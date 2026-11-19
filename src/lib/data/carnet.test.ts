import { describe, expect, it } from "vitest";
import {
  depensesDuCarnet,
  type EntreeCarnet,
  enteteEntree,
  euros,
  interventionsDuCarnet,
} from "./carnet";

describe("enteteEntree", () => {
  it("date l'entrée, avec le compteur quand il a été noté", () => {
    const vidange = {
      genre: "remplacement",
      libelle: "Vidange",
      le: "2026-03-03",
      compteur: 45_000,
      intervention: null,
      cout: null,
    } as const;

    expect(enteteEntree(vidange)).toBe("3 mars 2026 · 45 000 km");
    expect(enteteEntree({ ...vidange, compteur: null })).toBe("3 mars 2026");
  });

  it("ajoute le coût d'une intervention", () => {
    expect(
      enteteEntree({ le: "2026-03-03", compteur: 45_000, cout: 320 }),
    ).toBe("3 mars 2026 · 45 000 km · 320 €");
    expect(enteteEntree({ le: "2026-03-03", compteur: null, cout: 89.9 })).toBe(
      "3 mars 2026 · 89,90 €",
    );
  });
});

describe("euros", () => {
  it("garde les centimes seulement s'il y en a", () => {
    expect(euros(1210)).toBe("1 210 €");
    expect(euros(12.5)).toBe("12,50 €");
  });
});

const entree = (
  champs: Partial<EntreeCarnet> & Pick<EntreeCarnet, "libelle" | "le">,
): EntreeCarnet => ({
  genre: "remplacement",
  compteur: null,
  intervention: null,
  cout: null,
  ...champs,
});

describe("interventionsDuCarnet", () => {
  it("regroupe les lignes d'une intervention, laisse seules les autres", () => {
    const garage = {
      le: "2026-03-03",
      compteur: 45_000,
      intervention: "i1",
      cout: 320,
    };

    expect(
      interventionsDuCarnet([
        entree({ ...garage, libelle: "Vidange" }),
        // Saisie seule le même jour : elle ne rejoint pas l'intervention.
        entree({ le: "2026-03-03", libelle: "Essuie-glaces" }),
        entree({ ...garage, genre: "echeance", libelle: "Révision" }),
        entree({ ...garage, genre: "libre", libelle: "Plaquettes AR" }),
        entree({ le: "2025-05-01", libelle: "Pneus" }),
      ]),
    ).toEqual([
      {
        cle: "i1",
        le: "2026-03-03",
        compteur: 45_000,
        cout: 320,
        lignes: [
          { genre: "remplacement", libelle: "Vidange" },
          { genre: "echeance", libelle: "Révision" },
          { genre: "libre", libelle: "Plaquettes AR" },
        ],
      },
      {
        cle: "seule-1",
        le: "2026-03-03",
        compteur: null,
        cout: null,
        lignes: [{ genre: "remplacement", libelle: "Essuie-glaces" }],
      },
      {
        cle: "seule-4",
        le: "2025-05-01",
        compteur: null,
        cout: null,
        lignes: [{ genre: "remplacement", libelle: "Pneus" }],
      },
    ]);
  });
});

describe("depensesDuCarnet", () => {
  const intervention = (le: string, cout: number | null) => ({
    cle: le,
    le,
    compteur: null,
    cout,
    lignes: [],
  });

  it("totalise l'année en cours et la précédente", () => {
    expect(
      depensesDuCarnet(
        [
          intervention("2026-03-03", 320),
          intervention("2026-01-10", 89.9),
          intervention("2025-06-01", null),
          intervention("2025-02-01", 1210),
          intervention("2024-02-01", 500),
        ],
        2026,
      ),
    ).toEqual([
      { annee: 2026, total: 409.9 },
      { annee: 2025, total: 1210 },
    ]);
  });

  it("ne montre rien tant qu'aucun coût n'est noté", () => {
    expect(depensesDuCarnet([intervention("2026-03-03", null)], 2026)).toEqual(
      [],
    );
  });
});
