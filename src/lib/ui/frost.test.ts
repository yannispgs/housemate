import { describe, expect, it } from "vitest";
import { destinationProposee, type FrostRow, frostCard } from "@/lib/ui/frost";

const ligne = (over: Partial<FrostRow>): FrostRow => ({
  nuit: "2026-12-14",
  chauffee: false,
  ficheId: "f",
  titre: "Une plante",
  emplacementDuSoir: "Extérieur",
  emplacement: "Extérieur",
  niveau: "alerte",
  estimation: -1,
  borneBasse: -7.5,
  seuilDegats: -5,
  seuilMort: -10,
  ...over,
});

const deg = (texte: string) => texte.replaceAll(" °C", " °C");

describe("frostCard", () => {
  it("ne dit rien sans plante", () => {
    expect(frostCard([])).toBeNull();
  });

  it("groupe Extérieur puis Véranda, les alertes d'abord", () => {
    const card = frostCard([
      ligne({
        ficheId: "c",
        titre: "Le citronnier",
        emplacementDuSoir: "Véranda",
        emplacement: "Véranda",
        niveau: "indisponible",
        estimation: null,
        borneBasse: null,
        seuilDegats: 0,
      }),
      ligne({ ficheId: "r", titre: "Le romarin", niveau: "vigilance" }),
      ligne({ ficheId: "l", titre: "Le laurier rose" }),
    ]);

    expect(card).toMatchObject({ nuit: "2026-12-14", alerte: true });
    expect(
      card?.sections.map(s => [s.emplacement, s.plantes.map(p => p.titre)]),
    ).toEqual([
      ["Extérieur", ["Le laurier rose", "Le romarin"]],
      ["Véranda", ["Le citronnier"]],
    ]);
    expect(card?.sections.flatMap(s => s.plantes.map(p => p.detail))).toEqual([
      deg("Jusqu'à −7,5 °C · dégâts dès −5 °C"),
      deg("À surveiller · jusqu'à −7,5 °C, dégâts dès −5 °C"),
      deg("Impossible d'estimer ce soir · dégâts dès 0 °C"),
    ]);
  });

  it("n'est qu'à surveiller sans alerte, et dit si la véranda est chauffée", () => {
    expect(
      frostCard([ligne({ niveau: "vigilance", chauffee: true })]),
    ).toMatchObject({ alerte: false, chauffee: true });
  });

  it("dit où une plante a été déplacée depuis l'alerte", () => {
    const plantes = frostCard([
      ligne({ ficheId: "a", emplacement: "Véranda" }),
      ligne({ ficheId: "b", emplacement: null }),
      ligne({ ficheId: "c" }),
    ])?.sections[0]?.plantes;

    expect(plantes?.map(p => p.deplaceeVers)).toEqual(["Véranda", null, null]);
  });

  it("donne la frise, avec son explication", () => {
    const frise = (over: Partial<FrostRow>) =>
      frostCard([ligne(over)])?.sections[0]?.plantes[0]?.range;

    expect(frise({})).toEqual({
      lowerBound: -7.5,
      estimate: -1,
      margin: 6.5,
      damageThreshold: -5,
      deathThreshold: -10,
      explanation:
        "Le pire cas passe sous le seuil de dégâts, sans atteindre celui de mort.",
    });
    expect(frise({ borneBasse: -10 })?.explanation).toContain(
      "sous le seuil de mort",
    );
    expect(frise({ niveau: "vigilance", borneBasse: -4 })?.explanation).toBe(
      "Le pire cas reste au-dessus du seuil de dégâts, mais à moins de 2 °C.",
    );
    // Sans seuil de mort ou sans estimation, pas de frise.
    expect(frise({ seuilMort: null })).toBeNull();
    expect(frise({ estimation: null, borneBasse: null })).toBeNull();
  });
});

describe("destinationProposee", () => {
  it("rentre en véranda une plante du dehors", () => {
    expect(destinationProposee("Extérieur", ["Salon"])).toBe("Véranda");
  });

  it("propose une pièce pour une plante de la véranda, sinon rien", () => {
    expect(destinationProposee("Véranda", ["Extérieur", "Salon"])).toBe(
      "Salon",
    );
    expect(destinationProposee("Véranda", ["Extérieur", "Véranda"])).toBe("");
  });
});
