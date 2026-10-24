import { describe, expect, it } from "vitest";
import { type ColonneDatee, decaler, genreDe } from "@/lib/db/seed-dates";
import { fromISO } from "@/lib/domain/plain-date";

const COMPLETIONS: readonly ColonneDatee[] = [
  { name: "occurrence", genre: "date" },
  { name: "faite_le", genre: "date" },
  { name: "saisie_le", genre: "instant" },
];

const plafond = {
  aujourdhui: fromISO("2026-11-10"),
  maintenant: new Date("2026-11-10T07:00:00.000Z"),
  passees: ["faite_le"],
};

describe("decaler", () => {
  it("avance toutes les dates d'un bloc, sans toucher au reste", () => {
    const ligne = {
      id: "c1",
      occurrence: "2026-10-20",
      faite_le: "2026-10-18",
      saisie_le: "2026-10-18T09:30:00.000Z",
    };

    expect(decaler(ligne, COMPLETIONS, 10)).toEqual({
      id: "c1",
      occurrence: "2026-10-30",
      faite_le: "2026-10-28",
      saisie_le: "2026-10-28T09:30:00.000Z",
    });
  });

  it("recule aussi, pour revenir au repère de seed", () => {
    const ligne = { occurrence: "2026-03-01", faite_le: null, saisie_le: null };

    expect(decaler(ligne, COMPLETIONS, -1)).toEqual({
      occurrence: "2026-02-28",
      faite_le: null,
      saisie_le: null,
    });
  });

  it("ne pousse jamais dans le futur ce qui est déjà arrivé", () => {
    const ligne = {
      occurrence: "2026-11-12",
      faite_le: "2026-11-09",
      saisie_le: "2026-11-09T20:00:00.000Z",
    };

    expect(decaler(ligne, COMPLETIONS, 3, plafond)).toEqual({
      // Une occurrence peut être à venir ; un « fait le », non.
      occurrence: "2026-11-15",
      faite_le: "2026-11-10",
      saisie_le: "2026-11-10T07:00:00.000Z",
    });
  });

  it("laisse sous le plafond ce qui y est déjà", () => {
    const ligne = {
      occurrence: "2026-11-01",
      faite_le: "2026-11-01",
      saisie_le: "2026-11-01T08:00:00.000Z",
    };

    expect(decaler(ligne, COMPLETIONS, 2, plafond)).toEqual({
      occurrence: "2026-11-03",
      faite_le: "2026-11-03",
      saisie_le: "2026-11-03T08:00:00.000Z",
    });
  });

  it("avance les dates seules d'un JSON, à toute profondeur", () => {
    const recurrence = {
      kind: "interval",
      start: "2026-10-01",
      every: { count: 2, unit: "week" },
      dates: ["2026-10-05", "pas une date", 7, null],
      note: "2026-10-01T12:00",
    };

    expect(
      decaler({ recurrence }, [{ name: "recurrence", genre: "json" }], 5),
    ).toEqual({
      recurrence: {
        kind: "interval",
        start: "2026-10-06",
        every: { count: 2, unit: "week" },
        dates: ["2026-10-10", "pas une date", 7, null],
        note: "2026-10-01T12:00",
      },
    });
  });

  it("laisse ce qui n'est pas une chaîne dans une colonne de date", () => {
    expect(
      decaler({ le: 20_261_018 }, [{ name: "le", genre: "date" }], 1),
    ).toEqual({ le: 20_261_018 });
  });
});

describe("genreDe", () => {
  it("reconnaît les types qui portent des dates", () => {
    expect(
      ["date", "timestamp with time zone", "json", "jsonb", "text"].map(
        genreDe,
      ),
    ).toEqual(["date", "instant", "json", "json", null]);
  });
});
