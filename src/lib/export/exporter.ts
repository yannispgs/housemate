/**
 * L'export quotidien (SPEC § 14.2) : une fois par jour, à heure fixe, si les
 * données ont changé depuis le dernier export. Chaque passage laisse une
 * ligne au journal — exporté, inchangé ou échec — dont l'absence prolongée
 * est elle-même une alerte (§ 14.5).
 *
 * Écrit contre des dépendances, comme l'envoi des résumés : la route les
 * branche sur la base, R2 et la destination ; les tests sur des doublures.
 */

import type { InstantParis } from "@/lib/data/resumes";
import { toISO } from "@/lib/domain/plain-date";
import { archiver, chiffrer, estChiffreAge } from "./archive";
import {
  empreinte,
  type Instantane,
  instantane,
  jsonCanonique,
  type Ligne,
  type Table,
} from "./instantane";
import { enMarkdown } from "./markdown";
import { cheminDePiece, piecesADeposer } from "./pieces";

/** L'heure de Paris à laquelle l'export passe : la nuit, base au repos. */
export const HEURE_EXPORT = 3;

/** Combien d'archives des données on garde (décision du 2026-10-22). */
export const VERSIONS_GARDEES = 10;

export const PREFIXE = "housemate-";
export const SUFFIXE = ".tar.gz.age";

export type Issue = "exporte" | "inchange" | "echec";

export interface Passage {
  readonly le: Date;
  readonly issue: Issue;
  readonly empreinte: string | null;
}

/** Où vont les fichiers : le Drive en production, une doublure en test. */
export interface Destination {
  /** Les chemins déjà déposés, archives et pièces. */
  lister(): Promise<string[]>;
  /** Dépose, en remplaçant un fichier du même chemin. */
  deposer(chemin: string, contenu: Uint8Array): Promise<void>;
  supprimer(chemin: string): Promise<void>;
}

export interface ExportDeps {
  /** Le dernier passage au journal, s'il y en a un. */
  dernier(): Promise<Passage | null>;
  /** Les lignes de chaque table, lues en propriétaire. */
  tables(): Promise<Record<Table, Ligne[]>>;
  /** Le contenu d'une pièce jointe, lu dans R2. */
  piece(piece: Ligne): Promise<Uint8Array>;
  destination: Destination;
  noter(
    issue: Issue,
    empreinte: string | null,
    fichier: string | null,
    detail: string | null,
  ): Promise<void>;
  clePublique: string;
}

export type Bilan =
  | { readonly issue: "pas-l-heure" }
  | { readonly issue: "deja-fait" }
  | { readonly issue: "inchange" }
  | {
      readonly issue: "exporte";
      readonly fichier: string;
      readonly pieces: number;
    }
  | { readonly issue: "echec"; readonly detail: string };

/** Passé `HEURE_EXPORT`, et pas encore de passage réussi aujourd'hui (Paris). */
export function exportDu(
  instant: InstantParis,
  dernier: Passage | null,
  jourDe: (le: Date) => string,
): "pas-l-heure" | "deja-fait" | "du" {
  if (instant.heure < HEURE_EXPORT) {
    return "pas-l-heure";
  }

  return dernier !== null &&
    dernier.issue !== "echec" &&
    jourDe(dernier.le) === toISO(instant.jour)
    ? "deja-fait"
    : "du";
}

/**
 * Plus de 36 h sans passage réussi — exporté ou inchangé — au journal :
 * l'export ne tourne plus (§ 14.2). C'est l'absence de passage qui alerte,
 * jamais l'absence de fichier : un foyer calme n'en produit pas. Une suite
 * d'échecs alerte de même. Avant tout passage, on compte depuis la mise en
 * service (`depuis`).
 */
export const RETARD_MAX_HEURES = 36;

export function exportEnPanne(
  dernierReussi: Date | null,
  maintenant: Date,
  depuis: Date,
): boolean {
  const reference = dernierReussi ?? depuis;

  return (
    maintenant.getTime() - reference.getTime() > RETARD_MAX_HEURES * 3_600_000
  );
}

/** Le nom de l'archive d'un jour ; l'ordre alphabétique est l'ordre des jours. */
export function nomDArchive(jour: string): string {
  return `${PREFIXE}${jour}${SUFFIXE}`;
}

/** Les archives à supprimer : toutes sauf les `garder` plus récentes. */
export function aElaguer(chemins: readonly string[], garder: number): string[] {
  return chemins
    .filter(c => c.startsWith(PREFIXE) && c.endsWith(SUFFIXE))
    .sort()
    .reverse()
    .slice(garder);
}

/** Même contenu que le dernier passage réussi (un « inchangé » garde l'empreinte). */
function memeContenu(dernier: Passage | null, e: string): boolean {
  return (
    dernier !== null && dernier.issue !== "echec" && dernier.empreinte === e
  );
}

async function deposerPieces(
  deps: ExportDeps,
  i: Instantane,
  deposes: ReadonlySet<string>,
): Promise<number> {
  const manquantes = piecesADeposer(i.tables.pieces_jointes, deposes);

  for (const p of manquantes) {
    await deps.destination.deposer(
      cheminDePiece(p),
      await chiffrer(await deps.piece(p), deps.clePublique),
    );
  }

  return manquantes.length;
}

export async function exporter(
  deps: ExportDeps,
  instant: InstantParis,
  maintenant: Date,
  jourDe: (le: Date) => string,
): Promise<Bilan> {
  const dernier = await deps.dernier();
  const du = exportDu(instant, dernier, jourDe);

  if (du !== "du") {
    return { issue: du };
  }

  let e: string | null = null;

  try {
    const i = instantane(await deps.tables());
    const json = jsonCanonique(i as unknown as Ligne);
    e = empreinte(json);

    if (memeContenu(dernier, e)) {
      await deps.noter("inchange", e, null, null);

      return { issue: "inchange" };
    }

    const jour = toISO(instant.jour);
    const fichier = nomDArchive(jour);
    const chiffre = await chiffrer(
      archiver(json, enMarkdown(i, jour), maintenant),
      deps.clePublique,
    );

    if (!estChiffreAge(chiffre)) {
      throw new Error("l'archive chiffrée n'a pas l'en-tête age");
    }

    const deposes = new Set(await deps.destination.lister());
    const pieces = await deposerPieces(deps, i, deposes);
    await deps.destination.deposer(fichier, chiffre);

    for (const ancien of aElaguer(
      [...new Set([...deposes, fichier])],
      VERSIONS_GARDEES,
    )) {
      await deps.destination.supprimer(ancien);
    }

    await deps.noter("exporte", e, fichier, `${chiffre.length} octets`);

    return { issue: "exporte", fichier, pieces };
  } catch (error_) {
    const detail = error_ instanceof Error ? error_.message : String(error_);
    await deps.noter("echec", e, null, detail);

    return { issue: "echec", detail };
  }
}
