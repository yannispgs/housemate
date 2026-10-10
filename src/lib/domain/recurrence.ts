import type { Month } from "@/lib/domain/month";
import {
  activeMonths,
  isActiveIn,
  isEmpty,
  type MonthMask,
} from "@/lib/domain/month-mask";
import {
  addDays,
  addMonths,
  addMonthsFromAnchor,
  compare,
  daysInMonth,
  type PlainDate,
  plainDate,
} from "@/lib/domain/plain-date";

/* -------------------------------------------------------------------------- */
/* Durées                                                                     */
/* -------------------------------------------------------------------------- */

export type DurationUnit = "day" | "week" | "month" | "year";

export type Duration = {
  readonly count: number;
  readonly unit: DurationUnit;
};

export class InvalidRecurrenceError extends Error {}

/**
 * Un décalage de dérivation peut être négatif (SPEC § 3.4a) : les échéances les
 * plus coûteuses se calculent à l'envers, depuis une date qu'on ne choisit pas
 * — un passeport six mois avant son expiration, un contrat un mois avant sa
 * date anniversaire. Sans cela, l'échéance tomberait au moment précis où il
 * est trop tard pour agir. Seule exigence : un nombre entier.
 */
function assertWholeOffset(duration: Duration): void {
  if (!Number.isInteger(duration.count)) {
    throw new InvalidRecurrenceError(
      `Un décalage est un nombre entier, reçu ${duration.count}.`,
    );
  }
}

function assertPositive(duration: Duration): void {
  if (!Number.isInteger(duration.count) || duration.count < 1) {
    throw new InvalidRecurrenceError(
      `Un intervalle vaut au moins 1, reçu ${duration.count}.`,
    );
  }
}

/**
 * La n-ième répétition d'une durée à partir d'une ancre.
 *
 * Passe par `addMonthsFromAnchor` pour les mois et les années : calculer depuis
 * l'ancre plutôt que de proche en proche évite qu'un rabattement de fin de mois
 * contamine toute la série (voir `plain-date.ts`).
 */
export function addDuration(
  anchor: PlainDate,
  duration: Duration,
  repetitions: number,
): PlainDate {
  switch (duration.unit) {
    case "day":
      return addDays(anchor, duration.count * repetitions);
    case "week":
      return addDays(anchor, duration.count * 7 * repetitions);
    case "month":
      return addMonthsFromAnchor(anchor, duration.count, repetitions);
    case "year":
      return addMonthsFromAnchor(anchor, duration.count * 12, repetitions);
  }
}

/* -------------------------------------------------------------------------- */
/* Les neuf motifs                                                            */
/* -------------------------------------------------------------------------- */

/** 1 — Tous les N jours, semaines, mois ou ans depuis une date d'ancrage. */
export type IntervalRecurrence = {
  readonly kind: "interval";
  readonly anchor: PlainDate;
  readonly every: Duration;
  /**
   * Un premier saut différent des suivants (SPEC § 3.4c) : le contrôle
   * technique tombe 4 ans après la mise en circulation, puis tous les 2 ans.
   * ⚠️ C'est la durée du premier saut qui change, pas l'ancre : la série
   * reste ancrée sur la date d'origine.
   */
  readonly firstAfter?: Duration;
};

/** 2 — Date annuelle fixe : anniversaires, fêtes. */
export type AnnualRecurrence = {
  readonly kind: "annual";
  readonly month: Month;
  readonly day: number;
};

/** 3 — Intervalle restreint à une fenêtre saisonnière. */
export type SeasonalRecurrence = {
  readonly kind: "seasonal";
  readonly every: Duration;
  readonly season: MonthMask;
  /** Jour du mois où la saison démarre. 1 par défaut. */
  readonly startDay: number;
};

/** 4 — Compté depuis la dernière complétion, pas depuis le calendrier. */
export type SinceCompletionRecurrence = {
  readonly kind: "sinceCompletion";
  readonly after: Duration;
};

/**
 * 5 — Dérivée d'un attribut de fiche : date d'achat + durée de garantie, ou
 * expiration − 6 mois. Le décalage est **négatif** quand l'échéance précède sa
 * source.
 */
export type DerivedRecurrence = {
  readonly kind: "derived";
  readonly sourceDate: PlainDate;
  readonly offset: Duration;
};

