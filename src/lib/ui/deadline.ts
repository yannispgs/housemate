/**
 * Ce qu'un écran montre d'une échéance, et comment une carte d'accueil
 * l'habille (handoff de design, § « Règles métier » et composant
 * `CarteEcheance`). Données d'affichage seulement : le calcul des dates et de
 * l'importance effective appartient au domaine.
 */

/** Les quatre niveaux, du plus au moins pressant (ordre de tri du handoff). */
export const IMPORTANCES = [
  "critique",
  "important",
  "normal",
  "memoire",
] as const;

export type Importance = (typeof IMPORTANCES)[number];

/** Ferme : la date ne glisse pas. Souple : elle peut glisser. */
export type Tenure = "ferme" | "souple";

export const IMPORTANCE_LABELS: Readonly<Record<Importance, string>> = {
  critique: "Critique",
  important: "Important",
  normal: "Normal",
  memoire: "Pour mémoire",
};

/**
 * La teinte du statut, portée par la puce de la ligne d'état et la jauge de
 * fenêtre. Distincte de l'importance : une garantie « pour mémoire » peut
 * avoir un statut d'avertissement.
 */
export type StatusTone = "critical" | "serious" | "warning" | "neutral";

export type CategoryIcon =
  | "frost"
  | "warranty"
  | "vehicle"
  | "fertiliser"
  | "pruning";

export interface HistoryEntry {
  readonly date: string;
  readonly text: string;
}

/** Une plante d'une échéance regroupée (tailles d'automne). */
export interface GroupedPlant {
  readonly id: string;
  readonly name: string;
  /** Consigne de coupe, courte. */
  readonly instruction: string;
  /** Lien du guide de coupe : un attribut de la plante, facultatif. */
  readonly guideUrl: string;
  /** Date de réalisation affichée, si elle est faite. */
  readonly doneOn: string | null;
}

/** La fourchette de température d'une alerte de gel. */
export interface FrostRange {
  /** Borne basse, sur laquelle se prend la décision. */
  readonly lowerBound: number;
  readonly estimate: number;
  readonly margin: number;
  readonly damageThreshold: number;
  readonly deathThreshold: number;
  readonly explanation: string;
}

export interface DeadlineView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** « due », « en préavis », « en tolérance ». */
  readonly state: string;
  /** « ce soir », « dans 19 jours ». */
  readonly when: string;
  readonly category: string;
  readonly recipient: string;
  /** Libellé du bouton principal : « Fait », « Rendez-vous pris »… */
  readonly verb: string;
  /** Comment l'échéance prévient : « notifiée », « récap seulement »… */
  readonly note: string;
  /** Importance EFFECTIVE (après montée des échéances fermes). */
  readonly importance: Importance;
  /** Vrai quand l'importance effective dépasse l'importance de base. */
  readonly raised: boolean;
  readonly tenure: Tenure;
  readonly tone: StatusTone;
  readonly icon: CategoryIcon;
  /** Fenêtre (tâche étalée sur une période) : avancement et libellé. */
  readonly window: { readonly percent: number; readonly text: string } | null;
  readonly frostRange: FrostRange | null;
  /** Une garantie ne se reporte pas ; une échéance regroupée non plus. */
  readonly canPostpone: boolean;
  readonly history: readonly HistoryEntry[];
  /** Échéance regroupée : les plantes, cochées une à une. */
  readonly plants: readonly GroupedPlant[] | null;
}

export const TONE_INK: Readonly<Record<StatusTone, string>> = {
  critical: "var(--ink-critical)",
  serious: "var(--ink-serious)",
  warning: "var(--ink-warning)",
  neutral: "var(--ink-secondary)",
};

export interface CardFrame {
  readonly color: string;
  readonly width: string;
  /** Une échéance critique renforce sa ligne d'état. */
  readonly emphasised: boolean;
}

/**
 * Le contour d'une carte d'accueil : il dit l'importance sans rien écrire.
 * Critique : 2 px rouge ; important : 1,5 px orange ; le reste : le filet
 * ordinaire.
 */
export function cardFrame(importance: Importance): CardFrame {
  if (importance === "critique") {
    return { color: "var(--ink-critical)", width: "2px", emphasised: true };
  }

  if (importance === "important") {
    return { color: "var(--ink-serious)", width: "1.5px", emphasised: false };
  }

  return { color: "var(--border)", width: "1px", emphasised: false };
}

/** « 1 sur 3 faites », pour une échéance regroupée. */
export function plantsProgress(plants: readonly GroupedPlant[]): string {
  const done = plants.filter(plant => plant.doneOn !== null).length;

  return `${done} sur ${plants.length} faites`;
}

/** « 1 chose faite aujourd'hui », « 3 choses faites aujourd'hui ». */
export function doneTodayText(count: number): string {
  return count === 1
    ? "1 chose faite aujourd'hui"
    : `${count} choses faites aujourd'hui`;
}

const DECIMAL = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « −3,5 » : virgule française et vrai signe moins. */
export function formatTemperature(value: number): string {
  return DECIMAL.format(value).replace("-", "−");
}

export interface FrostScale {
  /** Positions en pourcentage de la largeur de la frise. */
  readonly death: number;
  readonly damage: number;
  readonly estimate: number;
  readonly lowerBound: number;
  readonly upperBound: number;
}

/**
 * Où placer chaque repère sur la frise. L'échelle court de deux degrés sous
 * le seuil de mort à trois au-dessus du seuil de dégâts : avec les seuils du
 * citronnier (−5 et 0 °C), c'est exactement la frise de la maquette, 10 % par
 * degré. Une borne hors de l'échelle est ramenée au bord.
 */
export function frostScale(range: FrostRange): FrostScale {
  const low = range.deathThreshold - 2;
  const high = range.damageThreshold + 3;
  const at = (value: number) =>
    Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));

  return {
    death: at(range.deathThreshold),
    damage: at(range.damageThreshold),
    estimate: at(range.estimate),
    lowerBound: at(range.estimate - range.margin),
    upperBound: at(range.estimate + range.margin),
  };
}
