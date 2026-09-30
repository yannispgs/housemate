/**
 * Une ligne du récap ou d'« À venir » (`LigneRecap` de la maquette) : la date
 * en colonne, puis le titre, le détail et les étiquettes. Dans « À venir »,
 * les étiquettes ajoutent le filtre correspondant ; dans le récap, elles ne
 * font rien.
 */
import type { UpcomingRow } from "@/lib/ui/upcoming";
import { ImportancePill, TenureTag } from "./Tags";

export interface RecapRowFilters {
  readonly onCategory: () => void;
  readonly onImportance: () => void;
  readonly onTenure: () => void;
}

export function RecapRow({
  row,
  filters,
}: Readonly<{ row: UpcomingRow; filters?: RecapRowFilters }>) {
  return (
    <div className="flex items-start gap-4 border-t border-grid px-0.5 py-[13px]">
      <span className="flex w-[46px] flex-none flex-col gap-px pt-px">
        <span className="text-[11px] leading-none lowercase text-ink-muted">
          {row.weekday}
        </span>
        <span className="text-[16px] leading-none font-semibold tabular-nums text-ink">
          {row.dayOfMonth}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="font-display text-[15.5px] leading-[1.4] text-pretty text-ink">
          {row.title}
        </span>
        {row.detail && (
          <span className="text-[12.5px] leading-[1.45] text-ink-secondary">
            {row.detail}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-0.5">
          <ImportancePill
            importance={row.importance}
            raised={row.raised}
            onClick={filters?.onImportance}
          />
          {filters ? (
            <button
              type="button"
              onClick={filters.onCategory}
              className="touch-target cursor-pointer bg-transparent text-[11.5px] leading-none text-ink-muted"
            >
              {row.category}
            </button>
          ) : (
            <span className="text-[11.5px] leading-none text-ink-muted">
              {row.category}
            </span>
          )}
          <TenureTag
            tenure={row.tenure}
            variant="row"
            onClick={filters?.onTenure}
          />
        </span>
      </span>
    </div>
  );
}