/** 6 — Une seule échéance, jamais répétée. */
export type OnceRecurrence = {
  readonly kind: "once";
  readonly on: PlainDate;
};

/** 7 — Sans date. Consultable, ne remonte jamais d'elle-même. */
export type DormantRecurrence = { readonly kind: "dormant" };

/** 8 — Au compteur : révision tous les 15 000 km. */
export type CounterRecurrence = {
  readonly kind: "counter";
  readonly every: number;
  readonly unit: string;
};

/** 9 — Déclenchée par un seuil extérieur : gel annoncé sous la rusticité. */
export type ThresholdRecurrence = {
  readonly kind: "threshold";
  readonly metric: string;
  readonly below: number;
};

/**
 * Les motifs **calculables depuis une date**.
 *
 * ⚠️ La séparation est portée par les types, pas par une convention. Les motifs
 * 7, 8 et 9 ne peuvent produire aucune « prochaine occurrence » : le dormant
 * n'a pas de date, le compteur dépend d'un relevé, le seuil naît d'un événement
 * extérieur qui peut ne jamais survenir (SPEC § 3.4).
 *
 * Les faire passer par la même fonction obligerait à renvoyer `null` sans que
 * l'appelant sache s'il s'agit d'une absence normale ou d'une erreur.
 */
/**
 * « Au premier des deux termes échus » (SPEC § 3.4b) : plusieurs motifs, et
 * l'occurrence retenue est la plus proche. Révision tous les 20 000 km OU tous
 * les ans ; garantie constructeur en années OU en kilomètres.
 *
 * ⚠️ Un compteur (motif 8) ne se calcule pas depuis une date : il n'entre dans
 * une composite que par une date ESTIMÉE à partir de la série de ses relevés
 * (§ 5.3), sous la forme d'une échéance ponctuelle.
 */
export type CompositeRecurrence = {
  readonly kind: "composite";
  readonly parts: readonly ScheduledRecurrence[];
};

export type ScheduledRecurrence =
  | IntervalRecurrence
  | AnnualRecurrence
  | SeasonalRecurrence
  | SinceCompletionRecurrence
  | DerivedRecurrence
  | OnceRecurrence
  | CompositeRecurrence;

export type UnscheduledRecurrence =
  | DormantRecurrence
  | CounterRecurrence
  | ThresholdRecurrence;

export type Recurrence = ScheduledRecurrence | UnscheduledRecurrence;

export function isScheduled(
  recurrence: Recurrence,
): recurrence is ScheduledRecurrence {
  return (
    recurrence.kind !== "dormant" &&
    recurrence.kind !== "counter" &&
    recurrence.kind !== "threshold"
  );
}

/* -------------------------------------------------------------------------- */
/* Calcul des occurrences                                                     */
/* -------------------------------------------------------------------------- */

export type OccurrenceContext = {
  /** On cherche la première occurrence **à partir de** ce jour, inclus. */
  readonly from: PlainDate;
  /** Dernière complétion connue, pour le motif 4. */
  readonly lastCompletion?: PlainDate;
};

function notBefore(candidate: PlainDate, from: PlainDate): boolean {
  return compare(candidate, from) >= 0;
}

/** Longueur approchée d'une unité, pour une première estimation seulement. */
const APPROXIMATE_DAYS: Readonly<Record<DurationUnit, number>> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Nombre de répétitions à partir duquel l'intervalle atteint `from`. */
function firstRepetitionAtOrAfter(
  anchor: PlainDate,
  every: Duration,
  from: PlainDate,
): number {
  if (notBefore(anchor, from)) {
    return 0;
  }
  // Estimation grossière puis correction bornée : les mois n'ont pas tous la
  // même longueur, donc on ne peut pas diviser exactement.
  const perRepetitionDays = every.count * APPROXIMATE_DAYS[every.unit];
  const rough = Math.max(
    0,
    Math.floor(
      (new Date(from.year, from.month - 1, from.day).getTime() -
        new Date(anchor.year, anchor.month - 1, anchor.day).getTime()) /
        (86_400_000 * perRepetitionDays),
    ),
  );

  let repetition = rough;
  // Recule tant qu'on a dépassé, puis avance jusqu'à atteindre `from`.
  while (
    repetition > 0 &&
    notBefore(addDuration(anchor, every, repetition - 1), from)
  ) {
    repetition -= 1;
  }
  while (!notBefore(addDuration(anchor, every, repetition), from)) {
    repetition += 1;
  }
  return repetition;
}

