/**
 * L'occurrence en cours d'une échéance, et son état (SPEC § 3.6) :
 *
 *   dormante → en préavis → due → en tolérance → en retard (ferme)
 *                                              → abandonnée (souple)
 *
 * Une occurrence souple dont la tolérance est dépassée est **abandonnée** : on
 * vise la suivante, l'occasion est passée. Une occurrence ferme reste **en
 * retard** indéfiniment.
 *
 * ⚠️ Le motif n° 4 (« depuis la dernière fois ») ne s'abandonne jamais : sans
 * nouvelle complétion, la suivante n'est calculable depuis rien, et le besoin
 * grandit au lieu de s'évaporer. Souple, il reste **dû** (sans rouge) ; ferme,
 * il passe en retard comme les autres.
 */
import {
  addDays,
  compare,
  daysBetween,
  type PlainDate,
} from "@/lib/domain/plain-date";
import {
  nextOccurrence,
  type ScheduledRecurrence,
} from "@/lib/domain/recurrence";

export type OccurrenceState =
  | "dormante"
  | "preavis"
  | "due"
  | "tolerance"
  | "retard";

export interface OccurrenceInputs {
  readonly recurrence: ScheduledRecurrence;
  readonly tenue: "ferme" | "souple";
  readonly toleranceDays: number;
  /** Fenêtre d'attention avant la date (§ 3.5) ; 0 : pas de préavis. */
  readonly noticeDays: number;
  /** Les occurrences déjà traitées, par leur date due. */
  readonly completed: readonly PlainDate[];
  /** Date réelle de la dernière complétion, pour le motif n° 4. */
  readonly lastDone?: PlainDate;
  /** Aucune occurrence n'est cherchée avant ce jour : la création. */
  readonly since: PlainDate;
  readonly today: PlainDate;
}

export interface CurrentOccurrence {
  readonly due: PlainDate;
  readonly state: OccurrenceState;
}

/** Au-delà, la recherche s'arrête : une série quotidienne oubliée des années. */
const MAX_STEPS = 2000;

export function stateOn(
  due: PlainDate,
  today: PlainDate,
  inputs: Pick<OccurrenceInputs, "tenue" | "toleranceDays" | "noticeDays">,
): OccurrenceState | "abandonnee" {
  const remaining = daysBetween(today, due);

  if (remaining > inputs.noticeDays) {
    return "dormante";
  }

  if (remaining > 0) {
    return "preavis";
  }

  if (remaining === 0) {
    return "due";
  }

  if (-remaining <= inputs.toleranceDays) {
    return "tolerance";
  }

  return inputs.tenue === "ferme" ? "retard" : "abandonnee";
}

/**
 * L'occurrence qui demande attention, ou la prochaine à venir ; `null` s'il
 * n'y en a plus (une échéance ponctuelle faite, une saison vide).
 */
export function currentOccurrence(
  inputs: OccurrenceInputs,
): CurrentOccurrence | null {
  const { recurrence, today } = inputs;

  if (recurrence.kind === "sinceCompletion") {
    // Ce motif a toujours une prochaine date : au plus tard, `from`.
    const due = nextOccurrence(recurrence, {
      from: inputs.lastDone ? addDays(inputs.lastDone, 1) : inputs.since,
      lastCompletion: inputs.lastDone,
    }) as PlainDate;
    const state = stateOn(due, today, inputs);

    return { due, state: state === "abandonnee" ? "due" : state };
  }

  const isDone = (day: PlainDate) =>
    inputs.completed.some(d => compare(d, day) === 0);
  // Souple : tout ce qui précède « aujourd'hui − tolérance » est abandonné de
  // toute façon. Partir de là évite de parcourir des années de jours manqués.
  // Ferme : la plus ancienne non faite compte, on part de la création.
  const skipTo = addDays(today, -inputs.toleranceDays);
  let from =
    inputs.tenue === "souple" && compare(skipTo, inputs.since) > 0
      ? skipTo
      : inputs.since;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const due = nextOccurrence(recurrence, { from });

    if (due === null) {
      return null;
    }

    from = addDays(due, 1);

    if (isDone(due)) {
      continue;
    }

    // Jamais « abandonnée » ici : une échéance ferme ne s'abandonne pas, et
    // une souple ne cherche qu'à partir d'« aujourd'hui − tolérance ».
    return { due, state: stateOn(due, today, inputs) as OccurrenceState };
  }

  return null;
}
