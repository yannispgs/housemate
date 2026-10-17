/**
 * Les éléments communs des formulaires provisoires (ajout, connexion) :
 * repris de la refonte — champs en pilule, intertitres en petites capitales.
 * ⚠️ Provisoire : aucun formulaire n'est encore dessiné dans Claude Design.
 */
import type { ReactNode } from "react";

/** 16 px au moins : en dessous, Safari sur iPhone zoome sur le champ. */
const BASE =
  "h-11 min-w-0 rounded-full border border-border bg-surface px-4 text-base leading-none text-ink outline-none focus:border-brand-border";

export const CHAMP = `${BASE} w-full`;

/**
 * Un nombre court à côté de son unité. Largeur fixe, sans `w-full` : les deux
 * classes ensemble laissaient gagner `w-full`, et l'unité sortait de l'écran.
 */
export const NOMBRE = `${BASE} w-20 flex-none text-center`;

/**
 * Safari sur iPhone donne aux champs de date une largeur propre, plus large
 * que la colonne, tant que leur apparence native n'est pas neutralisée. Sans
 * elle, le texte n'est plus centré : la hauteur de ligne le recentre (et
 * remplace celle de `BASE`, qui l'emporterait sinon).
 */
export const DATE = `${BASE.replace("leading-none", "leading-[42px]")} block w-full appearance-none text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0`;

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

/** Deux champs courts côte à côte, pour ne pas allonger le formulaire. */
export function Ligne({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}
