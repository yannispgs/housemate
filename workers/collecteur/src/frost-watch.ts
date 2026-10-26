/**
 * Veille de gel par plante et par emplacement (SPEC § 12.8, décisions du
 * 25/10/2026) : ce qui se décide autour du calcul pur de
 * `src/lib/domain/frost.ts` — quelle prévision retenir, quel niveau pour
 * chaque plante, quel message envoyer, et avec quels mots. Aucune
 * entrée-sortie ici.
 */
import {
  type Extrapolation,
  type FrostLevel,
  frostLevel,
} from "../../../src/lib/domain/frost";

/**
 * Les réglages du démarrage. Chacun est une décision, pas une mesure — la
 * mesure viendra du journal du soir (`meteo.nuits_gel`). Les seuils, eux,
 * viennent des fiches des plantes (§ 12.2).
 */
export const FROST_WATCH = {
  // La marge de prévision n'est pas ici : mesurée puis validée, elle se lit en
  // base (`meteo.marges_prevision`), `DEFAULT_FORECAST_MARGIN` à défaut.
  veranda: {
    /**
     * Marge radiative, gardée entière au démarrage bien qu'elle soit faible
     * sous verre (SPEC § 12.2) : c'est un des premiers réglages à resserrer.
     */
    radiativeMargin: 3,
  },
  exterior: {
    radiativeMargin: 3,
    /** Pour toutes les plantes dehors, en pot comme en terre. */
    groundMargin: 1.5,
  },
  /**
   * Sans relevé du soir, la véranda ne s'estime pas. On le dit quand même si
   * la nuit annoncée passe à moins de 5 °C au-dessus du seuil d'une de ses
   * plantes : un silence ne vaut pas « pas de gel ».
   */
  undecidedWithin: 5,
} as const;

export interface ModelMinimum {
  readonly source: string;
  readonly model: string;
  readonly minimum: number;
}

/** La note d'un modèle : son erreur sur les nuits passées (`fiabilite_modeles`). */
export interface ModelScore {
  readonly source: string;
  readonly model: string;
  readonly nights: number;
  readonly rmse: number;
}

/**
 * Les règles de la moyenne (SPEC § 12.8, décision du 29/09/2026). Chaque
 * modèle pèse l'inverse du carré de son erreur : deux fois plus précis, quatre
 * fois plus lourd.
 */
export const FORECAST_BLEND = {
  /** En deçà, un modèle n'est pas encore noté. */
  minNights: 5,
  /**
   * Plancher de l'erreur : aucun modèle n'est plus juste que le capteur qui le
   * juge (relevé horaire, minimum à l'heure près). Sans plancher, un modèle
   * chanceux sur quelques nuits écraserait tous les autres.
   */
  rmseFloor: 0.3,
  /** Au-delà de ce multiple de l'erreur du meilleur, un modèle est écarté. */
  excludeAbove: 2,
} as const;

export interface WeightedModel extends ModelMinimum {
  /** Part dans la moyenne, de 0 (écarté) à 1. */
  readonly weight: number;
}

export interface BlendedForecast {
  readonly minimum: number;
  /** Comment la moyenne a été faite, en clair : elle figure dans les mails. */
  readonly method: string;
  readonly models: readonly WeightedModel[];
}

const key = (entry: { source: string; model: string }) =>
  `${entry.source}/${entry.model}`;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    /* c8 ignore next -- repli inatteignable : `middle` est un indice valide. */
    return sorted[middle] ?? 0;
  }

  /* c8 ignore next -- replis inatteignables : deux indices valides. */
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Les poids bruts : 1 pour tous tant que rien n'est noté. */
function rawWeights(
  minima: readonly ModelMinimum[],
  scores: readonly ModelScore[],
): number[] {
  const rmse = new Map<string, number>();

  for (const score of scores) {
    if (score.nights >= FORECAST_BLEND.minNights) {
      rmse.set(key(score), Math.max(score.rmse, FORECAST_BLEND.rmseFloor));
    }
  }

  const known = minima.flatMap(entry => {
    const error = rmse.get(key(entry));

    return error === undefined ? [] : [error];
  });

  if (known.length === 0) {
    return minima.map(() => 1);
  }

  const best = Math.min(...known);
  const weightOf = (error: number) =>
    error > best * FORECAST_BLEND.excludeAbove ? 0 : 1 / error ** 2;
  // Un modèle arrivé récemment, pas encore noté, pèse comme un modèle moyen.
  const unscored = median(known.map(weightOf).filter(weight => weight > 0));

  return minima.map(entry => {
    const error = rmse.get(key(entry));

    return error === undefined ? unscored : weightOf(error);
  });
}

