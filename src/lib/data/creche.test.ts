import { describe, expect, it } from "vitest";
import { plainDate } from "@/lib/domain/plain-date";
import type { RainHour } from "@/lib/domain/school-run";
import {
  composerRappelCreche,
  crecheAnnoncee,
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
