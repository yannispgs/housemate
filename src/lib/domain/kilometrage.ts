/**
 * Le kilométrage dans le temps (SPEC § 5.3, décisions du 23/10/2026) : la
 * courbe des relevés réels, les kilomètres de chaque année civile, et leur
 * mise à l'échelle pour un graphique. Logique pure ; le dessin est dans
 * `GraphiqueKilometrage`.
 */
import type { Releve } from "./entretien";
import {
  addYears,
  compare,
  daysBetween,
  type PlainDate,
  plainDate,
} from "./plain-date";

/** Les années montrées ; « tout » part du premier relevé. */
export type Periode = 1 | 2 | 5 | "tout";

export const PERIODES: readonly Periode[] = [1, 2, 5, "tout"];

/** Deux ans par défaut : la période du rythme de référence. */
export const PERIODE_PAR_DEFAUT: Periode = 2;

function tries(releves: readonly Releve[]): Releve[] {
  return [...releves].sort((a, b) => compare(a.le, b.le));
}

/**
 * Le compteur à cette date, interpolé entre les deux relevés qui
 * l'encadrent ; `null` s'il manque un relevé avant ou après.
 */
export function compteurAu(
  releves: readonly Releve[],
  date: PlainDate,
): number | null {
  const ordre = tries(releves);
  const avant = ordre.findLast(r => compare(r.le, date) <= 0);
  const apres = ordre.find(r => compare(r.le, date) >= 0);

  if (avant === undefined || apres === undefined) {
    return null;
  }

  const ecart = daysBetween(avant.le, apres.le);

  return ecart === 0
    ? avant.valeur
    : avant.valeur +
        ((apres.valeur - avant.valeur) * daysBetween(avant.le, date)) / ecart;
}

export interface KmAnnee {
  readonly annee: number;
  readonly km: number;
  /** L'année en cours : jusqu'au dernier relevé seulement. */
  readonly enCours: boolean;
}

/**
 * Les kilomètres de chaque année civile : du compteur au 1er janvier à celui
 * du 1er janvier suivant, tous deux interpolés. Une année sans relevé de
 * part et d'autre n'a pas de valeur. L'année en cours va jusqu'au dernier
 * relevé.
 */
export function kmParAn(
  releves: readonly Releve[],
  aujourdhui: PlainDate,
): KmAnnee[] {
  const ordre = tries(releves);
  const premier = ordre[0];
  const dernier = ordre.at(-1);

  if (premier === undefined || dernier === undefined) {
    return [];
  }

  const annees: KmAnnee[] = [];

  for (let annee = premier.le.year; annee <= dernier.le.year; annee++) {
    const debut = compteurAu(ordre, plainDate(annee, 1, 1));
    const enCours = annee === aujourdhui.year;
    const fin = enCours
      ? dernier.valeur
      : compteurAu(ordre, plainDate(annee + 1, 1, 1));

    if (debut !== null && fin !== null) {
      annees.push({ annee, km: Math.round(fin - debut), enCours });
    }
  }

  return annees;
}

/** Le premier jour montré : il y a N ans, ou le premier relevé. */
export function debutDePeriode(
  periode: Periode,
  releves: readonly Releve[],
  aujourdhui: PlainDate,
): PlainDate {
  if (periode !== "tout") {
    return addYears(aujourdhui, -periode);
  }

  return tries(releves)[0]?.le ?? aujourdhui;
}

/**
 * Les années à montrer en barres : celles qui commencent dans la période (la
 * première année d'une période qui démarre en cours d'année n'y est pas).
 */
export function anneesDeLaPeriode(
  annees: readonly KmAnnee[],
  debut: PlainDate,
): KmAnnee[] {
  const premiere =
    debut.month === 1 && debut.day === 1 ? debut.year : debut.year + 1;

  return annees.filter(a => a.annee >= premiere);
}

/** Un pas « rond » (1, 2 ou 5 × 10ⁿ) d'au moins `brut`. */
function pasRond(brut: number): number {
  const puissance = 10 ** Math.floor(Math.log10(brut));

  return [1, 2, 5, 10].map(m => m * puissance).find(p => p >= brut) as number;
}

export interface Dimensions {
  readonly largeur: number;
  readonly hauteur: number;
  /**
   * Marges : à gauche pour les kilomètres, en bas pour les années, en haut
   * pour que la plus haute graduation ne soit pas rognée.
   */
  readonly gauche: number;
  readonly bas: number;
  readonly haut: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Courbe {
  readonly points: readonly (Point & Releve)[];
  readonly reperes: readonly (Point & { readonly index: number })[];
  readonly graduationsX: readonly {
    readonly x: number;
    readonly annee: number;
  }[];
  readonly graduationsY: readonly { readonly y: number; readonly km: number }[];
}

/** Un repère à placer : une intervention, à sa date et à son compteur. */
export interface RepereKm {
  readonly le: PlainDate;
  readonly compteur: number;
}

/**
 * La courbe mise à l'échelle : les relevés et les repères de la période,
 * une graduation par 1er janvier et quatre ou cinq paliers de kilomètres.
 */
export function courbe(
  releves: readonly Releve[],
  reperes: readonly RepereKm[],
  periode: Periode,
  aujourdhui: PlainDate,
  dims: Dimensions,
): Courbe {
  const debut = debutDePeriode(periode, releves, aujourdhui);
  const dans = (le: PlainDate) =>
    compare(debut, le) <= 0 && compare(le, aujourdhui) <= 0;
  const montres = tries(releves).filter(r => dans(r.le));
  const visibles = reperes
    .map((repere, index) => ({ ...repere, index }))
    .filter(repere => dans(repere.le));
  const valeurs = [
    ...montres.map(r => r.valeur),
    ...visibles.map(r => r.compteur),
  ];

  if (valeurs.length === 0) {
    return { points: [], reperes: [], graduationsX: [], graduationsY: [] };
  }

  const pas = pasRond(
    Math.max((Math.max(...valeurs) - Math.min(...valeurs)) / 4, 1000),
  );
  const bas = Math.floor(Math.min(...valeurs) / pas) * pas;
  const haut = Math.ceil(Math.max(...valeurs) / pas) * pas || pas;
  const etendue = Math.max(haut - bas, pas);
  const jours = Math.max(daysBetween(debut, aujourdhui), 1);
  const largeurUtile = dims.largeur - dims.gauche;
  const hauteurUtile = dims.hauteur - dims.bas - dims.haut;
  const x = (le: PlainDate) =>
    dims.gauche + (daysBetween(debut, le) / jours) * largeurUtile;
  const y = (km: number) =>
    dims.haut + hauteurUtile - ((km - bas) / etendue) * hauteurUtile;

  const graduationsX = [];

  for (let annee = debut.year + 1; annee <= aujourdhui.year; annee++) {
    graduationsX.push({ x: x(plainDate(annee, 1, 1)), annee });
  }

  const graduationsY = [];

  for (let km = bas; km <= bas + etendue; km += pas) {
    graduationsY.push({ y: y(km), km });
  }

  return {
    points: montres.map(r => ({ ...r, x: x(r.le), y: y(r.valeur) })),
    reperes: visibles.map(r => ({
      index: r.index,
      x: x(r.le),
      y: y(r.compteur),
    })),
    graduationsX,
    graduationsY,
  };
}
