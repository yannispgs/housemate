import { describe, expect, it } from "vitest";
import { plainDate, toISO } from "./plain-date";
import {
  assertReminderAhead,
  defaultReminders,
  InvalidReminderError,
  pendingReminders,
  type Reminder,
  reminderDate,
  remindersFor,
} from "./reminders";

const d = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);

  return plainDate(year ?? 0, month ?? 0, day ?? 0);
};

const email = (amount: number, unit: Reminder["unit"]): Reminder => ({
  amount,
  unit,
  channels: ["email"],
});

describe("reminderDate", () => {
  const occurrence = d("2026-10-02");

  it("compte en jours, en semaines et en mois avant", () => {
    expect(toISO(reminderDate(occurrence, email(0, "day")))).toBe("2026-10-02");
    expect(toISO(reminderDate(occurrence, email(3, "day")))).toBe("2026-09-29");
    expect(toISO(reminderDate(occurrence, email(2, "week")))).toBe(
      "2026-09-18",
    );
    expect(toISO(reminderDate(occurrence, email(1, "month")))).toBe(
      "2026-09-02",
    );
  });

  it("n'a pas de limite au délai", () => {
    expect(toISO(reminderDate(occurrence, email(400, "day")))).toBe(
      "2025-08-28",
    );
    expect(toISO(reminderDate(occurrence, email(26, "month")))).toBe(
      "2024-08-02",
    );
  });

  it("rabat sur le dernier jour d'un mois plus court", () => {
    expect(toISO(reminderDate(d("2026-03-31"), email(1, "month")))).toBe(
      "2026-02-28",
    );
  });
});

describe("defaultReminders", () => {
  it("donne au critique un rappel le jour même, en push et par e-mail", () => {
    expect(defaultReminders("critical")).toEqual([
      { amount: 0, unit: "day", channels: ["push", "email"] },
    ]);
  });

  it("ne donne rien aux autres niveaux", () => {
    expect(defaultReminders("important")).toEqual([]);
    expect(defaultReminders("normal")).toEqual([]);
    expect(defaultReminders("memo")).toEqual([]);
  });
});

describe("remindersFor", () => {
  it("ajoute les rappels saisis à ceux de l'importance", () => {
    expect(remindersFor("critical", [email(1, "week")])).toHaveLength(2);
  });

  it("refuse deux rappels au même délai, une semaine valant sept jours", () => {
    expect(() =>
      remindersFor("normal", [email(1, "week"), email(7, "day")]),
    ).toThrow(InvalidReminderError);
    expect(() => remindersFor("critical", [email(0, "day")])).toThrow(
      /même délai/,
    );
  });

  it("distingue un mois de trente jours", () => {
    expect(
      remindersFor("normal", [email(1, "month"), email(30, "day")]),
    ).toHaveLength(2);
  });

  it("refuse un délai négatif ou fractionnaire", () => {
    expect(() => remindersFor("normal", [email(-1, "day")])).toThrow(
      /Délai de rappel invalide/,
    );
    expect(() => remindersFor("normal", [email(1.5, "week")])).toThrow(
      InvalidReminderError,
    );
  });

  it("exige au moins un canal, sans doublon", () => {
    expect(() =>
      remindersFor("normal", [{ amount: 1, unit: "day", channels: [] }]),
    ).toThrow(/au moins un canal/);
    expect(() =>
      remindersFor("normal", [
        { amount: 1, unit: "day", channels: ["push", "push"] },
      ]),
    ).toThrow(/deux fois/);
  });
});

describe("assertReminderAhead", () => {
  const occurrence = d("2026-10-10");

  it("accepte un rappel qui tombe après aujourd'hui", () => {
    expect(() =>
      assertReminderAhead(occurrence, email(1, "week"), d("2026-10-02")),
    ).not.toThrow();
  });

  it("refuse un rappel qui tomberait aujourd'hui ou avant", () => {
    expect(() =>
      assertReminderAhead(occurrence, email(8, "day"), d("2026-10-02")),
    ).toThrow(/aujourd'hui ou avant/);
    expect(() =>
      assertReminderAhead(occurrence, email(1, "month"), d("2026-10-02")),
    ).toThrow(InvalidReminderError);
  });
});

describe("pendingReminders", () => {
  it("garde ceux d'aujourd'hui et après, du plus proche au plus lointain", () => {
    const due = pendingReminders(
      d("2026-10-10"),
      [email(1, "day"), email(8, "day"), email(1, "month"), email(0, "day")],
      d("2026-10-02"),
    );

    expect(due.map(entry => toISO(entry.date))).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-10",
    ]);
  });
});
