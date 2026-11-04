import { describe, expect, it } from "vitest";
import {
  preavisEnUnite,
  preavisLisible,
  REGLAGES_PAR_DEFAUT,
  recurrenceAnniversaire,
  reglagesSaisie,
  titreAnniversaire,
} from "@/lib/data/anniversaires";
import { lire } from "@/lib/data/saisie";

describe("titreAnniversaire", () => {
  it("dit le cadeau à préparer, ou l'anniversaire seul", () => {
    expect(titreAnniversaire("cadeau", "Mamie")).toBe(
      "Cadeau — anniversaire de Mamie",
    );
    expect(titreAnniversaire("simple", "Mamie")).toBe("Anniversaire de Mamie");
  });
});

describe("recurrenceAnniversaire", () => {
  it("revient chaque année au jour de naissance, sans source", () => {
    expect(
      recurrenceAnniversaire([
        {
          libelle: "Date de naissance",
          type: "jour",
          valeur: { jour: 29, mois: 2, annee: 1960 },
        },
      ]),
    ).toEqual({ kind: "annual", month: 2, day: 29 });
  });

  it("n'existe pas sans date de naissance", () => {
    expect(recurrenceAnniversaire([])).toBeNull();
    expect(
      recurrenceAnniversaire([
        { libelle: "Date de naissance", type: "texte", valeur: "mars" },
      ]),
    ).toBeNull();
  });
});

describe("le préavis", () => {
  it.each([
    [60, { nombre: 2, unite: "mois" }, "2 mois avant"],
    [14, { nombre: 2, unite: "semaine" }, "2 semaines avant"],
    [7, { nombre: 1, unite: "semaine" }, "1 semaine avant"],
    [1, { nombre: 1, unite: "jour" }, "1 jour avant"],
    [10, { nombre: 10, unite: "jour" }, "10 jours avant"],
    [0, { nombre: 0, unite: "jour" }, "le jour même"],
  ])("%i jours : %o, « %s »", (jours, enUnite, lisible) => {
    expect(preavisEnUnite(jours)).toEqual(enUnite);
    expect(preavisLisible(jours)).toBe(lisible);
  });
});

describe("reglagesSaisie", () => {
  const saisie = {
    cadeauNombre: "3",
    cadeauUnite: "semaine",
    cadeauImportance: "important",
    simpleNombre: "0",
    simpleUnite: "jour",
    simpleImportance: "memoire",
  };

  it("convertit les préavis en jours", () => {
    expect(lire(reglagesSaisie, saisie)).toEqual({
      ok: true,
      valeur: {
        cadeau: { preavisJours: 21, importance: "important" },
        simple: { preavisJours: 0, importance: "memoire" },
      },
    });
  });

  it("relit ceux de départ", () => {
    expect(
      lire(reglagesSaisie, {
        cadeauNombre: "2",
        cadeauUnite: "mois",
        cadeauImportance: "normal",
        simpleNombre: "1",
        simpleUnite: "jour",
        simpleImportance: "memoire",
      }),
    ).toEqual({ ok: true, valeur: REGLAGES_PAR_DEFAUT });
  });

  it.each([
    [{ cadeauNombre: "deux" }, "cadeauNombre", "Un nombre, s'il te plaît."],
    [{ cadeauNombre: "1.5" }, "cadeauNombre", "Un nombre entier."],
    [{ simpleNombre: "-1" }, "simpleNombre", "Pas de préavis négatif."],
    [
      { cadeauNombre: "13", cadeauUnite: "mois" },
      "cadeauNombre",
      "Un an de préavis au plus.",
    ],
    [{ simpleUnite: "an" }, "simpleUnite", "Choisis une unité."],
    [
      { cadeauImportance: "urgent" },
      "cadeauImportance",
      "Choisis une importance.",
    ],
  ])("refuse %o", (change, champ, message) => {
    expect(lire(reglagesSaisie, { ...saisie, ...change })).toEqual({
      ok: false,
      erreurs: { [champ]: message },
    });
  });
});
