"use client";

/**
 * À venir (handoff de design, § E) : toutes les échéances, filtrables par
 * catégorie, importance et tenue, triées par date, importance ou catégorie.
 * Les étiquettes d'une ligne ajoutent le filtre correspondant.
 */
import { useCallback, useRef, useState } from "react";
import {
  IMPORTANCE_LABELS,
  type Importance,
  type Tenure,
} from "@/lib/ui/deadline";
import {
  ALL,
  ALL_FEMININE,
  filterOptions,
  filterUpcoming,
  groupUpcoming,
  hasActiveFilters,
  NO_FILTERS,
  SORT_LABELS,
  type UpcomingFilters,
  type UpcomingItem,
  type UpcomingSort,
} from "@/lib/ui/upcoming";
import { SortIcon } from "../icons";
import { MenuList, type MenuOption, PillButton, useDismiss } from "../Menu";
import { RecapRow } from "../RecapRow";
import { Panel, Screen, SectionLabel } from "../Screen";

type Control = "category" | "importance" | "tenure" | "sort";

const TENURE_LABELS: Readonly<Record<Tenure, string>> = {
  ferme: "Ferme",
  souple: "Souple",
};

function Controls({
  items,
  filters,
  sort,
  open,
  setOpen,
  setFilters,
  setSort,
  desktop,
}: Readonly<{
  items: readonly UpcomingItem[];
  filters: UpcomingFilters;
  sort: UpcomingSort;
  open: Control | null;
  setOpen: (control: Control | null) => void;
  setFilters: (filters: UpcomingFilters) => void;
  setSort: (sort: UpcomingSort) => void;
  desktop: boolean;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), [setOpen]);
  useDismiss(ref, open !== null, close);
  const options = filterOptions(items);
  const pick = (next: Partial<UpcomingFilters>) => {
    setFilters({ ...filters, ...next });
    setOpen(null);
  };
  const menus: Record<Control, MenuOption[]> = {
    category: options.category.map(option => ({
      label: option.label,
      checked: option.value === filters.category,
      onSelect: () => pick({ category: option.value }),
    })),
    importance: options.importance.map(option => ({
      label: option.label,
      checked: option.value === filters.importance,
      onSelect: () =>
        pick({ importance: option.value as UpcomingFilters["importance"] }),
    })),
    tenure: options.tenure.map(option => ({
      label: option.label,
      checked: option.value === filters.tenure,
      onSelect: () =>
        pick({ tenure: option.value as UpcomingFilters["tenure"] }),
    })),
    sort: (Object.keys(SORT_LABELS) as UpcomingSort[]).map(value => ({
      label: SORT_LABELS[value],
      checked: value === sort,
      onSelect: () => {
        setSort(value);
        setOpen(null);
      },
    })),
  };
  const pill = (control: Control, label: string, highlighted: boolean) => (
    <PillButton
      key={control}
      label={label}
      highlighted={highlighted}
      open={open === control}
      size={desktop ? "md" : "sm"}
      icon={control === "sort" ? <SortIcon size={14} /> : undefined}
      onClick={() => setOpen(open === control ? null : control)}
    />
  );

  return (
    <div ref={ref} className="relative flex min-w-0 flex-col gap-2">
      <div
        className={
          desktop
            ? "flex flex-wrap gap-2 py-0.5"
            : "-mx-[18px] flex gap-2 overflow-x-auto px-[18px] py-0.5 [scrollbar-width:none]"
        }
      >
        {pill(
          "category",
          filters.category === ALL ? "Catégorie" : filters.category,
          filters.category !== ALL,
        )}
        {pill(
          "importance",
          filters.importance === ALL_FEMININE
            ? "Importance"
            : IMPORTANCE_LABELS[filters.importance as Importance],
          filters.importance !== ALL_FEMININE,
        )}
        {pill(
          "tenure",
          filters.tenure === ALL_FEMININE
            ? "Tenue"
            : TENURE_LABELS[filters.tenure as Tenure],
          filters.tenure !== ALL_FEMININE,
        )}
        {pill("sort", SORT_LABELS[sort], false)}
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => {
              setFilters(NO_FILTERS);
              setOpen(null);
            }}
            className={`touch-target inline-flex flex-none cursor-pointer items-center bg-transparent px-1.5 leading-none whitespace-nowrap text-ink-secondary underline underline-offset-[3px] hover:text-ink ${desktop ? "h-[38px] text-[13px]" : "h-9 text-[12.5px]"}`}
          >
            Effacer
          </button>
        )}
      </div>
      {open !== null && (
        <MenuList
          options={menus[open]}
          className="top-[calc(100%+2px)] left-0"
        />
      )}
    </div>
  );
}

export function UpcomingScreen({
  items,
}: Readonly<{ items: readonly UpcomingItem[] }>) {
  const [filters, setFilters] = useState<UpcomingFilters>(NO_FILTERS);
  const [sort, setSort] = useState<UpcomingSort>("date");
  const [open, setOpen] = useState<Control | null>(null);
  const groups = groupUpcoming(filterUpcoming(items, filters), sort);
  const controls = (desktop: boolean) => (
    <Controls
      items={items}
      filters={filters}
      sort={sort}
      open={open}
      setOpen={setOpen}
      setFilters={setFilters}
      setSort={setSort}
      desktop={desktop}
    />
  );

  return (
    <Screen title="À venir" subtitle="Toutes les échéances du foyer">
      {/* Dans la maquette, titre et filtres partagent une rangée qui passe à
          la ligne : à 620 px, les filtres tombent sous le titre, à gauche. */}
      <div className="flex flex-col gap-3 md:gap-[18px]">
        <div className="md:hidden">{controls(false)}</div>
        <div className="max-md:hidden">{controls(true)}</div>
        {groups.map(group => (
          <Panel key={group.name} className="px-4 pt-4 pb-1.5">
            <span className="pb-2.5">
              <SectionLabel count={group.rows.length}>
                {group.name}
              </SectionLabel>
            </span>
            {group.rows.map(row => (
              <RecapRow
                key={`${row.date}-${row.title}`}
                row={row}
                filters={{
                  onCategory: () =>
                    setFilters({ ...filters, category: row.category }),
                  onImportance: () =>
                    setFilters({ ...filters, importance: row.importance }),
                  onTenure: () =>
                    setFilters({ ...filters, tenure: row.tenure }),
                }}
              />
            ))}
            <span className="h-1.5" />
          </Panel>
        ))}
        {groups.length === 0 && (
          <span className="px-1 py-3 text-[14px] leading-normal text-ink-secondary">
            {items.length === 0
              ? "Aucune échéance pour l'instant."
              : "Aucune échéance ne correspond à ces filtres."}
          </span>
        )}
      </div>
    </Screen>
  );
}
