import { describe, expect, it } from "vitest";
import {
  parseRecurrence,
  serializeRecurrence,
} from "@/lib/data/recurrence-json";
import { fromISO } from "@/lib/domain/plain-date";
import type { ScheduledRecurrence } from "@/lib/domain/recurrence";

const quatre: readonly ScheduledRecurrence[] = [
  { kind: "once", on: fromISO("2026-10-20") },
  {
    kind: "interval",
    anchor: fromISO("2026-09-01"),
    every: { count: 2, unit: "week" },
  },
  { kind: "annual", month: 3, day: 12 },
  { kind: "sinceCompletion", after: { count: 3, unit: "month" } },
];

describe("récurrence stockée", () => {
  it.each(quatre)("fait l'aller-retour sans perte : $kind", recurrence => {
    expect(
      parseRecurrence(
        JSON.parse(JSON.stringify(serializeRecurrence(recurrence))),
      ),
    ).toEqual(recurrence);
  });

  it("écrit les dates au format AAAA-MM-JJ", () => {
    expect(serializeRecurrence(quatre[0] as ScheduledRecurrence)).toEqual({
      kind: "once",
      on: "2026-10-20",
    });
  });

  it.each([
    ["un motif hors des quatre", { kind: "seasonal", every: {}, season: [] }],
    ["une date mal formée", { kind: "once", on: "20/10/2026" }],
    [
      "un intervalle nul",
      {
        kind: "interval",
        anchor: "2026-09-01",
        every: { count: 0, unit: "day" },
      },
    ],
    ["un mois impossible", { kind: "annual", month: 13, day: 1 }],
    ["rien", null],
  ])("refuse à la lecture %s", (_, value) => {
    expect(parseRecurrence(value)).toBeNull();
  });

  it("refuse d'écrire un motif pas encore pris en charge", () => {
    expect(() =>
      serializeRecurrence({
        kind: "derived",
        sourceDate: fromISO("2026-01-01"),
        offset: { count: 2, unit: "year" },
      }),
    ).toThrow(/pas encore pris en charge/);
  });
});
