/**
 * L'alerte de gel (SPEC § 12.2 et § 12.8), en calcul pur : dans la véranda,
 * et dehors (décisions du 25/10/2026).
 *
 * La chaîne : la prévision donne le minimum EXTÉRIEUR de la nuit ; le relevé
 * de 20 h donne l'avance de la véranda sur l'extérieur ; le modèle calibré en
 * déduit le minimum DANS la véranda ; la décision se prend sur la borne basse,
 * jamais sur l'estimation centrale — un chauffage inutile coûte quelques
 * centimes, un manqué coûte l'agrume.
 */

/**
 * Le modèle retenu à la calibration du 16/09/2026 (SPEC § 12.8) :
 *
 *   Δ_aube = 1,66 + 0,39 × Δ_soir + 0,32 × chute_extérieure
 *
 * un socle que l'abri procure toujours, 39 % de l'avance accumulée dans la
 * journée, et un tiers de ce que l'extérieur perd dans la nuit.
 */
export const VERANDA_MODEL = {
  base: 1.66,
  eveningLead: 0.39,
  exteriorDrop: 0.32,
  /** Deux écarts types de l'erreur hors échantillon (0,56 °C). */
  margin: 1.1,
  /** Les minima extérieurs sur lesquels le modèle a été ajusté. */
  validFrom: 0.3,
  validTo: 5,
} as const;

/**
 * Hors de son domaine, le modèle prolonge une droite : il doit le dire, dans
 * les deux sens — une nuit douce est aussi hors domaine qu'une nuit de gel.
 */
export type Extrapolation = "none" | "low" | "high";

export interface EveningInputs {
  /** Relevé extérieur de 20 h. */
  readonly exteriorAt20h: number;
  /** Relevé de la véranda à 20 h. */
  readonly verandaAt20h: number;
  /** Minimum extérieur annoncé pour la nuit. */
  readonly forecastExteriorMinimum: number;
}

export interface VerandaPrediction {
  readonly estimate: number;
  /** Marge du modèle, doublée en extrapolation. */
  readonly margin: number;
  readonly extrapolation: Extrapolation;
}

/**
 * Arrondi au dixième, sans « −0 » : `5,1 − 1,1 − 1 − 3` vaut −4e−16 en virgule
 * flottante, et s'afficherait « −0 °C ».
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

function extrapolationFor(exteriorMinimum: number): Extrapolation {
  if (exteriorMinimum < VERANDA_MODEL.validFrom) {
    return "low";
  }

  if (exteriorMinimum > VERANDA_MODEL.validTo) {
    return "high";
  }

  return "none";
}

/** Le minimum de la véranda attendu cette nuit, avec sa marge. */
export function predictVerandaMinimum({
  exteriorAt20h,
  verandaAt20h,
  forecastExteriorMinimum,
}: EveningInputs): VerandaPrediction {
  const eveningLead = verandaAt20h - exteriorAt20h;
  const exteriorDrop = exteriorAt20h - forecastExteriorMinimum;
  const dawnLead =
    VERANDA_MODEL.base +
    VERANDA_MODEL.eveningLead * eveningLead +
    VERANDA_MODEL.exteriorDrop * exteriorDrop;

  const extrapolation = extrapolationFor(forecastExteriorMinimum);

  return {
    estimate: round1(forecastExteriorMinimum + dawnLead),
    margin:
      extrapolation === "none"
        ? VERANDA_MODEL.margin
        : VERANDA_MODEL.margin * 2,
    extrapolation,
  };
}

/**
 * La marge de prévision de départ : le protocole situe l'erreur entre 0,4 et
 * 2 °C, on part du haut. Elle vaut tant qu'aucune marge mesurée n'a été
 * appliquée (décision du 26/10/2026).
 */
export const DEFAULT_FORECAST_MARGIN = 2;

/**
 * Les règles de la proposition du matin (décisions du 26/10 et du 19/11/2026).
 * La cible du foyer : le minimum réel finit au plus 0,5 °C sous le pire cas,
 * quitte à finir jusqu'à 3 °C au-dessus — mieux vaut chauffer pour rien.
 */
export const MARGIN_PROPOSAL = {
  /** Assez de nuits froides mesurées pour proposer. */
  minNights: 10,
  /** De combien le réel peut finir sous le pire cas. */
  tolerance: 0.5,
  /**
   * Plancher de la marge : le capteur relève à l'heure près, il ne sait pas
   * juger plus fin (comme `FORECAST_BLEND.rmseFloor`).
   */
  floor: 0.3,
  /** En deçà de cet écart avec la marge en vigueur, rien à proposer. */
  minChange: 0.5,
} as const;

export interface ShortfallStats {
  readonly nights: number;
  /**
   * Le pire écart dangereux, en °C : de combien le minimum réel a fini sous
   * l'attendu, au pire ; 0 s'il n'a jamais fini dessous.
   */
  readonly shortfall: number;
}

/**
 * La marge à proposer d'après le pire écart mesuré, ou `null` : trop peu de
 * nuits, ou trop proche de la marge en vigueur pour mériter une validation.
 */
