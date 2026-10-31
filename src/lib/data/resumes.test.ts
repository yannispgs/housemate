import { describe, expect, it } from "vitest";
import {
  composerResume,
  jourIso,
  REGLAGES_PAR_DEFAUT,
  type ReglagesResumes,
  reglagesSaisis,
  resumesDus,
} from "@/lib/data/resumes";
import type { ConsommableRow } from "@/lib/data/store";
import type { EcheanceRow } from "@/lib/data/views";
import { fromISO } from "@/lib/domain/plain-date";

const d = fromISO;
/** Un lundi. */
const LUNDI = d("2026-10-19");
const LIEN = "https://house-mate.app/reglages";

const echeance = (overrides: Partial<EcheanceRow>): EcheanceRow => ({
  id: "e",
  titre: "Échéance",
  categorie: "Maison",
  recurrence: { kind: "once", on: LUNDI },
  toleranceJours: 3,
  preavisJours: 7,
  tenue: "souple",
  importance: "normal",
  ficheId: null,
  ficheTitre: null,
  destinataire: "Foyer",
  pourMoi: true,
  creeLe: d("2026-10-01"),
  completions: [],
  rappels: [],
  ...overrides,
});

const reglages = (overrides: Partial<ReglagesResumes>): ReglagesResumes => ({
  ...REGLAGES_PAR_DEFAUT,
  ...overrides,
});

describe("jourIso", () => {
  it("compte de 1, le lundi, à 7, le dimanche", () => {
    expect(jourIso(LUNDI)).toBe(1);
    expect(jourIso(d("2026-10-25"))).toBe(7);
  });
});

describe("resumesDus", () => {
  it("part le lundi dès 6 h par défaut, et pas avant", () => {
    expect(resumesDus(REGLAGES_PAR_DEFAUT, { jour: LUNDI, heure: 5 })).toEqual(
      [],
    );
    expect(resumesDus(REGLAGES_PAR_DEFAUT, { jour: LUNDI, heure: 6 })).toEqual([
      "hebdo",
    ]);
    // Un appel manqué : rattrapé plus tard le même jour.
    expect(resumesDus(REGLAGES_PAR_DEFAUT, { jour: LUNDI, heure: 9 })).toEqual([
      "hebdo",
      "quotidien",
    ]);
  });

  it("l'hebdomadaire ne part pas un autre jour que le sien", () => {
    expect(
      resumesDus(REGLAGES_PAR_DEFAUT, { jour: d("2026-10-20"), heure: 9 }),
    ).toEqual(["quotidien"]);
  });

  it("compose le quotidien chaque jour à son heure, pour ses rappels", () => {
    const deux = reglages({ quotidien: true, quotidienHeure: 8 });

    expect(resumesDus(deux, { jour: LUNDI, heure: 7 })).toEqual(["hebdo"]);
    expect(resumesDus(deux, { jour: LUNDI, heure: 8 })).toEqual([
      "hebdo",
      "quotidien",
    ]);
    // Même non voulu : un rappel par e-mail du jour le fait partir.
    expect(
      resumesDus(reglages({ hebdo: false }), { jour: LUNDI, heure: 7 }),
    ).toEqual(["quotidien"]);
  });
});

