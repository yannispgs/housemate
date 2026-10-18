import { describe, expect, it, vi } from "vitest";
import type { MailContent } from "@/lib/auth/messages";
import { type EnvoiDeps, envoyerResumes } from "@/lib/data/envoi-resumes";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import type { Destinataire } from "@/lib/data/resumes-store";
import type { EcheanceRow } from "@/lib/data/views";
import { fromISO } from "@/lib/domain/plain-date";

const LUNDI = fromISO("2026-10-19");
const LIEN = "https://house-mate.app/reglages";

const aFaire: EcheanceRow = {
  id: "e",
  titre: "Vidange",
  categorie: "Véhicule",
  recurrence: { kind: "once", on: LUNDI },
  toleranceJours: 3,
  preavisJours: 7,
  tenue: "souple",
  importance: "normal",
  ficheTitre: null,
  destinataire: "Foyer",
  pourMoi: true,
  creeLe: fromISO("2026-10-01"),
  completions: [],
  rappels: [],
  notifier: null,
};

const moi: Destinataire = {
  membre: "m1",
  compte: "c1",
  email: "moi@exemple.fr",
  reglages: { ...REGLAGES_PAR_DEFAUT, quotidien: true, quotidienHeure: 6 },
};
const toi: Destinataire = {
  membre: "m2",
  compte: "c2",
  email: "toi@exemple.fr",
  reglages: REGLAGES_PAR_DEFAUT,
};

function doublures(overrides: Partial<EnvoiDeps> = {}) {
  const journal = new Set<string>();
  const envoyes: { to: string; content: MailContent }[] = [];
  const deps: EnvoiDeps = {
    destinataires: async () => [moi, toi],
    reserver: async (membre, sorte, jour) => {
      const cle = `${membre}/${sorte}/${jour}`;
      const libre = !journal.has(cle);
      journal.add(cle);

      return libre;
    },
    liberer: async (membre, sorte, jour) => {
      journal.delete(`${membre}/${sorte}/${jour}`);
    },
    contenu: async compte => ({
      echeances: compte === "c1" ? [aFaire] : [],
      consommables: [],
    }),
    envoyer: async (to, content) => {
      envoyes.push({ to, content });
    },
    ...overrides,
  };

  return { deps, journal, envoyes };
}

describe("envoyerResumes", () => {
  it("envoie chaque résumé dû une seule fois par jour", async () => {
    const { deps, envoyes, journal } = doublures();

    expect(await envoyerResumes(deps, { jour: LUNDI, heure: 6 }, LIEN)).toEqual(
      { envoyes: 2, vides: 1, echecs: 0 },
    );
    expect(envoyes.map(e => [e.to, e.content.subject])).toEqual([
      ["moi@exemple.fr", "Votre semaine : 1 échéance"],
      ["moi@exemple.fr", "Aujourd'hui : 1 échéance"],
    ]);
    // Le résumé vide de « toi » est noté : il n'est pas recomposé.
    expect(journal).toContain("m2/hebdo/2026-10-19");

    // À 7 h, le quotidien de « toi » se compose (pour d'éventuels rappels),
    // vide : rien ne part.
    expect(await envoyerResumes(deps, { jour: LUNDI, heure: 7 }, LIEN)).toEqual(
      { envoyes: 0, vides: 1, echecs: 0 },
    );
    expect(envoyes).toHaveLength(2);
  });

  it("ne lit rien avant l'heure", async () => {
    const contenu = vi.fn(async () => ({
      echeances: [aFaire],
      consommables: [],
    }));
    const { deps } = doublures({ contenu });

    expect(await envoyerResumes(deps, { jour: LUNDI, heure: 5 }, LIEN)).toEqual(
      { envoyes: 0, vides: 0, echecs: 0 },
    );
    expect(contenu).not.toHaveBeenCalled();
  });

  it("rend un envoi échoué, pour le retenter à l'appel suivant", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const echec = doublures({
      envoyer: async () => {
        throw new Error("relais injoignable");
      },
    });

    expect(
      await envoyerResumes(echec.deps, { jour: LUNDI, heure: 6 }, LIEN),
    ).toEqual({ envoyes: 0, vides: 1, echecs: 2 });
    expect(echec.journal).not.toContain("m1/hebdo/2026-10-19");
    expect(echec.journal).toContain("m2/hebdo/2026-10-19");
  });
});
