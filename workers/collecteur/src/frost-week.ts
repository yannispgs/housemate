/**
 * Le bilan hebdomadaire de la veille de gel (SPEC § 12.8, décision du
 * 19/11/2026) : chaque dimanche, ce que chaque modèle annonçait à 20 h, ce que
 * notre modèle en déduisait pour la véranda, et ce qui s'est vraiment passé.
 * De quoi voir ce qui marche, et recaler ce qui ne marche pas. Calcul pur.
 *
 * Les écarts s'écrivent toujours « mesuré moins attendu » : négatif, la nuit a
 * été plus froide qu'attendu — le sens dangereux.
 */
import { MARGIN_PROPOSAL } from "../../../src/lib/domain/frost";
import { celsius, type Location, type Mail } from "./frost-watch";

/** La cible du foyer : le réel au plus 3 °C au-dessus du pire cas. */
export const WEEK_TARGET_ABOVE = 3;

/** Une nuit du journal, telle que le bilan la lit. */
export interface WeekNight {
  /** AAAA-MM-JJ, le soir de la nuit. */
  readonly night: string;
  readonly exteriorAt20h: number | null;
  readonly verandaAt20h: number | null;
  readonly forecastMinimum: number | null;
  readonly estimate: number | null;
  readonly lowerBound: number | null;
  readonly alert: boolean;
  /** Déclarée chauffée : la véranda mesurée n'y dit rien du modèle. */
  readonly heated: boolean;
  readonly minExterior: number | null;
  readonly minVeranda: number | null;
}

/** Le minimum annoncé par un modèle pour une nuit. */
export interface WeekModelMinimum {
  readonly night: string;
  readonly source: string;
  readonly model: string;
  readonly minimum: number;
}

/** Une plante en alerte une nuit de la semaine. */
export interface WeekAlert {
  readonly night: string;
  readonly title: string;
  readonly location: Location;
  readonly damageThreshold: number;
  readonly lowerBound: number;
}

/** L'erreur d'un modèle sur les 60 dernières nuits (`fiabilite_modeles`). */
export interface LongScore {
  readonly source: string;
  readonly model: string;
  readonly rmse: number;
}

export interface WeekData {
  /** Les nuits de la semaine, dans l'ordre. */
  readonly nights: readonly WeekNight[];
  readonly models: readonly WeekModelMinimum[];
  readonly alerts: readonly WeekAlert[];
  readonly scores: readonly LongScore[];
}

const NAMES: Record<string, string> = {
  "met-norway/locationforecast": "MET Norway",
  "open-meteo/ecmwf_ifs": "ECMWF",
  "open-meteo/gfs_seamless": "GFS",
  "open-meteo/icon_d2": "ICON-D2",
  "open-meteo/icon_eu": "ICON-EU",
  "open-meteo/meteofrance_arome_france_hd": "AROME",
  "open-meteo/meteofrance_arpege_europe": "ARPÈGE",
};

/** Le nom d'usage d'un modèle ; son identifiant s'il n'en a pas. */
export function modelName(source: string, model: string): string {
  const key = `${source}/${model}`;

  return NAMES[key] ?? key;
}

const NIGHT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const at = (night: string) => new Date(`${night}T12:00:00Z`);

/** « +1,1 °C », « −0,4 °C » : un écart, toujours signé. */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10 + 0;

  return rounded > 0 ? `+${celsius(rounded)}` : celsius(rounded);
}

const round1 = (value: number) => Math.round(value * 10) / 10 + 0;

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Un écart mesuré, et la nuit où il s'est produit. */
interface Gap {
  readonly night: string;
  readonly gap: number;
}

const short = (night: string) => NIGHT.format(at(night));

/** « au pire 1,1 °C plus froide qu'estimé (sam. 7 nov.) », ou jamais. */
function worstCold(gaps: readonly Gap[], what: string): string {
  const worst = gaps.reduce((a, b) => (b.gap < a.gap ? b : a));

  return worst.gap < 0
    ? `au pire ${celsius(-worst.gap)} plus ${what} (${short(worst.night)})`
    : `jamais plus ${what}`;
}

function verandaGaps(nights: readonly WeekNight[]): Gap[] {
  return nights.flatMap(n =>
    n.heated || n.estimate === null || n.minVeranda === null
      ? []
      : [{ night: n.night, gap: n.minVeranda - n.estimate }],
  );
}

function boundGaps(nights: readonly WeekNight[]): Gap[] {
  return nights.flatMap(n =>
    n.heated || n.lowerBound === null || n.minVeranda === null
      ? []
      : [{ night: n.night, gap: n.minVeranda - n.lowerBound }],
  );
}

