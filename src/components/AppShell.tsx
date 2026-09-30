"use client";

/**
 * Coquille de l'application (handoff de design, § « Chrome mobile » et
 * « Chrome bureau »).
 *
 * Mobile : l'en-tête (marque et toggle Échéances / Fiches), le contenu qui
 * défile, la barre d'onglets en bas. Bureau (`md` et plus) : un en-tête
 * horizontal qui porte aussi les onglets et les actions.
 *
 * Client component : l'onglet actif dépend du chemin courant. La barre d'état
 * et l'indicateur d'accueil de la maquette ne sont pas dessinés : ce sont les
 * zones sûres du système.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  DEADLINE_TABS,
  DOMAINS,
  domainOf,
  isActive,
  SETTINGS,
} from "@/lib/navigation";
import {
  CalendarIcon,
  ClockIcon,
  GearIcon,
  LinesIcon,
  PlusIcon,
  SlidersIcon,
} from "./icons";

function Brand() {
  return (
    <span className="inline-flex flex-none flex-col gap-[5px]">
      <span className="font-display text-[13px] text-ink">Housemate</span>
      <span className="h-0.5 rounded-sm bg-brand" />
    </span>
  );
}

/** Le toggle Échéances / Fiches : les deux destinations de même rang. */
function DomainToggle({
  pathname,
  compact,
}: Readonly<{ pathname: string; compact: boolean }>) {
  const active = domainOf(pathname);

  return (
    <span className="inline-flex flex-none gap-0.5 rounded-full bg-grid p-[3px]">
      {DOMAINS.map(entry => {
        const on = entry.domain === active;

        return (
          <Link
            key={entry.domain}
            href={entry.href}
            aria-current={on ? "true" : undefined}
            className={`inline-flex items-center justify-center rounded-full border font-display text-[12.5px] no-underline ${compact ? "h-[30px] px-[13px]" : "h-8 px-[15px]"}`}
            style={{
              background: on ? "var(--surface)" : "transparent",
              borderColor: on ? "var(--brand-border)" : "transparent",
              color: on ? "var(--ink-primary)" : "var(--ink-secondary)",
            }}
          >
            {entry.label}
          </Link>
        );
      })}
    </span>
  );
}

const TAB_ICONS = [CalendarIcon, LinesIcon, ClockIcon];

function TabBar({ pathname }: Readonly<{ pathname: string }>) {
  const tab = (
    href: string,
    label: string,
    Icon: (props: { size?: number; color?: string }) => ReactNode,
  ) => {
    const on = isActive(href, pathname);
    const colour = on ? "var(--ink-primary)" : "var(--ink-muted)";

    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 no-underline"
      >
        <Icon size={21} color={colour} />
        <span className="font-display text-[10.5px]" style={{ color: colour }}>
          {label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigation principale"
      className="flex flex-none items-stretch border-t border-border bg-surface px-3 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
    >
      {domainOf(pathname) === "echeances" &&
        DEADLINE_TABS.map((entry, index) =>
          tab(entry.href, entry.label, TAB_ICONS[index] ?? CalendarIcon),
        )}
      {/* Capture : pas encore d'écran, comme dans la maquette. */}
      <button
        type="button"
        className="flex min-h-12 flex-1 cursor-pointer flex-col items-center justify-center gap-1 bg-transparent p-0"
      >
        <PlusIcon size={21} color="var(--ink-muted)" />
        <span className="font-display text-[10.5px] text-ink-muted">
          Capture
        </span>
      </button>
      {tab(SETTINGS.href, SETTINGS.label, SlidersIcon)}
    </nav>
  );
}

function DesktopHeader({
  pathname,
  household,
}: Readonly<{ pathname: string; household: string }>) {
  const settingsOn = isActive(SETTINGS.href, pathname);

  return (
    <header className="hidden h-[62px] flex-none items-center gap-7 border-b border-border bg-surface px-10 md:flex">
      <Brand />
      <DomainToggle pathname={pathname} compact />
      {domainOf(pathname) === "echeances" && (
        <nav
          aria-label="Navigation principale"
          className="ml-3 flex items-center gap-1"
        >
          {DEADLINE_TABS.map(entry => {
            const on = isActive(entry.href, pathname);

            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={on ? "page" : undefined}
                className="flex min-h-11 items-center border-b-2 px-3.5 font-display text-[13.5px] no-underline"
                style={{
                  color: on ? "var(--ink-primary)" : "var(--ink-muted)",
                  borderColor: on ? "var(--brand)" : "transparent",
                }}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>
      )}
      <span className="ml-auto flex items-center gap-3.5">
        <Link
          href={SETTINGS.href}
          aria-label={SETTINGS.label}
          aria-current={settingsOn ? "page" : undefined}
          className="flex size-10 flex-none items-center justify-center rounded-full border text-ink hover:bg-grid"
          style={{
            borderColor: settingsOn ? "var(--brand-border)" : "var(--border)",
          }}
        >
          <GearIcon size={17} />
        </Link>
        <button
          type="button"
          className="inline-flex min-h-10 cursor-pointer items-center gap-[7px] rounded-full border border-border bg-transparent px-[15px] font-display text-[13px] text-ink hover:bg-grid"
        >
          <PlusIcon size={15} />
          Capture rapide
        </button>
        {household && (
          <span className="text-[12.5px] leading-none text-ink-muted">
            {household}
          </span>
        )}
      </span>
    </header>
  );
}

export function AppShell({
  household,
  children,
}: Readonly<{
  /** « Foyer · … » dans l'en-tête du bureau ; vide tant qu'il n'est pas connu. */
  household: string;
  children: ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page text-ink">
      <header className="flex flex-none items-start justify-between gap-3.5 px-[22px] pt-[max(env(safe-area-inset-top),14px)] md:hidden">
        <Brand />
        <DomainToggle pathname={pathname} compact={false} />
      </header>
      <DesktopHeader pathname={pathname} household={household} />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <TabBar pathname={pathname} />
    </div>
  );
}
