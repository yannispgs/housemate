/**
 * La mise en page commune d'un écran : le titre et son sous-titre, le
 * contenu, et sur grand écran une colonne latérale (handoff de design :
 * contenu à gauche, ~620 px ; colonne à droite, ~280 px).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "./icons";

export function Screen({
  title,
  subtitle,
  back,
  toolbar,
  aside,
  children,
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  /** Au-dessus du titre : « ← Retour » vers l'écran précédent. */
  back?: string;
  /**
   * Sous le titre et le sous-titre, sur toute la largeur : des filtres. Une
   * ligne à part, qui passe à la ligne : à côté du titre, des pilules
   * nombreuses ou longues le recouvraient.
   */
  toolbar?: ReactNode;
  /** Colonne latérale du bureau ; absente sur mobile. */
  aside?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="md:px-10 md:pt-[38px] md:pb-12">
      <div className="flex max-w-[1040px] items-start gap-[54px]">
        <div className="flex min-w-0 flex-1 flex-col md:max-w-[620px] md:gap-[22px]">
          <div className="flex flex-col gap-1.5 px-[22px] pt-2.5 pb-[18px] md:gap-[7px] md:p-0">
            {back && (
              <Link
                href={back}
                className="-ml-0.5 flex w-fit items-center gap-1.5 text-[14px] text-ink-secondary no-underline hover:text-ink"
              >
                <ArrowLeftIcon size={17} strokeWidth={2.25} />
                Retour
              </Link>
            )}
            <h1 className="m-0 font-display text-[27px] leading-[1.12] font-normal tracking-normal text-ink md:text-[32px] md:leading-[1.1]">
              {title}
            </h1>
            {subtitle && (
              <p className="m-0 text-[14.5px] leading-[1.45] text-ink-secondary md:text-[15px] md:leading-normal">
                {subtitle}
              </p>
            )}
            {toolbar && <div className="relative pt-2">{toolbar}</div>}
          </div>
          <div className="flex flex-col gap-2.5 px-[18px] pb-[26px] md:gap-[22px] md:p-0">
            {children}
          </div>
        </div>
        {aside && (
          <aside className="hidden min-w-[230px] flex-[0_1_280px] flex-col gap-[26px] pt-2 lg:flex">
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Un intertitre de section : « CE QUI VIENT », « JARDIN 4 ». */
export function SectionLabel({
  children,
  count,
}: Readonly<{ children: ReactNode; count?: number }>) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted">
        {children}
      </span>
      {count !== undefined && (
        <span className="text-[11.5px] leading-none text-ink-muted">
          {count}
        </span>
      )}
    </span>
  );
}

/** Un panneau : fond de surface, grand rayon. */
export function Panel({
  children,
  className = "",
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={`flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}
