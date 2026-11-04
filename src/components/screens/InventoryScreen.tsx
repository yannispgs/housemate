"use client";

/**
 * Inventaire (handoff de design, § F) : les fiches du foyer, groupées par
 * catégorie, avec un menu pour n'en garder qu'une, et un menu « Type » pour
 * n'en garder qu'une nature. Sur le type « Plante », un troisième menu ne
 * garde que les plantes en pot, en terre, ou d'un emplacement (SPEC § 12.4,
 * décisions du 25/10/2026 et du 04/11/2026) ; ⚠️ provisoire, pas encore
 * dessiné.
 */
import { useCallback, useRef, useState } from "react";
import type { CriterePlante } from "@/lib/data/plantes";
import {
  ALL_CATEGORIES,
  ALL_NATURES,
  filterNature,
  filterPlants,
  groupRecords,
  plantCriteria,
  type RecordNature,
  type RecordView,
  recordCategories,
  recordNatures,
  TOUTES_LES_PLANTES,
} from "@/lib/ui/inventory";
import { MenuList, type MenuOption, PillButton, useDismiss } from "../Menu";
import { RecordCard } from "../RecordCard";
import { Screen, SectionLabel } from "../Screen";

/** La largeur la plus grande d'un menu, avec la marge de l'écran. */
const LARGEUR_MENU = 232;

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
  // Le menu s'ouvre vers la droite, sauf s'il sortirait de l'écran : la
  // dernière pilule de la ligne l'ouvre alors vers la gauche.
  const [versLaGauche, setVersLaGauche] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <PillButton
        label={label}
        highlighted={highlighted}
        open={open}
        onClick={() => {
          const gauche = ref.current?.getBoundingClientRect().left ?? 0;
          setVersLaGauche(gauche + LARGEUR_MENU > window.innerWidth);
          setOpen(value => !value);
        }}
      />
      {open && (
        <MenuList
          className={`top-[calc(100%+8px)] min-w-[190px] md:min-w-[210px] ${versLaGauche ? "right-0" : "left-0"}`}
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
  const [nature, setNature] = useState<RecordNature | null>(null);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [critere, setCritere] = useState<CriterePlante | null>(null);
  const duType = filterNature(records, nature);
  const categories = recordCategories(duType);
  const criteres = plantCriteria(duType, nature);
  const groups = groupRecords(filterPlants(duType, critere), category);
  // Un autre type efface le critère des plantes, et la catégorie si ce type
  // n'en a pas.
  const choisirType = (choix: RecordNature | null) => {
    setNature(choix);
    setCritere(null);
    if (!recordCategories(filterNature(records, choix)).includes(category)) {
      setCategory(ALL_CATEGORIES);
    }
  };

  return (
    <Screen
      title="Inventaire"
      subtitle="Ce que le foyer possède, et ce qu'on en sait"
      toolbar={
        records.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <FilterMenu
              label={nature ?? "Type"}
              highlighted={nature !== null}
              options={[null, ...recordNatures(records)].map(choix => ({
                label: choix ?? ALL_NATURES,
                checked: choix === nature,
                onSelect: () => choisirType(choix),
              }))}
            />
            <FilterMenu
              label={category}
              highlighted={false}
              options={[ALL_CATEGORIES, ...categories].map(name => ({
                label: name,
                checked: name === category,
                onSelect: () => setCategory(name),
              }))}
            />
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
          Aucune fiche ne correspond.
        </span>
      )}
    </Screen>
  );
}
