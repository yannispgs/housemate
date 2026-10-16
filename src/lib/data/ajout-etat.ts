/** L'état d'un formulaire d'ajout : erreurs par champ, ou la fiche créée. */
export type EtatAjout =
  | {
      readonly etape: "saisie";
      readonly erreurs?: Readonly<Record<string, string>>;
    }
  | { readonly etape: "creee"; readonly ficheId: string };

export const ETAT_AJOUT: EtatAjout = { etape: "saisie" };
