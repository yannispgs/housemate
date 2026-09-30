"use client";

/**
 * Accueil : ce qui demande attention maintenant, et rien d'autre (handoff de
 * design, § A). Une carte par échéance ; la faire la retire de l'écran.
 */
import Link from "next/link";
import { useState } from "react";
import { homeTitle } from "@/lib/ui/dates";
import { type DeadlineView, doneTodayText } from "@/lib/ui/deadline";
import { DeadlineCard } from "../DeadlineCard";
import { CheckIcon } from "../icons";
import { Screen } from "../Screen";
import { type AsideContent, DeadlinesAside } from "./Aside";
import { shortDate, useToday } from "./useToday";

function EmptyState({ nextUp }: Readonly<{ nextUp: string | null }>) {
  return (
    <div className="flex flex-col gap-5 px-2 pt-[34px] pb-2 md:px-0 md:pt-[18px]">
      <div className="flex size-[54px] items-center justify-center rounded-full border-2 border-grid md:size-[60px]">
        <span className="h-0.5 w-2.5 rounded-sm bg-baseline md:w-3" />
      </div>
      <div className="flex max-w-[460px] flex-col gap-[9px]">
        <span className="font-display text-[24px] leading-[1.2] text-ink md:text-[25px]">
          Rien ne t'attend.
        </span>
        {nextUp && (
          <span className="text-[15px] leading-[1.55] text-pretty text-ink-secondary">
            {nextUp}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-[9px]">
        <Link
          href="/a-venir"
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-[18px] font-display text-[14px] text-ink no-underline hover:bg-grid"
        >
          Voir à venir
        </Link>
      </div>
    </div>
  );
}

export function HomeScreen({
  deadlines,
  fixedToday,
  nextUp,
  aside,
}: Readonly<{
  deadlines: readonly DeadlineView[];
  /** Date figée des données de démonstration, sinon `null`. */
  fixedToday: string | null;
  nextUp: string | null;
  aside: AsideContent | null;
}>) {
  const today = useToday(fixedToday);
  const [done, setDone] = useState<readonly string[]>([]);
  const [open, setOpen] = useState<readonly string[]>([]);
  const remaining = deadlines.filter(deadline => !done.includes(deadline.id));
  const toggle = (id: string) =>
    setOpen(ids =>
      ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id],
    );

  return (
    <Screen
      title={today === null ? " " : homeTitle(today)}
      // Pas de sous-titre tant qu'il reste des tâches : le décompte ferait
      // doublon avec la liste.
      subtitle={
        remaining.length === 0 ? "Plus rien pour aujourd'hui." : undefined
      }
      aside={aside && <DeadlinesAside content={aside} />}
    >
      {remaining.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {remaining.map(deadline => (
            <DeadlineCard
              key={deadline.id}
              deadline={deadline}
              open={open.includes(deadline.id)}
              todayLabel={shortDate(today)}
              onToggle={() => toggle(deadline.id)}
              onDone={() => {
                setDone(ids => [...ids, deadline.id]);
                setOpen(ids => ids.filter(other => other !== deadline.id));
              }}
            />
          ))}
        </div>
      )}

      {remaining.length === 0 && <EmptyState nextUp={nextUp} />}

      {done.length > 0 && remaining.length > 0 && (
        <div className="flex items-center gap-[9px] px-1 pt-1 md:p-0">
          <CheckIcon
            size={15}
            color="var(--ink-muted)"
            style={{ flex: "none" }}
          />
          <span className="text-[12.5px] leading-[1.4] text-ink-muted">
            {doneTodayText(done.length)}
          </span>
          <button
            type="button"
            onClick={() => setDone([])}
            className="touch-target ml-auto cursor-pointer bg-transparent p-1.5 text-[12.5px] leading-none text-ink-secondary underline md:ml-0"
          >
            Annuler
          </button>
        </div>
      )}
    </Screen>
  );
}
