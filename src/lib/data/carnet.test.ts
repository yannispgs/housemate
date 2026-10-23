import { describe, expect, it } from "vitest";
import { enteteEntree } from "./carnet";

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