/**
 * Le 29 février rabattu sur le 28 les années non bissextiles.
 *
 * Cas réel : un anniversaire le 29 février. Refuser la date serait absurde, la
 * décaler au 1er mars la ferait changer de mois.
 */
function annualOccurrenceIn(
  year: number,
  month: Month,
  day: number,
): PlainDate {
  return plainDate(year, month, Math.min(day, daysInMonth(year, month)));
}

/**
 * Premier jour de la saison en cours ou à venir, à partir de `from`.
 *
 * ⚠️ Une fenêtre saisonnière **traverse l'année** quand le masque le fait :
 * octobre → mars est une seule saison continue dans le temps. C'est l'inverse
 * de `segments()`, qui sert à l'affichage et ne reboucle volontairement pas,
 * parce qu'une frise est une bande linéaire de janvier à décembre. Même
 * masque, deux découpages, deux usages.
 */
function firstOfMonth(date: PlainDate, startDay: number): PlainDate {
  return plainDate(
    date.year,
    date.month,
    Math.min(startDay, daysInMonth(date.year, date.month)),
  );
}

/**
 * Début de la saison contenant `date`, ou de la prochaine si `date` tombe hors
 * saison.
 *
 * ⚠️ Une saison **traverse l'année** quand le masque le fait : octobre → mars
 * est une seule saison continue dans le temps. C'est l'inverse de `segments()`,
 * qui sert à l'affichage et ne reboucle volontairement pas, parce qu'une frise
 * est une bande linéaire de janvier à décembre. Même masque, deux découpages,
 * deux usages — et c'est exactement le genre de confusion qui produit un bogue
 * silencieux si on réutilise l'un pour l'autre.
 */
function seasonStart(
  season: MonthMask,
  startDay: number,
  date: PlainDate,
): PlainDate {
  if (isActiveIn(season, date.month)) {
    let cursor = firstOfMonth(date, startDay);
    // Remonte tant que le mois précédent appartient encore à la saison. Borné
    // à onze pas : au-delà, c'est que l'année entière est active.
    for (let i = 0; i < 11; i += 1) {
      const previous = addMonths(cursor, -1);
      if (!isActiveIn(season, previous.month)) {
        break;
      }
      cursor = firstOfMonth(previous, startDay);
    }
    return cursor;
  }

  let cursor = plainDate(date.year, date.month, 1);
  for (let i = 0; i < 12; i += 1) {
    cursor = addMonths(cursor, 1);
    if (isActiveIn(season, cursor.month)) {
      return firstOfMonth(cursor, startDay);
    }
  }
  /* c8 ignore next -- inatteignable : une saison vide est écartée avant tout appel (`nextSeasonal`). Gardé pour qu'une boucle ne rende jamais une date fausse. */
  throw new InvalidRecurrenceError("Saison sans mois actif.");
}

/** Premier jour de la saison qui suit celle commencée en `entry`. */
function nextSeasonStart(
  season: MonthMask,
  startDay: number,
  entry: PlainDate,
): PlainDate {
  let cursor = plainDate(entry.year, entry.month, 1);
  // Sort de la saison courante…
  for (let i = 0; i < 13; i += 1) {
    cursor = addMonths(cursor, 1);
    if (!isActiveIn(season, cursor.month)) {
      break;
    }
  }
  // …puis rejoint la suivante.
  return seasonStart(season, startDay, cursor);
}

function nextSeasonal(
  recurrence: SeasonalRecurrence,
  from: PlainDate,
): PlainDate | null {
  if (isEmpty(recurrence.season)) {
    return null;
  }
  assertPositive(recurrence.every);

  let entry = seasonStart(recurrence.season, recurrence.startDay, from);

  // Trois saisons suffisent largement ; la borne interdit toute boucle infinie
  // sur un masque inattendu.
  for (let season = 0; season < 3; season += 1) {
    for (let step = 0; step < 400; step += 1) {
      const candidate = addDuration(entry, recurrence.every, step);
      if (!isActiveIn(recurrence.season, candidate.month)) {
        break; // fin de saison : rien de plus à trouver dans celle-ci
      }
      if (notBefore(candidate, from)) {
        return candidate;
      }
    }
    entry = nextSeasonStart(recurrence.season, recurrence.startDay, entry);
  }
  /* c8 ignore next -- inatteignable : chaque saison non vide produit une date. Borne de sûreté contre une boucle infinie. */
  return null;
}

