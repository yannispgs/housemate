import { describe, expect, it } from "vitest";
import {
  exteriorLowerBound,
  frostLevel,
  nightErrors,
  predictVerandaMinimum,
  verandaLowerBound,
} from "@/lib/domain/frost";

// Nuits fictives : aucun relevé réel du foyer dans ce dépôt public.

/** Soirée claire de fin d'hiver : la véranda a stocké de la chaleur. */
const MILD = {
  exteriorAt20h: 4,
  verandaAt20h: 12,
  forecastExteriorMinimum: 1,
};

/** Soirée couverte, puis gel annoncé : aucune réserve. */
const FREEZING = {
  exteriorAt20h: 0,
  verandaAt20h: 3,
  forecastExteriorMinimum: -5,
};

const MARGINS = { forecastMargin: 1, radiativeMargin: 3 };

describe("predictVerandaMinimum", () => {
  it("applique le modèle calibré : socle, avance du soir, chute extérieure", () => {
    // Δ_soir = 8, chute = 3 → Δ_aube = 1,66 + 0,39×8 + 0,32×3 = 5,74.
    expect(predictVerandaMinimum(MILD)).toEqual({
      estimate: 6.7,
      margin: 1.1,
      extrapolation: "none",
    });
  });

  it("⚠️ annonce l'extrapolation vers le froid et double la marge", () => {
    // Δ_soir = 3, chute = 5 → Δ_aube = 4,43 → −5 + 4,43.
    expect(predictVerandaMinimum(FREEZING)).toEqual({
      estimate: -0.6,
      margin: 2.2,
      extrapolation: "low",
    });
  });

  it("⚠️ annonce aussi l'extrapolation vers le doux", () => {
    const prediction = predictVerandaMinimum({
      ...MILD,
      forecastExteriorMinimum: 10.3,
    });

    expect(prediction.extrapolation).toBe("high");
    expect(prediction.margin).toBe(2.2);
  });

  it("reste dans son domaine aux bornes validées, 0,3 et 5 °C", () => {
    const at = (forecastExteriorMinimum: number) =>
      predictVerandaMinimum({ ...MILD, forecastExteriorMinimum }).extrapolation;

    expect([at(0.3), at(5)]).toEqual(["none", "none"]);
    expect([at(0.2), at(5.1)]).toEqual(["low", "high"]);
  });
});

describe("verandaLowerBound", () => {
  it("retire toutes les marges de l'estimation", () => {
    // 6,7 − 1,1 − 1 − 3
    expect(verandaLowerBound(predictVerandaMinimum(MILD), MARGINS)).toBe(1.6);
    // Extrapolation : marge du modèle doublée.
    expect(verandaLowerBound(predictVerandaMinimum(FREEZING), MARGINS)).toBe(
      -6.8,
    );
  });

  it("n'écrit jamais « −0 »", () => {
    const bound = verandaLowerBound(
      { estimate: 5.1, margin: 1.1, extrapolation: "none" },
      { forecastMargin: 1, radiativeMargin: 3 },
    );

    expect(Object.is(bound, -0)).toBe(false);
    expect(bound).toBe(0);
  });
});

describe("exteriorLowerBound", () => {
  it("retire de la prévision les marges et le froid du sol", () => {
    expect(
      exteriorLowerBound(1, {
        forecastMargin: 2,
        radiativeMargin: 3,
        groundMargin: 1.5,
      }),
    ).toBe(-5.5);
  });
});

describe("frostLevel", () => {
  it("⚠️ décide sur le pire cas, au seuil de dégâts compris", () => {
    expect(frostLevel(0, 0)).toBe("alerte");
    expect(frostLevel(-6, -5)).toBe("alerte");
  });

  it("met en vigilance jusqu'à 2 °C au-dessus du seuil", () => {
    expect(frostLevel(0.1, 0)).toBe("vigilance");
    expect(frostLevel(-3, -5)).toBe("vigilance");
    expect(frostLevel(2.1, 0)).toBeNull();
  });
});

describe("nightErrors", () => {
  it("sépare l'erreur de prévision de l'erreur du modèle", () => {
    const errors = nightErrors(MILD, {
      exteriorMinimum: 0.5,
      verandaMinimum: 6,
    });

    // Prévision : 0,5 mesuré contre 1 annoncé.
    // Modèle, avec l'extérieur MESURÉ : prédit 6,4, observé 6.
    expect(errors).toEqual({ forecastError: -0.5, modelError: -0.4 });
  });
});
