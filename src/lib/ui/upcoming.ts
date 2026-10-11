/**
 * L'écran « À venir » : toutes les échéances du foyer, filtrées, triées et
 * groupées (handoff de design, § E). Logique pure, sans React.
 */
import {
  IMPORTANCE_LABELS,
  IMPORTANCES,
  type Importance,
  type Tenure,
} from "./deadline";

export interface UpcomingItem {
  /** Date de l'échéance, ou début de sa fenêtre : `AAAA-MM-JJ`. */
  readonly date: string;
  readonly title: string;
  readonly detail: string;
  readonly category: string;
  /** Importance effective (règle 3 du handoff). */
  readonly importance: Importance;
  readonly raised: boolean;
  readonly tenure: Tenure;
}

export const ALL = "Tout";
export const ALL_FEMININE = "Toutes";

export interface UpcomingFilters {
  readonly category: string;
  readonly importance: Importance | typeof ALL_FEMININE;
  readonly tenure: Tenure | typeof ALL_FEMININE;
}

export const NO_FILTERS: UpcomingFilters = {
  category: ALL,
  importance: ALL_FEMININE,
  tenure: ALL_FEMININE,
};

export type UpcomingSort = "date" | "importance" | "categorie";

export const SORT_LABELS: Readonly<Record<UpcomingSort, string>> = {
  date: "Date",
  importance: "Importance",
  categorie: "Catégorie",
};

const WEEKDAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/** Midi local : aucun décalage horaire ne fait glisser le jour. */
function atNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function monthOf(date: string): string {
  const day = atNoon(date);

  return `${MONTHS[day.getMonth()]} ${day.getFullYear()}`;
}

/** Les catégories présentes, dans l'ordre alphabétique français. */
export function categoriesOf(items: readonly UpcomingItem[]): string[] {
  return Array.from(new Set(items.map(item => item.category))).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

export function hasActiveFilters(filters: UpcomingFilters): boolean {
  return (
    filters.category !== ALL ||
    filters.importance !== ALL_FEMININE ||
    filters.tenure !== ALL_FEMININE
  );
}

export function filterUpcoming(
  items: readonly UpcomingItem[],
  filters: UpcomingFilters,
): UpcomingItem[] {
  return items.filter(
    item =>
      (filters.category === ALL || item.category === filters.category) &&
      (filters.importance === ALL_FEMININE ||
        item.importance === filters.importance) &&
      (filters.tenure === ALL_FEMININE || item.tenure === filters.tenure),
  );
}

export interface UpcomingRow extends UpcomingItem {
  /** Jour abrégé, en minuscules : « dim ». */
  readonly weekday: string;
  /** Numéro du jour sur deux chiffres : « 03 ». */
  readonly dayOfMonth: string;
}

export interface UpcomingGroup {
  readonly name: string;
  readonly rows: readonly UpcomingRow[];
}

const RANK: Readonly<Record<Importance, number>> = {
  critique: 0,
  important: 1,
  normal: 2,
  memoire: 3,
};

function groupName(item: UpcomingItem, sort: UpcomingSort): string {
  if (sort === "importance") {
    return IMPORTANCE_LABELS[item.importance];
  }

  if (sort === "categorie") {
    return item.category;
  }

  return monthOf(item.date);
}

function compare(sort: UpcomingSort) {
  return (a: UpcomingItem, b: UpcomingItem): number => {
    const byDate = a.date.localeCompare(b.date);

    if (sort === "importance") {
      return RANK[a.importance] - RANK[b.importance] || byDate;
    }

    if (sort === "categorie") {
      return a.category.localeCompare(b.category, "fr") || byDate;
    }

    return byDate;
  };
}

/**
 * Les groupes à afficher : par mois en tri par date, sinon par niveau ou par
 * catégorie, toujours par date à l'intérieur. Hors tri par date, le mois
 * rejoint le détail de chaque ligne, puisqu'il ne titre plus le groupe.
 */
export function groupUpcoming(
  items: readonly UpcomingItem[],
  sort: UpcomingSort,
): UpcomingGroup[] {
  const groups: { name: string; rows: UpcomingRow[] }[] = [];

  for (const item of [...items].sort(compare(sort))) {
    const name = groupName(item, sort);
    let group = groups.find(candidate => candidate.name === name);

    if (group === undefined) {
      group = { name, rows: [] };
      groups.push(group);
    }

    const day = atNoon(item.date);
    const month = monthOf(item.date).toLowerCase();
    group.rows.push({
      ...item,
      /* c8 ignore next -- repli inatteignable : `getDay()` rend 0 à 6. */
      weekday: WEEKDAYS[day.getDay()] ?? "",
      dayOfMonth: String(day.getDate()).padStart(2, "0"),
      detail:
        sort === "date"
          ? item.detail
          : [month, item.detail].filter(Boolean).join(" · "),
    });
  }

  return groups;
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/** Les options de chaque menu de filtre, « Tout » ou « Toutes » en tête. */
export function filterOptions(items: readonly UpcomingItem[]): {
  category: FilterOption[];
  importance: FilterOption[];
  tenure: FilterOption[];
} {
  return {
    category: [ALL, ...categoriesOf(items)].map(value => ({
      value,
      label: value,
    })),
    importance: [
      { value: ALL_FEMININE, label: ALL_FEMININE },
      ...IMPORTANCES.map(value => ({ value, label: IMPORTANCE_LABELS[value] })),
    ],
    tenure: [
      { value: ALL_FEMININE, label: ALL_FEMININE },
      { value: "ferme", label: "Ferme" },
      { value: "souple", label: "Souple" },
    ],
  };
}
