"use client";

/**
 * Réglages (handoff de design, § G) : l'apparence, les notifications, et les
 * réglages du foyer, dont les écrans de détail ne sont pas encore conçus.
 */
import { useEffect, useState } from "react";
import {
  dataThemeFor,
  parseThemeMode,
  THEME_LABELS,
  THEME_MODES,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/ui/theme";
import { ChevronRightIcon } from "../icons";
import { Panel, Screen } from "../Screen";

const PANEL_LABEL =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";

/** Le mode mémorisé, et ce que le système préfère en ce moment. */
function useAppearance() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      setMode(parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      // Stockage indisponible (navigation privée stricte) : on reste en auto.
    }

    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  const choose = (next: ThemeMode) => {
    setMode(next);
    const theme = dataThemeFor(next);

    if (theme === null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Le choix vaut pour cette visite, sans être mémorisé.
    }
  };

  return { mode, systemDark, choose };
}

export interface SettingsRow {
  readonly title: string;
  readonly value: string;
}

export function SettingsScreen({
  rows,
}: Readonly<{ rows: readonly SettingsRow[] }>) {
  const { mode, systemDark, choose } = useAppearance();
  const [critical, setCritical] = useState(true);
  const current = systemDark ? "sombre" : "clair";

  return (
    <Screen title="Réglages">
      <div className="flex flex-col gap-3.5">
        <Panel className="gap-3 p-[18px]">
          <span className={PANEL_LABEL} id="apparence">
            Apparence
          </span>
          <fieldset
            aria-labelledby="apparence"
            className="m-0 flex min-w-0 gap-0.5 rounded-full border-0 bg-grid p-[3px]"
          >
            {THEME_MODES.map(option => {
              const on = option === mode;

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(option)}
                  className="h-[38px] flex-1 cursor-pointer rounded-full border text-[13.5px] leading-none font-semibold"
                  style={{
                    background: on ? "var(--surface)" : "transparent",
                    borderColor: on ? "var(--brand-border)" : "transparent",
                    color: on ? "var(--ink-primary)" : "var(--ink-secondary)",
                  }}
                >
                  {THEME_LABELS[option]}
                </button>
              );
            })}
          </fieldset>
          <span className="text-[12.5px] leading-normal text-ink-secondary">
            Auto suit le réglage de{" "}
            <span className="md:hidden">ton téléphone</span>
            <span className="max-md:hidden">l'ordinateur</span>, actuellement{" "}
            {current}.
          </span>
        </Panel>

        <Panel className="gap-3 p-[18px]">
          <span className={PANEL_LABEL}>Notifications</span>
          <button
            type="button"
            role="switch"
            aria-checked={critical}
            onClick={() => setCritical(value => !value)}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 bg-transparent p-0 text-left"
          >
            <span className="text-[15px] leading-[1.3] text-ink">
              Échéances critiques
            </span>
            <span
              className="flex h-7 w-[46px] flex-none rounded-full p-[3px]"
              style={{
                background: critical
                  ? "var(--brand-strong)"
                  : "var(--baseline)",
                justifyContent: critical ? "flex-end" : "flex-start",
              }}
            >
              <span className="size-[22px] rounded-full bg-white shadow-[var(--shadow-sm)]" />
            </span>
          </button>
          <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
            Seules les critiques envoient une notification. Les autres passent
            par le récap ou restent à l'écran.
          </span>
        </Panel>

        <Panel className="px-[18px] py-1.5">
          {rows.map((row, index) => (
            <button
              key={row.title}
              type="button"
              className="flex min-h-14 cursor-pointer items-center gap-3 border-t bg-transparent p-0 text-left"
              style={{
                borderColor: index === 0 ? "transparent" : "var(--border)",
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px] leading-[1.3] text-ink">
                  {row.title}
                </span>
                {row.value && (
                  <span className="text-[12.5px] leading-[1.3] text-ink-secondary">
                    {row.value}
                  </span>
                )}
              </span>
              <ChevronRightIcon
                size={16}
                color="var(--ink-muted)"
                style={{ flex: "none" }}
              />
            </button>
          ))}
        </Panel>
      </div>
    </Screen>
  );
}
