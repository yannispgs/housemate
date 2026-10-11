import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DIRECT_URL } from "./env";

/**
 * Les règles d'accès du socle (migration 0003), éprouvées avec les rôles de
 * l'app et non avec le propriétaire : lui contourne la RLS.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

type Tx = postgres.TransactionSql;

/** La seule ligne d'un résultat qui doit en contenir exactement une. */
function one(rows: readonly postgres.Row[]): postgres.Row {
  const [row] = rows;

  if (row === undefined || rows.length > 1) {
    throw new Error(`Une ligne attendue, ${rows.length} obtenue(s).`);
  }

  return row;
}

afterAll(async () => {
  await owner.end();
});

interface Foyer {
  foyer: string;
  moi: string;
  conjoint: string;
}

let nous: Foyer;
let voisins: Foyer;

async function createFoyer(nom: string, prefix: string): Promise<Foyer> {
  const { id: foyer } = one(
    await owner`
    insert into app.foyers (nom) values (${nom}) returning id`,
  );
  const { id: moi } = one(
    await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyer}, ${`${prefix}-moi`}) returning id`,
  );
  const { id: conjoint } = one(
    await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyer}, ${`${prefix}-conjoint`}) returning id`,
  );

  return { foyer, moi, conjoint };
}

beforeEach(async () => {
  await owner`delete from app.completions`;
  await owner`delete from app.echeances`;
  await owner`delete from app.fiches`;
  await owner`delete from app.surnoms`;
  await owner`delete from app.liste_blanche`;
  await owner`delete from app.groupe_membres`;
  await owner`delete from app.groupes`;
  await owner`delete from app.membres`;
  await owner`delete from app.foyers`;
  nous = await createFoyer("Nous", "nous");
  voisins = await createFoyer("Voisins", "voisins");
});

/**
 * Ouvre la session de `userId` comme devra le faire l'app : identité posée
 * pour la seule transaction (jamais pour la session, qui fuirait derrière le
 * pooler), lue une première fois en propriétaire, PUIS rôle `authenticated`.
 * Cet ordre est obligatoire : voir `app.utilisateur_courant()`, migration 0003.
 */
async function openSession(tx: Tx, userId: string): Promise<void> {
  await tx`
    select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true),
      auth.user_id()`;
  await tx`set local role authenticated`;
}

/** Exécute `run` comme le ferait l'app pour `userId`. */
async function as<T>(userId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  return (await owner.begin(async tx => {
    await openSession(tx, userId);

    return run(tx);
  })) as T;
}

async function asAnonymous<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  return (await owner.begin(async tx => {
    await tx`set local role anonymous`;

    return run(tx);
  })) as T;
}

async function createFiche(userId: string, titre = "Chaudière") {
  return one(
    await as(
      userId,
      tx => tx`
        insert into app.fiches (nature, titre) values ('equipement', ${titre})
        returning id, foyer_id`,
    ),
  );
}

async function createEcheance(userId: string, ficheId: string | null = null) {
  const row = one(
    await as(
      userId,
      tx => tx`
        insert into app.echeances (fiche_id, titre, recurrence, tenue)
        values (${ficheId}, 'Entretien annuel', ${tx.json({ kind: "interval", months: 12 })}, 'ferme')
        returning id`,
    ),
  );

  return row.id as string;
}

