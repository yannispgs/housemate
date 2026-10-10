import { daysBetween, type PlainDate } from "@/lib/domain/plain-date";

/**
 * Les quatre niveaux d'importance (SPEC § 6), du moins au plus pressant.
 * L'ordre du tableau EST l'ordre de tri et de comparaison.
 */
export const IMPORTANCE_LEVELS = [
  "memo",
  "normal",
  "important",
  "critical",
] as const;

export type Importance = (typeof IMPORTANCE_LEVELS)[number];

function rank(importance: Importance): number {
  return IMPORTANCE_LEVELS.indexOf(importance);
}

function highest(a: Importance, b: Importance): Importance {
  return rank(a) >= rank(b) ? a : b;
}

export interface EscalationInputs {
  readonly base: Importance;
  readonly firm: boolean;
  /** Préavis en jours ; absent si l'échéance n'en a pas. */
  readonly noticeDays?: number;
  readonly today: PlainDate;
  readonly due: PlainDate;
}

export interface EffectiveImportance {
  readonly importance: Importance;
  /** Vrai quand l'importance affichée dépasse celle de base (« ↑ important »). */
  readonly raised: boolean;
}

/** Le niveau visé à `remaining` jours d'une échéance de préavis `noticeDays`. */
function target(
  base: Importance,
  remaining: number,
  noticeDays: number,
): Importance {
  const ratio = remaining / noticeDays;

  if (remaining <= 7 || ratio <= 0.1) {
    return "critical";
  }

  if (ratio <= 0.5) {
    return "important";
  }

  return base;
}

/**
 * L'importance d'une échéance ferme qui approche (SPEC § 3.8a, règle du
 * handoff de design) : dans la fenêtre de préavis, elle devient `important`
 * à mi-préavis, puis `critical` dans les sept derniers jours ou le dernier
 * dixième du préavis. Elle ne descend jamais sous l'importance de base.
 *
 * Une échéance souple ne monte pas : son retard se signale sans rouge
 * (SPEC § 3.6).
 */
export function effectiveImportance({
  base,
  firm,
  noticeDays,
  today,
  due,
}: EscalationInputs): EffectiveImportance {
  const remaining = daysBetween(today, due);

  if (!firm || !noticeDays || noticeDays <= 0 || remaining > noticeDays) {
    return { importance: base, raised: false };
  }

  const importance = highest(base, target(base, remaining, noticeDays));

  return { importance, raised: rank(importance) > rank(base) };
}

/** Tri : critique d'abord, pour mémoire en dernier. */
export function byImportanceDescending(a: Importance, b: Importance): number {
  return rank(b) - rank(a);
}
