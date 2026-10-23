/**
 * Le carnet d'entretien d'une fiche (SPEC § 5.3, décisions du 23/10/2026) :
 * ce qui a été fait, du plus récent au plus ancien. Lecture seule pour
 * l'instant : un remplacement de consommable ou une échéance faite forment
 * chacun une entrée d'une ligne ; les interventions groupées viendront avec
 * leur saisie.
 */

export interface EntreeCarnet {
  /** Un consommable remplacé, ou une échéance liée faite. */
  readonly genre: "remplacement" | "echeance";
  readonly libelle: string;
  /** AAAA-MM-JJ : la date réelle du geste. */
  readonly le: string;
  /** Le compteur ce jour-là, s'il a été noté. */
  readonly compteur: number | null;
}

export interface Carnet {
  /** Vrai si la fiche a un entretien : un plan, ou des échéances liées. */
  readonly entretien: boolean;
  readonly entrees: readonly EntreeCarnet[];
}

/** Les entrées montrées d'emblée ; « Tout voir » montre les autres. */
export const ENTREES_VISIBLES = 5;

const DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const NOMBRE = new Intl.NumberFormat("fr-FR");

/** « 3 mars 2026 · 45 000 km », ou la date seule sans compteur. */
export function enteteEntree({
  le,
  compteur,
}: Pick<EntreeCarnet, "le" | "compteur">): string {
  const date = DATE.format(new Date(`${le}T00:00:00Z`));

  return compteur === null ? date : `${date} · ${NOMBRE.format(compteur)} km`;
}

/** L'ancre d'une date du carnet, pour y mener depuis le graphique. */
export function ancreCarnet(le: string): string {
  return `carnet-${le}`;
}

export interface RepereCarnet {
  readonly le: string;
  readonly compteur: number;
  readonly libelles: readonly string[];
}

/**
 * Les repères du graphique du kilométrage : les entrées notées avec un
 * compteur, regroupées par jour et par compteur (ce qui a été fait ensemble).
 */
export function reperesDuCarnet(
  entrees: readonly EntreeCarnet[],
): RepereCarnet[] {
  const groupes = new Map<string, RepereCarnet>();

  for (const { le, compteur, libelle } of entrees) {
    if (compteur !== null) {
      const cle = `${le} ${compteur}`;
      const groupe = groupes.get(cle);
      groupes.set(cle, {
        le,
        compteur,
        libelles: [...(groupe?.libelles ?? []), libelle],
      });
    }
  }

  return [...groupes.values()];
}