function forecastGaps(nights: readonly WeekNight[]): Gap[] {
  return nights.flatMap(n =>
    n.forecastMinimum === null || n.minExterior === null
      ? []
      : [{ night: n.night, gap: n.minExterior - n.forecastMinimum }],
  );
}

/** Ce que la semaine dit de la cible du foyer, sur le pire cas de la véranda. */
function targetLine(gaps: readonly Gap[]): string {
  const low = Math.min(...gaps.map(g => g.gap));
  const high = Math.max(...gaps.map(g => g.gap));
  const range = `le réel a fini entre ${signed(low)} et ${signed(high)} du pire cas`;
  const below = gaps.filter(g => g.gap < -MARGIN_PROPOSAL.tolerance);
  const above = gaps.filter(g => g.gap > WEEK_TARGET_ABOVE);

  if (below.length > 0) {
    return `${range} : cible MANQUÉE, plus de ${celsius(MARGIN_PROPOSAL.tolerance)} dessous (${below.map(g => short(g.night)).join(", ")}).`;
  }

  if (above.length > 0) {
    return `${range} : sûr, mais trop large ${above.length} nuit${above.length > 1 ? "s" : ""} sur ${gaps.length} (plus de ${celsius(WEEK_TARGET_ABOVE)} au-dessus).`;
  }

  return `${range} : cible tenue.`;
}

function measuredAt(night: WeekNight | undefined, location: Location) {
  return location === "Véranda" ? night?.minVeranda : night?.minExterior;
}

/** Une alerte, jugée sur ce qui s'est passé. */
function alertVerdict(alert: WeekAlert, night: WeekNight | undefined): string {
  const head = `${alert.title} : pire cas ${celsius(alert.lowerBound)}, seuil ${celsius(alert.damageThreshold)}`;

  if (alert.location === "Véranda" && night?.heated) {
    return `${head} ; véranda chauffée, impossible de juger.`;
  }

  const measured = measuredAt(night, alert.location);

  if (measured === null || measured === undefined) {
    return `${head} ; pas de minimum mesuré.`;
  }

  return measured <= alert.damageThreshold
    ? `${head} ; ${celsius(measured)} mesuré : alerte justifiée.`
    : `${head} ; ${celsius(measured)} mesuré : alerte de trop.`;
}

function alertsLine(data: WeekData): string {
  if (data.alerts.length === 0) {
    return "Alertes : aucune.";
  }

  const justified = data.alerts.filter(alert => {
    const night = data.nights.find(n => n.night === alert.night);
    const measured = measuredAt(night, alert.location);

    return (
      measured !== null &&
      measured !== undefined &&
      measured <= alert.damageThreshold
    );
  }).length;

  return `Alertes : ${data.alerts.length} plante${data.alerts.length > 1 ? "s" : ""} en alerte, ${justified} justifiée${justified > 1 ? "s" : ""}.`;
}

interface ModelWeek {
  readonly name: string;
  readonly mean: number;
  readonly worst: number;
  readonly nights: number;
  readonly rmse: number | null;
}

/** Chaque modèle sur la semaine : écart moyen absolu, et son pire écart. */
function modelWeeks(data: WeekData): ModelWeek[] {
  const byModel = new Map<
    string,
    { source: string; model: string; gaps: number[] }
  >();

  for (const entry of data.models) {
    const measured = data.nights.find(
      n => n.night === entry.night,
    )?.minExterior;

    if (measured === null || measured === undefined) {
      continue;
    }

    const key = `${entry.source}/${entry.model}`;
    const found = byModel.get(key) ?? {
      source: entry.source,
      model: entry.model,
      gaps: [],
    };
    found.gaps.push(measured - entry.minimum);
    byModel.set(key, found);
  }

  return [...byModel.values()]
    .map(({ source, model, gaps }) => ({
      name: modelName(source, model),
      mean: mean(gaps.map(Math.abs)),
      worst: Math.min(...gaps),
      nights: gaps.length,
      rmse:
        data.scores.find(s => s.source === source && s.model === model)?.rmse ??
        null,
    }))
    .sort((a, b) => a.mean - b.mean || a.name.localeCompare(b.name, "fr"));
}

