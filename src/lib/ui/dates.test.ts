import { describe, expect, it } from "vitest";
import { homeTitle, recapWeek } from "./dates";

const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe("homeTitle", () => {
  it("écrit le jour en toutes lettres, avec une majuscule", () => {
    expect(homeTitle(day("2026-09-13"))).toBe("Dimanche 13 septembre");
  });
});

describe("recapWeek", () => {
  it("le dimanche, annonce la semaine qui commence le lendemain", () => {
    expect(recapWeek(day("2026-09-13"))).toBe("Semaine du 14 au 20 septembre");
  });

  it("en semaine, annonce la semaine en cours", () => {
    expect(recapWeek(day("2026-09-16"))).toBe("Semaine du 14 au 20 septembre");
  });

  it("nomme les deux mois quand la semaine en change", () => {
    expect(recapWeek(day("2026-09-30"))).toBe(
      "Semaine du 28 septembre au 4 octobre",
    );
  });
});
