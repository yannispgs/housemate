/**
 * Le mode d'apparence : clair, sombre, ou auto, qui suit le système (handoff
 * de design, § « Mode sombre »). Auto par défaut, mémorisé dans le
 * navigateur.
 */

export const THEME_MODES = ["clair", "sombre", "auto"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  clair: "Clair",
  sombre: "Sombre",
  auto: "Auto",
};

export const THEME_STORAGE_KEY = "housemate:apparence";

/** Une valeur lue du stockage, ou `auto` si elle manque ou ne veut rien dire. */
export function parseThemeMode(stored: string | null): ThemeMode {
  return THEME_MODES.find(mode => mode === stored) ?? "auto";
}

/**
 * L'attribut `data-theme` de `<html>` : forcé en clair ou en sombre, absent en
 * auto pour laisser `prefers-color-scheme` décider (app/globals.css).
 */
export function dataThemeFor(mode: ThemeMode): "light" | "dark" | null {
  if (mode === "clair") {
    return "light";
  }

  if (mode === "sombre") {
    return "dark";
  }

  return null;
}

/**
 * Le script posé en tête de page, avant le premier rendu : sans lui, une page
 * en mode sombre choisi s'afficherait d'abord en clair. Il ne fait que
 * reproduire `dataThemeFor` sur la valeur mémorisée.
 */
export const THEME_BOOT_SCRIPT = `try{var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(m==="clair")document.documentElement.dataset.theme="light";else if(m==="sombre")document.documentElement.dataset.theme="dark";}catch(e){}`;
