/**
 * Les étiquettes d'une échéance (handoff de design, règles 1 et 2). Forme,
 * graisse et casse portent le sens autant que la couleur : un daltonien lit
 * « ferme » ou « critique » sans voir la teinte.
 */
import type { Importance, Tenure } from "@/lib/ui/deadline";
import { AlertIcon, ArrowUpIcon } from "./icons";

const PILL =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-[1.4] font-semibold uppercase tracking-[.06em] text-ink";

const PILL_COLOUR: Readonly<Record<Exclude<Importance, "memoire">, string>> = {
  critique: "var(--ink-critical)",
  important: "var(--ink-serious)",
  normal: "var(--baseline)",
};

/**
 * Une étiquette : un simple `span`, ou un vrai bouton quand elle ajoute un
 * filtre (dans « À venir » seulement). Signalée par le curseur, sans
 * soulignement.
 */
function Tag({
  onClick,
  className,
  style,
  children,
}: Readonly<{
  onClick: (() => void) | undefined;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}>) {
  if (onClick === undefined) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} touch-target cursor-pointer bg-transparent`}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * La pilule d'importance d'une ligne de récap ou d'À venir. « Pour mémoire »
 * n'a pas de fond : c'est le niveau qui ne réclame rien.
 */
export function ImportancePill({
  importance,
  raised = false,
  onClick,
}: Readonly<{
  importance: Importance;
  raised?: boolean;
  onClick?: () => void;
}>) {
  if (importance === "memoire") {
    return (
      <Tag
        onClick={onClick}
        className="inline-flex items-center rounded-full border border-baseline px-2 py-0.5 text-[10.5px] leading-[1.4] italic text-ink-secondary"
      >
        pour mémoire
      </Tag>
    );
  }

  const colour = PILL_COLOUR[importance];

  return (
    <Tag
      onClick={onClick}
      className={PILL}
      style={{
        border: `1.5px solid ${colour}`,
        background: `color-mix(in srgb, ${colour} 20%, var(--surface))`,
      }}
    >
      {importance === "critique" && (
        <AlertIcon size={11} color="var(--ink-primary)" strokeWidth={2.9} />
      )}
      {raised && (
        <ArrowUpIcon size={10} color="var(--ink-primary)" strokeWidth={3.25} />
      )}
      {importance}
    </Tag>
  );
}

/**
 * Ferme : un rectangle au trait épais, en capitales. Souple : une pilule en
 * pointillés, en italique. Aucune couleur ne les distingue.
 */
export function TenureTag({
  tenure,
  variant,
  onClick,
}: Readonly<{
  tenure: Tenure;
  /** `card` : carte d'accueil ; `row` : ligne de récap ou d'À venir. */
  variant: "card" | "row";
  onClick?: () => void;
}>) {
  if (tenure === "ferme") {
    return (
      <Tag
        onClick={onClick}
        className={`inline-flex items-center rounded-[var(--radius-sm)] border-2 border-ink px-[7px] text-[10px] leading-[1.4] font-semibold uppercase tracking-[.09em] text-ink ${variant === "card" ? "py-px" : "py-0.5"}`}
      >
        ferme
      </Tag>
    );
  }

  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center rounded-full border border-dashed border-baseline px-[9px] text-[10.5px] italic text-ink-secondary ${variant === "card" ? "py-0.5 leading-[1.3]" : "py-[3px] leading-none"}`}
    >
      souple
    </Tag>
  );
}