function summary(data: WeekData): string[] {
  const lines = ["En bref"];
  const veranda = verandaGaps(data.nights);
  const bounds = boundGaps(data.nights);
  const forecast = forecastGaps(data.nights);

  if (veranda.length > 0) {
    lines.push(
      `- Véranda : l'estimation de 20 h s'est trompée de ${celsius(round1(mean(veranda.map(g => Math.abs(g.gap)))))} en moyenne, ${worstCold(veranda, "froide qu'estimé")}.`,
    );
  } else {
    lines.push(
      "- Véranda : aucune nuit à juger (relevés manquants ou chauffée).",
    );
  }

  if (bounds.length > 0) {
    lines.push(`- Pire cas : ${targetLine(bounds)}`);
  }

  if (forecast.length > 0) {
    lines.push(
      `- Prévision retenue (moyenne des modèles) : ${celsius(round1(mean(forecast.map(g => Math.abs(g.gap)))))} d'écart moyen, ${worstCold(forecast, "froid qu'annoncé")}.`,
    );
  }

  const models = modelWeeks(data);
  const best = models[0];
  const worst = models.at(-1);

  if (best !== undefined && worst !== undefined && models.length > 1) {
    lines.push(
      `- Modèles : le plus juste ${best.name} (${celsius(round1(best.mean))}), le moins juste ${worst.name} (${celsius(round1(worst.mean))}).`,
    );
  }

  lines.push(`- ${alertsLine(data)}`);

  return lines;
}

function nightBlock(night: WeekNight, data: WeekData): string[] {
  const lines = [NIGHT.format(at(night.night))];

  if (night.forecastMinimum === null) {
    lines.push("  Pas de prévision ce soir-là.");
  } else {
    const measured =
      night.minExterior === null
        ? "pas encore mesuré"
        : `mesuré ${celsius(night.minExterior)} (${signed(night.minExterior - night.forecastMinimum)})`;
    lines.push(
      `  Dehors : annoncé ${celsius(night.forecastMinimum)}, ${measured}.`,
    );
  }

  if (night.estimate === null || night.lowerBound === null) {
    lines.push("  Véranda : pas d'estimation (relevé de 20 h manquant).");
  } else if (night.heated) {
    lines.push(
      `  Véranda : estimé ${celsius(night.estimate)}, pire cas ${celsius(night.lowerBound)} ; chauffée, hors bilan.`,
    );
  } else {
    const measured =
      night.minVeranda === null
        ? "pas encore mesuré"
        : `mesuré ${celsius(night.minVeranda)} (${signed(night.minVeranda - night.estimate)} sur l'estimation, ${signed(night.minVeranda - night.lowerBound)} sur le pire cas)`;
    lines.push(
      `  Véranda : estimé ${celsius(night.estimate)}, pire cas ${celsius(night.lowerBound)}, ${measured}.`,
    );
  }

  const models = data.models
    .filter(entry => entry.night === night.night)
    .map(entry => ({ name: modelName(entry.source, entry.model), entry }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map(({ name, entry }) =>
      night.minExterior === null
        ? `${name} ${celsius(entry.minimum)}`
        : `${name} ${celsius(entry.minimum)} (${signed(night.minExterior - entry.minimum)})`,
    );

  if (models.length > 0) {
    lines.push(`  Modèles : ${models.join(" · ")}`);
  }

  for (const alert of data.alerts.filter(a => a.night === night.night)) {
    lines.push(`  Alerte, ${alertVerdict(alert, night)}`);
  }

  return lines;
}

function modelsSection(data: WeekData): string[] {
  const models = modelWeeks(data);

  if (models.length === 0) {
    return [];
  }

  return [
    "",
    "Modèles météo, du plus juste au moins juste cette semaine",
    ...models.map(m => {
      const long = m.rmse === null ? "" : ` ; ${celsius(m.rmse)} sur 60 nuits`;

      return `- ${m.name} : ${celsius(round1(m.mean))} d'écart moyen sur ${m.nights} nuit${m.nights > 1 ? "s" : ""}, pire ${signed(m.worst)}${long}.`;
    }),
  ];
}

/** Le mail du dimanche, ou `null` si la semaine n'a aucune nuit au journal. */
export function weeklyReviewMail(data: WeekData): Mail | null {
  const first = data.nights[0];
  const last = data.nights.at(-1);

  if (first === undefined || last === undefined) {
    return null;
  }

  const period = `du ${DAY.format(at(first.night))} au ${DAY.format(at(last.night))}`;

  return {
    subject: `Veille gel : bilan des nuits ${period}`,
    text: [
      `Bilan des nuits ${period} : ce qu'on attendait à 20 h, et ce qui s'est passé.`,
      `Cible : le minimum réel de la véranda finit au plus ${celsius(MARGIN_PROPOSAL.tolerance)} sous le pire cas, et au plus ${celsius(WEEK_TARGET_ABOVE)} au-dessus.`,
      "Écarts : mesuré moins attendu ; négatif, la nuit a été plus froide qu'attendu.",
      "",
      ...summary(data),
      "",
      "Nuit par nuit",
      ...data.nights.flatMap(night => nightBlock(night, data)),
      ...modelsSection(data),
    ].join("\n"),
  };
}
