import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FACTURE_FICTIVE, jeuFictif } from "@/lib/data/jeu-fictif";
import { foyerVide, remplirFoyer } from "@/lib/data/remplissage";
import {
  type Attribut,
  echeanceSaisie,
  garantieSaisie,
  lire,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import {
  ajouterConsommable,
  ajouterPieceJointe,
  ajouterRappel,
  annulerCompletions,
  commeMembre,
  completer,
  creerEcheance,
  creerFiche,
  creerGarantie,
  lireFiche,
  lireFoyer,
  lirePieceJointe,
  lirePlanEntretien,
  listerCategories,
  listerConsommables,
  listerEcheances,
  listerFiches,
  listerMarques,
  modifierDureeDeVie,
  modifierTenueConsommable,
  noterReleve,
  noterRemplacement,
  reglerEntretien,
  remplacerConsommable,
  volumePiecesJointes,
} from "@/lib/data/store";
import { homeDeadlines, recap, upcomingItems } from "@/lib/data/views";
import { etatConsommable } from "@/lib/domain/entretien";
import { fromISO } from "@/lib/domain/plain-date";
import { DIRECT_URL } from "./env";

/**
 * La couche de données de l'app (src/lib/data/store.ts) contre la base
 * locale : tout passe par `commeMembre`, donc sous la RLS du rôle
 * `authenticated`, comme en production.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

interface Membre {
  readonly foyer: string;
  readonly id: string;
  readonly compte: string;
}

let moi: Membre;
let conjoint: Membre;
let voisin: Membre;

async function foyer(nom: string): Promise<string> {
  const [row] = await owner`
    insert into app.foyers (nom) values (${nom}) returning id`;

  return row?.id as string;
}

async function membre(foyerId: string, compte: string): Promise<Membre> {
  const [row] = await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyerId}, ${compte}) returning id`;

  return { foyer: foyerId, id: row?.id as string, compte };
}

beforeEach(async () => {
  const nous = await foyer("Nous");
  const eux = await foyer("Eux");
  const suffixe = crypto.randomUUID();
  moi = await membre(nous, `moi-${suffixe}`);
  conjoint = await membre(nous, `conjoint-${suffixe}`);
  voisin = await membre(eux, `voisin-${suffixe}`);
});

const sql = () => owner;

async function echeanceDe(
  m: Membre,
  champs: { titre: string; destinataire?: string | null; fiche?: string },
): Promise<string> {
  return commeMembre(sql(), m.compte, async tx => {
    const [row] = await tx`
      insert into app.echeances
        (titre, categorie, recurrence, tenue, destinataire_membre, fiche_id)
      values (${champs.titre}, 'Maison',
        ${tx.json({ kind: "once", on: "2026-10-20" })}, 'souple',
        ${champs.destinataire ?? null}, ${champs.fiche ?? null})
      returning id::text`;

    return row?.id as string;
  });
}

describe("lecture au nom d'un membre", () => {
  it("liste les fiches du foyer, et seulement elles", async () => {
    await commeMembre(
      sql(),
      moi.compte,
      tx =>
        tx`insert into app.fiches (nature, titre) values ('vehicule', 'La voiture')`,
    );
    await commeMembre(
      sql(),
      voisin.compte,
      tx =>
        tx`insert into app.fiches (nature, titre) values ('plante', 'Leur rosier')`,
    );

    const titres = (
      await commeMembre(sql(), conjoint.compte, listerFiches)
    ).map(f => f.titre);

    expect(titres).toContain("La voiture");
    expect(titres).not.toContain("Leur rosier");
  });

  it("lit une échéance avec sa fiche, sa récurrence et son destinataire", async () => {
    const fiche = await commeMembre(sql(), moi.compte, async tx => {
      const [row] = await tx`
        insert into app.fiches (nature, titre) values ('equipement', 'La chaudière')
        returning id::text`;

      return row?.id as string;
    });
    await echeanceDe(moi, {
      titre: "Entretien",
      destinataire: moi.id,
      fiche,
    });

    const vueParMoi = (
      await commeMembre(sql(), moi.compte, listerEcheances)
    ).find(e => e.titre === "Entretien");
    const vueParConjoint = (
      await commeMembre(sql(), conjoint.compte, listerEcheances)
    ).find(e => e.titre === "Entretien");

    expect(vueParMoi).toMatchObject({
      ficheId: fiche,
      ficheTitre: "La chaudière",
      recurrence: { kind: "once", on: fromISO("2026-10-20") },
      destinataire: "Moi",
      completions: [],
    });
    // Le libellé dépend de qui regarde (§ 7.3) : pas de surnom donné ici.
    expect(vueParConjoint?.destinataire).toBe("Un membre");
  });

  it("dit « Foyer » sans destinataire, et le surnom choisi sinon", async () => {
    await echeanceDe(moi, { titre: "Pour tous" });
    await echeanceDe(moi, { titre: "Pour moi", destinataire: moi.id });
    await commeMembre(
      sql(),
      conjoint.compte,
      tx =>
        tx`insert into app.surnoms (observe_membre, surnom) values (${moi.id}, 'Mon cœur')`,
    );

    const vues = await commeMembre(sql(), conjoint.compte, listerEcheances);

    expect(vues.find(e => e.titre === "Pour tous")?.destinataire).toBe("Foyer");
    expect(vues.find(e => e.titre === "Pour moi")?.destinataire).toBe(
      "Mon cœur",
    );
  });

  it("sait ce qui me concerne : à moi, à mon groupe, ou au foyer", async () => {
    const [groupe] = await owner`
      insert into app.groupes (foyer_id) values (${moi.foyer}) returning id`;
    await owner`
      insert into app.groupe_membres (groupe_id, membre_id)
      values (${groupe?.id as string}, ${conjoint.id})`;
    await echeanceDe(moi, { titre: "Pour tous" });
    await echeanceDe(moi, { titre: "Pour moi", destinataire: moi.id });
    await commeMembre(
      sql(),
      moi.compte,
      tx =>
        tx`insert into app.echeances
             (titre, recurrence, tenue, destinataire_groupe)
           values ('Pour le groupe',
             ${tx.json({ kind: "once", on: "2026-10-20" })}, 'souple',
             ${groupe?.id as string})`,
    );

    const pourMoi = async (m: Membre) =>
      Object.fromEntries(
        (await commeMembre(sql(), m.compte, listerEcheances)).map(e => [
          e.titre,
          e.pourMoi,
        ]),
      );

    expect(await pourMoi(moi)).toEqual({
      "Pour tous": true,
      "Pour moi": true,
      "Pour le groupe": false,
    });
    expect(await pourMoi(conjoint)).toEqual({
      "Pour tous": true,
      "Pour moi": false,
      "Pour le groupe": true,
    });
  });
});

describe("complétions", () => {
  it("coche une occurrence, au nom de son auteur", async () => {
    const id = await echeanceDe(moi, { titre: "À faire" });
    await commeMembre(sql(), conjoint.compte, tx =>
      completer(tx, id, fromISO("2026-10-20"), fromISO("2026-10-09")),
    );

    const [vue] = (
      await commeMembre(sql(), moi.compte, listerEcheances)
    ).filter(e => e.id === id);
    const [auteur] = await owner`
      select auteur from app.completions where echeance_id = ${id}`;

    expect(vue?.completions).toEqual([
      { occurrence: fromISO("2026-10-20"), faiteLe: fromISO("2026-10-09") },
    ]);
    expect(auteur?.auteur).toBe(conjoint.id);
  });

  it("ignore une complétion annulée, et une version corrigée", async () => {
    const id = await echeanceDe(moi, { titre: "Corrigée" });
    const [premiere] = await owner`
      insert into app.completions (foyer_id, echeance_id, occurrence, faite_le, auteur)
      values (${moi.foyer}, ${id}, '2026-10-20', '2026-10-08', ${moi.id})
      returning id`;
    await owner`
      insert into app.completions (foyer_id, echeance_id, occurrence, faite_le, auteur, corrige)
      values (${moi.foyer}, ${id}, '2026-10-20', '2026-10-09', ${moi.id}, ${premiere?.id})`;
    await owner`
      insert into app.completions (foyer_id, echeance_id, occurrence, faite_le, auteur, annulee)
      values (${moi.foyer}, ${id}, '2026-11-20', '2026-10-01', ${moi.id}, true)`;

    const [vue] = (
      await commeMembre(sql(), moi.compte, listerEcheances)
    ).filter(e => e.id === id);

    expect(vue?.completions).toEqual([
      { occurrence: fromISO("2026-10-20"), faiteLe: fromISO("2026-10-09") },
    ]);
  });

  it("annule une complétion par un nouvel événement, sans rien effacer", async () => {
    const id = await echeanceDe(moi, { titre: "Annulée" });
    const completion = await commeMembre(sql(), moi.compte, tx =>
      completer(tx, id, fromISO("2026-10-20"), fromISO("2026-10-09")),
    );
    await commeMembre(sql(), moi.compte, tx =>
      annulerCompletions(tx, [completion]),
    );

    const [vue] = (
      await commeMembre(sql(), moi.compte, listerEcheances)
    ).filter(e => e.id === id);
    const lignes = await owner`
      select annulee from app.completions where echeance_id = ${id}`;

    expect(vue?.completions).toEqual([]);
    expect(lignes.map(l => l.annulee).sort()).toEqual([false, true]);
  });

  it("⚠️ refuse de cocher l'échéance d'un autre foyer", async () => {
    const id = await echeanceDe(moi, { titre: "Chez nous" });

    await expect(
      commeMembre(sql(), voisin.compte, tx =>
        completer(tx, id, fromISO("2026-10-20"), fromISO("2026-10-20")),
      ),
    ).rejects.toThrow();
  });
});

describe("la porte unique", () => {
  it("⚠️ agit sous le rôle authenticated, jamais en propriétaire", async () => {
    const role = await commeMembre(
      sql(),
      moi.compte,
      async tx => (await tx`select current_user as role`)[0]?.role,
    );

    expect(role).toBe("authenticated");
  });
});

describe("ajouts", () => {
  const balance = lire(garantieSaisie, {
    titre: "Balance",
    marque: "Terraillon",
    categorie: "Salle de bain",
    dateAchat: "2026-10-01",
    dureeNombre: "2",
    dureeUnite: "year",
  });

  it("crée une garantie : la fiche et sa fin de garantie, liées", async () => {
    if (!balance.ok) {
      throw new Error("saisie invalide");
    }

    const ficheId = await commeMembre(sql(), moi.compte, tx =>
      creerGarantie(tx, nouvelleGarantie(balance.valeur)),
    );
    const fiche = await commeMembre(sql(), conjoint.compte, tx =>
      lireFiche(tx, ficheId),
    );
    const echeance = (
      await commeMembre(sql(), conjoint.compte, listerEcheances)
    ).find(e => e.titre === "Fin de garantie — Balance");

    expect(fiche).toMatchObject({
      nature: "equipement",
      titre: "Balance",
      categorie: "Salle de bain",
      attributs: [
        { libelle: "Marque", valeur: "Terraillon" },
        { libelle: "Date d'achat", valeur: "2026-10-01" },
        { libelle: "Durée de garantie", valeur: { count: 2, unit: "year" } },
      ],
      echeances: [{ titre: "Fin de garantie — Balance" }],
      pieces: [],
    });
    expect(echeance).toMatchObject({
      ficheTitre: "Balance",
      importance: "memoire",
      preavisJours: 30,
      recurrence: {
        kind: "derived",
        sourceDate: fromISO("2026-10-01"),
        offset: { count: 2, unit: "year" },
      },
    });
  });

  it("⚠️ crée une garantie entière ou pas du tout", async () => {
    if (!balance.ok) {
      throw new Error("saisie invalide");
    }

    const garantie = nouvelleGarantie(balance.valeur);
    await expect(
      commeMembre(sql(), moi.compte, tx =>
        creerGarantie(tx, {
          ...garantie,
          echeance: { ...garantie.echeance, tenue: "invalide" as "souple" },
        }),
      ),
    ).rejects.toThrow();

    const fiches = await commeMembre(sql(), moi.compte, listerFiches);
    expect(fiches.filter(f => f.titre === "Balance")).toHaveLength(0);
  });

  it("crée une fiche vierge", async () => {
    const id = await commeMembre(sql(), moi.compte, tx =>
      creerFiche(tx, {
        nature: "lieu",
        titre: "Le garage",
        categorie: null,
        attributs: [],
      }),
    );

    expect(
      await commeMembre(sql(), moi.compte, tx => lireFiche(tx, id)),
    ).toMatchObject({ titre: "Le garage", categorie: null, attributs: [] });
  });

  it("crée une échéance « depuis la dernière fois » avec sa dernière fois", async () => {
    const saisie = lire(echeanceSaisie, {
      titre: "Changer les draps",
      importance: "normal",
      tenue: "souple",
      toleranceJours: "2",
      preavisJours: "0",
      motif: "sinceCompletion",
      nombre: "2",
      unite: "week",
      date: "2026-10-06",
    });

    if (!saisie.ok) {
      throw new Error("saisie invalide");
    }

    const id = await commeMembre(sql(), moi.compte, tx =>
      creerEcheance(tx, nouvelleEcheance(saisie.valeur)),
    );
    const [vue] = (
      await commeMembre(sql(), moi.compte, listerEcheances)
    ).filter(e => e.id === id);

    expect(vue?.completions).toEqual([
      { occurrence: fromISO("2026-10-06"), faiteLe: fromISO("2026-10-06") },
    ]);
  });
});

describe("rappels (§ 6)", () => {
  it("s'enregistrent avec l'échéance et se relisent avec elle", async () => {
    const saisie = lire(echeanceSaisie, {
      titre: "Contrôle technique",
      importance: "normal",
      tenue: "ferme",
      toleranceJours: "0",
      preavisJours: "30",
      motif: "once",
      date: "2026-12-01",
      // Un mois avant pour ne pas l'oublier, puis la veille.
      rappel0Nombre: "1",
      rappel0Unite: "month",
      rappel0Email: "on",
      rappel0Push: "on",
      rappel1Nombre: "1",
      rappel1Unite: "day",
      rappel1Push: "on",
    });

    if (!saisie.ok) {
      throw new Error("saisie invalide");
    }

    const id = await commeMembre(sql(), moi.compte, tx =>
      creerEcheance(tx, nouvelleEcheance(saisie.valeur)),
    );
    await commeMembre(sql(), conjoint.compte, tx =>
      ajouterRappel(tx, id, { amount: 2, unit: "week", channels: ["email"] }),
    );
    const vue = (await commeMembre(sql(), moi.compte, listerEcheances)).find(
      e => e.id === id,
    );

    expect(vue?.rappels).toEqual([
      { amount: 1, unit: "day", channels: ["push"] },
      { amount: 1, unit: "month", channels: ["email", "push"] },
      { amount: 2, unit: "week", channels: ["email"] },
    ]);
  });

  it("⚠️ suivent la visibilité de leur échéance", async () => {
    const id = await commeMembre(sql(), moi.compte, async tx => {
      const [row] = await tx`
        insert into app.echeances (titre, recurrence, tenue, prive)
        values ('Secret', ${tx.json({ kind: "once", on: "2026-12-01" })},
          'souple', true)
        returning id::text`;

      return row?.id as string;
    });
    await commeMembre(sql(), moi.compte, tx =>
      ajouterRappel(tx, id, { amount: 1, unit: "day", channels: ["push"] }),
    );

    await expect(
      commeMembre(sql(), conjoint.compte, tx =>
        ajouterRappel(tx, id, { amount: 2, unit: "day", channels: ["push"] }),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      await commeMembre(
        sql(),
        conjoint.compte,
        tx => tx`select 1 from app.rappels where echeance_id = ${id}`,
      ),
    ).toHaveLength(0);
    expect(
      await commeMembre(
        sql(),
        voisin.compte,
        tx => tx`delete from app.rappels where echeance_id = ${id} returning 1`,
      ),
    ).toHaveLength(0);
  });

  it("⚠️ refusent un rappel sans canal, ou deux au même délai", async () => {
    const id = await echeanceDe(moi, { titre: "Doublon" });

    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterRappel(tx, id, { amount: 1, unit: "day", channels: [] }),
      ),
    ).rejects.toThrow(/check constraint/);
    await commeMembre(sql(), moi.compte, tx =>
      ajouterRappel(tx, id, { amount: 1, unit: "day", channels: ["email"] }),
    );
    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterRappel(tx, id, { amount: 1, unit: "day", channels: ["push"] }),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("pièces jointes", () => {
  const piece = (ficheId: string) => ({
    ficheId,
    nom: "Facture",
    typeMime: "application/pdf",
    taille: 1234,
    cle: `fiches/${ficheId}/${crypto.randomUUID()}.pdf`,
  });

  async function fiche(m: Membre, prive = false): Promise<string> {
    return commeMembre(sql(), m.compte, async tx => {
      const [row] = await tx`
        insert into app.fiches (nature, titre, prive)
        values ('equipement', 'Objet', ${prive}) returning id::text`;

      return row?.id as string;
    });
  }

  it("joint un fichier à une fiche, lisible par le foyer", async () => {
    const ficheId = await fiche(moi);
    const pieceId = await commeMembre(sql(), moi.compte, tx =>
      ajouterPieceJointe(tx, piece(ficheId)),
    );

    expect(
      await commeMembre(sql(), conjoint.compte, tx => lireFiche(tx, ficheId)),
    ).toMatchObject({
      pieces: [{ id: pieceId, nom: "Facture", typeMime: "application/pdf" }],
    });
    expect(
      await commeMembre(sql(), conjoint.compte, tx =>
        lirePieceJointe(tx, pieceId),
      ),
    ).toMatchObject({ typeMime: "application/pdf", nom: "Facture" });
  });

  it("⚠️ la facture d'une fiche privée reste privée", async () => {
    const ficheId = await fiche(moi, true);
    const pieceId = await commeMembre(sql(), moi.compte, tx =>
      ajouterPieceJointe(tx, piece(ficheId)),
    );

    expect(
      await commeMembre(sql(), conjoint.compte, tx =>
        lirePieceJointe(tx, pieceId),
      ),
    ).toBeNull();
    expect(
      await commeMembre(sql(), conjoint.compte, tx => lireFiche(tx, ficheId)),
    ).toBeNull();
  });

  it("⚠️ un autre foyer ne lit ni ne joint rien", async () => {
    const ficheId = await fiche(moi);
    const pieceId = await commeMembre(sql(), moi.compte, tx =>
      ajouterPieceJointe(tx, piece(ficheId)),
    );

    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        lirePieceJointe(tx, pieceId),
      ),
    ).toBeNull();
    await expect(
      commeMembre(sql(), voisin.compte, tx =>
        ajouterPieceJointe(tx, piece(ficheId)),
      ),
    ).rejects.toThrow();
  });

  it("refuse un type de fichier non prévu et un fichier trop gros", async () => {
    const ficheId = await fiche(moi);

    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterPieceJointe(tx, { ...piece(ficheId), typeMime: "text/html" }),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterPieceJointe(tx, { ...piece(ficheId), taille: 30_000_000 }),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("accepte une facture de 25 Mo", async () => {
    const ficheId = await fiche(moi);

    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterPieceJointe(tx, { ...piece(ficheId), taille: 25 * 1024 * 1024 }),
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("⚠️ le quota compte les fiches privées des autres, pas les autres foyers", async () => {
    const privee = await fiche(moi, true);
    const commune = await fiche(moi);
    const ailleurs = await fiche(voisin);
    await commeMembre(sql(), moi.compte, async tx => {
      await ajouterPieceJointe(tx, piece(privee));
      await ajouterPieceJointe(tx, piece(commune));
    });
    await commeMembre(sql(), voisin.compte, tx =>
      ajouterPieceJointe(tx, piece(ailleurs)),
    );

    expect(await commeMembre(sql(), conjoint.compte, volumePiecesJointes)).toBe(
      2 * 1234,
    );
  });

  it("⚠️ rien ne s'efface : ni modification ni suppression", async () => {
    const ficheId = await fiche(moi);
    const pieceId = await commeMembre(sql(), moi.compte, tx =>
      ajouterPieceJointe(tx, piece(ficheId)),
    );

    await expect(
      commeMembre(
        sql(),
        moi.compte,
        tx => tx`delete from app.pieces_jointes where id = ${pieceId}`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("plan d'entretien (§ 5.3)", () => {
  const COURROIE = {
    compteur: 80_000,
    temps: { count: 10, unit: "year" as const },
  };

  async function voiture(m: Membre, prive = false): Promise<string> {
    return commeMembre(sql(), m.compte, async tx => {
      const [row] = await tx`
        insert into app.fiches (nature, titre, prive)
        values ('vehicule', 'La voiture', ${prive}) returning id::text`;

      return row?.id as string;
    });
  }

  it("relit consommables, remplacements et relevés, et en calcule l'échéance", async () => {
    const ficheId = await voiture(moi);
    await commeMembre(sql(), moi.compte, async tx => {
      const id = await ajouterConsommable(tx, ficheId, "Courroie", COURROIE);
      await noterRemplacement(tx, id, fromISO("2020-10-15"), 50_000);
      await noterReleve(tx, ficheId, fromISO("2025-10-15"), 100_000);
      await noterReleve(tx, ficheId, fromISO("2026-10-15"), 118_250);
      await ajouterConsommable(tx, ficheId, "Bougies", {
        compteur: 60_000,
        temps: null,
      });
    });

    // Vu par l'autre membre du foyer.
    const plan = await commeMembre(sql(), conjoint.compte, tx =>
      lirePlanEntretien(tx, ficheId),
    );

    expect(plan.consommables.map(c => [c.intitule, c.dureeTemps])).toEqual([
      ["Bougies", null],
      ["Courroie", { count: 10, unit: "year" }],
    ]);
    expect(plan.releves).toEqual([
      { le: fromISO("2025-10-15"), valeur: 100_000 },
      { le: fromISO("2026-10-15"), valeur: 118_250 },
    ]);
    const courroie = plan.consommables.find(c => c.intitule === "Courroie");
    expect(
      courroie &&
        etatConsommable(courroie, plan.releves, fromISO("2026-10-15")),
    ).toMatchObject({
      echeance: fromISO("2027-06-07"),
      donneeManquante: false,
    });
  });

  it("⚠️ la durée de vie se corrige, et rien d'autre ne s'efface", async () => {
    const ficheId = await voiture(moi);
    const id = await commeMembre(sql(), moi.compte, async tx => {
      const c = await ajouterConsommable(tx, ficheId, "Courroie", COURROIE);
      await noterRemplacement(tx, c, fromISO("2026-01-10"), null);

      return c;
    });

    expect(
      await commeMembre(sql(), conjoint.compte, tx =>
        modifierDureeDeVie(tx, id, { ...COURROIE, compteur: 100_000 }),
      ),
    ).toBe(true);
    expect(
      (
        await commeMembre(sql(), moi.compte, tx =>
          lirePlanEntretien(tx, ficheId),
        )
      ).consommables[0],
    ).toMatchObject({
      dureeKm: 100_000,
      remplacements: [{ le: fromISO("2026-01-10"), compteur: null }],
    });

    // Devenue purement kilométrique.
    await commeMembre(sql(), moi.compte, tx =>
      modifierDureeDeVie(tx, id, { compteur: 90_000, temps: null }),
    );
    expect(
      (
        await commeMembre(sql(), moi.compte, tx =>
          lirePlanEntretien(tx, ficheId),
        )
      ).consommables[0],
    ).toMatchObject({ dureeKm: 90_000, dureeTemps: null });

    for (const table of ["remplacements", "consommables", "releves"]) {
      await expect(
        commeMembre(
          sql(),
          moi.compte,
          tx => tx`delete from ${tx("app")}.${tx(table)}`,
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("⚠️ un autre foyer ne voit, ne corrige ni n'ajoute rien", async () => {
    const ficheId = await voiture(moi);
    const id = await commeMembre(sql(), moi.compte, tx =>
      ajouterConsommable(tx, ficheId, "Courroie", COURROIE),
    );

    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        lirePlanEntretien(tx, ficheId),
      ),
    ).toEqual({ tenue: "souple", seuil: 0.075, consommables: [], releves: [] });
    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        modifierDureeDeVie(tx, id, COURROIE),
      ),
    ).toBe(false);
    await expect(
      commeMembre(sql(), voisin.compte, tx =>
        noterReleve(tx, ficheId, fromISO("2026-10-15"), 1),
      ),
    ).rejects.toThrow();
    await expect(
      commeMembre(sql(), voisin.compte, tx =>
        noterRemplacement(tx, id, fromISO("2026-10-15"), null),
      ),
    ).rejects.toThrow();
  });

  it("⚠️ le plan d'une fiche privée reste privé", async () => {
    const ficheId = await voiture(moi, true);
    await commeMembre(sql(), moi.compte, tx =>
      ajouterConsommable(tx, ficheId, "Courroie", COURROIE),
    );

    expect(
      (
        await commeMembre(sql(), conjoint.compte, tx =>
          lirePlanEntretien(tx, ficheId),
        )
      ).consommables,
    ).toEqual([]);
  });

  it("⚠️ liste les consommables visibles, hors fiches archivées", async () => {
    const active = await voiture(moi);
    const archivee = await voiture(moi);
    const privee = await voiture(moi, true);
    await commeMembre(sql(), moi.compte, async tx => {
      const c = await ajouterConsommable(tx, active, "Courroie", COURROIE);
      await noterRemplacement(tx, c, fromISO("2020-10-15"), 50_000);
      await noterReleve(tx, active, fromISO("2026-10-15"), 118_250);
      await ajouterConsommable(tx, archivee, "Pneus", COURROIE);
      await ajouterConsommable(tx, privee, "Secret", COURROIE);
    });
    await owner`update app.fiches set archivee_le = now() where id = ${archivee}`;

    expect(
      await commeMembre(sql(), conjoint.compte, listerConsommables),
    ).toEqual([
      {
        id: expect.any(String),
        intitule: "Courroie",
        ficheId: active,
        ficheTitre: "La voiture",
        categorie: null,
        tenue: "souple",
        seuil: 0.075,
        dureeKm: 80_000,
        dureeTemps: { count: 10, unit: "year" },
        remplacements: [{ le: fromISO("2020-10-15"), compteur: 50_000 }],
        releves: [{ le: fromISO("2026-10-15"), valeur: 118_250 }],
      },
    ]);
    expect(await commeMembre(sql(), voisin.compte, listerConsommables)).toEqual(
      [],
    );
  });

  it("⚠️ la tenue se règle sur l'objet, se remplace par consommable, et revient", async () => {
    const ficheId = await voiture(moi);
    const [courroie, balais] = await commeMembre(sql(), moi.compte, tx =>
      Promise.all([
        ajouterConsommable(tx, ficheId, "Courroie", COURROIE),
        ajouterConsommable(tx, ficheId, "Balais", COURROIE, "souple"),
      ]),
    );
    const tenues = async () =>
      Object.fromEntries(
        (await commeMembre(sql(), conjoint.compte, listerConsommables)).map(
          c => [c.intitule, [c.tenue, c.seuil]],
        ),
      );

    // Souple et 7,5 % par défaut.
    expect(await tenues()).toEqual({
      Balais: ["souple", 0.075],
      Courroie: ["souple", 0.075],
    });

    expect(
      await commeMembre(sql(), conjoint.compte, tx =>
        reglerEntretien(tx, ficheId, { tenue: "ferme", seuil: 0.15 }),
      ),
    ).toBe(true);
    // La courroie hérite ; les balais gardent leur tenue propre.
    expect(await tenues()).toEqual({
      Balais: ["souple", 0.15],
      Courroie: ["ferme", 0.15],
    });

    await commeMembre(sql(), moi.compte, tx =>
      Promise.all([
        modifierTenueConsommable(tx, balais, null),
        modifierTenueConsommable(tx, courroie, "souple"),
      ]),
    );
    expect(await tenues()).toEqual({
      Balais: ["ferme", 0.15],
      Courroie: ["souple", 0.15],
    });
    expect(
      await commeMembre(sql(), moi.compte, tx =>
        lirePlanEntretien(tx, ficheId),
      ),
    ).toMatchObject({
      tenue: "ferme",
      seuil: 0.15,
      consommables: [
        { intitule: "Balais", tenue: null },
        { intitule: "Courroie", tenue: "souple" },
      ],
    });
  });

  it("⚠️ borne le seuil, et un autre foyer ne règle rien", async () => {
    const ficheId = await voiture(moi);
    const id = await commeMembre(sql(), moi.compte, tx =>
      ajouterConsommable(tx, ficheId, "Courroie", COURROIE),
    );

    await expect(
      commeMembre(sql(), moi.compte, tx =>
        reglerEntretien(tx, ficheId, { tenue: "ferme", seuil: 0.6 }),
      ),
    ).rejects.toThrow(/check constraint/);
    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        reglerEntretien(tx, ficheId, { tenue: "ferme", seuil: 0.1 }),
      ),
    ).toBe(false);
    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        modifierTenueConsommable(tx, id, "ferme"),
      ),
    ).toBe(false);
    expect(
      await commeMembre(sql(), voisin.compte, tx =>
        lirePlanEntretien(tx, ficheId),
      ),
    ).toEqual({ tenue: "souple", seuil: 0.075, consommables: [], releves: [] });
  });

  it("⚠️ « Fait » note le remplacement et, s'il est donné, le relevé du jour", async () => {
    const ficheId = await voiture(moi);
    const id = await commeMembre(sql(), moi.compte, tx =>
      ajouterConsommable(tx, ficheId, "Vidange", COURROIE),
    );

    await commeMembre(sql(), conjoint.compte, async tx => {
      await remplacerConsommable(tx, id, fromISO("2026-10-17"), 90_200);
      // Sans kilométrage : le remplacement seul, sans relevé.
      await remplacerConsommable(tx, id, fromISO("2026-10-18"), null);
    });

    const plan = await commeMembre(sql(), moi.compte, tx =>
      lirePlanEntretien(tx, ficheId),
    );
    expect(plan.consommables[0]?.remplacements).toEqual([
      { le: fromISO("2026-10-17"), compteur: 90_200 },
      { le: fromISO("2026-10-18"), compteur: null },
    ]);
    expect(plan.releves).toEqual([
      { le: fromISO("2026-10-17"), valeur: 90_200 },
    ]);

    // Un autre foyer ne remplace rien.
    await expect(
      commeMembre(sql(), voisin.compte, tx =>
        remplacerConsommable(tx, id, fromISO("2026-10-17"), 1),
      ),
    ).rejects.toThrow();
  });

  it("refuse un consommable sans durée de vie, ou une durée sans unité", async () => {
    const ficheId = await voiture(moi);

    await expect(
      commeMembre(sql(), moi.compte, tx =>
        ajouterConsommable(tx, ficheId, "Rien", {
          compteur: null,
          temps: null,
        }),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      commeMembre(
        sql(),
        moi.compte,
        tx => tx`
          insert into app.consommables (fiche_id, intitule, duree_nombre)
          values (${ficheId}, 'Filtre', 3)`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("remplissage d'une preview", () => {
  const TODAY = fromISO("2026-10-15");

  // La facture fictive n'est référencée qu'une fois par base (clé unique) :
  // chaque test remplit un nouveau foyer de la même base locale.
  beforeEach(async () => {
    await owner`delete from app.pieces_jointes where cle = ${FACTURE_FICTIVE.cle}`;
  });

  it("remplit un foyer vide, sous la RLS, et rien d'autre", async () => {
    expect(await commeMembre(sql(), moi.compte, foyerVide)).toBe(true);

    expect(
      await commeMembre(sql(), moi.compte, tx =>
        remplirFoyer(tx, jeuFictif(TODAY)),
      ),
    ).toEqual({ fiches: 14, echeances: 20, consommables: 3 });

    expect(await commeMembre(sql(), conjoint.compte, foyerVide)).toBe(false);
    // ⚠️ Le foyer voisin n'en voit rien.
    expect(await commeMembre(sql(), voisin.compte, foyerVide)).toBe(true);
  });

  it("⚠️ remplit chaque section de l'interface", async () => {
    await commeMembre(sql(), moi.compte, tx =>
      remplirFoyer(tx, jeuFictif(TODAY)),
    );
    const echeances = await commeMembre(sql(), moi.compte, listerEcheances);
    const consommables = await commeMembre(
      sql(),
      moi.compte,
      listerConsommables,
    );
    const fiches = await commeMembre(sql(), moi.compte, listerFiches);
    const accueil = homeDeadlines(echeances, TODAY, consommables);

    // Un consommable en préavis à l'accueil, un autre loin dans À venir.
    expect(accueil.find(v => v.title === "Vidange")).toMatchObject({
      state: "en préavis",
      verb: "Fait",
      tenure: "ferme",
    });
    // Souple malgré la voiture ferme : en retard, sans monter.
    expect(accueil.find(v => v.title === "Essuie-glaces")).toMatchObject({
      state: "en retard",
      importance: "normal",
      tenure: "souple",
    });
    expect(
      upcomingItems(echeances, TODAY, consommables).map(i => i.title),
    ).toContain("Courroie de distribution");

    // Accueil : rang 1 (critique à faire), rang 3 (à faire), rang 4 (préavis).
    // Une ferme en retard monte d'elle-même à critique (§ 3.8a) : le rang 1
    // compte alors les radiateurs comme le détecteur.
    expect(accueil[0]?.importance).toBe("critique");
    expect(
      accueil.filter(v => v.importance === "critique").map(v => v.title),
    ).toContain("Changer la pile du détecteur de fumée");
    expect(accueil.map(v => v.state)).toEqual(
      expect.arrayContaining(["en retard", "due", "en préavis"]),
    );
    // À venir, Récap.
    expect(upcomingItems(echeances, TODAY).length).toBeGreaterThan(0);
    const { coming, done } = recap(echeances, TODAY);
    expect(coming.length).toBeGreaterThan(0);
    expect(done.length).toBeGreaterThan(0);
    // Fiche : informations, pièces jointes, échéances.
    const id = (titre: string) => fiches.find(f => f.titre === titre)?.id ?? "";
    const laveLinge = await commeMembre(sql(), moi.compte, tx =>
      lireFiche(tx, id("Le lave-linge")),
    );
    expect(laveLinge?.attributs.length).toBeGreaterThan(0);
    expect(laveLinge?.echeances).toHaveLength(1);
    expect(laveLinge?.pieces).toMatchObject([
      { nom: "Facture (fictive)", typeMime: "application/pdf" },
    ]);
    expect(
      (
        await commeMembre(sql(), moi.compte, tx =>
          lireFiche(tx, id("La voiture")),
        )
      )?.attributs.map(a => a.libelle),
    ).toEqual(["Immatriculation", "Mise en circulation"]);
  });
});

describe("foyer", () => {
  it("⚠️ chacun ne lit que le nom de son foyer", async () => {
    expect(await commeMembre(sql(), moi.compte, lireFoyer)).toBe("Nous");
    expect(await commeMembre(sql(), voisin.compte, lireFoyer)).toBe("Eux");
  });

  it("rien pour un compte sans foyer", async () => {
    expect(await commeMembre(sql(), "inconnu", lireFoyer)).toBeNull();
  });
});

describe("catégories (§ 5.4)", () => {
  const echeanceDe = (ficheId: string | null, categorie: string | null) => ({
    titre: "Échéance",
    categorie,
    recurrence: { kind: "once", on: "2026-11-01" } as const,
    toleranceJours: 0,
    preavisJours: 7,
    tenue: "souple" as const,
    importance: "normal" as const,
    ficheId,
    derniereFois: null,
    rappels: [],
    notifier: null,
  });

  it("⚠️ une échéance liée tient sa catégorie de sa fiche, et la suit", async () => {
    const ficheId = await commeMembre(sql(), moi.compte, tx =>
      creerFiche(tx, {
        nature: "equipement",
        titre: "Le four",
        categorie: "Cuisine",
        attributs: [],
      }),
    );
    const id = await commeMembre(sql(), moi.compte, tx =>
      // Une catégorie passée pour une échéance liée n'est pas gardée.
      creerEcheance(tx, echeanceDe(ficheId, "Ignorée")),
    );
    const categorieDe = async () =>
      (await commeMembre(sql(), conjoint.compte, listerEcheances)).find(
        e => e.id === id,
      )?.categorie;

    expect(await categorieDe()).toBe("Cuisine");
    await owner`update app.fiches set categorie = 'Nettoyage' where id = ${ficheId}`;
    expect(await categorieDe()).toBe("Nettoyage");
    expect(
      (await owner`select categorie from app.echeances where id = ${id}`)[0]
        ?.categorie,
    ).toBeNull();
  });

  it("liste les catégories du foyer : fiches et échéances seules", async () => {
    const ficheId = await commeMembre(sql(), moi.compte, tx =>
      creerFiche(tx, {
        nature: "equipement",
        titre: "Le four",
        categorie: "Cuisine",
        attributs: [],
      }),
    );
    await commeMembre(sql(), moi.compte, async tx => {
      await creerEcheance(tx, echeanceDe(null, "Santé"));
      await creerEcheance(tx, echeanceDe(ficheId, "Ignorée"));
    });
    await commeMembre(sql(), voisin.compte, tx =>
      creerFiche(tx, {
        nature: "equipement",
        titre: "Le bateau",
        categorie: "Bateau",
        attributs: [],
      }),
    );

    expect(
      (await commeMembre(sql(), conjoint.compte, listerCategories)).sort(),
    ).toEqual(["Cuisine", "Santé"]);
  });

  it("liste les marques du foyer : l'attribut « Marque » de ses fiches", async () => {
    const fiche = (titre: string, attributs: Attribut[]) => ({
      nature: "equipement" as const,
      titre,
      categorie: null,
      attributs,
    });
    await commeMembre(sql(), moi.compte, async tx => {
      await creerFiche(
        tx,
        fiche("Le four", [
          { libelle: "Marque", type: "texte", valeur: "Bosch" },
          { libelle: "Modèle", type: "texte", valeur: "Serie 6" },
        ]),
      );
      await creerFiche(
        tx,
        fiche("Le lave-vaisselle", [
          { libelle: "Marque", type: "texte", valeur: "Bosch" },
        ]),
      );
      await creerFiche(tx, fiche("La perceuse", []));
    });
    await commeMembre(sql(), voisin.compte, tx =>
      creerFiche(
        tx,
        fiche("Le bateau", [
          { libelle: "Marque", type: "texte", valeur: "Bénéteau" },
        ]),
      ),
    );

    expect(await commeMembre(sql(), conjoint.compte, listerMarques)).toEqual([
      "Bosch",
    ]);
  });
});
