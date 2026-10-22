import { describe, expect, it } from "vitest";
import { plainDate } from "@/lib/domain/plain-date";
import type { RainHour } from "@/lib/domain/school-run";
import {
  apresBasculement,
  basculement,
  calendrierCreche,
  composerRappelCreche,
  crecheAnnoncee,
  estJourDeCreche,
  periodeDuCalendrier,
  REGLAGES_CRECHE_PAR_DEFAUT,
  type ReglagesCreche,
  reglagesCrecheSaisis,
} from "./creche";

const MERCREDI = plainDate(2026, 10, 21);
const JEUDI = plainDate(2026, 10, 22);
const NOMMES: ReglagesCreche = {
  jours: [1, 2, 4, 5],
  enfant: "Enfant B",
  parentSec: "Parent A",
  parentPluie: "Parent C",
};

/** La pluie d'un modèle de 8 h à 9 h, jeudi 22 octobre (6 h UTC). */
function pluie(model: string, millimetres: number): RainHour {
  return { model, start: new Date("2026-10-22T06:00:00Z"), millimetres };
}

describe("reglagesCrecheSaisis", () => {
  it("trie et dédoublonne les jours, vide un prénom blanc", () => {
    expect(
      reglagesCrecheSaisis.parse({
        jours: [5, 1, 5],
        enfant: "  Enfant B ",
        parentSec: "   ",
        parentPluie: null,
      }),
    ).toEqual({
      jours: [1, 5],
      enfant: "Enfant B",
      parentSec: null,
      parentPluie: null,
    });
  });

  it("refuse un jour hors de la semaine et un prénom trop long", () => {
    const base = {
      jours: [1],
      enfant: null,
      parentSec: null,
      parentPluie: null,
    };

    expect(
      reglagesCrecheSaisis.safeParse({ ...base, jours: [8] }).success,
    ).toBe(false);
    expect(
      reglagesCrecheSaisis.safeParse({ ...base, enfant: "x".repeat(41) })
        .success,
    ).toBe(false);
  });
});

describe("crecheAnnoncee", () => {
  it("annonce demain à partir de 22 h, si c'est un jour de crèche", () => {
    expect(crecheAnnoncee({ jour: MERCREDI, heure: 22 }, NOMMES)).toEqual(
      JEUDI,
    );
    expect(crecheAnnoncee({ jour: MERCREDI, heure: 21 }, NOMMES)).toBeNull();
  });

  it("suit les jours retirés ou ajoutés dans le calendrier", () => {
    const mardi = plainDate(2026, 10, 20);

    expect(
      crecheAnnoncee({ jour: MERCREDI, heure: 22 }, NOMMES, [
        { jour: "2026-10-22", creche: false },
      ]),
    ).toBeNull();
    expect(
      crecheAnnoncee({ jour: mardi, heure: 22 }, NOMMES, [
        { jour: "2026-10-21", creche: true },
      ]),
    ).toEqual(MERCREDI);
  });

  it("se tait la veille d'un jour sans crèche, selon les jours réglés", () => {
    const mardi = plainDate(2026, 10, 20);

    expect(crecheAnnoncee({ jour: mardi, heure: 22 }, NOMMES)).toBeNull();
    expect(
      crecheAnnoncee({ jour: mardi, heure: 22 }, { ...NOMMES, jours: [3] }),
    ).toEqual(MERCREDI);
  });
});

