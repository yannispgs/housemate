import { describe, expect, it } from "vitest";
import {
  attributsPlante,
  avecAttribut,
  avecPlantation,
  correspond,
  criteresPlantes,
  labelsPlante,
  plantation,
  situationPlante,
} from "@/lib/data/plantes";
import type { Attribut } from "@/lib/data/saisie";

const texte = (libelle: string, valeur: string): Attribut => ({
  libelle,
  type: "texte",
  valeur,
});

describe("situationPlante", () => {
  it("lit en pot / en terre et l'emplacement", () => {
    expect(
      situationPlante([
        texte("Espèce", "Citrus limon"),
        texte("Pot ou terre", "En pot"),
        texte("Emplacement", "Véranda"),
      ]),
    ).toEqual({ pot: "En pot", emplacement: "Véranda" });
  });

  it("ignore une valeur inconnue, un autre type, ou rien", () => {
    expect(
      situationPlante([
        texte("Pot ou terre", "En bac"),
        { libelle: "Emplacement", type: "date", valeur: "2026-01-01" },
      ]),
    ).toEqual({ pot: null, emplacement: null });
    expect(situationPlante([])).toEqual({ pot: null, emplacement: null });
  });
});

describe("labelsPlante", () => {
  it("ne montre que ce qui est connu", () => {
    expect(labelsPlante({ pot: "En terre", emplacement: "Extérieur" })).toEqual(
      ["En terre", "Extérieur"],
    );
    expect(labelsPlante({ pot: null, emplacement: "Salon" })).toEqual([
      "Salon",
    ]);
    expect(labelsPlante({ pot: null, emplacement: null })).toEqual([]);
  });
});

describe("avecAttribut", () => {
  const ATTRIBUTS = [texte("Espèce", "Citrus"), texte("Emplacement", "Salon")];

  it("remplace à la même place", () => {
    expect(avecAttribut(ATTRIBUTS, "Emplacement", "Véranda")).toEqual([
      texte("Espèce", "Citrus"),
      texte("Emplacement", "Véranda"),
    ]);
  });

  it("ajoute à la fin, ou retire", () => {
    expect(avecAttribut(ATTRIBUTS, "Pot ou terre", "En pot")).toEqual([
      ...ATTRIBUTS,
      texte("Pot ou terre", "En pot"),
    ]);
    expect(avecAttribut(ATTRIBUTS, "Emplacement", null)).toEqual([
      texte("Espèce", "Citrus"),
    ]);
    expect(avecAttribut(ATTRIBUTS, "Pot ou terre", null)).toEqual(ATTRIBUTS);
  });

  const VIERGE = {
    pot: null,
    emplacement: null,
    seuilDegats: null,
    seuilMort: null,
  };

  it("donne les attributs d'une plante nouvelle", () => {
    expect(
      attributsPlante({
        pot: "En pot",
        emplacement: "Véranda",
        seuilDegats: 0,
        seuilMort: -5,
      }),
    ).toEqual([
      texte("Pot ou terre", "En pot"),
      texte("Emplacement", "Véranda"),
      { libelle: "Seuil de dégâts", type: "temperature", valeur: 0 },
      { libelle: "Seuil de mort", type: "temperature", valeur: -5 },
    ]);
    expect(attributsPlante(VIERGE)).toEqual([]);
  });

  it("modifie la plantation sans toucher au reste", () => {
    const avant = [
      texte("Espèce", "Citrus"),
      { libelle: "Seuil de dégâts", type: "temperature", valeur: 0 },
    ] as const;

    expect(avecPlantation(avant, { ...VIERGE, seuilMort: -5 })).toEqual([
      texte("Espèce", "Citrus"),
      { libelle: "Seuil de mort", type: "temperature", valeur: -5 },
    ]);
  });

  it("relit la plantation ; un seuil qui n'est pas une température est ignoré", () => {
    expect(
      plantation([
        texte("Emplacement", "Extérieur"),
        { libelle: "Seuil de dégâts", type: "temperature", valeur: -5 },
        texte("Seuil de mort", "-10"),
      ]),
    ).toEqual({
      pot: null,
      emplacement: "Extérieur",
      seuilDegats: -5,
      seuilMort: null,
    });
  });
});

describe("criteresPlantes et correspond", () => {
  const SITUATIONS = [
    { pot: "En terre", emplacement: "Extérieur" },
    { pot: "En pot", emplacement: "Véranda" },
    { pot: "En pot", emplacement: "Extérieur" },
    { pot: null, emplacement: null },
  ] as const;

  it("propose en pot / en terre puis les emplacements employés", () => {
    expect(criteresPlantes(SITUATIONS)).toEqual([
      { sorte: "pot", valeur: "En pot" },
      { sorte: "pot", valeur: "En terre" },
      { sorte: "emplacement", valeur: "Extérieur" },
      { sorte: "emplacement", valeur: "Véranda" },
    ]);
    expect(criteresPlantes([])).toEqual([]);
  });

  it("garde les plantes qui répondent au critère", () => {
    expect(
      SITUATIONS.filter(s => correspond(s, { sorte: "pot", valeur: "En pot" })),
    ).toHaveLength(2);
    expect(
      SITUATIONS.filter(s =>
        correspond(s, { sorte: "emplacement", valeur: "Extérieur" }),
      ),
    ).toHaveLength(2);
  });
});
