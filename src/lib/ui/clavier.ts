/**
 * Garder visible le champ où l'on écrit quand le clavier virtuel s'ouvre
 * (décision du foyer, 2026-10-21) : où qu'il soit dans l'application, s'il
 * est caché par le clavier ou par ce qui l'accompagne, la vue se décale.
 *
 * Fonctions pures : le branchement sur le navigateur est dans
 * `useChampVisible`.
 */

/** Une bande verticale de l'écran, en pixels depuis le haut. */
export type Bande = Readonly<{ haut: number; bas: number }>;

/** L'air laissé entre le champ et le bord de la zone visible. */
export const MARGE = 16;

/** Les champs `input` qui n'ouvrent pas le clavier (même liste que `globals.css`). */
const SANS_CLAVIER = new Set([
  "checkbox",
  "radio",
  "file",
  "date",
  "range",
  "color",
  "submit",
  "button",
]);

/** Le champ ouvre-t-il le clavier virtuel ? */
export function ouvreLeClavier(
  champ: Readonly<{ tagName: string; type?: string; readOnly?: boolean }>,
): boolean {
  if (champ.readOnly === true) {
    return false;
  }

  if (champ.tagName === "TEXTAREA") {
    return true;
  }

  return champ.tagName === "INPUT" && !SANS_CLAVIER.has(champ.type ?? "text");
}

/**
 * La hauteur cachée en bas de l'écran (le clavier et ses barres) : ce qui
 * dépasse de la zone visible dans la hauteur de la page.
 */
export function hauteurCachee(
  page: number,
  visible: Readonly<{ offsetTop: number; height: number }>,
): number {
  return Math.max(0, Math.round(page - visible.offsetTop - visible.height));
}

/**
 * De combien faire défiler pour que `champ` tienne dans `visible`, marge
 * comprise : positif vers le bas, 0 s'il est déjà en vue. Trop grand pour
 * tenir, on en montre le haut : c'est là qu'on commence à écrire.
 */
export function decalage(champ: Bande, visible: Bande, marge = MARGE): number {
  const haut = visible.haut + marge;
  const bas = visible.bas - marge;

  if (champ.haut < haut || champ.bas - champ.haut > bas - haut) {
    return champ.haut - haut;
  }

  return Math.max(0, champ.bas - bas);
}
