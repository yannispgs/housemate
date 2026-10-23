import { describe, expect, it } from "vitest";
import { ancreCarnet, enteteEntree, reperesDuCarnet } from "./carnet";

describe("enteteEntree", () => {
  it("date l'entrée, avec le compteur quand il a été noté", () => {
    const vidange = {
      genre: "remplacement",
      libelle: "Vidange",
      le: "2026-03-03",
      compteur: 45_000,
    } as const;

    expect(enteteEntree(vidange)).toBe("3 mars 2026 · 45\u202f000 km");
    expect(enteteEntree({ ...vidange, compteur: null })).toBe("3 mars 2026");
  });
});

describe("reperesDuCarnet", () => {
  it("regroupe ce qui a été fait le même jour, au même compteur", () => {
    const entree = (libelle: string, le: string, compteur: number | null) =>
      ({ genre: "remplacement", libelle, le, compteur }) as const;

    expect(ancreCarnet("2026-03-03")).toBe("carnet-2026-03-03");
    expect(
      reperesDuCarnet([
        entree("Vidange", "2026-03-03", 45_000),
        entree("Filtre à huile", "2026-03-03", 45_000),
        entree("Révision", "2026-03-03", null),
        entree("Pneus", "2025-05-01", 38_000),
      ]),
    ).toEqual([
      {
        le: "2026-03-03",
        compteur: 45_000,
        libelles: ["Vidange", "Filtre à huile"],
      },
      { le: "2025-05-01", compteur: 38_000, libelles: ["Pneus"] },
    ]);
  });
});
