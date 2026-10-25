"use client";

/**
 * Inventaire (handoff de design, § F) : les fiches du foyer, groupées par
 * catégorie, avec un menu pour n'en garder qu'une. Un second menu, « Plantes »,
 * ne garde que les plantes en pot, en terre, ou d'un emplacement (SPEC
 * § 12.4, décisions du 25/10/2026) ; ⚠️ provisoire, pas encore dessiné.
 */
import { useCallback, useRef, useState } from "react";
import type { CriterePlante } from "@/lib/data/plantes";
import {
  ALL_CATEGORIES,
  filterPlants,
  groupRecords,
  plantCriteria,
  type RecordView,
  recordCategories,
  TOUTES_LES_PLANTES,
} from "@/lib/ui/inventory";
import { MenuList, type MenuOption, PillButton, useDismiss } from "../Menu";
import { RecordCard } from "../RecordCard";
import { Screen, SectionLabel } from "../Screen";

/** Une pilule et son menu, fermé par un clic en dehors ou par Échap. */
function FilterMenu({
  label,
  highlighted,
  options,
}: Readonly<{
  label: string;
  highlighted: boolean;
  options: readonly MenuOption[];
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <PillButton
        label={label}
        highlighted={highlighted}
        open={open}
        onClick={() => setOpen(value => !value)}
      />
      {open && (
        <MenuList
          className="top-[calc(100%+8px)] right-0 min-w-[190px] md:min-w-[210px]"
          options={options.map(option => ({
            ...option,
            onSelect: () => {
              option.onSelect();
              setOpen(false);
            },
          }))}
        />
      )}
    </div>
  );
}

const memeCritere = (a: CriterePlante | null, b: CriterePlante | null) =>
  a?.sorte === b?.sorte && a?.valeur === b?.valeur;

export function InventoryScreen({
  records,
}: Readonly<{ records: readonly RecordView[] }>) {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [critere, setCritere] = useState<CriterePlante | null>(null);
  const criteres = plantCriteria(records);
  const groups = groupRecords(filterPlants(records, critere), category);

  return (
    <Screen
      title="Inventaire"
      subtitle="Ce que le foyer possède, et ce qu'on en sait"
      titleAside={
        records.length > 0 && (
          <div className="flex gap-2">
            {criteres.length > 0 && (
              <FilterMenu
                label={critere?.valeur ?? "Plantes"}
                highlighted={critere !== null}
                options={[null, ...criteres].map((c, index, liste) => ({
                  label: c?.valeur ?? TOUTES_LES_PLANTES,
                  checked: memeCritere(c, critere),
                  // Deux groupes : en pot / en terre, puis les emplacements.
                  separated: index > 0 && liste[index - 1]?.sorte !== c?.sorte,
                  onSelect: () => setCritere(c),
                }))}
              />
            )}
            <FilterMenu
              label={category}
              highlighted={false}
              options={[ALL_CATEGORIES, ...recordCategories(records)].map(
                name => ({
                  label: name,
                  checked: name === category,
                  onSelect: () => setCategory(name),
                }),
              )}
            />
          </div>
        )
      }
    >
      {groups.map(group => (
        <div
          key={group.name}
          className="flex flex-col gap-[9px] pt-1 md:gap-2.5 md:pt-0"
        >
          <span className="px-1">
            <SectionLabel count={group.records.length}>
              {group.name}
            </SectionLabel>
          </span>
          {group.records.map(record => (
            <RecordCard key={record.id ?? record.title} record={record} />
          ))}
        </div>
      ))}
      {records.length === 0 && (
        <span className="px-1 py-3 text-[14px] leading-normal text-ink-secondary">
          Aucune fiche pour l'instant.
        </span>
      )}
      {records.length > 0 && groups.length === 0 && (
        <span className="px-1 py-3 text-[14px] leading-normal text-ink-secondary">
          Aucune plante ne correspond.
        </span>
      )}
    </Screen>
  );
}