/**
 * Le minimum extérieur retenu pour la nuit : la moyenne des modèles, pondérée
 * par leur fiabilité, les moins fiables écartés.
 */
export function blendForecasts(
  minima: readonly ModelMinimum[],
  scores: readonly ModelScore[],
): BlendedForecast | null {
  if (minima.length === 0) {
    return null;
  }

  const raw = rawWeights(minima, scores);
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  const models = minima.map((entry, index) => ({
    ...entry,
    /* c8 ignore next -- repli inatteignable : un poids par modèle. */
    weight: (raw[index] ?? 0) / total,
  }));
  const minimum = models.reduce(
    (sum, entry) => sum + entry.weight * entry.minimum,
    0,
  );
  const kept = models.filter(entry => entry.weight > 0).length;
  const scored = minima.some(entry =>
    scores.some(
      score =>
        key(score) === key(entry) && score.nights >= FORECAST_BLEND.minNights,
    ),
  );

  return {
    minimum: Math.round(minimum * 10) / 10 + 0,
    method: scored
      ? `moyenne de ${kept} modèles sur ${models.length}, pondérée par leur fiabilité`
      : `moyenne simple de ${models.length} modèles, pas encore notés`,
    models,
  };
}

export type FrostMessage = "alerte" | "rappel" | "indisponible";

export type Location = "Extérieur" | "Véranda";

/** Une plante suivie, telle que sa fiche la décrit ce soir. */
export interface WatchedPlant {
  readonly id: string;
  readonly title: string;
  readonly location: Location;
  /** Vide : pas suivie, faute de seuil. Le mail le dit. */
  readonly damageThreshold: number | null;
  readonly deathThreshold: number | null;
  /** Fiche privée : le membre à qui son alerte est réservée ; sinon `null`. */
  readonly reservedTo: string | null;
}

export type PlantLevel = FrostLevel | "indisponible";

/** Ce que la nuit réserve à une plante. */
export interface PlantNight extends WatchedPlant {
  /** Minimum attendu à son emplacement ; vide s'il ne s'estime pas. */
  readonly estimate: number | null;
  readonly lowerBound: number | null;
  readonly level: PlantLevel | null;
}

/** Le minimum attendu à un emplacement, et le pire cas retenu. */
export interface LocationEstimate {
  readonly estimate: number;
  readonly lowerBound: number;
}

export interface NightEstimates {
  readonly forecastMinimum: number;
  readonly exterior: LocationEstimate;
  /** Vide quand un relevé de 20 h manque. */
  readonly veranda: LocationEstimate | null;
}

/** Une passe par plante, avec l'estimation de son emplacement. */
export function assessPlants(
  plants: readonly WatchedPlant[],
  night: NightEstimates,
): PlantNight[] {
  return plants.map(plant => {
    const here = plant.location === "Véranda" ? night.veranda : night.exterior;
    const threshold = plant.damageThreshold;
    const assessed = {
      ...plant,
      estimate: here?.estimate ?? null,
      lowerBound: here?.lowerBound ?? null,
    };

    if (threshold === null) {
      return { ...assessed, level: null };
    }

    if (here === null) {
      const possible =
        night.forecastMinimum <= threshold + FROST_WATCH.undecidedWithin;

      return { ...assessed, level: possible ? "indisponible" : null };
    }

    return { ...assessed, level: frostLevel(here.lowerBound, threshold) };
  });
}

