import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  groupRecords,
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
