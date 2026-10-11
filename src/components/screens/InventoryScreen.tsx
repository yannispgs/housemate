"use client";

/**
 * Inventaire (handoff de design, § F) : les fiches du foyer, groupées par
 * catégorie, avec un menu pour n'en garder qu'une.
 */
import { useCallback, useRef, useState } from "react";
import {
  ALL_CATEGORIES,
  groupRecords,
  type RecordView,
  recordCategories,
} from "@/lib/ui/inventory";
import { MenuList, PillButton, useDismiss } from "../Menu";
import { RecordCard } from "../RecordCard";
import { Screen, SectionLabel } from "../Screen";

export function InventoryScreen({
  records,
}: Readonly<{ records: readonly RecordView[] }>) {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const groups = groupRecords(records, category);

  return (
    <Screen
      title="Inventaire"
      subtitle="Ce que le foyer possède, et ce qu'on en sait"
      titleAside={
        records.length > 0 && (
          <div ref={ref}>
            <PillButton
              label={category}
              open={open}
              onClick={() => setOpen(value => !value)}
            />
            {open && (
              <MenuList
                className="top-[calc(100%+8px)] right-0 min-w-[190px] md:min-w-[210px]"
                options={[ALL_CATEGORIES, ...recordCategories(records)].map(
                  name => ({
                    label: name,
                    checked: name === category,
                    onSelect: () => {
                      setCategory(name);
                      setOpen(false);
                    },
                  }),
                )}
              />
            )}
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
            <RecordCard key={record.title} record={record} />
          ))}
        </div>
      ))}
      {records.length === 0 && (
        <span className="px-1 py-3 text-[14px] leading-normal text-ink-secondary">
          Aucune fiche pour l'instant.
        </span>
      )}
    </Screen>
  );
}
