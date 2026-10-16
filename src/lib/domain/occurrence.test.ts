import { describe, expect, it } from "vitest";
import {
  currentOccurrence,
  type OccurrenceInputs,
  stateOn,
} from "@/lib/domain/occurrence";
import { fromISO, toISO } from "@/lib/domain/plain-date";

const d = fromISO;
const TODAY = d("2026-10-13");

const base = (overrides: Partial<OccurrenceInputs> = {}): OccurrenceInputs => ({
  recurrence: { kind: "once", on: d("2026-10-20") },
  tenue: "souple",
  toleranceDays: 3,
  noticeDays: 7,
  completed: [],
  since: d("2026-10-01"),
  today: TODAY,
  ...overrides,
});

const iso = (r: ReturnType<typeof currentOccurrence>) =>
  r && { due: toISO(r.due), state: r.state };

describe("stateOn — le cycle de vie (§ 3.6)", () => {
  const regles = { tenue: "souple", toleranceDays: 3, noticeDays: 7 } as const;

  it.each([
    ["2026-10-21", "dormante"],
    ["2026-10-20", "preavis"],
    ["2026-10-14", "preavis"],
    ["2026-10-13", "due"],
    ["2026-10-10", "tolerance"],
    ["2026-10-09", "abandonnee"],
  ] as const)("échéance au %s : %s", (due, state) => {
    expect(stateOn(d(due), TODAY, regles)).toBe(state);
  });

  it("une échéance ferme passe en retard au lieu d'être abandonnée", () => {
    expect(stateOn(d("2026-10-09"), TODAY, { ...regles, tenue: "ferme" })).toBe(
      "retard",
    );
  });

  it("sans préavis, une échéance future dort jusqu'à sa date", () => {
    expect(stateOn(d("2026-10-14"), TODAY, { ...regles, noticeDays: 0 })).toBe(
      "dormante",
    );
  });
});

describe("currentOccurrence", () => {
  it("donne une échéance ponctuelle à venir, puis rien une fois faite", () => {
    expect(iso(currentOccurrence(base()))).toEqual({
      due: "2026-10-20",
      state: "preavis",
    });
    expect(
      currentOccurrence(base({ completed: [d("2026-10-20")] })),
    ).toBeNull();
  });

  it("⚠️ abandonne une occurrence souple dépassée et vise la suivante", () => {
    const every2Weeks = base({
      recurrence: {
        kind: "interval",
        anchor: d("2026-09-01"),
        every: { count: 2, unit: "week" },
      },
      since: d("2026-09-01"),
    });

    // 01/09, 15/09, 29/09 dépassées ; 13/10 due aujourd'hui.
    expect(iso(currentOccurrence(every2Weeks))).toEqual({
      due: "2026-10-13",
      state: "due",
    });
  });

  it("⚠️ garde en retard la plus ancienne occurrence ferme non faite", () => {
    const ferme = base({
      recurrence: {
        kind: "interval",
        anchor: d("2026-09-01"),
        every: { count: 1, unit: "month" },
      },
      tenue: "ferme",
      since: d("2026-09-01"),
    });

    expect(iso(currentOccurrence(ferme))).toEqual({
      due: "2026-09-01",
      state: "retard",
    });
    expect(
      iso(currentOccurrence({ ...ferme, completed: [d("2026-09-01")] })),
    ).toEqual({ due: "2026-10-01", state: "retard" });
  });

  it("ne cherche aucune occurrence avant la création", () => {
    const annuel = base({
      recurrence: { kind: "annual", month: 10, day: 2 },
      since: d("2026-10-05"),
    });

    expect(iso(currentOccurrence(annuel))).toEqual({
      due: "2027-10-02",
      state: "dormante",
    });
  });

  it("saute les occurrences déjà faites, même dans le désordre", () => {
    const hebdo = base({
      recurrence: {
        kind: "interval",
        anchor: d("2026-10-06"),
        every: { count: 1, unit: "week" },
      },
      since: d("2026-10-06"),
      completed: [d("2026-10-13"), d("2026-10-06")],
    });

    expect(iso(currentOccurrence(hebdo))).toEqual({
      due: "2026-10-20",
      state: "preavis",
    });
  });

  describe("motif n° 4 — depuis la dernière fois", () => {
    const draps = base({
      recurrence: {
        kind: "sinceCompletion",
        after: { count: 2, unit: "week" },
      },
      since: d("2026-09-01"),
    });

    it("jamais fait : dû depuis la création", () => {
      expect(iso(currentOccurrence(draps))).toEqual({
        due: "2026-09-01",
        state: "due",
      });
    });

    it("se calcule depuis la dernière fois", () => {
      expect(
        iso(currentOccurrence({ ...draps, lastDone: d("2026-10-06") })),
      ).toEqual({ due: "2026-10-20", state: "preavis" });
    });

    it("⚠️ souple et dépassé : reste dû, jamais abandonné", () => {
      expect(
        currentOccurrence({ ...draps, lastDone: d("2026-09-01") })?.state,
      ).toBe("due");
    });

    it("ferme et dépassé : en retard", () => {
      expect(
        currentOccurrence({
          ...draps,
          tenue: "ferme",
          lastDone: d("2026-09-01"),
        })?.state,
      ).toBe("retard");
    });
  });

  it("s'arrête quand la série n'a plus d'occurrence", () => {
    expect(
      currentOccurrence(
        base({
          recurrence: { kind: "once", on: d("2026-10-01") },
        }),
      ),
    ).toBeNull();
  });

  it("⚠️ une série souple quotidienne oubliée depuis des années reste visible", () => {
    expect(
      iso(
        currentOccurrence(
          base({
            recurrence: {
              kind: "interval",
              anchor: d("2010-01-01"),
              every: { count: 1, unit: "day" },
            },
            since: d("2010-01-01"),
          }),
        ),
      ),
    ).toEqual({ due: "2026-10-10", state: "tolerance" });
  });

  it("borne la recherche quand toutes les occurrences sont faites", () => {
    const quotidienne = base({
      recurrence: {
        kind: "interval",
        anchor: d("2010-01-01"),
        every: { count: 1, unit: "day" },
      },
      tenue: "ferme",
      since: d("2010-01-01"),
    });
    const tout = Array.from({ length: 2500 }, (_, i) => {
      const day = new Date(Date.UTC(2010, 0, 1 + i));

      return d(day.toISOString().slice(0, 10));
    });

    expect(currentOccurrence({ ...quotidienne, completed: tout })).toBeNull();
  });
});
