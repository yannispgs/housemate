import { describe, expect, it } from "vitest";
import {
  categoriesOf,
  filterOptions,
  filterUpcoming,
  groupUpcoming,
  hasActiveFilters,
  NO_FILTERS,
  type UpcomingItem,
} from "./upcoming";

const item = (overrides: Partial<UpcomingItem>): UpcomingItem => ({
  date: "2026-09-13",
  title: "Tâche",
  detail: "",
  category: "Jardin",
  importance: "normal",
  raised: false,
  tenure: "souple",
  ...overrides,
});

const items = [
  item({
    date: "2026-10-02",
    title: "Contrôle",
    category: "Véhicule",
    importance: "important",
    tenure: "ferme",
    detail: "préavis ouvert",
  }),
  item({
    date: "2026-09-13",
    title: "Gel",
    importance: "critique",
    tenure: "ferme",
  }),
  item({ date: "2026-11-15", title: "Hivernage", importance: "memoire" }),
  item({ date: "2026-12-10", title: "Chaudière", category: "Bricolage" }),
];

describe("categoriesOf", () => {
  it("rend les catégories présentes, une fois, dans l'ordre alphabétique", () => {
    expect(categoriesOf(items)).toEqual(["Bricolage", "Jardin", "Véhicule"]);
  });
});

describe("filterUpcoming", () => {
  it("ne filtre rien par défaut", () => {
    expect(filterUpcoming(items, NO_FILTERS)).toHaveLength(4);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it("combine catégorie, importance et tenue", () => {
    const filters = {
      category: "Jardin",
      importance: "critique",
      tenure: "ferme",
    } as const;

    expect(filterUpcoming(items, filters).map(entry => entry.title)).toEqual([
      "Gel",
    ]);
    expect(hasActiveFilters(filters)).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, importance: "normal" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...NO_FILTERS, tenure: "souple" })).toBe(true);
  });
});

describe("groupUpcoming", () => {
  it("groupe par mois en tri par date, dans l'ordre chronologique", () => {
    const groups = groupUpcoming(items, "date");

    expect(groups.map(group => group.name)).toEqual([
      "Septembre 2026",
      "Octobre 2026",
      "Novembre 2026",
      "Décembre 2026",
    ]);
    expect(groups[1]?.rows[0]).toMatchObject({
      weekday: "ven",
      dayOfMonth: "02",
      detail: "préavis ouvert",
    });
  });

  it("groupe par niveau en tri par importance, le mois passant dans le détail", () => {
    const groups = groupUpcoming(items, "importance");

    expect(groups.map(group => group.name)).toEqual([
      "Critique",
      "Important",
      "Normal",
      "Pour mémoire",
    ]);
    expect(groups[1]?.rows[0]?.detail).toBe("octobre 2026 · préavis ouvert");
    expect(groups[0]?.rows[0]?.detail).toBe("septembre 2026");
  });

  it("groupe par catégorie, par date à l'intérieur", () => {
    const groups = groupUpcoming(items, "categorie");

    expect(groups.map(group => group.name)).toEqual([
      "Bricolage",
      "Jardin",
      "Véhicule",
    ]);
    expect(groups[1]?.rows.map(row => row.title)).toEqual(["Gel", "Hivernage"]);
  });

  it("départage deux échéances de même rang par la date", () => {
    const groups = groupUpcoming(
      [
        item({ date: "2026-10-01", title: "B" }),
        item({ date: "2026-09-01", title: "A" }),
      ],
      "importance",
    );

    expect(groups[0]?.rows.map(row => row.title)).toEqual(["A", "B"]);
  });
});

describe("filterOptions", () => {
  it("met « Tout » ou « Toutes » en tête de chaque menu", () => {
    const options = filterOptions(items);

    expect(options.category.map(option => option.label)).toEqual([
      "Tout",
      "Bricolage",
      "Jardin",
      "Véhicule",
    ]);
    expect(options.importance.map(option => option.label)).toEqual([
      "Toutes",
      "Critique",
      "Important",
      "Normal",
      "Pour mémoire",
    ]);
    expect(options.tenure.map(option => option.value)).toEqual([
      "Toutes",
      "ferme",
      "souple",
    ]);
  });
});
