/**
 * Une fiche de l'inventaire (`CarteFiche` de la maquette) : sa nature, son
 * titre, sa catégorie et ce qu'on en retient.
 */
import type { RecordNature, RecordView } from "@/lib/ui/inventory";
import {
  ChevronRightIcon,
  ContractIcon,
  DropIcon,
  EquipmentIcon,
  StayIcon,
  VehicleIcon,
} from "./icons";

const NATURE_ICON: Readonly<
  Record<RecordNature, (props: { size?: number }) => React.ReactNode>
> = {
  Plante: DropIcon,
  Véhicule: VehicleIcon,
  Équipement: EquipmentIcon,
  Contrat: ContractIcon,
  Séjour: StayIcon,
};

export function RecordCard({ record }: Readonly<{ record: RecordView }>) {
  const Icon = NATURE_ICON[record.nature];

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center gap-[11px] bg-transparent px-[13px] py-3 text-left hover:bg-page"
      >
        <span className="flex flex-none items-center text-ink-muted">
          <Icon size={19} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[11px] leading-none font-semibold uppercase tracking-[.09em] text-ink-muted">
            {record.nature}
          </span>
          <span className="font-display text-[16.5px] leading-[1.3] text-ink">
            {record.title}
          </span>
          <span className="flex flex-wrap items-center gap-[7px] pt-0.5">
            <span className="inline-flex items-center rounded-full bg-grid px-[9px] py-[3px] text-[11px] leading-none text-ink-secondary">
              {record.category}
            </span>
            <span className="text-[12px] leading-[1.4] text-ink-secondary">
              {record.descriptor}
            </span>
          </span>
        </span>
        <span className="flex flex-none items-center text-ink-muted">
          <ChevronRightIcon size={17} />
        </span>
      </button>
    </div>
  );
}