export function proposeMargin(
  stats: ShortfallStats,
  current: number,
): number | null {
  if (stats.nights < MARGIN_PROPOSAL.minNights) {
    return null;
  }

  const proposed = round1(
    Math.max(
      stats.shortfall - MARGIN_PROPOSAL.tolerance,
      MARGIN_PROPOSAL.floor,
    ),
  );

  return Math.abs(proposed - current) < MARGIN_PROPOSAL.minChange
    ? null
    : proposed;
}

/**
 * La marge radiative de la véranda : une feuille descend sous l'air par nuit
 * claire, même sous verre, et le capteur mesure l'air (SPEC § 12.2).
 */
export const VERANDA_RADIATIVE_MARGIN = {
  /** Au départ, avec les marges additionnées (décision du 19/11/2026). */
  start: 1.5,
  /** Avec la marge mesurée, qui couvre déjà prévision et modèle. */
  measured: 0.5,
} as const;

/**
 * La marge mesurée de la véranda telle qu'appliquée ce soir : elle couvre la
 * prévision et le modèle d'un coup, doublée quand le modèle extrapole.
 */
export function measuredVerandaMargin(
  prediction: VerandaPrediction,
  measuredMargin: number,
): number {
  return prediction.extrapolation === "none"
    ? measuredMargin
    : measuredMargin * 2;
}

/** Le pire cas dans la véranda avec sa marge mesurée, et le radiatif réduit. */
export function measuredVerandaLowerBound(
  prediction: VerandaPrediction,
  measuredMargin: number,
): number {
  return round1(
    prediction.estimate -
      measuredVerandaMargin(prediction, measuredMargin) -
      VERANDA_RADIATIVE_MARGIN.measured,
  );
}

export interface WatchMargins {
  /**
   * Erreur de la prévision extérieure, mesurée par le journal du soir
   * (protocole § 5 bis). Tant qu'elle n'est pas mesurée, c'est à l'appelant
   * de la fixer : aucune valeur par défaut ne ferait semblant de la connaître.
   */
  readonly forecastMargin: number;
  /** Marge radiative : une feuille descend sous l'air par nuit claire. */
  readonly radiativeMargin: number;
}

/**
 * Le pire cas dans la véranda : l'estimation du modèle, moins toutes les
 * marges. Elles s'additionnent : c'est l'hypothèse prudente tant qu'on ne sait
 * pas si les erreurs de prévision et de modèle sont indépendantes.
 */
export function verandaLowerBound(
  prediction: VerandaPrediction,
  { forecastMargin, radiativeMargin }: WatchMargins,
): number {
  return round1(
    prediction.estimate - prediction.margin - forecastMargin - radiativeMargin,
  );
}

export interface ExteriorMargins extends WatchMargins {
  /**
   * Marge du sol (décision du 25/10/2026) : la prévision vaut à 2 m, une
   * plante dehors vit plus bas, là où l'air froid s'accumule.
   */
  readonly groundMargin: number;
}

/** Le pire cas dehors : la prévision elle-même, moins les marges. */
export function exteriorLowerBound(
  forecastMinimum: number,
  { forecastMargin, radiativeMargin, groundMargin }: ExteriorMargins,
): number {
  return round1(
    forecastMinimum - forecastMargin - radiativeMargin - groundMargin,
  );
}

/**
 * La vigilance (décision du 25/10/2026) : un pire cas à moins de 2 °C au-dessus
 * du seuil de dégâts. La plante est citée, sans déclencher de mail à elle seule.
 */
export const VIGILANCE_GAP = 2;

export type FrostLevel = "alerte" | "vigilance";

/**
 * Le niveau d'une plante cette nuit. Le seuil est celui de DÉGÂTS, jamais
 * celui de mort — alerter au seuil de mort, c'est alerter trop tard.
 */
export function frostLevel(
  lowerBound: number,
  damageThreshold: number,
): FrostLevel | null {
  if (lowerBound <= damageThreshold) {
    return "alerte";
  }

  return lowerBound <= damageThreshold + VIGILANCE_GAP ? "vigilance" : null;
}

export interface MorningOutcome {
  readonly exteriorMinimum: number;
  readonly verandaMinimum: number;
}

export interface NightErrors {
  /** Minimum extérieur mesuré moins annoncé : la qualité de la prévision. */
  readonly forecastError: number;
  /**
   * Minimum de la véranda mesuré moins prédit AVEC le minimum extérieur
   * mesuré : la qualité du modèle seul, sans l'erreur de prévision.
   */
  readonly modelError: number;
}

/**
 * Les deux erreurs d'une nuit, séparées (SPEC § 12.8) : sans cette séparation,
 * on ne sait pas si une alerte ratée vient de la prévision ou du modèle.
 */
export function nightErrors(
  evening: EveningInputs,
  morning: MorningOutcome,
): NightErrors {
  const withMeasuredExterior = predictVerandaMinimum({
    ...evening,
    forecastExteriorMinimum: morning.exteriorMinimum,
  });

  return {
    forecastError: round1(
      morning.exteriorMinimum - evening.forecastExteriorMinimum,
    ),
    modelError: round1(morning.verandaMinimum - withMeasuredExterior.estimate),
  };
}
