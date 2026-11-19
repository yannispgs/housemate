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

/** Les consommables des repères, chacun une fois, dans l'ordre alphabétique. */
export function consommablesDesReperes(
  reperes: readonly RepereCarnet[],
): string[] {
  return [...new Set(reperes.flatMap(r => r.libelles))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

/** Un couloir du graphique du kilométrage : un consommable et ses changements. */
export interface Couloir {
  readonly consommable: string;
  /** Les index, dans les repères, des interventions où il a été changé. */
  readonly indices: readonly number[];
  /** Le compteur du dernier changement. */
  readonly dernier: number;
  /** Les kilomètres entre deux changements, en moyenne ; null s'il n'y en a qu'un. */
  readonly intervalleMoyen: number | null;
}

/**
 * Un couloir par consommable (décision du foyer, 19/11/2026) : sous la
 * courbe, chaque consommable a sa ligne, reconnue à sa place et non à une
 * couleur, ce qui tient quel que soit leur nombre.
 */
export function couloirsDuCarnet(reperes: readonly RepereCarnet[]): Couloir[] {
  return consommablesDesReperes(reperes).map(consommable => {
    const changes = reperes.flatMap((r, index) =>
      r.libelles.includes(consommable) ? [{ index, compteur: r.compteur }] : [],
    );
    const compteurs = changes.map(c => c.compteur);
    const dernier = Math.max(...compteurs);
    const premier = Math.min(...compteurs);

    return {
      consommable,
      indices: changes.map(c => c.index),
      dernier,
      intervalleMoyen:
        changes.length > 1
          ? Math.round((dernier - premier) / (changes.length - 1))
          : null,
    };
  });
}
