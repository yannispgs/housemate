import { describe, expect, it } from "vitest";
import { cheminDePiece, piecesADeposer } from "./pieces";

describe("cheminDePiece", () => {
  it("garde l'extension du nom d'origine, en minuscules", () => {
    expect(cheminDePiece({ id: "p1", nom: "Facture.PDF" })).toBe(
      "pieces/p1.pdf.age",
    );
  });

  it("écarte une extension absente, douteuse ou un nom manquant", () => {
    expect(cheminDePiece({ id: "p1", nom: "facture" })).toBe("pieces/p1.age");
    expect(cheminDePiece({ id: "p1", nom: "a.b/../x" })).toBe("pieces/p1.age");
    expect(cheminDePiece({ id: "p1", nom: null })).toBe("pieces/p1.age");
  });
});

describe("piecesADeposer", () => {
  it("ne garde que celles absentes de la destination", () => {
    const a = { id: "a", nom: "a.jpg" };
    const b = { id: "b", nom: "b.jpg" };

    expect(piecesADeposer([a, b], new Set(["pieces/a.jpg.age"]))).toEqual([b]);
  });
});
