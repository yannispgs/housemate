/**
 * L'instantané exporté (SPEC § 14.1) : toutes les lignes des données du
 * foyer, sérialisées de façon canonique — clés triées, lignes ordonnées par
 * identifiant — pour qu'un même contenu donne toujours le même texte, donc la
 * même empreinte (§ 14.2 : on n'exporte que ce qui a changé).
 */
import { createHash } from "node:crypto";

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [cle: string]: Json };

export type Ligne = Readonly<Record<string, Json>>;

/**
 * Les tables exportées. Restent dehors : la météo (le hub et Open-Meteo en
 * gardent l'historique), les sessions et appareils, les abonnements push et
 * les journaux d'envoi — techniques, ou secrets.
 */
export const TABLES = [
  "foyers",
  "membres",
  "groupes",
  "groupe_membres",
  "surnoms",
  "fiches",
  "echeances",
  "completions",
  "rappels",
  "consommables",
  "remplacements",
  "releves",
  "pieces_jointes",
  "adresses",
  "reglages_resumes",
  "exceptions_push",
] as const;

export type Table = (typeof TABLES)[number];

/** Le format de l'export : à incrémenter à tout changement de forme. */
export const FORMAT = { nom: "housemate-export", version: 1 } as const;

export interface Instantane {
  readonly format: typeof FORMAT;
  readonly tables: Readonly<Record<Table, readonly Ligne[]>>;
}

/** Ce qui identifie une ligne pour la trier : son `id`, sinon toutes ses valeurs. */
function cleDeTri(ligne: Ligne): string {
  return typeof ligne.id === "string" ? ligne.id : jsonCanonique(ligne);
}

export function instantane(
  tables: Readonly<Record<Table, readonly Ligne[]>>,
): Instantane {
  const triees = Object.fromEntries(
    TABLES.map(table => [
      table,
      [...tables[table]].sort((a, b) =>
        cleDeTri(a) < cleDeTri(b) ? -1 : cleDeTri(a) > cleDeTri(b) ? 1 : 0,
      ),
    ]),
  ) as unknown as Record<Table, readonly Ligne[]>;

  return { format: FORMAT, tables: triees };
}

/** JSON aux clés triées à tous les niveaux, sans espace : une forme unique. */
export function jsonCanonique(valeur: Json): string {
  if (Array.isArray(valeur)) {
    return `[${valeur.map(jsonCanonique).join(",")}]`;
  }

  if (valeur !== null && typeof valeur === "object") {
    const objet = valeur as { readonly [cle: string]: Json };

    return `{${Object.keys(objet)
      .sort()
      .map(cle => `${JSON.stringify(cle)}:${jsonCanonique(objet[cle] as Json)}`)
      .join(",")}}`;
  }

  return JSON.stringify(valeur);
}

/** L'empreinte SHA-256 (hexadécimale) d'un texte. */
export function empreinte(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}
