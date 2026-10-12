/**
 * Le délai avant de pouvoir redemander un code (demande du foyer,
 * 2026-10-12) : 60 secondes après chaque envoi, le premier compris.
 */
export const DELAI_RENVOI_MS = 60_000;

/** Secondes entières restantes avant de pouvoir renvoyer ; 0 si c'est possible. */
export function secondesAvantRenvoi(
  envoyeA: number | null,
  maintenant: number,
): number {
  if (envoyeA === null) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((envoyeA + DELAI_RENVOI_MS - maintenant) / 1000),
  );
}

export function libelleRenvoi(secondes: number): string {
  return secondes > 0
    ? `Renvoyer le code dans ${secondes} s`
    : "Renvoyer le code";
}