/**
 * Le message de la nuit : une alerte pleine ouvre l'épisode, puis un rappel
 * léger chaque soir tant qu'il dure (SPEC § 12.8 b) — la décision de protéger
 * se reprend tous les soirs, mais cinq alertes pleines d'affilée finissent
 * ignorées. La vigilance seule ne fait pas partir de mail.
 */
export function nightMessage(
  plants: readonly PlantNight[],
  previousNightAlerted: boolean,
): FrostMessage | null {
  if (plants.some(plant => plant.level === "alerte")) {
    return previousNightAlerted ? "rappel" : "alerte";
  }

  return plants.some(plant => plant.level === "indisponible")
    ? "indisponible"
    : null;
}

const CELSIUS = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** « −2,5 °C », avec un vrai signe moins. */
export function celsius(value: number): string {
  return `${CELSIUS.format(value).replace("-", "−")} °C`;
}

/** Ce qu'un mail dit de la prévision retenue. */
export interface ForecastSummary {
  readonly minimum: number;
  readonly method: string;
}

/** Ce que le journal sait de la nuit, en dehors des plantes. */
export interface NightFacts {
  readonly forecast: ForecastSummary;
  /** La prédiction de la véranda et ses relevés ; vide s'il en manque un. */
  readonly veranda: {
    readonly estimate: number;
    readonly extrapolation: Extrapolation;
    readonly verandaAt20h: number;
    readonly exteriorAt20h: number;
  } | null;
  /** Les relevés de 20 h qui manquent, en clair. */
  readonly missing: readonly string[];
}

export interface Mail {
  readonly subject: string;
  readonly text: string;
}

function list(titles: readonly string[]): string {
  if (titles.length <= 1) {
    return titles.join("");
  }

  return `${titles.slice(0, -1).join(", ")} et ${titles.at(-1)}`;
}

/** « 1,2 °C sous son seuil de dégâts (0,0 °C) », ou au-dessus. */
function gap(lowerBound: number, threshold: number): string {
  const seuil = `son seuil de dégâts (${celsius(threshold)})`;

  if (lowerBound === threshold) {
    return `au niveau de ${seuil}`;
  }

  const by = celsius(Math.abs(lowerBound - threshold));

  return lowerBound < threshold
    ? `${by} sous ${seuil}`
    : `${by} au-dessus de ${seuil}`;
}

function death(plant: PlantNight, lowerBound: number): string {
  if (plant.deathThreshold === null) {
    return "";
  }

  return lowerBound <= plant.deathThreshold
    ? ` ; sous son seuil de mort (${celsius(plant.deathThreshold)})`
    : ` ; mort à ${celsius(plant.deathThreshold)}`;
}

function plantLine(plant: PlantNight): string {
  const { lowerBound, damageThreshold } = plant;

  /* c8 ignore next 3 -- une plante sans seuil n'a pas de niveau, donc pas de ligne. */
  if (damageThreshold === null) {
    return `- ${plant.title}`;
  }

  if (lowerBound === null) {
    return `- ${plant.title} (seuil de dégâts ${celsius(damageThreshold)})`;
  }

  const watch = plant.level === "vigilance" ? " (à surveiller)" : "";

  return `- ${plant.title}${watch} : pire cas ${celsius(lowerBound)}, ${gap(lowerBound, damageThreshold)}${death(plant, lowerBound)}.`;
}

const PLACES = {
  Véranda: { name: "Véranda", act: "chauffer" },
  Extérieur: { name: "Dehors", act: "protéger" },
} as const;

