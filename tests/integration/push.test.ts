import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  annoncesDe,
  enregistrerAbonnement,
  libererPush,
  listerAbonnes,
  noterAnnonces,
  oublierAbonnement,
  reserverPush,
  retirerAbonnement,
} from "@/lib/data/push-store";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import { enregistrerReglagesResumes } from "@/lib/data/resumes-store";
import {
  commeMembre,
  creerEcheance,
  definirExceptionPush,
  listerEcheances,
} from "@/lib/data/store";
import { fromISO } from "@/lib/domain/plain-date";
import { DIRECT_URL } from "./env";

/**
 * Les notifications push en base (migration 0012) : mes appareils et mes
 * exceptions sous la RLS, les abonnés et le journal en propriétaire.
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

async function membre(foyer: string, nom: string): Promise<Membre> {
  const compte = `${nom}-${crypto.randomUUID()}`;
  const [row] = await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyer}, ${compte}) returning id::text`;

  return { id: row?.id as string, compte };
}

const appareil = (nom: string) => ({
  endpoint: `https://push.exemple/${nom}-${crypto.randomUUID()}`,
  keys: { p256dh: `p-${nom}`, auth: `a-${nom}` },
});

beforeEach(async () => {
  const [row] = await owner`
    insert into app.foyers (nom) values ('Les notifications') returning id`;
  const foyer = row?.id as string;
  moi = await membre(foyer, "moi");
  conjoint = await membre(foyer, "conjoint");
});

describe("mes appareils", () => {
  it("s'enregistrent une fois, se mettent à jour, et ne se voient qu'à moi", async () => {
    const telephone = appareil("telephone");
    await commeMembre(owner, moi.compte, tx =>
      enregistrerAbonnement(tx, telephone),
    );
    await commeMembre(owner, moi.compte, tx =>
      enregistrerAbonnement(tx, {
        ...telephone,
        keys: { p256dh: "p-neuve", auth: "a-neuve" },
      }),
    );

    expect(
      await commeMembre(
        owner,
        moi.compte,
        tx => tx`select p256dh from app.abonnements_push`,
      ),
    ).toEqual([{ p256dh: "p-neuve" }]);
    expect(
      await commeMembre(
        owner,
        conjoint.compte,
        tx => tx`select 1 from app.abonnements_push`,
      ),
    ).toHaveLength(0);
  });

  it("⚠️ le conjoint ne retire pas le mien", async () => {
    const telephone = appareil("telephone");
    await commeMembre(owner, moi.compte, tx =>
      enregistrerAbonnement(tx, telephone),
    );
    await commeMembre(owner, conjoint.compte, tx =>
      retirerAbonnement(tx, telephone.endpoint),
    );

    expect(
      await owner`select 1 from app.abonnements_push
        where endpoint = ${telephone.endpoint}`,
    ).toHaveLength(1);

    await commeMembre(owner, moi.compte, tx =>
      retirerAbonnement(tx, telephone.endpoint),
    );

    expect(
      await owner`select 1 from app.abonnements_push
        where endpoint = ${telephone.endpoint}`,
    ).toHaveLength(0);
  });

  it("⚠️ refuse une adresse qui n'est pas en https", async () => {
    await expect(
      commeMembre(owner, moi.compte, tx =>
        enregistrerAbonnement(tx, {
          ...appareil("x"),
          endpoint: "http://push.exemple/x",
        }),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("abonnés et journal", () => {
  it("liste les comptes qui ont un appareil, avec leurs réglages", async () => {
    const [telephone, ordinateur] = [appareil("tel"), appareil("ordi")];
    await commeMembre(owner, moi.compte, async tx => {
      await enregistrerAbonnement(tx, telephone);
      await enregistrerAbonnement(tx, ordinateur);
      await enregistrerReglagesResumes(tx, {
        ...REGLAGES_PAR_DEFAUT,
        push: { critique: true, important: false, normal: true, memoire: true },
      });
    });

    const abonnes = (await listerAbonnes(owner)).filter(a =>
      [moi.id, conjoint.id].includes(a.membre),
    );

    expect(abonnes).toEqual([
      {
        membre: moi.id,
        compte: moi.compte,
        reglages: {
          ...REGLAGES_PAR_DEFAUT,
          push: {
            critique: true,
            important: false,
            normal: true,
            memoire: true,
          },
        },
        abonnements: [telephone, ordinateur],
      },
    ]);

    await oublierAbonnement(owner, telephone.endpoint);
    await commeMembre(owner, conjoint.compte, tx =>
      enregistrerAbonnement(tx, appareil("tablette")),
    );

    const ensuite = (await listerAbonnes(owner)).filter(a =>
      [moi.id, conjoint.id].includes(a.membre),
    );

    expect(ensuite.find(a => a.membre === moi.id)?.abonnements).toEqual([
      ordinateur,
    ]);
    expect(ensuite.find(a => a.membre === conjoint.id)?.reglages).toEqual(
      REGLAGES_PAR_DEFAUT,
    );
  });

  it("réserve la notification du matin une fois par jour, et la rend", async () => {
    expect(await reserverPush(owner, moi.id, "2026-10-19")).toBe(true);
    expect(await reserverPush(owner, moi.id, "2026-10-19")).toBe(false);
    expect(await reserverPush(owner, conjoint.id, "2026-10-19")).toBe(true);

    await libererPush(owner, moi.id, "2026-10-19");

    expect(await reserverPush(owner, moi.id, "2026-10-19")).toBe(true);
  });

  it("note les arrivées annoncées, sans la journée", async () => {
    await reserverPush(owner, moi.id, "2026-10-19");
    await noterAnnonces(owner, moi.id, []);
    await noterAnnonces(owner, moi.id, [
      { cle: "e-1", due: fromISO("2026-10-19") },
      { cle: "c-2", due: fromISO("2026-10-15") },
    ]);
    // Rejouable.
    await noterAnnonces(owner, moi.id, [
      { cle: "e-1", due: fromISO("2026-10-19") },
    ]);

    expect(await annoncesDe(owner, moi.id)).toEqual(
      new Set(["e-1@2026-10-19", "c-2@2026-10-15"]),
    );
    expect(await annoncesDe(owner, conjoint.id)).toEqual(new Set());
  });

  it("⚠️ un membre ne lit pas le journal", async () => {
    await reserverPush(owner, moi.id, "2026-10-19");

    await expect(
      commeMembre(owner, moi.compte, tx => tx`select 1 from app.push_envoyes`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("l'exception d'une échéance", () => {
  const nouvelle = (notifier: boolean | null) => ({
    titre: "Vidange",
    categorie: null,
    recurrence: { kind: "once", on: "2026-12-01" } as const,
    toleranceJours: 0,
    preavisJours: 7,
    tenue: "souple" as const,
    importance: "normal" as const,
    ficheId: null,
    derniereFois: null,
    rappels: [],
    notifier,
  });
  const vue = async (m: Membre, id: string) =>
    (await commeMembre(owner, m.compte, listerEcheances)).find(e => e.id === id)
      ?.notifier;

  it("se pose à la création, pour moi seulement, puis se change", async () => {
    const id = await commeMembre(owner, moi.compte, tx =>
      creerEcheance(tx, nouvelle(true)),
    );

    expect(await vue(moi, id)).toBe(true);
    expect(await vue(conjoint, id)).toBeNull();

    await commeMembre(owner, conjoint.compte, tx =>
      definirExceptionPush(tx, id, false),
    );
    await commeMembre(owner, moi.compte, tx =>
      definirExceptionPush(tx, id, false),
    );

    expect(await vue(moi, id)).toBe(false);
    expect(await vue(conjoint, id)).toBe(false);

    await commeMembre(owner, moi.compte, tx =>
      definirExceptionPush(tx, id, null),
    );

    expect(await vue(moi, id)).toBeNull();
    expect(await vue(conjoint, id)).toBe(false);
  });

  it("⚠️ pas d'exception sur une échéance que je ne vois pas", async () => {
    const id = await commeMembre(owner, moi.compte, async tx => {
      const [row] = await tx`
        insert into app.echeances (titre, recurrence, tenue, prive)
        values ('Secret', ${tx.json({ kind: "once", on: "2026-12-01" })},
          'souple', true)
        returning id::text`;

      return row?.id as string;
    });

    await expect(
      commeMembre(owner, conjoint.compte, tx =>
        definirExceptionPush(tx, id, true),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
