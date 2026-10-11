/**
 * L'inventaire : les fiches du foyer, groupées par catégorie (handoff de
 * design, § F). Logique pure.
 */

export type RecordNature =
  | "Plante"
  | "Véhicule"
  | "Équipement"
  | "Contrat"
  | "Séjour";

export interface RecordView {
  readonly title: string;
  readonly nature: RecordNature;
  readonly category: string;
  /** Ce qu'on retient de la fiche, en une ligne. */
  readonly descriptor: string;
}

export interface RecordGroup {
  readonly name: string;
  readonly records: readonly RecordView[];
}

export const ALL_CATEGORIES = "Tout";

/** Les catégories, dans l'ordre où elles apparaissent. */
export function recordCategories(records: readonly RecordView[]): string[] {
  return Array.from(new Set(records.map(record => record.category)));
}

/**
 * Les groupes à afficher. Choisir une catégorie réduit la liste à ce seul
 * groupe ; « Tout » les rétablit.
 */
export function groupRecords(
  records: readonly RecordView[],
  category: string,
): RecordGroup[] {
  return recordCategories(records)
    .filter(name => category === ALL_CATEGORIES || name === category)
    .map(name => ({
      name,
      records: records.filter(record => record.category === name),
    }));
}

/** « 1 fiche », « 4 fiches ». */
export function recordCount(count: number): string {
  return count === 1 ? "1 fiche" : `${count} fiches`;
}
