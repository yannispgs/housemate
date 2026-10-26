import { describe, expect, it } from "vitest";
import {
  composerResume,
  jourIso,
  REGLAGES_PAR_DEFAUT,
  type ReglagesResumes,
  reglagesSaisis,
  resumesDus,
} from "@/lib/data/resumes";
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
  ficheTitre: null,
  destinataire: "Foyer",
  pourMoi: true,
  creeLe: d("2026-10-01"),
  completions: [],
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
    ]);
  });

  it("ne part pas un autre jour que le sien", () => {
    expect(
      resumesDus(REGLAGES_PAR_DEFAUT, { jour: d("2026-10-20"), heure: 9 }),
    ).toEqual([]);
  });

  it("ajoute le quotidien chaque jour à son heure, s'il est voulu", () => {
    const deux = reglages({ quotidien: true, quotidienHeure: 8 });

    expect(resumesDus(deux, { jour: LUNDI, heure: 7 })).toEqual(["hebdo"]);
    expect(resumesDus(deux, { jour: LUNDI, heure: 8 })).toEqual([
      "hebdo",
      "quotidien",
    ]);
    expect(
      resumesDus(reglages({ hebdo: false, quotidien: true }), {
        jour: LUNDI,
        heure: 7,
      }),
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
      composerResume(rows, LUNDI, "hebdo", REGLAGES_PAR_DEFAUT, LIEN),
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
      rows,
      LUNDI,
      "quotidien",
      reglages({
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
      composerResume([faite, seule], LUNDI, "hebdo", REGLAGES_PAR_DEFAUT, LIEN),
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
      composerResume([faite], LUNDI, "quotidien", REGLAGES_PAR_DEFAUT, LIEN),
    ).toBeNull();
  });

  it("dit « 1 échéance » au singulier", () => {
    expect(
      composerResume(
        [rows[0] as EcheanceRow],
        LUNDI,
        "quotidien",
        REGLAGES_PAR_DEFAUT,
        LIEN,
      )?.subject,
    ).toBe("Aujourd'hui : 1 échéance");
  });

  it("ne part pas vide", () => {
    expect(
      composerResume([], LUNDI, "hebdo", REGLAGES_PAR_DEFAUT, LIEN),
    ).toBeNull();
    // Une récurrence illisible ne compte pas.
    expect(
      composerResume(
        [echeance({ recurrence: null })],
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
