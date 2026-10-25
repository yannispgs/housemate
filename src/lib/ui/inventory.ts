/**
 * L'inventaire : les fiches du foyer, groupées par catégorie (handoff de
 * design, § F). Logique pure.
 */
import {
  type CriterePlante,
  correspond,
  criteresPlantes,
  type SituationPlante,
} from "@/lib/data/plantes";

export type RecordNature =
  | "Plante"
  | "Véhicule"
  | "Équipement"
  | "Contrat"
  | "Séjour"
  // Natures de la base (SPEC § 4.1) que la maquette ne dessine pas encore.
  | "Animal"
  | "Document"
  | "Personne"
  | "Lieu";

export interface RecordView {
  /** La fiche à ouvrir ; absent pour les données de démonstration. */
  readonly id?: string;
  readonly title: string;
  readonly nature: RecordNature;
  readonly category: string;
  /** Ce qu'on retient de la fiche, en une ligne. */
  readonly descriptor: string;
  /** Une plante : en pot ou en terre, et son emplacement (§ 12.4). */
  readonly plante?: SituationPlante;
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

/* ------------------------------------------------------------------------ */
/* Le menu « Plantes » (§ 12.4, décisions du 25/10/2026)                    */
/* ------------------------------------------------------------------------ */

export const TOUTES_LES_PLANTES = "Toutes";

/**
 * Les critères du menu, d'après les plantes de la liste. Vide sans plante
 * renseignée : le menu n'apparaît pas, il n'aurait rien à filtrer.
 */
export function plantCriteria(records: readonly RecordView[]): CriterePlante[] {
  return criteresPlantes(
    records.flatMap(record => (record.plante ? [record.plante] : [])),
  );
}

/** Les plantes qui répondent au critère ; tout, sans critère. */
export function filterPlants(
  records: readonly RecordView[],
  critere: CriterePlante | null,
): RecordView[] {
  if (critere === null) {
    return [...records];
  }

  return records.filter(
    record => record.plante !== undefined && correspond(record.plante, critere),
  );
}
