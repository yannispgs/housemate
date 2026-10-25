/**
 * Les dates de la saisie recopiée dans `seed` suivent le calendrier (décision
 * du foyer, 2026-10-18) : une échéance saisie « dans un mois » reste « dans un
 * mois » d'une preview à l'autre, un « fait il y a trois jours » reste « il y
 * a trois jours ».
 *
 * `seed` garde ses lignes datées d'un **jour de référence** (`R`). Une preview
 * née le jour `J` avance toutes les dates héritées de `J − R` jours, d'un seul
 * bloc : les liens entre lignes (une complétion et son occurrence) tiennent.
 * À la fusion, ce qu'on y a saisi recule d'autant pour rejoindre le repère de
 * `seed` (`scripts/enrichir-seed.ts`).
 *
 * Calculé sans base : les scripts lisent les lignes et appliquent.
 */
import {
  addDays,
  compare,
  fromISO,
  type PlainDate,
  toISO,
} from "@/lib/domain/plain-date";

/** Une date seule, un instant, ou du JSON qui peut contenir des dates. */
export type Genre = "date" | "instant" | "json";

export interface ColonneDatee {
  readonly name: string;
  readonly genre: Genre;
}

export type Ligne = Readonly<Record<string, unknown>>;

/**
 * Ce qui ne peut pas être dans le futur, une fois avancé : un instant (une
 * création, une connexion) et les dates de `passees` (« fait le »).
 */
export interface Plafond {
  readonly aujourdhui: PlainDate;
  readonly maintenant: Date;
  readonly passees: readonly string[];
}

const JOUR_MS = 86_400_000;
const DATE_SEULE = /^\d{4}-\d{2}-\d{2}$/;

/** Le genre d'une colonne d'après son type Postgres ; `null` sans date. */
export function genreDe(type: string): Genre | null {
  switch (type) {
    case "date":
      return "date";
    case "timestamp with time zone":
      return "instant";
    case "json":
    case "jsonb":
      return "json";
    default:
      return null;
  }
}

function decalerDate(valeur: string, jours: number, plafond?: PlainDate) {
  const decalee = addDays(fromISO(valeur), jours);

  return toISO(
    plafond !== undefined && compare(decalee, plafond) > 0 ? plafond : decalee,
  );
}

function decalerInstant(valeur: string, jours: number, plafond?: Date) {
  const decale = new Date(Date.parse(valeur) + jours * JOUR_MS);

  return (
    plafond !== undefined && decale > plafond ? plafond : decale
  ).toISOString();
}

/** Les dates seules (« 2026-11-20 ») d'un JSON, à toute profondeur. */
function decalerJson(valeur: unknown, jours: number): unknown {
  if (typeof valeur === "string") {
    return DATE_SEULE.test(valeur) ? decalerDate(valeur, jours) : valeur;
  }

  if (Array.isArray(valeur)) {
    return valeur.map(v => decalerJson(v, jours));
  }

  if (valeur !== null && typeof valeur === "object") {
    return Object.fromEntries(
      Object.entries(valeur).map(([k, v]) => [k, decalerJson(v, jours)]),
    );
  }

  return valeur;
}

/** La ligne, ses dates avancées (ou reculées) de `jours`. */
export function decaler(
  ligne: Ligne,
  colonnes: readonly ColonneDatee[],
  jours: number,
  plafond?: Plafond,
): Ligne {
  const copie: Record<string, unknown> = { ...ligne };

  for (const { name, genre } of colonnes) {
    const valeur = ligne[name];

    if (valeur === null || valeur === undefined) {
      continue;
    }

    if (genre === "json") {
      copie[name] = decalerJson(valeur, jours);
    } else if (typeof valeur !== "string") {
      // Lue en JSON, une date est une chaîne : le reste n'est pas une date.
    } else if (genre === "date") {
      copie[name] = decalerDate(
        valeur,
        jours,
        plafond?.passees.includes(name) ? plafond.aujourdhui : undefined,
      );
    } else {
      copie[name] = decalerInstant(valeur, jours, plafond?.maintenant);
    }
  }

  return copie;
}
