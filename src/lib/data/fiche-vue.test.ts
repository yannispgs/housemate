import { describe, expect, it } from "vitest";
import { valeurAffichee } from "@/lib/data/fiche-vue";

describe("valeurAffichee", () => {
  it.each([
    [{ libelle: "Marque", type: "texte", valeur: "Terraillon" }, "Terraillon"],
    [{ libelle: "Seuil", type: "temperature", valeur: -2.5 }, "−2,5\u00a0°C"],
    [{ libelle: "Seuil", type: "temperature", valeur: 0 }, "0\u00a0°C"],
    [
      { libelle: "Date d'achat", type: "date", valeur: "2026-10-13" },
      "13 octobre 2026",
    ],
    [
      {
        libelle: "Garantie",
        type: "duree",
        valeur: { count: 2, unit: "year" },
      },
      "2 ans",
    ],
    [
      {
        libelle: "Garantie",
        type: "duree",
        valeur: { count: 1, unit: "year" },
      },
      "1 an",
    ],
    [
      {
        libelle: "Garantie",
        type: "duree",
        valeur: { count: 6, unit: "month" },
      },
      "6 mois",
    ],
    [{ libelle: "Montant", type: "montant", valeur: 12.5 }, "12,50\u00a0€"],
  ] as const)("%o → %s", (attribut, texte) => {
    expect(valeurAffichee(attribut)).toBe(texte);
  });
});
