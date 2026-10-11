import { describe, expect, it } from "vitest";
import {
  cardFrame,
  doneTodayText,
  formatTemperature,
  frostScale,
  type GroupedPlant,
  plantsProgress,
} from "./deadline";

describe("cardFrame", () => {
  it("dit l'importance par le seul contour", () => {
    expect(cardFrame("critique")).toEqual({
      color: "var(--ink-critical)",
      width: "2px",
      emphasised: true,
    });
    expect(cardFrame("important")).toEqual({
      color: "var(--ink-serious)",
      width: "1.5px",
      emphasised: false,
    });
    expect(cardFrame("normal").color).toBe("var(--border)");
    expect(cardFrame("memoire").width).toBe("1px");
  });
});

describe("plantsProgress", () => {
  const plant = (doneOn: string | null): GroupedPlant => ({
    id: "p",
    name: "Plante",
    instruction: "",
    guideUrl: "",
    doneOn,
  });

  it("compte les plantes faites", () => {
    expect(plantsProgress([plant("9 sept."), plant(null), plant(null)])).toBe(
      "1 sur 3 faites",
    );
  });
});

describe("doneTodayText", () => {
  it("accorde au singulier et au pluriel", () => {
    expect(doneTodayText(1)).toBe("1 chose faite aujourd'hui");
    expect(doneTodayText(3)).toBe("3 choses faites aujourd'hui");
  });
});

describe("formatTemperature", () => {
  it("écrit à la française, avec un vrai signe moins", () => {
    expect(formatTemperature(-3.5)).toBe("−3,5");
    expect(formatTemperature(0)).toBe("0");
    expect(formatTemperature(1.25)).toBe("1,3");
  });
});

describe("frostScale", () => {
  const range = {
    lowerBound: -3.5,
    estimate: -2,
    margin: 1.5,
    damageThreshold: 0,
    deathThreshold: -5,
    explanation: "",
  };

  it("reproduit la frise de la maquette pour les seuils du citronnier", () => {
    const scale = frostScale(range);

    expect(scale.death).toBeCloseTo(20);
    expect(scale.damage).toBeCloseTo(70);
    expect(scale.estimate).toBeCloseTo(50);
    expect(scale.lowerBound).toBeCloseTo(35);
    expect(scale.upperBound).toBeCloseTo(65);
  });

  it("ramène au bord une borne hors de l'échelle", () => {
    const scale = frostScale({ ...range, estimate: -12, margin: 1 });

    expect(scale.estimate).toBe(0);
    expect(frostScale({ ...range, estimate: 8, margin: 1 }).upperBound).toBe(
      100,
    );
  });
});
