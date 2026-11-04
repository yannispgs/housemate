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
  nightErrors,
  predictVerandaMinimum,
  proposeForecastMargin,
  verandaLowerBound,
} from "../../../src/lib/domain/frost";
import {
  appliedForecastMargin,
  claimMessage,
  coldForecastError,
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
} from "./frost-store";
import {
  assessPlants,
  blendForecasts,
  FROST_WATCH,
  frostMail,
  type Mail,
  marginMail,
  nightMessage,
  type PlantNight,
} from "./frost-watch";
import type { Sql } from "./store";

/** La marge de prévision en vigueur : validée, sinon celle de départ. */
async function forecastMargin(sql: Sql): Promise<number> {
  return (await appliedForecastMargin(sql)) ?? DEFAULT_FORECAST_MARGIN;
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

  const margin = await forecastMargin(sql);
  const MARGINS = {
    veranda: { forecastMargin: margin, ...FROST_WATCH.veranda },
    exterior: { forecastMargin: margin, ...FROST_WATCH.exterior },
  };

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
  const veranda =
    prediction === null
      ? null
      : {
          estimate: prediction.estimate,
          lowerBound: verandaLowerBound(prediction, MARGINS.veranda),
        };
  const plants = assessPlants(await watchedPlants(sql), {
    forecastMinimum: forecast.minimum,
    exterior: {
      estimate: forecast.minimum,
      lowerBound: exteriorLowerBound(forecast.minimum, MARGINS.exterior),
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
    ...(prediction === null || veranda === null
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
          modelMargin: prediction.margin,
          forecastMargin: MARGINS.veranda.forecastMargin,
          radiativeMargin: MARGINS.veranda.radiativeMargin,
          lowerBound: veranda.lowerBound,
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

/**
 * Le matin, après le bilan : propose une marge de prévision si l'erreur
 * mesurée la justifie. Rend le mail qui l'annonce à la première proposition
 * seulement — les matins suivants la mettent à jour sans rien envoyer.
 */
export async function proposeMargin(sql: Sql): Promise<Mail | null> {
  const stats = await coldForecastError(sql);
  const current = await forecastMargin(sql);
  const proposed = proposeForecastMargin(stats, current);

  if (proposed === null) {
    return null;
  }

  const created = await recordMarginProposal(sql, {
    valeur: proposed,
    nuits: stats.nights,
    erreur: stats.error,
  });

  return created ? marginMail(current, proposed, stats) : null;
}
