/**
 * Une récurrence telle qu'elle est stockée en base (`app.echeances.recurrence`,
 * JSON), et sa traduction vers le type du domaine. Les dates y sont écrites
 * « AAAA-MM-JJ » : lisibles, et comparables à l'œil.
 *
 * Première version (décision du foyer, 2026-10-13) : les quatre motifs
 * courants — une seule fois, intervalle, date annuelle, depuis la dernière
 * fois — et la dérivée d'une date, pour les garanties. Le moteur sait les neuf ; une récurrence d'un autre motif est
 * refusée à la lecture plutôt qu'interprétée de travers.
 */
import { z } from "zod";
import { isMonth, type Month } from "@/lib/domain/month";
import { fromISO, toISO } from "@/lib/domain/plain-date";
import type { Duration, ScheduledRecurrence } from "@/lib/domain/recurrence";

const isoDate = z.iso.date();

const duration = z.object({
  count: z.number().int().positive(),
  unit: z.enum(["day", "week", "month", "year"]),
});

export const recurrenceJson = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), on: isoDate }),
  z.object({
    kind: z.literal("interval"),
    anchor: isoDate,
    every: duration,
  }),
  z.object({
    kind: z.literal("annual"),
    month: z.number().int().refine(isMonth),
    day: z.number().int().min(1).max(31),
  }),
  z.object({ kind: z.literal("sinceCompletion"), after: duration }),
  // 5 — dérivée d'une date : la fin de garantie, date d'achat + durée
  // (décision du foyer, 2026-10-13). Le décalage peut être négatif (§ 3.4a).
  z.object({
    kind: z.literal("derived"),
    sourceDate: isoDate,
    offset: z.object({
      count: z
        .number()
        .int()
        .refine(n => n !== 0),
      unit: z.enum(["day", "week", "month", "year"]),
    }),
  }),
]);

export type RecurrenceJson = z.infer<typeof recurrenceJson>;

/** Le JSON stocké, vers le type du domaine ; `null` s'il n'est pas lisible. */
export function parseRecurrence(value: unknown): ScheduledRecurrence | null {
  const parsed = recurrenceJson.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const r = parsed.data;

  switch (r.kind) {
    case "once":
      return { kind: "once", on: fromISO(r.on) };
    case "interval":
      return {
        kind: "interval",
        anchor: fromISO(r.anchor),
        every: r.every as Duration,
      };
    case "annual":
      // `isMonth` l'a vérifié ci-dessus.
      return { kind: "annual", month: r.month as Month, day: r.day };
    case "sinceCompletion":
      return { kind: "sinceCompletion", after: r.after as Duration };
    case "derived":
      return {
        kind: "derived",
        sourceDate: fromISO(r.sourceDate),
        offset: r.offset as Duration,
      };
  }
}

/** Le type du domaine, vers le JSON à stocker. */
export function serializeRecurrence(
  recurrence: ScheduledRecurrence,
): RecurrenceJson {
  switch (recurrence.kind) {
    case "once":
      return { kind: "once", on: toISO(recurrence.on) };
    case "interval":
      return {
        kind: "interval",
        anchor: toISO(recurrence.anchor),
        every: recurrence.every,
      };
    case "annual":
      return {
        kind: "annual",
        month: recurrence.month,
        day: recurrence.day,
      };
    case "sinceCompletion":
      return { kind: "sinceCompletion", after: recurrence.after };
    case "derived":
      return {
        kind: "derived",
        sourceDate: toISO(recurrence.sourceDate),
        offset: recurrence.offset,
      };
    default:
      throw new Error(
        `Motif « ${recurrence.kind} » : pas encore pris en charge à la saisie.`,
      );
  }
}
