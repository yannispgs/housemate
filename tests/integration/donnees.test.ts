import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jeuFictif } from "@/lib/data/jeu-fictif";
import { foyerVide, remplirFoyer } from "@/lib/data/remplissage";
import {
  echeanceSaisie,
  garantieSaisie,
  lire,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import {
  ajouterPieceJointe,
  annulerCompletions,
  commeMembre,
  completer,
  creerEcheance,
  creerFiche,
  creerGarantie,
  lireFiche,
  lireFoyer,
  lirePieceJointe,
  listerEcheances,
  listerFiches,
  volumePiecesJointes,
} from "@/lib/data/store";
import { homeDeadlines } from "@/lib/data/views";
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

describe("remplissage d'une preview", () => {
  const TODAY = fromISO("2026-10-15");

  it("remplit un foyer vide, sous la RLS, et rien d'autre", async () => {
    expect(await commeMembre(sql(), moi.compte, foyerVide)).toBe(true);

    expect(
      await commeMembre(sql(), moi.compte, tx =>
        remplirFoyer(tx, jeuFictif(TODAY)),
      ),
    ).toEqual({ fiches: 12, echeances: 18 });

    expect(await commeMembre(sql(), conjoint.compte, foyerVide)).toBe(false);
    // ⚠️ Le foyer voisin n'en voit rien.
    expect(await commeMembre(sql(), voisin.compte, foyerVide)).toBe(true);
  });

  it("donne un accueil vivant : critique en tête, à faire, en préavis", async () => {
    await commeMembre(sql(), moi.compte, tx =>
      remplirFoyer(tx, jeuFictif(TODAY)),
    );
    const accueil = homeDeadlines(
      await commeMembre(sql(), moi.compte, listerEcheances),
      TODAY,
    );

    expect(accueil.map(v => v.state)).toEqual(
      expect.arrayContaining(["en retard", "due", "en préavis"]),
    );
    expect(accueil[0]?.title).toBe("Purger les radiateurs");
    expect(
      (await commeMembre(sql(), moi.compte, listerFiches)).map(f => f.titre),
    ).toContain("La balance de cuisine");
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
