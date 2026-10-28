import { describe, expect, it } from "vitest";
import {
  parisDate,
  parisHour,
  shouldEvaluateFrost,
  shouldFetchTemperatureForecasts,
  shouldReadSensors,
  shouldReviewNight,
  shouldSendFrostMessage,
} from "./schedule";

describe("parisHour", () => {
  it("ajoute deux heures en été", () => {
    expect(parisHour(new Date("2026-07-14T18:00:00Z"))).toBe(20);
  });

  it("ajoute une heure en hiver", () => {
    expect(parisHour(new Date("2026-12-14T19:00:00Z"))).toBe(20);
  });

  it("suit le changement d'heure d'octobre dans la nuit même", () => {
    // Dimanche 25 octobre 2026, 3 h d'été redevient 2 h d'hiver.
    expect(parisHour(new Date("2026-10-25T00:30:00Z"))).toBe(2);
    expect(parisHour(new Date("2026-10-25T01:30:00Z"))).toBe(2);
    expect(parisHour(new Date("2026-10-25T02:30:00Z"))).toBe(3);
  });

  it("écrit minuit 0, pas 24", () => {
    expect(parisHour(new Date("2026-12-14T23:00:00Z"))).toBe(0);
  });
});

describe("shouldReadSensors", () => {
  it("relève de 20 h à 9 h inclus", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(
      shouldReadSensors,
    );

    expect(hours).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23]);
  });
});

describe("prévisions figées une fois par soir", () => {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  it("fige les températures à 20 h, avec le relevé du gel", () => {
    expect(hours.filter(shouldFetchTemperatureForecasts)).toEqual([20]);
  });
});

describe("parisDate", () => {
  it("donne la date de Paris, pas celle d'UTC", () => {
    // 23 h 30 à Paris le 14 décembre, déjà le 14 à 22 h 30 UTC.
    expect(parisDate(new Date("2026-12-14T22:30:00Z"))).toBe("2026-12-14");
    // 0 h 30 à Paris le 15, encore le 14 en UTC.
    expect(parisDate(new Date("2026-12-14T23:30:00Z"))).toBe("2026-12-15");
  });

  it("recule d'un jour au matin, y compris au changement d'heure", () => {
    // 9 h à Paris le 26 octobre 2026, lendemain du passage à l'heure d'hiver.
    expect(parisDate(new Date("2026-10-26T08:00:00Z"), -1)).toBe("2026-10-25");
    // 9 h à Paris le 29 mars 2027, lendemain du passage à l'heure d'été.
    expect(parisDate(new Date("2027-03-29T07:00:00Z"), -1)).toBe("2027-03-28");
    // Et d'un mois sur l'autre.
    expect(parisDate(new Date("2027-01-01T08:00:00Z"), -1)).toBe("2026-12-31");
  });
});

describe("veille de gel", () => {
  it("décide à 20 h, envoie de 20 h à 23 h, fait le bilan à 9 h", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => hour);

    expect(hours.filter(shouldEvaluateFrost)).toEqual([20]);
    expect(hours.filter(shouldSendFrostMessage)).toEqual([20, 21, 22, 23]);
    expect(hours.filter(shouldReviewNight)).toEqual([9]);
  });
});
