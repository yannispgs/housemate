import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  commeMembre,
  completer,
  listerEcheances,
  listerFiches,
} from "@/lib/data/store";
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

async function creerEcheance(
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
    await creerEcheance(moi, {
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
    await creerEcheance(moi, { titre: "Pour tous" });
    await creerEcheance(moi, { titre: "Pour moi", destinataire: moi.id });
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
    const id = await creerEcheance(moi, { titre: "À faire" });
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
    const id = await creerEcheance(moi, { titre: "Corrigée" });
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

  it("⚠️ refuse de cocher l'échéance d'un autre foyer", async () => {
    const id = await creerEcheance(moi, { titre: "Chez nous" });

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
