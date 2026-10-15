/**
 * Le plan d'entretien (SPEC § 5.3) : des consommables — courroie, bougies,
 * filtre d'aspirateur — dont chacun dérive une échéance, au kilométrage et/ou
 * au temps, « au premier des deux termes échus » (§ 3.4b).
 *
 * Pur : aucune base, aucune date « d'aujourd'hui » implicite. Tout ce qui
 * dépend du jour le reçoit.
 *
 * Décisions du foyer (2026-10-15) :
 * - l'échéance s'ouvre au **dernier 7,5 %** de la durée de vie, et ce seuil
 *   tient lieu de préavis ; la montée jusqu'à `critique` est celle de
 *   l'importance effective (§ 3.8a) ;
 * - le kilométrage s'estime par un **rythme** prudent : sur 2 ans, sur 6 mois
 *   si l'on a de quoi, et **le plus élevé des deux** ;
 * - un remplacement noté sans le compteur, ou un compteur sans rythme, est
 *   une **donnée manquante** signalée, jamais un blocage ;
 * - un relevé de plus de 3 mois est redemandé, mais seulement quand un
 *   consommable kilométrique approche de sa limite (moins de 20 % restants).
 */
import {
  addDays,
  addMonths,
  addYears,
  compare,
  daysBetween,
  type PlainDate,
} from "@/lib/domain/plain-date";
import { addDuration, type Duration } from "@/lib/domain/recurrence";

/** Un relevé daté du compteur : `kilometrage` · `instant` · `valeur`. */
export interface Releve {
  readonly le: PlainDate;
  readonly valeur: number;
}

/** Un remplacement : sa date, et le compteur ce jour-là s'il est connu. */
export interface Remplacement {
  readonly le: PlainDate;
  readonly compteur: number | null;
}

export interface Consommable {
  /** Durée de vie au compteur ; `null` : purement calendaire. */
  readonly dureeKm: number | null;
  /** Durée de vie au temps ; `null` : purement kilométrique. */
  readonly dureeTemps: Duration | null;
  readonly remplacements: readonly Remplacement[];
}

/** Part de la durée de vie où l'échéance s'ouvre (décision du 2026-10-15). */
export const PART_DU_PREAVIS = 0.075;

/** Au-delà, un relevé est trop vieux pour qu'on s'y fie sans demander. */
export const RELEVE_PERIME_MOIS = 3;

/** En deçà de cette part restante, un relevé périmé se redemande. */
export const PART_PROCHE_DE_LA_LIMITE = 0.2;

/* ------------------------------------------------------------------------ */
/* Rythme et compteur estimé                                                */
/* ------------------------------------------------------------------------ */

function tries(releves: readonly Releve[], today: PlainDate): Releve[] {
  return releves
    .filter(r => compare(r.le, today) <= 0)
    .sort((a, b) => compare(a.le, b.le));
}

/** Kilomètres par jour du premier au dernier relevé ; `null` sans écart. */
function pente(releves: readonly Releve[]): number | null {
  const premier = releves[0];
  const dernier = releves.at(-1);

  if (premier === undefined || dernier === undefined) {
    return null;
  }

  const jours = daysBetween(premier.le, dernier.le);

  return jours > 0 ? (dernier.valeur - premier.valeur) / jours : null;
}

/**
 * Le rythme, en kilomètres par jour ; `null` s'il ne peut pas se calculer
 * (un seul relevé, ou un compteur qui n'avance pas).
 *
 * - **référence** : les 2 dernières années, ou tout l'historique s'il est
 *   plus court ;
 * - **récent** : les 6 derniers mois, retenu s'il repose sur deux relevés
 *   espacés d'au moins deux mois ;
 * - **le plus élevé des deux** : rouler plus avance l'alerte, rouler moins
 *   ne la retarde jamais.
 */
export function rythme(
  releves: readonly Releve[],
  today: PlainDate,
): number | null {
  const tous = tries(releves, today);
  const depuis = (debut: PlainDate) =>
    tous.filter(r => compare(r.le, debut) >= 0);

  const deuxAns = depuis(addYears(today, -2));
  const reference = pente(deuxAns.length >= 2 ? deuxAns : tous);

  const sixMois = depuis(addMonths(today, -6));
  const premier = sixMois[0];
  const dernier = sixMois.at(-1);
  const recent =
    premier !== undefined &&
    dernier !== undefined &&
    compare(addMonths(premier.le, 2), dernier.le) <= 0
      ? pente(sixMois)
      : null;

  const retenu = Math.max(reference ?? 0, recent ?? 0);

  return retenu > 0 ? retenu : null;
}

