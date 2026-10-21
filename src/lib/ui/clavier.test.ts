import { describe, expect, it } from "vitest";
import {
  decalage,
  hauteurCachee,
  MARGE,
  ouvreLeClavier,
} from "@/lib/ui/clavier";

describe("ouvreLeClavier", () => {
  it("vaut pour les zones de texte et les champs texte, nombre, courriel…", () => {
    expect(ouvreLeClavier({ tagName: "TEXTAREA" })).toBe(true);
    expect(ouvreLeClavier({ tagName: "INPUT" })).toBe(true);
    expect(ouvreLeClavier({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(ouvreLeClavier({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(ouvreLeClavier({ tagName: "INPUT", type: "email" })).toBe(true);
  });

  it("ne vaut ni pour les dates, cases, fichiers et boutons, ni pour les listes", () => {
    for (const type of ["date", "checkbox", "radio", "file", "submit"]) {
      expect(ouvreLeClavier({ tagName: "INPUT", type })).toBe(false);
    }
    expect(ouvreLeClavier({ tagName: "SELECT" })).toBe(false);
    expect(ouvreLeClavier({ tagName: "BUTTON" })).toBe(false);
  });

  it("ne vaut pas pour un champ en lecture seule", () => {
    expect(ouvreLeClavier({ tagName: "INPUT", readOnly: true })).toBe(false);
  });
});

describe("hauteurCachee", () => {
  it("est la part de la page sous la zone visible : le clavier", () => {
    expect(hauteurCachee(844, { offsetTop: 0, height: 480 })).toBe(364);
  });

  it("tient compte d'une page déjà décalée vers le haut", () => {
    expect(hauteurCachee(844, { offsetTop: 100, height: 480 })).toBe(264);
  });

  it("vaut 0 sans clavier, jamais moins", () => {
    expect(hauteurCachee(844, { offsetTop: 0, height: 844 })).toBe(0);
    expect(hauteurCachee(844, { offsetTop: 0, height: 900 })).toBe(0);
  });
});

describe("decalage", () => {
  const visible = { haut: 0, bas: 400 };

  it("ne bouge pas un champ déjà en vue", () => {
    expect(decalage({ haut: 100, bas: 150 }, visible)).toBe(0);
  });

  it("remonte un champ caché par le clavier juste au-dessus, marge comprise", () => {
    expect(decalage({ haut: 500, bas: 550 }, visible)).toBe(150 + MARGE);
  });

  it("redescend un champ parti au-dessus de la zone visible", () => {
    expect(decalage({ haut: -80, bas: -30 }, visible)).toBe(-80 - MARGE);
  });

  it("montre le haut d'un champ trop grand pour tenir", () => {
    expect(decalage({ haut: 300, bas: 900 }, visible)).toBe(300 - MARGE);
  });

  it("se rapporte à la zone visible, même décalée", () => {
    expect(decalage({ haut: 500, bas: 550 }, { haut: 300, bas: 700 })).toBe(0);
  });
});
