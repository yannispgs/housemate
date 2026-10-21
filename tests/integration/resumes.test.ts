import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { REGLAGES_PAR_DEFAUT, type ReglagesResumes } from "@/lib/data/resumes";
import {
  enregistrerReglagesResumes,
  libererResume,
  lireReglagesResumes,
  listerDestinataires,
  reserverResume,
} from "@/lib/data/resumes-store";
import { commeMembre } from "@/lib/data/store";
import { DIRECT_URL } from "./env";

/**
 * Les résumés en base (migration 0010) : les réglages sous la RLS, la liste
 * des destinataires et le journal des envois en propriétaire.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

interface Membre {
  readonly id: string;
  readonly compte: string;
}

let moi: Membre;
let conjoint: Membre;
let sansAdresse: Membre;

async function membre(foyer: string, nom: string, email?: string) {
  const compte = `${nom}-${crypto.randomUUID()}`;
  const [row] = await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyer}, ${compte}) returning id::text`;
  const id = row?.id as string;

  if (email !== undefined) {
    await owner`insert into app.adresses (membre_id, email) values (${id}, ${email})`;
  }

  return { id, compte };
}

beforeEach(async () => {
  await owner`delete from app.resumes_envoyes`;
  await owner`delete from app.reglages_resumes`;
  await owner`delete from app.adresses`;
  const [row] = await owner`
    insert into app.foyers (nom) values ('Les résumés') returning id`;
  const foyer = row?.id as string;
  moi = await membre(foyer, "moi", "moi@exemple.fr");
  conjoint = await membre(foyer, "conjoint", "conjoint@exemple.fr");
  sansAdresse = await membre(foyer, "sans");
});

const QUOTIDIEN: ReglagesResumes = {
  ...REGLAGES_PAR_DEFAUT,
  hebdo: false,
  quotidien: true,
  quotidienHeure: 8,
  horizonJours: 14,
  retards: false,
  perimetre: "foyer",
  email: { critique: true, important: false, normal: false, memoire: true },
};

describe("réglages des résumés", () => {
  it("valent ceux par défaut tant que rien n'est enregistré", async () => {
    expect(await commeMembre(owner, moi.compte, lireReglagesResumes)).toEqual(
      REGLAGES_PAR_DEFAUT,
    );
  });

  it("s'enregistrent, puis se remplacent, à mon nom seulement", async () => {
    await commeMembre(owner, moi.compte, tx =>
      enregistrerReglagesResumes(tx, QUOTIDIEN),
    );
    await commeMembre(owner, moi.compte, tx =>
      enregistrerReglagesResumes(tx, { ...QUOTIDIEN, quotidienHeure: 9 }),
    );

    expect(await commeMembre(owner, moi.compte, lireReglagesResumes)).toEqual({
      ...QUOTIDIEN,
      quotidienHeure: 9,
    });
    // Ceux du conjoint ne bougent pas, et il ne voit pas les miens.
    expect(
      await commeMembre(owner, conjoint.compte, lireReglagesResumes),
    ).toEqual(REGLAGES_PAR_DEFAUT);
  });

  it("⚠️ refuse une heure hors de 0 à 23", async () => {
    await expect(
      commeMembre(owner, moi.compte, tx =>
        enregistrerReglagesResumes(tx, { ...QUOTIDIEN, quotidienHeure: 24 }),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("destinataires et journal", () => {
  it("liste les comptes qui ont une adresse, avec leurs réglages", async () => {
    await commeMembre(owner, moi.compte, tx =>
      enregistrerReglagesResumes(tx, QUOTIDIEN),
    );

    const liste = (await listerDestinataires(owner)).filter(d =>
      [moi.id, conjoint.id, sansAdresse.id].includes(d.membre),
    );

    expect(liste).toHaveLength(2);
    expect(liste).toContainEqual({
      membre: moi.id,
      compte: moi.compte,
      email: "moi@exemple.fr",
      reglages: QUOTIDIEN,
    });
    expect(liste).toContainEqual({
      membre: conjoint.id,
      compte: conjoint.compte,
      email: "conjoint@exemple.fr",
      reglages: REGLAGES_PAR_DEFAUT,
    });
  });

  it("réserve un envoi une seule fois par jour, et le rend s'il échoue", async () => {
    expect(await reserverResume(owner, moi.id, "hebdo", "2026-10-19")).toBe(
      true,
    );
    expect(await reserverResume(owner, moi.id, "hebdo", "2026-10-19")).toBe(
      false,
    );
    // Une autre sorte, ou un autre jour : indépendants.
    expect(await reserverResume(owner, moi.id, "quotidien", "2026-10-19")).toBe(
      true,
    );
    expect(await reserverResume(owner, moi.id, "hebdo", "2026-10-26")).toBe(
      true,
    );

    await libererResume(owner, moi.id, "hebdo", "2026-10-19");

    expect(await reserverResume(owner, moi.id, "hebdo", "2026-10-19")).toBe(
      true,
    );
  });

  it("⚠️ un membre ne lit pas le journal", async () => {
    await reserverResume(owner, moi.id, "hebdo", "2026-10-19");

    await expect(
      commeMembre(
        owner,
        moi.compte,
        tx => tx`select * from app.resumes_envoyes`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
