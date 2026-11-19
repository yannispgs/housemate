/**
 * Les trois temps de la veille de gel (SPEC § 12.8) :
 *
 * - 20 h : évaluer la nuit, plante par plante, et l'inscrire au journal ;
 * - 20 h à 23 h : envoyer le message de la nuit s'il n'est pas parti — un
 *   relais indisponible à 20 h est ainsi retenté trois fois avant la nuit ;
 * - 9 h : faire le bilan, avec les minima réellement mesurés.
 *
 * L'envoi relit la ligne du journal plutôt que de recevoir la décision : le
 * journal est la seule vérité, et ce qui part est exactement ce qui y est écrit.
 */
import {
  DEFAULT_FORECAST_MARGIN,
  exteriorLowerBound,
  measuredVerandaLowerBound,
  measuredVerandaMargin,
  nightErrors,
  predictVerandaMinimum,
  proposeMargin,
  VERANDA_MODEL,
  VERANDA_RADIATIVE_MARGIN,
  type VerandaPrediction,
  verandaLowerBound,
} from "../../../src/lib/domain/frost";
import {
  appliedMargins,
  claimMessage,
  coldShortfalls,
  eveningReadings,
  forecastMinima,
  modelScores,
  nightToReview,
  type PendingMessage,
  plantsOfNight,
  previousNightAlerted,
  recordEvening,
  recordMarginProposal,
  recordModelMinima,
  recordPlants,
  recordReview,
  releaseMessage,
  watchedPlants,
  weekAlerts,
  weekModelMinima,
  weekNights,
} from "./frost-store";
import {
  assessPlants,
  blendForecasts,
  FROST_WATCH,
  frostMail,
  type Mail,
  type MarginLocation,
  marginMail,
  nightMessage,
  type PlantNight,
} from "./frost-watch";
import { weeklyReviewMail } from "./frost-week";
import type { Sql } from "./store";

/** Les marges qu'on retranche dans la véranda ce soir, détaillées au journal. */
interface VerandaMargins {
  readonly modelMargin: number;
  readonly forecastMargin: number;
  readonly radiativeMargin: number;
  readonly lowerBound: number;
}

/**
 * Le pire cas de la véranda : avec sa marge mesurée dès qu'elle est validée
 * (décision du 19/11/2026), sinon les marges du départ additionnées. La marge
 * mesurée couvre prévision et modèle d'un coup : le journal la range en marge
 * du modèle, avec une marge de prévision nulle.
 */
function verandaMargins(
  prediction: VerandaPrediction,
  measured: number | undefined,
  forecastMargin: number,
): VerandaMargins {
  if (measured === undefined) {
    const start = {
      forecastMargin,
      radiativeMargin: FROST_WATCH.veranda.radiativeMargin,
    };

    return {
      modelMargin: prediction.margin,
      ...start,
      lowerBound: verandaLowerBound(prediction, start),
    };
  }

  return {
    modelMargin: measuredVerandaMargin(prediction, measured),
    forecastMargin: 0,
    radiativeMargin: VERANDA_RADIATIVE_MARGIN.measured,
    lowerBound: measuredVerandaLowerBound(prediction, measured),
  };
}

export async function evaluateEvening(
  sql: Sql,
  night: string,
  now: Date,
): Promise<void> {
  const readings = await eveningReadings(sql, now);
  const forecast = blendForecasts(
    await forecastMinima(sql, night, now),
    await modelScores(sql),
  );

  if (forecast === null) {
    // Sans prévision, rien à décider ni à dire de sensé : l'échec doit se
    // voir dans les journaux du Worker, pas passer pour une nuit douce.
    throw new Error(
      `Veille de gel du ${night} : aucune prévision pour la nuit.`,
    );
  }

  const applied = await appliedMargins(sql);
  const forecastMargin = applied.Extérieur ?? DEFAULT_FORECAST_MARGIN;

  // La véranda se prédit dès que ses relevés sont là, même sans plante
  // dedans : le bilan du matin continue d'en calibrer le modèle.
  const prediction =
    readings.exterieur === null || readings.veranda === null
      ? null
      : predictVerandaMinimum({
          exteriorAt20h: readings.exterieur,
          verandaAt20h: readings.veranda,
          forecastExteriorMinimum: forecast.minimum,
        });
  const margins =
    prediction === null
      ? null
      : verandaMargins(prediction, applied.Véranda, forecastMargin);
  const veranda =
    prediction === null || margins === null
      ? null
      : { estimate: prediction.estimate, lowerBound: margins.lowerBound };
  const plants = assessPlants(await watchedPlants(sql), {
    forecastMinimum: forecast.minimum,
    exterior: {
      estimate: forecast.minimum,
      lowerBound: exteriorLowerBound(forecast.minimum, {
        forecastMargin,
        ...FROST_WATCH.exterior,
      }),
    },
    veranda,
  });
  const alert = plants.some(plant => plant.level === "alerte");

  // La ligne du soir d'abord, puis ce qui s'y rattache — une fois : un second
  // déclenchement de 20 h n'ajoute rien à ce qui a été décidé.
  const first = await recordEvening(sql, {
    night,
    exteriorAt20h: readings.exterieur,
    verandaAt20h: readings.veranda,
    forecastMinimum: forecast.minimum,
    forecastMethod: forecast.method,
    // Les marges telles qu'appliquées à la véranda ce soir ; celles du dehors
    // se lisent dans l'écart entre estimation et pire cas de ses plantes.
    ...(prediction === null || margins === null
      ? {
          estimate: null,
          modelMargin: null,
          forecastMargin: null,
          radiativeMargin: null,
          lowerBound: null,
          extrapolation: null,
        }
      : {
          estimate: prediction.estimate,
          modelMargin: margins.modelMargin,
          forecastMargin: margins.forecastMargin,
          radiativeMargin: margins.radiativeMargin,
          lowerBound: margins.lowerBound,
          extrapolation: prediction.extrapolation,
        }),
    alert,
    message: nightMessage(plants, await previousNightAlerted(sql, night)),
  });

  if (first) {
    await recordModelMinima(sql, night, forecast.models);
    await recordPlants(sql, night, plants);
  }
}

