import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  filterPlants,
  groupRecords,
  plantCriteria,
  type RecordView,
  recordCategories,
  recordCount,
} from "./inventory";

const record = (title: string, category: string): RecordView => ({
  title,
  nature: "Plante",
  category,
  descriptor: "",
});

const records = [
  record("Citronnier", "Jardin"),
  record("Voiture", "Véhicule"),
  record("Laurier", "Jardin"),
];

describe("groupRecords", () => {
  it("groupe par catégorie, dans l'ordre d'apparition", () => {
    expect(recordCategories(records)).toEqual(["Jardin", "Véhicule"]);
    expect(
      groupRecords(records, ALL_CATEGORIES).map(group => [
        group.name,
        group.records.map(entry => entry.title),
      ]),
    ).toEqual([
      ["Jardin", ["Citronnier", "Laurier"]],
      ["Véhicule", ["Voiture"]],
    ]);
  });

  it("réduit la liste à la catégorie choisie", () => {
    expect(groupRecords(records, "Véhicule").map(group => group.name)).toEqual([
      "Véhicule",
    ]);
  });
});

describe("recordCount", () => {
  it("accorde au singulier et au pluriel", () => {
    expect(recordCount(1)).toBe("1 fiche");
    expect(recordCount(4)).toBe("4 fiches");
  });
});

describe("le menu « Plantes » (§ 12.4)", () => {
  const plante = (
    title: string,
    pot: "En pot" | "En terre" | null,
    emplacement: string | null,
  ): RecordView => ({
    ...record(title, "Jardin"),
    plante: { pot, emplacement },
  });
  const liste = [
    plante("Citronnier", "En pot", "Véranda"),
    plante("Rosier", "En terre", "Extérieur"),
    plante("Ficus", null, null),
    { ...record("Voiture", "Véhicule"), nature: "Véhicule" as const },
  ];

  it("propose les critères des plantes renseignées, sinon rien", () => {
    expect(plantCriteria(liste).map(c => c.valeur)).toEqual([
      "En pot",
      "En terre",
      "Extérieur",
      "Véranda",
    ]);
    expect(plantCriteria([plante("Ficus", null, null)])).toEqual([]);
  });

  it("ne garde que les plantes du critère, ou tout sans critère", () => {
    expect(
      filterPlants(liste, { sorte: "pot", valeur: "En pot" }).map(r => r.title),
    ).toEqual(["Citronnier"]);
    expect(
      filterPlants(liste, { sorte: "emplacement", valeur: "Extérieur" }).map(
        r => r.title,
      ),
    ).toEqual(["Rosier"]);
    expect(filterPlants(liste, null)).toEqual(liste);
  });
});
