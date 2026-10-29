import { describe, expect, it, vi } from "vitest";
import {
  AbonnementPerime,
  envoyerPush,
  type PushDeps,
} from "@/lib/data/envoi-push";
import type { MessagePush } from "@/lib/data/push";
import type { Abonne, Abonnement } from "@/lib/data/push-store";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import type { EcheanceRow } from "@/lib/data/views";
import { fromISO, toISO } from "@/lib/domain/plain-date";

const LUNDI = fromISO("2026-10-19");
const MATIN = { jour: LUNDI, heure: 8 };

const importante: EcheanceRow = {
  id: "e",
  titre: "Vidange",
  categorie: "Véhicule",
  recurrence: { kind: "once", on: LUNDI },
  toleranceJours: 3,
  preavisJours: 7,
  tenue: "souple",
  importance: "important",
  ficheId: null,
  ficheTitre: null,
  destinataire: "Foyer",
  pourMoi: true,
  creeLe: fromISO("2026-10-01"),
  completions: [],
  rappels: [],
  notifier: null,
};

const appareil = (nom: string): Abonnement => ({
  endpoint: `https://push.exemple/${nom}`,
  keys: { p256dh: "p", auth: "a" },
});

const moi: Abonne = {
  membre: "m1",
  compte: "c1",
  reglages: REGLAGES_PAR_DEFAUT,
  abonnements: [appareil("telephone"), appareil("ordinateur")],
};
const toi: Abonne = {
  membre: "m2",
  compte: "c2",
  reglages: REGLAGES_PAR_DEFAUT,
  abonnements: [appareil("tablette")],
};

function doublures(overrides: Partial<PushDeps> = {}) {
  const journal = new Set<string>();
  const annonces = new Set<string>();
  const recus: { endpoint: string; message: MessagePush }[] = [];
  const oublies: string[] = [];
  const deps: PushDeps = {
    abonnes: async () => [moi, toi],
    reserver: async (membre, jour) => {
      const cle = `${membre}/${jour}`;
      const libre = !journal.has(cle);
      journal.add(cle);

      return libre;
    },
    liberer: async (membre, jour) => {
      journal.delete(`${membre}/${jour}`);
    },
    annonces: async () => annonces,
    noterAnnonces: async (_membre, elements) => {
      for (const e of elements) {
        annonces.add(`${e.cle}@${toISO(e.due)}`);
      }
    },
    contenu: async compte => ({
      echeances: compte === "c1" ? [importante] : [],
      consommables: [],
    }),
    envoyer: async (abonnement, message) => {
      recus.push({ endpoint: abonnement.endpoint, message });
    },
    oublier: async endpoint => {
      oublies.push(endpoint);
    },
    ...overrides,
  };

  return { deps, journal, annonces, recus, oublies };
}

describe("envoyerPush", () => {
  it("rien avant l'heure du matin", async () => {
    const { deps, recus } = doublures();

    expect(await envoyerPush(deps, { jour: LUNDI, heure: 7 })).toEqual({
      envoyes: 0,
      vides: 0,
      echecs: 0,
    });
    expect(recus).toEqual([]);
  });

  it("une notification sur chaque appareil, et une arrivée annoncée une fois", async () => {
    const { deps, recus, journal, annonces } = doublures();

    expect(await envoyerPush(deps, MATIN)).toEqual({
      envoyes: 1,
      vides: 1,
      echecs: 0,
    });
    expect(recus.map(r => r.endpoint)).toEqual([
      "https://push.exemple/telephone",
      "https://push.exemple/ordinateur",
    ]);
    expect(recus[0]?.message.title).toBe("Vidange");
    expect([...journal]).toEqual(["m1/2026-10-19"]);
    expect([...annonces]).toEqual(["e-e@2026-10-19"]);

    // L'appel suivant, le même jour : rien de plus.
    expect(await envoyerPush(deps, { jour: LUNDI, heure: 9 })).toEqual({
      envoyes: 0,
      vides: 1,
      echecs: 0,
    });
    // Le lendemain : l'arrivée est déjà annoncée.
    expect(
      await envoyerPush(deps, { jour: fromISO("2026-10-20"), heure: 8 }),
    ).toEqual({ envoyes: 0, vides: 2, echecs: 0 });
    expect(recus).toHaveLength(2);
  });

  it("rend la journée si aucun appareil ne l'a reçue", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, journal, annonces } = doublures({
      abonnes: async () => [moi],
      envoyer: async () => {
        throw new Error("service indisponible");
      },
    });

    expect(await envoyerPush(deps, MATIN)).toEqual({
      envoyes: 0,
      vides: 0,
      echecs: 1,
    });
    expect(journal.size).toBe(0);
    expect(annonces.size).toBe(0);
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });

  it("oublie un appareil périmé, sans compter d'échec", async () => {
    const { deps, oublies, recus } = doublures({
      abonnes: async () => [moi],
      envoyer: async abonnement => {
        if (abonnement.endpoint.endsWith("ordinateur")) {
          throw new AbonnementPerime("410");
        }

        recus.push({ endpoint: abonnement.endpoint, message: {} as never });
      },
    });

    expect(await envoyerPush(deps, MATIN)).toEqual({
      envoyes: 1,
      vides: 0,
      echecs: 0,
    });
    expect(oublies).toEqual(["https://push.exemple/ordinateur"]);
  });

  it("plus aucun appareil : ni envoi ni échec", async () => {
    const { deps, journal } = doublures({
      abonnes: async () => [{ ...moi, abonnements: [appareil("vieux")] }],
      envoyer: async () => {
        throw new AbonnementPerime("404");
      },
    });

    expect(await envoyerPush(deps, MATIN)).toEqual({
      envoyes: 0,
      vides: 1,
      echecs: 0,
    });
    expect(journal.size).toBe(0);
  });
});