describe("composerResume", () => {
  const rows = [
    echeance({
      id: "1",
      titre: "Vidange",
      importance: "critique",
      tenue: "ferme",
      ficheTitre: "La voiture",
    }),
    echeance({
      id: "2",
      titre: "Assurance",
      tenue: "ferme",
      recurrence: { kind: "once", on: d("2026-10-10") },
    }),
    echeance({
      id: "3",
      titre: "Ramonage",
      importance: "important",
      recurrence: { kind: "once", on: d("2026-10-23") },
    }),
    echeance({
      id: "4",
      titre: "Contrôle technique",
      recurrence: { kind: "once", on: d("2026-11-10") },
    }),
    echeance({ id: "5", titre: "Anniversaire", importance: "memoire" }),
    echeance({ id: "6", titre: "Sa tâche", pourMoi: false }),
  ];

  it("regroupe tout en un seul message, section par section", () => {
    expect(
      composerResume(
        { echeances: rows, consommables: [] },
        LUNDI,
        "hebdo",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      ),
    ).toEqual({
      subject: "Votre semaine : 3 échéances",
      text: [
        "Bonjour,",
        "",
        "À faire",
        "- aujourd'hui · Vidange · La voiture (critique, ferme)",
        "",
        "En retard",
        "- depuis 9 jours · Assurance (critique, ferme)",
        "",
        "À venir, les sept prochains jours",
        "- 23 oct. · Ramonage (important)",
        "",
        `Régler ces résumés : ${LIEN}`,
        "",
        "HouseMate",
      ].join("\n"),
    });
  });

  it("suit l'horizon, les retards, le périmètre et les niveaux choisis", () => {
    const texte = composerResume(
      { echeances: rows, consommables: [] },
      LUNDI,
      "quotidien",
      reglages({
        quotidien: true,
        horizonJours: 30,
        retards: false,
        perimetre: "foyer",
        email: {
          critique: false,
          important: true,
          normal: true,
          memoire: true,
        },
      }),
      LIEN,
    );

    expect(texte?.subject).toBe("Aujourd'hui : 4 échéances");
    expect(texte?.text).toContain("À venir, les 30 prochains jours");
    expect(texte?.text).toContain("Contrôle technique");
    expect(texte?.text).toContain("Anniversaire");
    expect(texte?.text).toContain("Sa tâche");
    expect(texte?.text).not.toContain("Vidange");
    expect(texte?.text).not.toContain("En retard");
  });

  it("rappelle ce qui a été fait dans la semaine, au résumé hebdomadaire", () => {
    const faite = echeance({
      titre: "Tonte",
      ficheTitre: "Le jardin",
      recurrence: { kind: "once", on: d("2026-10-15") },
      completions: [
        { occurrence: d("2026-10-15"), faiteLe: d("2026-10-14") },
        { occurrence: d("2026-10-15"), faiteLe: d("2026-10-11") },
      ],
    });
    const seule = echeance({
      titre: "Lessive",
      recurrence: { kind: "once", on: d("2026-10-12") },
      completions: [{ occurrence: d("2026-10-12"), faiteLe: d("2026-10-13") }],
    });

    expect(
      composerResume(
        { echeances: [faite, seule], consommables: [] },
        LUNDI,
        "hebdo",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      ),
    ).toEqual({
      subject: "Votre semaine : 0 échéances",
      text: [
        "Bonjour,",
        "",
        "Fait ces sept derniers jours",
        "- 14 oct. · Tonte · Le jardin",
        "- 13 oct. · Lessive",
        "",
        `Régler ces résumés : ${LIEN}`,
        "",
        "HouseMate",
      ].join("\n"),
    });
    // Le quotidien ne parle que de ce qui vient : rien à dire ici.
    expect(
      composerResume(
        { echeances: [faite], consommables: [] },
        LUNDI,
        "quotidien",
        reglages({ quotidien: true }),
        LIEN,
      ),
    ).toBeNull();
  });

  it("dit « 1 échéance » au singulier", () => {
    expect(
      composerResume(
        { echeances: [rows[0] as EcheanceRow], consommables: [] },
        LUNDI,
        "quotidien",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      )?.subject,
    ).toBe("Aujourd'hui : 1 échéance");
  });

  it("ne part pas vide", () => {
    expect(
      composerResume(
        { echeances: [], consommables: [] },
        LUNDI,
        "hebdo",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      ),
    ).toBeNull();
    // Une récurrence illisible ne compte pas.
    expect(
      composerResume(
        { echeances: [echeance({ recurrence: null })], consommables: [] },
        LUNDI,
        "hebdo",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      ),
    ).toBeNull();
  });
});

describe("reglagesSaisis", () => {
  it("accepte des réglages complets", () => {
    expect(reglagesSaisis.parse(REGLAGES_PAR_DEFAUT)).toEqual(
      REGLAGES_PAR_DEFAUT,
    );
  });

  it("⚠️ refuse un horizon, un jour ou une heure hors des choix", () => {
    for (const faux of [
      { horizonJours: 10 },
      { hebdoJour: 0 },
      { quotidienHeure: 24 },
      { perimetre: "voisins" },
    ]) {
      expect(
        reglagesSaisis.safeParse({ ...REGLAGES_PAR_DEFAUT, ...faux }).success,
      ).toBe(false);
    }
  });
});

const consommable = (
  overrides: Partial<ConsommableRow> = {},
): ConsommableRow => ({
  id: "c",
  intitule: "Filtre à air",
  ficheId: "f",
  ficheTitre: "La voiture",
  categorie: "Véhicule",
  tenue: "souple",
  seuil: 0.075,
  dureeKm: null,
  dureeTemps: { count: 1, unit: "year" },
  remplacements: [{ le: d("2025-10-22"), compteur: null }],
  releves: [],
  ...overrides,
});

