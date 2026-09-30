"use client";

/**
 * Pilules de filtre et menus déroulants (handoff de design, § E et F). Un
 * seul menu ouvert à la fois, fermé par un clic en dehors ou par Échap, ou
 * dès qu'une option est choisie.
 */
import { type ReactNode, type RefObject, useEffect } from "react";
import { ChevronDownIcon } from "./icons";

/** Ferme quand on clique hors de `ref`, ou sur Échap. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

/** Une pilule qui ouvre un menu : fond de surface, ombre légère. */
export function PillButton({
  label,
  highlighted = false,
  open,
  icon,
  size = "md",
  onClick,
}: Readonly<{
  label: string;
  /** Un filtre actif : bordure foncée. */
  highlighted?: boolean;
  open: boolean;
  icon?: ReactNode;
  /** `sm` : 36 px, `md` : 38 px. */
  size?: "sm" | "md";
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      className={`touch-target inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-full border bg-surface pr-[11px] pl-3.5 font-display whitespace-nowrap text-ink shadow-[var(--shadow-sm)] hover:border-baseline active:bg-grid ${size === "sm" ? "h-9 text-[12.5px]" : "h-[38px] text-[13px]"}`}
      style={{
        borderColor: highlighted ? "var(--ink-primary)" : "var(--border)",
      }}
    >
      {icon}
      {label}
      <ChevronDownIcon size={13} />
    </button>
  );
}

export interface MenuOption {
  readonly label: string;
  readonly checked: boolean;
  readonly onSelect: () => void;
}

/** Le menu lui-même, positionné par l'appelant. */
export function MenuList({
  options,
  className = "",
}: Readonly<{ options: readonly MenuOption[]; className?: string }>) {
  return (
    <div
      role="menu"
      className={`absolute z-10 flex min-w-[200px] flex-col rounded-[var(--radius-md)] border border-border bg-surface p-1.5 shadow-[var(--shadow-md)] ${className}`}
    >
      {options.map(option => (
        <button
          key={option.label}
          type="button"
          role="menuitemradio"
          aria-checked={option.checked}
          onClick={option.onSelect}
          className="flex min-h-10 cursor-pointer items-center justify-between gap-2.5 rounded-[10px] bg-transparent px-3 text-left text-[14px] leading-none whitespace-nowrap text-ink hover:bg-grid"
        >
          <span>{option.label}</span>
          <span className="text-[12px] leading-none text-ink-muted">
            {option.checked ? "✓" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