function locationSection(
  location: Location,
  plants: readonly PlantNight[],
  facts: NightFacts,
): string[] {
  const here = plants.filter(
    plant => plant.location === location && plant.level !== null,
  );

  if (here.length === 0) {
    return [];
  }

  const place = PLACES[location];
  const undecided = here.some(plant => plant.level === "indisponible");
  let heading = `${place.name} : à surveiller`;

  if (undecided) {
    heading = `${place.name} : impossible d'estimer`;
  } else if (here.some(plant => plant.level === "alerte")) {
    heading = `${place.name} : ${place.act}`;
  }

  const lines = [heading];

  if (undecided) {
    lines.push(
      `Il manque ${list(facts.missing)} : impossible d'estimer le minimum de la véranda. La vérifier avant la nuit.`,
    );
  } else if (location === "Véranda" && facts.veranda !== null) {
    lines.push(
      `Minimum attendu : ${celsius(facts.veranda.estimate)}. Relevés de 20 h : véranda ${celsius(facts.veranda.verandaAt20h)}, extérieur ${celsius(facts.veranda.exteriorAt20h)}.`,
    );
  } else {
    lines.push(
      `Minimum annoncé : ${celsius(facts.forecast.minimum)}, et jusqu'à ${celsius(FROST_WATCH.exterior.groundMargin)} de moins au ras du sol.`,
    );
  }

  lines.push(...here.map(plantLine));

  if (location === "Véranda" && facts.veranda?.extrapolation === "low") {
    lines.push(
      "Le modèle de la véranda n'a encore jamais vu de gel : sa marge est doublée ce soir.",
    );
  }

  return ["", ...lines];
}

const INTRO: Record<FrostMessage, string> = {
  alerte: "Il peut geler cette nuit. Protéger ce soir :",
  rappel: "L'épisode froid continue. Protéger encore ce soir :",
  indisponible: "La veille de gel n'a pas pu tout estimer ce soir.",
};

function subjectFor(kind: FrostMessage, alerted: readonly string[]): string {
  if (kind === "indisponible") {
    return "Veille de gel impossible ce soir";
  }

  return kind === "alerte"
    ? `Gel possible cette nuit : ${list(alerted)}`
    : `Gel encore cette nuit : ${list(alerted)}`;
}

/**
 * Le mail de la nuit, groupé : une section par emplacement, les plantes en
 * alerte et celles à surveiller, et celles qu'on ne suit pas faute de seuil.
 */
export function frostMail(
  kind: FrostMessage,
  facts: NightFacts,
  plants: readonly PlantNight[],
): Mail {
  const alerted = plants
    .filter(plant => plant.level === "alerte")
    .map(plant => plant.title);
  const untracked = plants
    .filter(plant => plant.damageThreshold === null)
    .map(plant => plant.title);
  const intro =
    kind === "indisponible" ? INTRO[kind] : `${INTRO[kind]} ${list(alerted)}.`;

  return {
    subject: subjectFor(kind, alerted),
    text: [
      intro,
      ...locationSection("Véranda", plants, facts),
      ...locationSection("Extérieur", plants, facts),
      "",
      `Dehors, la nuit descendra à ${celsius(facts.forecast.minimum)} (${facts.forecast.method}).`,
      ...(untracked.length > 0
        ? [
            `Pas suivies, faute de seuil de dégâts sur leur fiche : ${list(untracked)}.`,
          ]
        : []),
      ...(kind === "alerte"
        ? ["", "Tant que l'épisode dure, un rappel court arrivera chaque soir."]
        : []),
    ].join("\n"),
  };
}

/** Le mail court qui annonce une marge à valider (décision du 26/10/2026). */
export function marginMail(
  current: number,
  proposed: number,
  stats: { readonly nights: number; readonly error: number },
): Mail {
  return {
    subject: "Veille gel : une nouvelle marge de prévision à valider",
    text: [
      `Sur les ${stats.nights} dernières nuits froides, la prévision s'est trompée de ${celsius(stats.error)} en moyenne quadratique.`,
      `La veille propose de passer sa marge de prévision de ${celsius(current)} à ${celsius(proposed)}.`,
      "",
      "Rien ne change sans validation : Réglages, section « Veille gel ».",
    ].join("\n"),
  };
}