describe("composerRappelCreche", () => {
  it("nomme le parent du temps sec quand tous les modèles voient sec", () => {
    expect(
      composerRappelCreche(
        JEUDI,
        [pluie("b/m2", 0.4), pluie("a/m1", 0)],
        NOMMES,
      ),
    ).toEqual({
      subject: "Crèche demain : Parent A emmène Enfant B",
      text: [
        "Pas de pluie prévue de 8 h à 9 h demain, jeudi 22 octobre : c'est Parent A qui emmène Enfant B.",
        "",
        "Pluie prévue par modèle (sec sous 1,0 mm, pluie à partir de 2,0 mm) :",
        "- a/m1 : 0,0 mm (sec)",
        "- b/m2 : 0,4 mm (sec)",
      ].join("\n"),
    });
  });

  it("nomme le parent des jours de pluie quand tous voient la pluie", () => {
    const mail = composerRappelCreche(
      JEUDI,
      [pluie("a/m1", 2), pluie("b/m2", 3.2)],
      NOMMES,
    );

    expect(mail.subject).toBe(
      "Crèche demain : Parent C emmène Enfant B, il va pleuvoir",
    );
    expect(mail.text).toMatch(
      /^Pluie prévue de 8 h à 9 h demain, jeudi 22 octobre : c'est Parent C qui emmène Enfant B\.\n/,
    );
  });

  it("prévient dans le doute : désaccord, entre-deux, ou aucune prévision", () => {
    const desaccord = composerRappelCreche(
      JEUDI,
      [pluie("a/m1", 0), pluie("b/m2", 2.5)],
      NOMMES,
    );
    const entreDeux = composerRappelCreche(JEUDI, [pluie("a/m1", 1.5)], NOMMES);
    const rien = composerRappelCreche(JEUDI, [], NOMMES);

    expect(desaccord.subject).toBe("Crèche demain : la pluie est incertaine");
    expect(desaccord.text).toContain("Parent C, mets ton réveil au cas où.");
    expect(desaccord.text).toContain("- b/m2 : 2,5 mm (pluie)");
    expect(entreDeux.text).toContain("- a/m1 : 1,5 mm (doute)");
    expect(rien.subject).toBe("Crèche demain : la pluie est incertaine");
    expect(rien.text).toContain("Aucune prévision complète pour ce créneau.");
  });

  it("reste juste sans prénoms", () => {
    const sec = composerRappelCreche(
      JEUDI,
      [pluie("a/m1", 0)],
      REGLAGES_CRECHE_PAR_DEFAUT,
    );
    const pluvieux = composerRappelCreche(
      JEUDI,
      [pluie("a/m1", 5)],
      REGLAGES_CRECHE_PAR_DEFAUT,
    );

    expect(sec.subject).toBe(
      "Crèche demain : le parent du temps sec emmène l'enfant",
    );
    expect(pluvieux.text).toContain(
      "c'est le parent des jours de pluie qui emmène l'enfant.",
    );
  });
});

describe("basculement", () => {
  it("retire un jour habituel, puis le rend", () => {
    const retire = apresBasculement(JEUDI, NOMMES, []);

    expect(retire).toEqual([{ jour: "2026-10-22", creche: false }]);
    expect(estJourDeCreche(JEUDI, NOMMES, retire)).toBe(false);
    expect(apresBasculement(JEUDI, NOMMES, retire)).toEqual([]);
  });

  it("ajoute un jour inhabituel, sans toucher aux autres exceptions", () => {
    const autre = { jour: "2026-10-23", creche: false };

    expect(apresBasculement(MERCREDI, NOMMES, [autre])).toEqual([
      autre,
      { jour: "2026-10-21", creche: true },
    ]);
  });

  it("change toujours ce qu'on voit, même si la semaine a changé depuis", () => {
    // Mercredi ajouté, puis devenu un jour habituel : l'exception est muette.
    const ancienne = [{ jour: "2026-10-21", creche: true }];
    const avecMercredi = { ...NOMMES, jours: [1, 2, 3, 4, 5] as const };

    expect(basculement(MERCREDI, avecMercredi, ancienne)).toEqual({
      jour: "2026-10-21",
      creche: false,
    });
  });
});

describe("calendrierCreche", () => {
  it("couvre ce mois et le suivant, du jour même", () => {
    expect(periodeDuCalendrier(MERCREDI)).toEqual({
      du: "2026-10-21",
      au: "2026-11-30",
    });
    expect(periodeDuCalendrier(plainDate(2026, 12, 5))).toEqual({
      du: "2026-12-05",
      au: "2027-01-31",
    });
  });

  it("met en avant les jours de crèche, et marque les exceptions", () => {
    const [octobre, novembre] = calendrierCreche(MERCREDI, NOMMES, [
      { jour: "2026-10-22", creche: false },
      { jour: "2026-11-04", creche: true },
    ]);

    // Le 1er octobre 2026 est un jeudi, le 1er novembre un dimanche.
    expect(octobre?.titre).toBe("octobre 2026");
    expect(octobre?.decalage).toBe(3);
    expect(octobre?.cases).toHaveLength(31);
    expect(novembre?.decalage).toBe(6);
    expect(octobre?.cases[19]).toEqual({
      iso: "2026-10-20",
      jour: 20,
      creche: true,
      habituel: true,
      passe: true,
    });
    expect(octobre?.cases[21]).toMatchObject({
      creche: false,
      habituel: true,
      passe: false,
    });
    expect(novembre?.cases[3]).toMatchObject({
      iso: "2026-11-04",
      creche: true,
      habituel: false,
    });
  });
});
