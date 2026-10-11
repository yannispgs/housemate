/**
 * La mise en page commune d'un écran : le titre et son sous-titre, le
 * contenu, et sur grand écran une colonne latérale (handoff de design :
 * contenu à gauche, ~620 px ; colonne à droite, ~280 px).
 */
import type { ReactNode } from "react";

export function Screen({
  title,
  subtitle,
  titleAside,
  aside,
  children,
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  /** À droite du titre : un menu, des filtres. */
  titleAside?: ReactNode;
  /** Colonne latérale du bureau ; absente sur mobile. */
  aside?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="md:px-10 md:pt-[38px] md:pb-12">
      <div className="flex max-w-[1040px] items-start gap-[54px]">
        <div className="flex min-w-0 flex-1 flex-col md:max-w-[620px] md:gap-[22px]">
          {/* Grille : sur mobile, ce qui accompagne le titre s'aligne sur le
              titre seul et le sous-titre prend toute la largeur ; sur bureau,
              il se range à droite du bloc entier, aligné en bas. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-[22px] pt-2.5 pb-[18px] md:gap-x-4 md:gap-y-[7px] md:p-0">
            <h1 className="m-0 font-display text-[27px] leading-[1.12] font-normal tracking-normal text-ink md:text-[32px] md:leading-[1.1]">
              {title}
            </h1>
            {titleAside && (
              <div className="relative justify-self-end md:row-span-2 md:self-end">
                {titleAside}
              </div>
            )}
            {subtitle && (
              <p className="col-span-2 m-0 text-[14.5px] leading-[1.45] text-ink-secondary md:col-span-1 md:text-[15px] md:leading-normal">
                {subtitle}
              </p>
            )}
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