describe("le rôle anonymous", () => {
  it.each([
    "foyers",
    "membres",
    "groupes",
    "groupe_membres",
    "surnoms",
    "liste_blanche",
    "fiches",
    "echeances",
    "completions",
  ])("n'a aucun accès à app.%s", async table => {
    await expect(
      asAnonymous(tx => tx`select 1 from ${tx("app")}.${tx(table)}`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("l'isolement entre foyers", () => {
  it("rattache une fiche au foyer de la personne connectée", async () => {
    const fiche = await createFiche("nous-moi");

    expect(fiche.foyer_id).toBe(nous.foyer);
  });

  it("ne montre rien d'un autre foyer", async () => {
    await createFiche("voisins-moi", "Tondeuse des voisins");
    await createFiche("nous-moi");

    const titres = await as("nous-moi", tx => tx`select titre from app.fiches`);
    const membres = await as(
      "nous-moi",
      tx => tx`select id from app.membres order by id`,
    );

    expect(titres.map(r => r.titre)).toEqual(["Chaudière"]);
    expect(membres.map(r => r.id).sort()).toEqual(
      [nous.moi, nous.conjoint].sort(),
    );
  });

  it("refuse une fiche écrite au nom d'un autre foyer", async () => {
    await expect(
      as(
        "nous-moi",
        tx => tx`
          insert into app.fiches (foyer_id, nature, titre)
          values (${voisins.foyer}, 'equipement', 'Intrus')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuse une échéance liée à la fiche d'un autre foyer", async () => {
    const leur = await createFiche("voisins-moi");

    await expect(createEcheance("nous-moi", leur.id)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("refuse un responsable pris dans un autre foyer", async () => {
    await expect(
      as(
        "nous-moi",
        tx => tx`
          insert into app.echeances (titre, recurrence, tenue, responsable)
          values ('Haie', ${tx.json({ kind: "interval", months: 6 })}, 'souple', ${voisins.moi})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("ne laisse pas modifier la fiche d'un autre foyer", async () => {
    const leur = await createFiche("voisins-moi");

    const touched = await as(
      "nous-moi",
      tx => tx`update app.fiches set titre = 'Piraté' where id = ${leur.id}`,
    );

    expect(touched.count).toBe(0);
  });

  it("reconnaît la personne dès la première requête d'une connexion neuve", async () => {
    // Sur une connexion neuve, pg_session_jwt perd l'identité si son premier
    // appel a lieu dans une fonction SECURITY DEFINER. `openSession` l'évite ;
    // seule une connexion neuve peut le vérifier.
    const fresh = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

    try {
      const rows = await fresh.begin(async tx => {
        await openSession(tx, "nous-moi");

        return tx`select app.foyer_courant() as foyer`;
      });

      expect(one(rows).foyer).toBe(nous.foyer);
    } finally {
      await fresh.end();
    }
  });

  it("ne donne aucun accès à une personne sans compte membre", async () => {
    await createFiche("nous-moi");

    const rows = await as("inconnu", tx => tx`select id from app.fiches`);

    expect(rows).toHaveLength(0);
  });
});

describe("le masquage ciblé", () => {
  it("cache une fiche au seul membre visé", async () => {
    await as(
      "nous-moi",
      tx => tx`
        insert into app.fiches (nature, titre, masque_pour)
        values ('document', 'Cadeau d''anniversaire', ${nous.conjoint})`,
    );

    const pourMoi = await as(
      "nous-moi",
      tx => tx`select titre from app.fiches`,
    );
    const pourConjoint = await as(
      "nous-conjoint",
      tx => tx`select titre from app.fiches`,
    );

    expect(pourMoi).toHaveLength(1);
    expect(pourConjoint).toHaveLength(0);
  });

  it("cache aussi les complétions d'une échéance masquée", async () => {
    const { id } = one(
      await as(
        "nous-moi",
        tx => tx`
          insert into app.echeances (titre, recurrence, tenue, masque_pour)
          values ('Surprise', ${tx.json({ kind: "interval", months: 12 })}, 'souple', ${nous.conjoint})
          returning id`,
      ),
    );
    await as(
      "nous-moi",
      tx => tx`
        insert into app.completions (echeance_id, occurrence, faite_le)
        values (${id}, '2026-09-01', '2026-09-01')`,
    );

    const vues = await as(
      "nous-conjoint",
      tx => tx`select id from app.completions`,
    );

    expect(vues).toHaveLength(0);
  });
});

describe("le privé strict", () => {
  it("ne montre une fiche privée qu'à son auteur", async () => {
    await as(
      "nous-moi",
      tx => tx`
        insert into app.fiches (nature, titre, prive)
        values ('document', 'Journal', true)`,
    );

    const pourMoi = await as("nous-moi", tx => tx`select id from app.fiches`);
    const pourConjoint = await as(
      "nous-conjoint",
      tx => tx`select id from app.fiches`,
    );

    expect(pourMoi).toHaveLength(1);
    expect(pourConjoint).toHaveLength(0);
  });

  it("refuse une fiche créée au nom d'un autre membre", async () => {
    await expect(
      as(
        "nous-moi",
        tx => tx`
          insert into app.fiches (nature, titre, cree_par)
          values ('document', 'Usurpée', ${nous.conjoint})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("ne laisse personne changer l'auteur après coup", async () => {
    const fiche = await createFiche("nous-moi");

    await expect(
      as(
        "nous-moi",
        tx => tx`
          update app.fiches set cree_par = ${nous.conjoint}
          where id = ${fiche.id}`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("laisse l'auteur rendre sa fiche privée, puis publique", async () => {
    const fiche = await createFiche("nous-moi");

    const toPrivate = await as(
      "nous-moi",
      tx => tx`update app.fiches set prive = true where id = ${fiche.id}`,
    );
    const toPublic = await as(
      "nous-moi",
      tx => tx`update app.fiches set prive = false where id = ${fiche.id}`,
    );

    expect(toPrivate.count).toBe(1);
    expect(toPublic.count).toBe(1);
  });

  it("refuse qu'un autre membre rende privée la fiche d'autrui", async () => {
    const fiche = await createFiche("nous-moi");

    await expect(
      as(
        "nous-conjoint",
        tx => tx`update app.fiches set prive = true where id = ${fiche.id}`,
      ),
    ).rejects.toThrow(/Seul l'auteur/);
  });

  it("refuse aussi qu'un autre membre rende privée l'échéance d'autrui", async () => {
    const id = await createEcheance("nous-moi");

    await expect(
      as(
        "nous-conjoint",
        tx => tx`update app.echeances set prive = true where id = ${id}`,
      ),
    ).rejects.toThrow(/Seul l'auteur/);
  });

  it("laisse un autre membre modifier la fiche, et la masquer pour une surprise", async () => {
    const fiche = await createFiche("nous-moi");

    const edited = await as(
      "nous-conjoint",
      tx => tx`
        update app.fiches set titre = 'Chaudière du sous-sol',
          masque_pour = ${nous.moi}
        where id = ${fiche.id}`,
    );

    expect(edited.count).toBe(1);
  });
});

describe("les groupes", () => {
  async function createGroupe(foyer: Foyer): Promise<string> {
    const { id } = one(
      await owner`
      insert into app.groupes (foyer_id) values (${foyer.foyer}) returning id`,
    );
    await owner`
      insert into app.groupe_membres (groupe_id, membre_id)
      values (${id}, ${foyer.moi}), (${id}, ${foyer.conjoint})`;

    return id;
  }

  it("peuvent être destinataires d'une échéance", async () => {
    const couple = await createGroupe(nous);

    const row = one(
      await as(
        "nous-moi",
        tx => tx`
          insert into app.echeances (titre, recurrence, tenue, destinataire_groupe)
          values ('Anniversaire de mariage', ${tx.json({ kind: "interval", months: 12 })}, 'ferme', ${couple})
          returning destinataire_groupe`,
      ),
    );

    expect(row.destinataire_groupe).toBe(couple);
  });

  it("refuse le groupe d'un autre foyer", async () => {
    const leurCouple = await createGroupe(voisins);

    await expect(
      as(
        "nous-moi",
        tx => tx`
          insert into app.echeances (titre, recurrence, tenue, destinataire_groupe)
          values ('Intrus', ${tx.json({ kind: "interval", months: 12 })}, 'ferme', ${leurCouple})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("reçoivent un surnom propre à qui regarde", async () => {
    const couple = await createGroupe(nous);

    await as(
      "nous-moi",
      tx => tx`
        insert into app.surnoms (observe_groupe, surnom)
        values (${couple}, 'les darons')`,
    );
    const miens = await as(
      "nous-moi",
      tx => tx`select surnom from app.surnoms where observe_groupe = ${couple}`,
    );

    expect(miens.map(r => r.surnom)).toEqual(["les darons"]);
  });
});

describe("l'archivage", () => {
  it("rend une fiche indélébile : la supprimer ne touche aucune ligne", async () => {
    const fiche = await createFiche("nous-moi");

    const deleted = await as(
      "nous-moi",
      tx => tx`delete from app.fiches where id = ${fiche.id}`,
    );
    const { n } = one(
      await owner`
      select count(*)::int as n from app.fiches where id = ${fiche.id}`,
    );

    expect(deleted.count).toBe(0);
    expect(n).toBe(1);
  });

  it("garde une échéance archivée", async () => {
    const id = await createEcheance("nous-moi");

    await as(
      "nous-moi",
      tx => tx`update app.echeances set archivee_le = now() where id = ${id}`,
    );
    const deleted = await as(
      "nous-moi",
      tx => tx`delete from app.echeances where id = ${id}`,
    );
    const row = one(
      await as(
        "nous-moi",
        tx => tx`select archivee_le from app.echeances where id = ${id}`,
      ),
    );

    expect(deleted.count).toBe(0);
    expect(row.archivee_le).toBeInstanceOf(Date);
  });
});

describe("le journal des complétions", () => {
  async function complete(userId: string, echeanceId: string, extra = {}) {
    return one(
      await as(
        userId,
        tx => tx`
          insert into app.completions ${tx({
            echeance_id: echeanceId,
            occurrence: "2026-09-01",
            faite_le: "2026-09-03",
            ...extra,
          })}
          returning id, auteur`,
      ),
    );
  }

  it("signe la complétion du nom de la personne connectée", async () => {
    const echeance = await createEcheance("nous-moi");

    const row = await complete("nous-conjoint", echeance);

    expect(row.auteur).toBe(nous.conjoint);
  });

  it("refuse une complétion signée par quelqu'un d'autre", async () => {
    const echeance = await createEcheance("nous-moi");

    await expect(
      complete("nous-moi", echeance, { auteur: nous.conjoint }),
    ).rejects.toThrow(/row-level security/);
  });

  it("n'écrase jamais : ni modification ni suppression", async () => {
    const echeance = await createEcheance("nous-moi");
    const row = await complete("nous-moi", echeance);

    await expect(
      as(
        "nous-moi",
        tx =>
          tx`update app.completions set faite_le = '2026-09-02' where id = ${row.id}`,
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      as(
        "nous-moi",
        tx => tx`delete from app.completions where id = ${row.id}`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("corrige en ajoutant une version qui désigne l'ancienne", async () => {
    const echeance = await createEcheance("nous-moi");
    const first = await complete("nous-moi", echeance);

    await complete("nous-moi", echeance, {
      faite_le: "2026-09-02",
      corrige: first.id,
    });
    const versions = await as(
      "nous-moi",
      tx => tx`
        select faite_le::text, corrige from app.completions
        order by saisie_le, faite_le`,
    );

    expect(versions).toEqual([
      { faite_le: "2026-09-03", corrige: null },
      { faite_le: "2026-09-02", corrige: first.id },
    ]);
  });

  it("refuse une correction visant une autre échéance", async () => {
    const chaudiere = await createEcheance("nous-moi");
    const haie = await createEcheance("nous-moi");
    const first = await complete("nous-moi", chaudiere);

    await expect(
      complete("nous-moi", haie, { corrige: first.id }),
    ).rejects.toThrow(/même échéance/);
  });

  it("refuse une complétion datée du futur", async () => {
    const echeance = await createEcheance("nous-moi");

    await expect(
      complete("nous-moi", echeance, { faite_le: "2099-01-01" }),
    ).rejects.toThrow(/futur/);
  });

  it("refuse une complétion sur l'échéance d'un autre foyer", async () => {
    const leur = await createEcheance("voisins-moi");

    await expect(complete("nous-moi", leur)).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe("les surnoms", () => {
  it("dépendent de qui regarde", async () => {
    await as(
      "nous-moi",
      tx => tx`
        insert into app.surnoms (observateur, observe_membre, surnom)
        values (${nous.moi}, ${nous.conjoint}, 'Lulu')`,
    );

    const miens = await as(
      "nous-moi",
      tx => tx`select surnom from app.surnoms`,
    );
    const siens = await as(
      "nous-conjoint",
      tx => tx`select surnom from app.surnoms`,
    );

    expect(miens.map(r => r.surnom)).toEqual(["Lulu"]);
    expect(siens).toHaveLength(0);
  });

  it("ne se donnent pas à la place d'un autre", async () => {
    await expect(
      as(
        "nous-moi",
        tx => tx`
          insert into app.surnoms (observateur, observe_membre, surnom)
          values (${nous.conjoint}, ${nous.moi}, 'Chef')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("la liste blanche", () => {
  it("n'est pas lisible par l'app", async () => {
    await expect(
      as("nous-moi", tx => tx`select email from app.liste_blanche`),
    ).rejects.toThrow(/permission denied/);
  });
});
