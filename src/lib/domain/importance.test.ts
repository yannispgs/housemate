import { describe, expect, it } from "vitest";
import {
  byImportanceDescending,
  effectiveImportance,
  type Importance,
} from "@/lib/domain/importance";
import { addDays, fromISO } from "@/lib/domain/plain-date";

const today = fromISO("2026-09-13");

/** Une échéance ferme, préavis de 60 jours, à `remaining` jours. */
const firmIn = (remaining: number, base: Importance = "normal") =>
  effectiveImportance({
    base,
    firm: true,
    noticeDays: 60,
    today,
    due: addDays(today, remaining),
  });

describe("effectiveImportance — échéance ferme avec préavis", () => {
  it("garde sa base avant l'ouverture du préavis", () => {
    expect(firmIn(61)).toEqual({ importance: "normal", raised: false });
  });

  it("garde sa base dans la première moitié du préavis", () => {
    expect(firmIn(31)).toEqual({ importance: "normal", raised: false });
  });

  it("⚠️ le contrôle technique à 19 jours devient important (exemple du design)", () => {
    expect(firmIn(19)).toEqual({ importance: "important", raised: true });
  });

  it("monte à important à mi-préavis exactement", () => {
    expect(firmIn(30).importance).toBe("important");
  });

  it("devient critique dans les sept derniers jours", () => {
    expect(firmIn(7)).toEqual({ importance: "critical", raised: true });
    expect(firmIn(0).importance).toBe("critical");
  });

  it("devient critique dans le dernier dixième d'un long préavis", () => {
    const year = effectiveImportance({
      base: "normal",
      firm: true,
      noticeDays: 365,
      today,
      due: addDays(today, 36),
    });

    expect(year.importance).toBe("critical");
  });

  it("⚠️ ne descend jamais sous la base", () => {
    expect(firmIn(19, "critical")).toEqual({
      importance: "critical",
      raised: false,
    });
  });

  it("reste critique une fois la date passée", () => {
    expect(firmIn(-3).importance).toBe("critical");
  });
});

describe("effectiveImportance — ce qui ne monte pas", () => {
  it("une échéance souple garde sa base", () => {
    const soft = effectiveImportance({
      base: "memo",
      firm: false,
      noticeDays: 30,
      today,
      due: addDays(today, 2),
    });

    expect(soft).toEqual({ importance: "memo", raised: false });
  });

  it("une échéance ferme sans préavis garde sa base", () => {
    const noNotice = effectiveImportance({
      base: "normal",
      firm: true,
      today,
      due: addDays(today, 2),
    });

    expect(noNotice).toEqual({ importance: "normal", raised: false });
  });
});

describe("byImportanceDescending", () => {
  it("trie de critique à pour mémoire", () => {
    const levels: Importance[] = ["normal", "memo", "critical", "important"];

    expect(levels.sort(byImportanceDescending)).toEqual([
      "critical",
      "important",
      "normal",
      "memo",
    ]);
  });
});
