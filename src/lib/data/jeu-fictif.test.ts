import { describe, expect, it } from "vitest";
import { jeuFictif } from "@/lib/data/jeu-fictif";
import { parseRecurrence } from "@/lib/data/recurrence-json";
import { fromISO } from "@/lib/domain/plain-date";

describe("jeuFictif — le foyer fictif des previews", () => {
  // N'importe quel jour doit donner un jeu valide : fin de mois, 29 février,
  // veille du jour de l'an.
  it.each([
    "2026-10-15",
    "2027-01-31",
    "2028-02-29",
    "2026-12-31",
  ])("se construit le %s", jour => {
    const jeu = jeuFictif(fromISO(jour));
    const echeances = [
      ...jeu.fiches.flatMap(f => f.echeances),
      ...jeu.garanties.map(g => g.garantie.echeance),
      ...jeu.echeances,
    ];

    expect(jeu.fiches.length + jeu.garanties.length).toBe(14);
    expect(echeances).toHaveLength(20);
    // Chaque récurrence se relit, comme en base.
    for (const e of echeances) {
      expect(parseRecurrence(e.recurrence)).not.toBeNull();
    }
  });

  it("date tout à partir du jour de remplissage", () => {
    const jeu = jeuFictif(fromISO("2026-10-15"));
    const controle = jeu.fiches
      .flatMap(f => f.echeances)
      .find(e => e.titre === "Contrôle technique");

    expect(controle?.recurrence).toEqual({ kind: "once", on: "2026-11-29" });
    expect(
      jeu.echeances.find(e => e.titre === "Changer les draps"),
    ).toMatchObject({ derniereFois: "2026-10-05" });
  });

  it("⚠️ ne contient aucune vraie donnée : que des titres neutres", () => {
    const textes = (v: unknown): string[] => {
      if (typeof v === "string") {
        return [v];
      }

      return typeof v === "object" && v !== null
        ? Object.values(v).flatMap(textes)
        : [];
    };

    // Ni adresse e-mail, ni code postal dans un texte du jeu.
    for (const texte of textes(jeuFictif(fromISO("2026-10-15")))) {
      expect(texte).not.toMatch(/@|\b\d{5}\b/);
    }
  });
});