describe("composerResume, avec le plan d'entretien", () => {
  it("parle des consommables comme des échéances, et de leurs remplacements", () => {
    const texte = composerResume(
      {
        echeances: [],
        consommables: [
          consommable(),
          consommable({
            id: "c2",
            intitule: "Bougies",
            remplacements: [{ le: d("2026-10-16"), compteur: null }],
          }),
        ],
      },
      LUNDI,
      "hebdo",
      REGLAGES_PAR_DEFAUT,
      LIEN,
    );

    expect(texte?.subject).toBe("Votre semaine : 1 échéance");
    expect(texte?.text).toContain("- 22 oct. · Filtre à air · La voiture");
    expect(texte?.text).toContain(
      "Fait ces sept derniers jours\n- 16 oct. · Bougies · La voiture",
    );
  });

  it("dit qu'une date tirée du compteur est une estimation", () => {
    const texte = composerResume(
      {
        echeances: [],
        consommables: [
          consommable({
            dureeKm: 10000,
            dureeTemps: null,
            remplacements: [{ le: d("2026-01-01"), compteur: 0 }],
            releves: [
              { le: d("2026-01-01"), valeur: 0 },
              { le: d("2026-10-01"), valeur: 9500 },
            ],
          }),
        ],
      },
      LUNDI,
      "hebdo",
      REGLAGES_PAR_DEFAUT,
      LIEN,
    );

    expect(texte?.text).toContain("estimé au compteur");
  });
});

describe("composerResume, rappels par e-mail (§ 6)", () => {
  const rappelee = echeance({
    id: "r",
    titre: "Contrôle technique",
    recurrence: { kind: "once", on: d("2026-11-19") },
    rappels: [{ amount: 1, unit: "month", channels: ["email"] }],
  });

  it("met au quotidien du jour une échéance rappelée, même hors horizon", () => {
    const texte = composerResume(
      { echeances: [rappelee], consommables: [] },
      LUNDI,
      "quotidien",
      reglages({ quotidien: true }),
      LIEN,
    );

    expect(texte?.text).toContain(
      "Rappels du jour\n- dans 31 jours · Contrôle technique",
    );
  });

  it("fait partir un quotidien non voulu, avec ses seuls rappels", () => {
    const texte = composerResume(
      {
        echeances: [rappelee, echeance({ id: "autre", titre: "Autre chose" })],
        consommables: [consommable()],
      },
      LUNDI,
      "quotidien",
      REGLAGES_PAR_DEFAUT,
      LIEN,
    );

    expect(texte?.subject).toBe("Aujourd'hui : 1 échéance");
    expect(texte?.text).not.toContain("Autre chose");
    expect(texte?.text).not.toContain("Filtre");
  });

  it("donne d'office à une critique un rappel le jour même, sans doublon", () => {
    const texte = composerResume(
      {
        echeances: [echeance({ titre: "Vidange", importance: "critique" })],
        consommables: [],
      },
      LUNDI,
      "quotidien",
      reglages({ quotidien: true }),
      LIEN,
    );

    expect(texte?.text).toContain("Rappels du jour\n- aujourd'hui · Vidange");
    expect(texte?.text).not.toContain("À faire");
  });

  it("ignore un rappel push seul, un autre jour, l'hebdo, et ce qui ne me concerne pas", () => {
    const sans = (rows: EcheanceRow[], sorte: "hebdo" | "quotidien") =>
      composerResume(
        { echeances: rows, consommables: [] },
        LUNDI,
        sorte,
        reglages({ hebdo: false }),
        LIEN,
      );

    expect(
      sans(
        [
          echeance({
            ...rappelee,
            rappels: [{ amount: 1, unit: "month", channels: ["push"] }],
          }),
        ],
        "quotidien",
      ),
    ).toBeNull();
    expect(
      sans(
        [
          echeance({
            ...rappelee,
            rappels: [{ amount: 2, unit: "week", channels: ["email"] }],
          }),
        ],
        "quotidien",
      ),
    ).toBeNull();
    expect(
      sans([echeance({ ...rappelee, pourMoi: false })], "quotidien"),
    ).toBeNull();
    expect(
      sans(
        [
          echeance({
            importance: "critique",
            tenue: "ferme",
            recurrence: { kind: "once", on: d("2026-10-10") },
          }),
        ],
        "quotidien",
      ),
    ).toBeNull();
    expect(
      composerResume(
        { echeances: [rappelee], consommables: [] },
        LUNDI,
        "hebdo",
        reglages({ horizonJours: 7 }),
        LIEN,
      ),
    ).toBeNull();
  });
});