/**
 * Le compteur estimé aujourd'hui : dernier relevé + rythme × jours écoulés.
 * Sans rythme, le dernier relevé tel quel ; `null` sans aucun relevé.
 * Un relevé réel prime toujours : c'est lui le point de départ.
 */
export function compteurEstime(
  releves: readonly Releve[],
  today: PlainDate,
): number | null {
  const dernier = tries(releves, today).at(-1);

  if (dernier === undefined) {
    return null;
  }

  const r = rythme(releves, today);

  return r === null
    ? dernier.valeur
    : dernier.valeur + r * daysBetween(dernier.le, today);
}

/* ------------------------------------------------------------------------ */
/* L'échéance d'un consommable                                              */
/* ------------------------------------------------------------------------ */

export interface EtatConsommable {
  /** La date du prochain remplacement, estimée au besoin ; `null` : inconnue. */
  readonly echeance: PlainDate | null;
  /** Le préavis : 7,5 % de la durée de vie du terme retenu, en jours. */
  readonly preavisJours: number;
  /** Il manque de quoi calculer le terme kilométrique (§ 5.3). */
  readonly donneeManquante: boolean;
  /** Le dernier relevé est trop vieux, et la limite approche. */
  readonly releveAttendu: boolean;
}

interface Terme {
  readonly echeance: PlainDate;
  readonly preavisJours: number;
}

function dernierRemplacement(c: Consommable): Remplacement | undefined {
  return [...c.remplacements].sort((a, b) => compare(a.le, b.le)).at(-1);
}

function termeTemps(dernier: Remplacement, duree: Duration): Terme {
  const echeance = addDuration(dernier.le, duree, 1);

  return {
    echeance,
    preavisJours: Math.round(
      PART_DU_PREAVIS * daysBetween(dernier.le, echeance),
    ),
  };
}

function termeKm(
  limite: number,
  duree: number,
  releves: readonly Releve[],
  today: PlainDate,
): Terme | null {
  const r = rythme(releves, today);
  const estime = compteurEstime(releves, today);

  if (r === null || estime === null) {
    return null;
  }

  return {
    echeance: addDays(today, Math.ceil((limite - estime) / r)),
    preavisJours: Math.ceil((PART_DU_PREAVIS * duree) / r),
  };
}

export function etatConsommable(
  c: Consommable,
  releves: readonly Releve[],
  today: PlainDate,
): EtatConsommable {
  const dernier = dernierRemplacement(c);

  if (dernier === undefined) {
    return {
      echeance: null,
      preavisJours: 0,
      donneeManquante: true,
      releveAttendu: false,
    };
  }

  const temps =
    c.dureeTemps === null ? null : termeTemps(dernier, c.dureeTemps);
  const limite =
    c.dureeKm === null || dernier.compteur === null
      ? null
      : dernier.compteur + c.dureeKm;
  const km =
    limite === null || c.dureeKm === null
      ? null
      : termeKm(limite, c.dureeKm, releves, today);

  // « Au premier des deux termes échus » : le plus proche l'emporte.
  const retenu = [temps, km]
    .filter((t): t is Terme => t !== null)
    .sort((a, b) => compare(a.echeance, b.echeance))[0];

  const dernierReleve = tries(releves, today).at(-1);
  const estime = compteurEstime(releves, today);
  const releveAttendu =
    limite !== null &&
    c.dureeKm !== null &&
    dernierReleve !== undefined &&
    estime !== null &&
    compare(addMonths(dernierReleve.le, RELEVE_PERIME_MOIS), today) < 0 &&
    limite - estime <= PART_PROCHE_DE_LA_LIMITE * c.dureeKm;

  return {
    echeance: retenu?.echeance ?? null,
    preavisJours: retenu?.preavisJours ?? 0,
    donneeManquante: c.dureeKm !== null && km === null,
    releveAttendu,
  };
}