/** La plus proche des prochaines occurrences de chaque motif d'une composite. */
function earliestOf(
  recurrence: CompositeRecurrence,
  context: OccurrenceContext,
): PlainDate | null {
  if (recurrence.parts.length === 0) {
    throw new InvalidRecurrenceError("Une récurrence composite sans motif.");
  }

  let earliest: PlainDate | null = null;

  for (const part of recurrence.parts) {
    const candidate = nextOccurrence(part, context);

    if (candidate && (!earliest || compare(candidate, earliest) < 0)) {
      earliest = candidate;
    }
  }

  return earliest;
}

/**
 * La prochaine occurrence à partir de `context.from`, ou `null` s'il n'y en a
 * plus — cas d'une échéance ponctuelle déjà passée, ou d'une saison vide.
 */
export function nextOccurrence(
  recurrence: ScheduledRecurrence,
  context: OccurrenceContext,
): PlainDate | null {
  const { from } = context;

  switch (recurrence.kind) {
    case "once":
      return notBefore(recurrence.on, from) ? recurrence.on : null;

    case "interval": {
      assertPositive(recurrence.every);

      if (recurrence.firstAfter) {
        assertPositive(recurrence.firstAfter);
      }

      // Avec un premier saut distinct, la série « régulière » démarre à la
      // première échéance, et l'ancre elle-même n'est jamais une occurrence.
      const start = recurrence.firstAfter
        ? addDuration(recurrence.anchor, recurrence.firstAfter, 1)
        : recurrence.anchor;
      const repetition = firstRepetitionAtOrAfter(
        start,
        recurrence.every,
        from,
      );

      return addDuration(start, recurrence.every, repetition);
    }

    case "composite":
      return earliestOf(recurrence, context);

    case "annual": {
      const thisYear = annualOccurrenceIn(
        from.year,
        recurrence.month,
        recurrence.day,
      );
      return notBefore(thisYear, from)
        ? thisYear
        : annualOccurrenceIn(from.year + 1, recurrence.month, recurrence.day);
    }

    case "derived": {
      assertWholeOffset(recurrence.offset);
      const due = addDuration(recurrence.sourceDate, recurrence.offset, 1);
      return notBefore(due, from) ? due : null;
    }

    case "sinceCompletion": {
      assertPositive(recurrence.after);
      // Sans complétion connue, la série n'a pas encore commencé : l'échéance
      // est due tout de suite. C'est le comportement voulu — une tâche « tous
      // les trois mois depuis la dernière fois » jamais faite est à faire.
      if (!context.lastCompletion) {
        return from;
      }
      const due = addDuration(context.lastCompletion, recurrence.after, 1);
      return notBefore(due, from) ? due : from;
    }

    case "seasonal":
      return nextSeasonal(recurrence, from);
  }
}

/** Les `count` prochaines occurrences, dans l'ordre. */
export function nextOccurrences(
  recurrence: ScheduledRecurrence,
  context: OccurrenceContext,
  count: number,
): readonly PlainDate[] {
  const result: PlainDate[] = [];
  let cursor = context.from;

  for (let i = 0; i < count; i += 1) {
    const next = nextOccurrence(recurrence, { ...context, from: cursor });
    if (!next) {
      break;
    }
    result.push(next);
    cursor = addDays(next, 1);
    // Une échéance ponctuelle ou dérivée ne se répète pas.
    if (recurrence.kind === "once" || recurrence.kind === "derived") {
      break;
    }
    // Sans complétion, « depuis la dernière fois » ne produit qu'une échéance.
    if (recurrence.kind === "sinceCompletion" && !context.lastCompletion) {
      break;
    }
  }
  return result;
}

/** Les mois où un motif saisonnier peut produire une occurrence. */
export function activeSeasonMonths(
  recurrence: SeasonalRecurrence,
): readonly Month[] {
  return activeMonths(recurrence.season);
}
