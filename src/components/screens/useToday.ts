"use client";

import { useEffect, useState } from "react";

/**
 * « Aujourd'hui », tel que le lit la personne. Une date figée (démonstration)
 * est connue dès le rendu serveur ; sinon, elle n'est lue qu'une fois dans le
 * navigateur, pour ne jamais afficher le jour UTC du serveur (conventions
 * § 12).
 */
export function useToday(fixed: string | null): Date | null {
  const [today, setToday] = useState<Date | null>(() =>
    fixed === null ? null : new Date(`${fixed}T12:00:00`),
  );

  useEffect(() => {
    if (fixed === null) {
      setToday(new Date());
    }
  }, [fixed]);

  return today;
}

const SHORT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});

/** « 13 sept. » : la date qu'enregistre une plante cochée. */
export function shortDate(day: Date | null): string {
  return day === null ? "" : SHORT.format(day);
}
