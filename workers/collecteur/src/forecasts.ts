/**
 * Prévisions horaires de température, figées au moment où on les récupère.
 *
 * Plusieurs modèles, pour que le banc d'essai (protocole § 3) puisse les
 * départager sur les minima réels. Open-Meteo les sert tous en un appel et
 * archive ses prévisions passées ; Met Norway n'archive rien, c'est donc lui
 * qu'on ne peut pas rattraper plus tard (protocole § 5 bis).
 */

export interface ForecastPoint {
  readonly source: "open-meteo" | "met-norway";
  readonly model: string;
  /** Quand la source dit avoir calculé la prévision, si elle le dit. */
  readonly issuedAt: Date | null;
  readonly target: Date;
  readonly temperature: number;
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** L'horizon utile : le minimum de la nuit, à H+24, H+48 et H+72. */
export const HORIZON_HOURS = 72;

export const OPEN_METEO_MODELS = [
  "meteofrance_arome_france_hd",
  "meteofrance_arpege_europe",
  "ecmwf_ifs",
  "icon_d2",
  "icon_eu",
  "gfs_seamless",
] as const;

// Met Norway exige une identification (conditions d'utilisation). Le dépôt est
// public : c'est un contact suffisant, sans exposer d'adresse personnelle.
export const MET_NORWAY_USER_AGENT =
  "housemate/0.1 github.com/yannispgs/housemate";

export function openMeteoUrl(
  { latitude, longitude }: Coordinates,
  variable: "temperature_2m" | "precipitation",
): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: variable,
    models: OPEN_METEO_MODELS.join(","),
    forecast_hours: String(HORIZON_HOURS),
    // Des instants sans fuseau à interpréter : aucune ambiguïté au changement
    // d'heure.
    timeformat: "unixtime",
    timezone: "GMT",
  });

  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Une ligne par modèle et par heure. Un modèle qui ne porte pas si loin
 * (AROME : ~2 jours) renvoie `null` au-delà : ces heures sont absentes, pas
 * nulles.
 */
export function parseOpenMeteo(payload: unknown): ForecastPoint[] {
  const hourly = (payload as { hourly?: Record<string, unknown> }).hourly;
  const times = hourly?.time;

  if (!Array.isArray(times)) {
    throw new TypeError("Open-Meteo : réponse sans série horaire.");
  }

  const points: ForecastPoint[] = [];

  for (const model of OPEN_METEO_MODELS) {
    const values = hourly?.[`temperature_2m_${model}`];

    if (!Array.isArray(values)) {
      continue;
    }

    values.forEach((value, index) => {
      const time = times[index];

      if (typeof value === "number" && typeof time === "number") {
        points.push({
          source: "open-meteo",
          model,
          issuedAt: null,
          target: new Date(time * 1000),
          temperature: value,
        });
      }
    });
  }

  return points;
}

/**
 * Met Norway demande des coordonnées à 4 décimales au plus (au-delà, il refuse
 * de servir depuis son cache). Onze mètres de précision suffisent largement.
 */
export function metNorwayUrl({ latitude, longitude }: Coordinates): string {
  const round = (value: number) => Math.round(value * 10_000) / 10_000;

  return `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${round(latitude)}&lon=${round(longitude)}`;
}

export function parseMetNorway(payload: unknown, now: Date): ForecastPoint[] {
  const properties = (
    payload as {
      properties?: {
        meta?: { updated_at?: unknown };
        timeseries?: {
          time?: unknown;
          data?: { instant?: { details?: { air_temperature?: unknown } } };
        }[];
      };
    }
  ).properties;

  if (!Array.isArray(properties?.timeseries)) {
    throw new TypeError("Met Norway : réponse sans série temporelle.");
  }

  const updatedAt = properties.meta?.updated_at;
  const issuedAt = typeof updatedAt === "string" ? new Date(updatedAt) : null;
  const horizon = now.getTime() + HORIZON_HOURS * 3_600_000;
  const points: ForecastPoint[] = [];

  for (const step of properties.timeseries) {
    const temperature = step.data?.instant?.details?.air_temperature;

    if (typeof step.time !== "string" || typeof temperature !== "number") {
      continue;
    }

    const target = new Date(step.time);

    if (target.getTime() <= horizon) {
      points.push({
        source: "met-norway",
        model: "locationforecast",
        issuedAt,
        target,
        temperature,
      });
    }
  }

  return points;
}
