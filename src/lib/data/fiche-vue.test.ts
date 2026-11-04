import { describe, expect, it } from "vitest";
import { age, valeurAffichee } from "@/lib/data/fiche-vue";
import { fromISO } from "@/lib/domain/plain-date";

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

describe("une date de naissance", () => {
  const naissance = (annee: number | null) =>
    ({
      libelle: "Date de naissance",
      type: "jour",
      valeur: { jour: 12, mois: 3, annee },
    }) as const;

  it("s'écrit avec ou sans l'année, le 29 février compris", () => {
    expect(valeurAffichee(naissance(null))).toBe("12 mars");
    expect(valeurAffichee(naissance(1958))).toBe("12 mars 1958");
    expect(
      valeurAffichee({
        libelle: "Date de naissance",
        type: "jour",
        valeur: { jour: 29, mois: 2, annee: null },
      }),
    ).toBe("29 février");
  });

  it("donne l'âge quand l'année est connue", () => {
    expect(valeurAffichee(naissance(1958), fromISO("2026-10-28"))).toBe(
      "12 mars 1958 · 68 ans",
    );
    expect(valeurAffichee(naissance(2025), fromISO("2026-03-12"))).toBe(
      "12 mars 2025 · 1 an",
    );
    expect(valeurAffichee(naissance(null), fromISO("2026-10-28"))).toBe(
      "12 mars",
    );
  });

  it("compte l'âge à partir du jour anniversaire", () => {
    const nee = { jour: 12, mois: 3, annee: 2000 };

    expect(age(nee, fromISO("2026-03-11"))).toBe(25);
    expect(age(nee, fromISO("2026-03-12"))).toBe(26);
    expect(age(nee, fromISO("2026-02-28"))).toBe(25);
    expect(age(nee, fromISO("2026-04-01"))).toBe(26);
  });
});
