/**
 * Les rappels d'une échéance : des notifications envoyées AVANT sa date
 * (décisions du foyer du 2 octobre 2026, SPEC § 6).
 *
 * - Les échéances restent des JOURS : un rappel se compte en jours, semaines
 *   ou mois avant, jamais en heures.
 * - L'importance fixe des rappels par défaut ; on peut en ajouter à la main.
 *   Un rappel ne change jamais l'importance de l'échéance.
 * - Plusieurs rappels par échéance, chacun à un délai différent.
 * - Aucune limite au délai, sinon que le rappel doit tomber APRÈS aujourd'hui.
 *
 * Pur : aucune notion d'heure d'envoi ni de canal réel ici.
 */
import {
  addDays,
  addMonths,
  compare,
  isAfter,
  type PlainDate,
} from "./plain-date";

export type ReminderUnit = "day" | "week" | "month";

export type Channel = "email" | "push";

export interface Reminder {
  /** Combien d'unités avant la date de l'occurrence ; 0 = le jour même. */
  readonly amount: number;
  readonly unit: ReminderUnit;
  readonly channels: readonly Channel[];
}

/**
 * Les niveaux d'importance, tels que les nomme le domaine. (`importance.ts`
 * arrive avec la PR des règles d'échéance ; ce type s'y rattachera.)
 */
export type ImportanceLevel = "critical" | "important" | "normal" | "memo";

export class InvalidReminderError extends Error {}

/** La date à laquelle part un rappel, pour une occurrence donnée. */
export function reminderDate(
  occurrence: PlainDate,
  reminder: Reminder,
): PlainDate {
  if (reminder.unit === "month") {
    return addMonths(occurrence, -reminder.amount);
  }

  return addDays(
    occurrence,
    -reminder.amount * (reminder.unit === "week" ? 7 : 1),
  );
}

/**
 * Les rappels qu'une importance donne d'office. Seule une échéance critique
 * notifie (SPEC § 6) : le jour même, en push et par e-mail. « Important » n'a
 * pas encore de comportement : la révision des notifications le tranchera
 * (§ 17), d'ici là il n'en donne aucun.
 */
export function defaultReminders(importance: ImportanceLevel): Reminder[] {
  if (importance === "critical") {
    return [{ amount: 0, unit: "day", channels: ["push", "email"] }];
  }

  return [];
}

/**
 * Deux rappels au même délai n'en font qu'un : une semaine et sept jours sont
 * le même délai. Les mois ne se convertissent pas (leur longueur varie).
 */
function leadKey(reminder: Reminder): string {
  return reminder.unit === "month"
    ? `month:${reminder.amount}`
    : `day:${reminder.amount * (reminder.unit === "week" ? 7 : 1)}`;
}

function assertWellFormed(reminder: Reminder): void {
  if (!Number.isInteger(reminder.amount) || reminder.amount < 0) {
    throw new InvalidReminderError(
      `Délai de rappel invalide : ${reminder.amount} (entier positif ou nul attendu).`,
    );
  }

  if (reminder.channels.length === 0) {
    throw new InvalidReminderError(
      "Un rappel doit passer par au moins un canal.",
    );
  }

  if (new Set(reminder.channels).size !== reminder.channels.length) {
    throw new InvalidReminderError(
      "Un canal est cité deux fois dans le même rappel.",
    );
  }
}

/**
 * Tous les rappels d'une échéance : ceux de son importance, puis ceux ajoutés
 * à la main. Deux rappels au même délai sont refusés.
 */
export function remindersFor(
  importance: ImportanceLevel,
  added: readonly Reminder[],
): Reminder[] {
  const all = [...defaultReminders(importance), ...added];
  const seen = new Set<string>();

  for (const reminder of all) {
    assertWellFormed(reminder);
    const key = leadKey(reminder);

    if (seen.has(key)) {
      throw new InvalidReminderError(
        "Deux rappels au même délai : chaque rappel doit tomber à un délai différent.",
      );
    }

    seen.add(key);
  }

  return all;
}

/**
 * Vérifie qu'un rappel qu'on ajoute tombe après aujourd'hui pour la
 * prochaine occurrence : un rappel déjà passé ne préviendrait de rien.
 */
export function assertReminderAhead(
  occurrence: PlainDate,
  reminder: Reminder,
  today: PlainDate,
): void {
  if (!isAfter(reminderDate(occurrence, reminder), today)) {
    throw new InvalidReminderError(
      "Ce rappel tomberait aujourd'hui ou avant : choisis un délai plus court.",
    );
  }
}

export interface DueReminder {
  readonly date: PlainDate;
  readonly channels: readonly Channel[];
}

/**
 * Les rappels encore à envoyer pour une occurrence, du plus proche au plus
 * lointain. Ceux d'aujourd'hui en font partie : c'est le jour de les envoyer.
 */
export function pendingReminders(
  occurrence: PlainDate,
  reminders: readonly Reminder[],
  today: PlainDate,
): DueReminder[] {
  return reminders
    .map(reminder => ({
      date: reminderDate(occurrence, reminder),
      channels: reminder.channels,
    }))
    .filter(due => compare(due.date, today) >= 0)
    .sort((a, b) => compare(a.date, b.date));
}
