/**
 * Une plante en pot ou en terre, et son emplacement (SPEC § 12.4, décisions
 * du 25/10/2026) : deux attributs de la fiche, montrés en label et servant
 * de filtre dans l'inventaire. Logique pure.
 */
import type { Attribut } from "@/lib/data/saisie";

export const LIBELLE_POT = "Pot ou terre";
export const LIBELLE_EMPLACEMENT = "Emplacement";

export const POT_OU_TERRE = ["En pot", "En terre"] as const;
export type PotOuTerre = (typeof POT_OU_TERRE)[number];

/** Proposés d'office ; une pièce saisie une fois s'y ajoute. */
export const EMPLACEMENTS_DE_DEPART = ["Extérieur", "Véranda"] as const;

export interface SituationPlante {
  readonly pot: PotOuTerre | null;
  readonly emplacement: string | null;
}

function texte(attributs: readonly Attribut[], libelle: string): string | null {
  const attribut = attributs.find(
    a => a.libelle === libelle && a.type === "texte",
  );

  return attribut?.type === "texte" ? attribut.valeur : null;
}

/** Ce que les attributs disent de la plante ; une valeur inconnue est ignorée. */
export function situationPlante(
  attributs: readonly Attribut[],
): SituationPlante {
  const pot = texte(attributs, LIBELLE_POT);

  return {
    pot: POT_OU_TERRE.find(v => v === pot) ?? null,
    emplacement: texte(attributs, LIBELLE_EMPLACEMENT),
  };
}

/** « En pot · Véranda », ou ce qui en est connu ; vide sinon. */
export function labelsPlante(situation: SituationPlante): string[] {
  return [situation.pot, situation.emplacement].filter(
    (v): v is string => v !== null,
  );
}

/**
 * Les attributs avec ce libellé remplacé par la valeur (en texte), à la même
 * place ; ajouté à la fin s'il manquait, retiré si la valeur est `null`.
 */
export function avecAttribut(
  attributs: readonly Attribut[],
  libelle: string,
  valeur: string | null,
): Attribut[] {
  const nouveau: Attribut | null =
    valeur === null ? null : { libelle, type: "texte", valeur };
  const index = attributs.findIndex(a => a.libelle === libelle);

  if (index === -1) {
    return nouveau === null ? [...attributs] : [...attributs, nouveau];
  }

  return attributs.flatMap((a, i) => {
    if (i !== index) {
      return [a];
    }

    return nouveau === null ? [] : [nouveau];
  });
}

/** Les attributs d'une plante nouvelle, dans l'ordre de la fiche. */
export function attributsPlante(situation: SituationPlante): Attribut[] {
  return avecAttribut(
    avecAttribut([], LIBELLE_POT, situation.pot),
    LIBELLE_EMPLACEMENT,
    situation.emplacement,
  );
}

/* ------------------------------------------------------------------------ */
/* Filtre de l'inventaire                                                   */
/* ------------------------------------------------------------------------ */

/** Un critère du menu « Plantes » : en pot / en terre, ou un emplacement. */
export type CriterePlante =
  | { readonly sorte: "pot"; readonly valeur: PotOuTerre }
  | { readonly sorte: "emplacement"; readonly valeur: string };

/**
 * Les critères à proposer, en deux groupes : en pot / en terre, puis les
 * emplacements réellement employés, dans l'ordre alphabétique.
 */
export function criteresPlantes(
  situations: readonly SituationPlante[],
): CriterePlante[] {
  const pots = POT_OU_TERRE.filter(v => situations.some(s => s.pot === v));
  const emplacements = [
    ...new Set(
      situations.map(s => s.emplacement).filter((v): v is string => v !== null),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  return [
    ...pots.map(valeur => ({ sorte: "pot", valeur }) as const),
    ...emplacements.map(valeur => ({ sorte: "emplacement", valeur }) as const),
  ];
}

export function correspond(
  situation: SituationPlante,
  critere: CriterePlante,
): boolean {
  return critere.sorte === "pot"
    ? situation.pot === critere.valeur
    : situation.emplacement === critere.valeur;
}