/** Le mail d'une nuit, d'après sa ligne du journal et ses plantes. */
export function mailFor(
  pending: PendingMessage,
  plants: readonly PlantNight[],
): Mail {
  const missing = [
    ...(pending.verandaAt20h === null ? ["le relevé de la véranda"] : []),
    ...(pending.exteriorAt20h === null ? ["le relevé extérieur"] : []),
  ];
  const veranda =
    pending.verandaAt20h === null ||
    pending.exteriorAt20h === null ||
    pending.estimate === null ||
    pending.extrapolation === null
      ? null
      : {
          estimate: pending.estimate,
          extrapolation: pending.extrapolation,
          verandaAt20h: pending.verandaAt20h,
          exteriorAt20h: pending.exteriorAt20h,
        };

  return frostMail(
    pending.message,
    {
      forecast: {
        minimum: pending.forecastMinimum,
        method: pending.forecastMethod,
      },
      veranda,
      missing,
    },
    plants,
  );
}

/** Envoie le message de la nuit s'il reste à partir. */
export async function sendPending(
  sql: Sql,
  night: string,
  send: (mail: Mail) => Promise<void>,
): Promise<void> {
  const pending = await claimMessage(sql, night);

  if (pending === null) {
    return;
  }

  try {
    // Le mail part encore à une adresse commune : une plante privée n'y
    // figure pas tant que l'envoi par membre n'existe pas (§ 7).
    const shared = (await plantsOfNight(sql, night)).filter(
      plant => plant.reservedTo === null,
    );

    if (!shared.some(plant => plant.level !== null)) {
      return;
    }

    await send(mailFor(pending, shared));
  } catch (error) {
    await releaseMessage(sql, night);
    throw error;
  }
}

/** Le bilan du matin : les deux erreurs de la nuit, séparées. */
export async function reviewNight(sql: Sql, night: string): Promise<void> {
  const entry = await nightToReview(sql, night);

  if (entry?.minExterior == null || entry.minVeranda === null) {
    return;
  }

  const errors = nightErrors(
    {
      exteriorAt20h: entry.exteriorAt20h,
      verandaAt20h: entry.verandaAt20h,
      forecastExteriorMinimum: entry.forecastMinimum,
    },
    {
      exteriorMinimum: entry.minExterior,
      verandaMinimum: entry.minVeranda,
    },
  );

  await recordReview(sql, night, {
    minExterior: entry.minExterior,
    minVeranda: entry.minVeranda,
    ...errors,
  });
}

/** La marge en vigueur d'un emplacement, telle qu'une proposition la compare. */
function currentMargin(
  location: MarginLocation,
  applied: Partial<Record<MarginLocation, number>>,
): number {
  const exterior = applied.Extérieur ?? DEFAULT_FORECAST_MARGIN;

  if (location === "Extérieur") {
    return exterior;
  }

  // Au départ, la véranda additionne la marge du modèle et celle de la
  // prévision : c'est ce que sa marge mesurée remplace.
  return applied.Véranda ?? VERANDA_MODEL.margin + exterior;
}

/**
 * Le matin, après le bilan : propose une marge par emplacement si le pire
 * écart mesuré la justifie. Rend les mails qui l'annoncent, à la première
 * proposition seulement — les matins suivants la mettent à jour en silence.
 */
export async function proposeMargins(sql: Sql): Promise<Mail[]> {
  const applied = await appliedMargins(sql);
  const mails: Mail[] = [];

  for (const stats of await coldShortfalls(sql)) {
    const current = currentMargin(stats.location, applied);
    const proposed = proposeMargin(stats, current);

    if (proposed === null) {
      continue;
    }

    const created = await recordMarginProposal(sql, {
      emplacement: stats.location,
      valeur: proposed,
      nuits: stats.nights,
      ecart: stats.shortfall,
    });

    if (created) {
      mails.push(marginMail(stats.location, current, proposed, stats));
    }
  }

  return mails;
}

/**
 * Le bilan du dimanche (décision du 19/11/2026) : les nuits de `from` à
 * `to`, comprises.
 */
export async function weeklyReview(
  sql: Sql,
  from: string,
  to: string,
): Promise<Mail | null> {
  return weeklyReviewMail({
    nights: await weekNights(sql, from, to),
    models: await weekModelMinima(sql, from, to),
    alerts: await weekAlerts(sql, from, to),
    scores: await modelScores(sql),
  });
}
