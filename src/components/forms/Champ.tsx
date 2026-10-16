/**
 * Les éléments communs des formulaires provisoires (ajout, connexion) :
 * repris de la refonte — champs en pilule, intertitres en petites capitales.
 * ⚠️ Provisoire : aucun formulaire n'est encore dessiné dans Claude Design.
 */
import type { ReactNode } from "react";

/** 16 px au moins : en dessous, Safari sur iPhone zoome sur le champ. */
export const CHAMP =
  "h-11 w-full min-w-0 rounded-full border border-border bg-surface px-4 text-base leading-none text-ink outline-none focus:border-brand-border";

export const LISTE = `${CHAMP} appearance-none pr-9`;

export const LIBELLE =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";

export const BOUTON =
  "min-h-11 w-full cursor-pointer rounded-full bg-brand-strong px-5 text-[15px] font-semibold text-white hover:brightness-[1.08] active:brightness-[.92] disabled:opacity-60";

export const BOUTON_SECONDAIRE =
  "min-h-11 w-full cursor-pointer rounded-full border border-border bg-transparent px-5 text-[15px] font-semibold text-ink hover:bg-grid disabled:opacity-60";

export function Champ({
  libelle,
  aide,
  erreur,
  children,
}: Readonly<{
  libelle: string;
  aide?: string;
  erreur?: string;
  children: ReactNode;
}>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: le champ arrive par `children` ; les champs doubles (nombre et unité) portent chacun leur `aria-label`.
    <label className="flex flex-col gap-2.5">
      <span className={LIBELLE}>{libelle}</span>
      {children}
      {aide && (
        <span className="text-[12.5px] leading-normal text-ink-secondary">
          {aide}
        </span>
      )}
      {erreur && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreur}
        </span>
      )}
    </label>
  );
}
