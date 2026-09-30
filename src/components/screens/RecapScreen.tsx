"use client";

/**
 * Récap de la semaine (handoff de design, § C) : ce qui vient, puis ce qui a
 * été fait. Les échéances « pour mémoire » n'y figurent jamais.
 */
import { recapWeek } from "@/lib/ui/dates";
import type { UpcomingRow } from "@/lib/ui/upcoming";
import { CheckIcon } from "../icons";
import { RecapRow } from "../RecapRow";
import { Panel, Screen } from "../Screen";
import { type AsideContent, DeadlinesAside } from "./Aside";
import { useToday } from "./useToday";

const LABEL =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";

export function RecapScreen({
  coming,
  comingNote,
  done,
  fixedToday,
  aside,
}: Readonly<{
  coming: readonly UpcomingRow[];
  comingNote: string;
  done: readonly UpcomingRow[];
  fixedToday: string | null;
  aside: AsideContent | null;
}>) {
  const today = useToday(fixedToday);

  return (
    <Screen
      title="Récap de la semaine"
      subtitle={today === null ? " " : recapWeek(today)}
      aside={aside && <DeadlinesAside content={aside} />}
    >
      <Panel className="px-4 pt-4 pb-1.5 md:px-[22px] md:pt-5 md:pb-2">
        <span className={`${LABEL} pb-2.5 md:pb-3`}>Ce qui vient</span>
        {coming.map(row => (
          <RecapRow key={`${row.dayOfMonth}-${row.title}`} row={row} />
        ))}
        <span className="border-t border-grid px-0.5 py-3 text-[12.5px] leading-normal text-ink-muted md:py-[13px]">
          {coming.length === 0 ? "Rien de prévu cette semaine." : comingNote}
        </span>
      </Panel>

      {done.length > 0 && (
        <Panel className="px-4 pt-4 pb-1.5 md:px-[22px] md:pt-5 md:pb-3">
          {/* La coche est dans l'intertitre seulement, pas sur chaque ligne. */}
          <span className={`${LABEL} flex items-center gap-1.5 pb-2.5 md:pb-3`}>
            <CheckIcon size={12} strokeWidth={3} />
            Fait la semaine dernière
          </span>
          {done.map(row => (
            <RecapRow key={`${row.dayOfMonth}-${row.title}`} row={row} />
          ))}
          <span className="h-1.5 md:hidden" />
        </Panel>
      )}
    </Screen>
  );
}
