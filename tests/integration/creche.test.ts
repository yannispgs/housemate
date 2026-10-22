import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { REGLAGES_CRECHE_PAR_DEFAUT } from "@/lib/data/creche";
import {
  abonnerRappelCreche,
  desabonnerRappelCreche,
  enregistrerReglagesCreche,
  libererRappelCreche,
  lireExceptionsCreche,
  lireReglagesCreche,
  listerAbonnesCreche,
  pluiePrevue,
  poserExceptionCreche,
  recoisRappelCreche,
  reserverRappelCreche,
  retirerExceptionCreche,
} from "@/lib/data/creche-store";
import { commeMembre } from "@/lib/data/store";
import { DIRECT_URL } from "./env";

/**
 * Le rappel de crèche en base (migrations 0013 et 0014) : les réglages partagés par
 * le foyer, l'abonnement de chacun, la pluie figée et le journal.
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
let voisin: Membre;

async function foyer(nom: string): Promise<string> {
  const [row] = await owner`
    insert into app.foyers (nom) values (${nom}) returning id::text`;

  return row?.id as string;
}

async function membre(foyerId: string, nom: string): Promise<Membre> {
  const compte = `${nom}-${crypto.randomUUID()}`;
  const [row] = await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyerId}, ${compte}) returning id::text`;
  const id = row?.id as string;
  await owner`insert into app.adresses (membre_id, email) values (${id}, ${`${nom}@exemple.fr`})`;

  return { id, compte };
}

beforeEach(async () => {
  await owner`delete from app.creche_envoyes`;
  await owner`delete from app.abonnes_creche`;
  await owner`delete from app.jours_creche`;
  await owner`delete from app.reglages_creche`;
  await owner`delete from meteo.previsions_pluie`;
  const nous = await foyer("La crèche");
  moi = await membre(nous, "moi");
  conjoint = await membre(nous, "conjoint");
  voisin = await membre(await foyer("Les voisins"), "voisin");
});

const NOMMES = {
  jours: [1, 2, 4] as const,
  enfant: "Enfant B",
  parentSec: "Parent A",
  parentPluie: "Parent C",
};

describe("réglages de crèche", () => {
  it("valent ceux par défaut, puis se partagent dans le foyer seulement", async () => {
    expect(await commeMembre(owner, moi.compte, lireReglagesCreche)).toEqual(
      REGLAGES_CRECHE_PAR_DEFAUT,
    );

    await commeMembre(owner, moi.compte, tx =>
      enregistrerReglagesCreche(tx, { ...NOMMES, jours: [1, 2] }),
    );
    await commeMembre(owner, conjoint.compte, tx =>
      enregistrerReglagesCreche(tx, { ...NOMMES, jours: [...NOMMES.jours] }),
    );

    expect(await commeMembre(owner, moi.compte, lireReglagesCreche)).toEqual({
      ...NOMMES,
      jours: [1, 2, 4],
    });
    expect(await commeMembre(owner, voisin.compte, lireReglagesCreche)).toEqual(
      REGLAGES_CRECHE_PAR_DEFAUT,
    );
  });
});

describe("jours sans crèche", () => {
  it("se posent, se remplacent et se retirent, dans le foyer seulement", async () => {
    await commeMembre(owner, moi.compte, async tx => {
      await poserExceptionCreche(tx, { jour: "2026-12-24", creche: true });
      await poserExceptionCreche(tx, { jour: "2026-12-24", creche: false });
      await poserExceptionCreche(tx, { jour: "2026-12-25", creche: false });
      await poserExceptionCreche(tx, { jour: "2027-01-04", creche: false });
    });
    await commeMembre(owner, conjoint.compte, tx =>
      retirerExceptionCreche(tx, "2026-12-25"),
    );

    expect(
      await commeMembre(owner, conjoint.compte, tx =>
        lireExceptionsCreche(tx, "2026-12-01", "2026-12-31"),
      ),
    ).toEqual([{ jour: "2026-12-24", creche: false }]);
    expect(
      await commeMembre(owner, voisin.compte, tx =>
        lireExceptionsCreche(tx, "2026-01-01", "2027-12-31"),
      ),
    ).toEqual([]);
  });

  it("accompagnent les abonnés, sans les jours passés", async () => {
    await commeMembre(owner, moi.compte, async tx => {
      await abonnerRappelCreche(tx);
      await poserExceptionCreche(tx, { jour: "2000-01-03", creche: false });
      await poserExceptionCreche(tx, { jour: "2999-01-03", creche: false });
    });

    const [abonne] = await listerAbonnesCreche(owner);

    expect(abonne?.exceptions).toEqual([{ jour: "2999-01-03", creche: false }]);
  });
});

describe("abonnement au rappel", () => {
  it("est personnel, et rejouable", async () => {
    await commeMembre(owner, moi.compte, abonnerRappelCreche);
    await commeMembre(owner, moi.compte, abonnerRappelCreche);

    expect(await commeMembre(owner, moi.compte, recoisRappelCreche)).toBe(true);
    expect(await commeMembre(owner, conjoint.compte, recoisRappelCreche)).toBe(
      false,
    );

    await commeMembre(owner, moi.compte, desabonnerRappelCreche);
    expect(await commeMembre(owner, moi.compte, recoisRappelCreche)).toBe(
      false,
    );
  });

  it("liste les abonnés avec leur adresse et les réglages de leur foyer", async () => {
    await commeMembre(owner, moi.compte, abonnerRappelCreche);
    await commeMembre(owner, voisin.compte, abonnerRappelCreche);
    await commeMembre(owner, moi.compte, tx =>
      enregistrerReglagesCreche(tx, { ...NOMMES, jours: [...NOMMES.jours] }),
    );

    const abonnes = await listerAbonnesCreche(owner);

    expect(abonnes).toHaveLength(2);
    expect(abonnes).toContainEqual({
      membre: moi.id,
      email: "moi@exemple.fr",
      reglages: { ...NOMMES, jours: [1, 2, 4] },
      exceptions: [],
    });
    expect(abonnes).toContainEqual({
      membre: voisin.id,
      email: "voisin@exemple.fr",
      reglages: REGLAGES_CRECHE_PAR_DEFAUT,
      exceptions: [],
    });
  });
});

describe("pluiePrevue", () => {
  const MAINTENANT = new Date("2026-10-21T20:05:00Z");

  async function prevision(modele: string, recuperee: string, mm: number) {
    await owner`
      insert into meteo.previsions_pluie
        (source, modele, recuperee_le, debut, fin, precipitation_mm)
      values ('open-meteo', ${modele}, ${recuperee},
        '2026-10-22T06:00:00Z', '2026-10-22T07:00:00Z', ${mm})`;
  }

  it("garde la dernière récupération récente de chaque modèle", async () => {
    await prevision("icon", "2026-10-21T18:00:00Z", 9);
    await prevision("icon", "2026-10-21T20:00:00Z", 0.4);
    // Figée la veille : trop vieille pour décider ce soir.
    await prevision("gfs", "2026-10-20T20:00:00Z", 5);

    expect(await pluiePrevue(owner, MAINTENANT)).toEqual([
      {
        model: "open-meteo/icon",
        start: new Date("2026-10-22T06:00:00Z"),
        millimetres: 0.4,
      },
    ]);
  });
});

describe("journal des rappels", () => {
  it("réserve une fois par compte et par jour, et se rend", async () => {
    expect(await reserverRappelCreche(owner, moi.id, "2026-10-22")).toBe(true);
    expect(await reserverRappelCreche(owner, moi.id, "2026-10-22")).toBe(false);
    expect(await reserverRappelCreche(owner, conjoint.id, "2026-10-22")).toBe(
      true,
    );

    await libererRappelCreche(owner, moi.id, "2026-10-22");
    expect(await reserverRappelCreche(owner, moi.id, "2026-10-22")).toBe(true);
  });

  it("reste fermé aux comptes", async () => {
    await expect(
      owner.begin(async tx => {
        await tx`set local role authenticated`;
        await tx`select * from app.creche_envoyes`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
