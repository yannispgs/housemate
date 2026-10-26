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
  exteriorLowerBound,
  nightErrors,
  predictVerandaMinimum,
  verandaLowerBound,
} from "../../../src/lib/domain/frost";
import {
  claimMessage,
  eveningReadings,
  forecastMinima,
  modelScores,
  nightToReview,
  type PendingMessage,
  plantsOfNight,
  previousNightAlerted,
  recordEvening,
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
  nightMessage,
  type PlantNight,
} from "./frost-watch";
import type { Sql } from "./store";

const MARGINS = {
  veranda: {
    forecastMargin: FROST_WATCH.forecastMargin,
    ...FROST_WATCH.veranda,
  },
  exterior: {
    forecastMargin: FROST_WATCH.forecastMargin,
    ...FROST_WATCH.exterior,
  },
};

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
    await send(mailFor(pending, await plantsOfNight(sql, night)));
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
