import { describe, expect, it } from "vitest";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";

describe("ETAT_AJOUT", () => {
  it("commence par la saisie, sans erreur", () => {
    expect(ETAT_AJOUT).toEqual({ etape: "saisie" });
  });
});
