/**
 * Le carnet d'entretien d'une fiche (SPEC § 5.3, décisions du 23/10/2026) :
 * ce qui a été fait, du plus récent au plus ancien. Une intervention
 * regroupe ce qui a été fait le même jour, au même compteur, avec son coût ;
 * un remplacement ou une échéance faite saisis seuls forment une entrée
 * d'une ligne.
 */

export interface EntreeCarnet {
  /** Un consommable remplacé, une échéance liée faite, ou une ligne libre. */
  readonly genre: "remplacement" | "echeance" | "libre";
  readonly libelle: string;
  /** AAAA-MM-JJ : la date réelle du geste. */
  readonly le: string;
  /** Le compteur ce jour-là, s'il a été noté. */
  readonly compteur: number | null;
  /** L'intervention qui la regroupe ; `null` : saisie seule. */
  readonly intervention: string | null;
  /** Le coût de son intervention, en euros. */
  readonly cout: number | null;
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

const EUROS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const EUROS_RONDS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** « 320 € », « 89,90 € » : les centimes seulement s'il y en a. */
export function euros(montant: number): string {
  return (Number.isInteger(montant) ? EUROS_RONDS : EUROS).format(montant);
}

/**
 * « 3 mars 2026 · 45 000 km · 320 € » : la date, puis le compteur et le coût
 * s'ils sont connus.
 */
export function enteteEntree({
  le,
  compteur,
  cout = null,
}: Pick<EntreeCarnet, "le" | "compteur"> & {
  readonly cout?: number | null;
}): string {
  return [
    DATE.format(new Date(`${le}T00:00:00Z`)),
    compteur === null ? null : `${NOMBRE.format(compteur)} km`,
    cout === null ? null : euros(cout),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Une entrée du carnet : une intervention, ou une ligne saisie seule. */
export interface InterventionCarnet {
  readonly cle: string;
  readonly le: string;
  readonly compteur: number | null;
  readonly cout: number | null;
  readonly lignes: readonly Pick<EntreeCarnet, "genre" | "libelle">[];
}

/**
 * Le carnet par intervention (§ 5.3) : les lignes d'une même intervention
 * ensemble, à la place de la première ; une ligne saisie seule reste seule.
 */
export function interventionsDuCarnet(
  entrees: readonly EntreeCarnet[],
): InterventionCarnet[] {
  const groupes = new Map<string, InterventionCarnet>();

  entrees.forEach((entree, index) => {
    const cle = entree.intervention ?? `seule-${index}`;
    const groupe = groupes.get(cle);

    groupes.set(cle, {
      cle,
      le: entree.le,
      compteur: entree.compteur,
      cout: entree.cout,
      lignes: [
        ...(groupe?.lignes ?? []),
        { genre: entree.genre, libelle: entree.libelle },
      ],
    });
  });

  return [...groupes.values()];
}

/**
 * En tête du carnet (§ 5.3) : le total de l'année en cours et de l'année
 * précédente. Vide tant qu'aucune intervention n'a de coût.
 */
export function depensesDuCarnet(
  interventions: readonly InterventionCarnet[],
  annee: number,
): { readonly annee: number; readonly total: number }[] {
  if (interventions.every(i => i.cout === null)) {
    return [];
  }

  return [annee, annee - 1].map(a => ({
    annee: a,
    total: interventions
      .filter(i => i.le.startsWith(`${a}-`))
      .reduce((total, i) => total + (i.cout ?? 0), 0),
  }));
}
