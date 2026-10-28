/**
 * Les infos de base d'une fiche, selon sa nature (SPEC § 4.1, décisions du
 * 27/10/2026) : lesquelles, comment les lire du formulaire, et les échéances
 * qui en dérivent (§ 5.2) — la fin de garantie, le renouvellement d'un
 * document. Les champs libres (§ 4.2) viendront avec la maquette de la fiche.
 */
import { z } from "zod";
import {
  type Attribut,
  LIBELLE_DATE_ACHAT,
  LIBELLE_DUREE_GARANTIE,
  lire,
  marqueConnue,
  type NouvelleEcheance,
  PREAVIS_GARANTIE_JOURS,
  type Resultat,
  titreGarantie,
} from "@/lib/data/saisie";
import type { Nature } from "@/lib/data/views";

export type TypeInfo = "texte" | "date" | "duree" | "montant" | "jour";

export interface ChampInfo {
  /**
   * Le nom du champ de formulaire ; une durée en a deux, `…Nombre` et
   * `…Unite`, un jour trois, `…Jour`, `…Mois` et `…Annee`.
   */
  readonly cle: string;
  readonly libelle: string;
  readonly type: TypeInfo;
}

export const LIBELLE_EXPIRATION = "Date d'expiration";
export const LIBELLE_NAISSANCE = "Date de naissance";

const champ = (cle: string, libelle: string, type: TypeInfo): ChampInfo => ({
  cle,
  libelle,
  type,
});

/** Les infos de chaque nature ; le lieu et le séjour n'en ont pas. */
export const INFOS: Readonly<Record<Nature, readonly ChampInfo[]>> = {
  equipement: [
    champ("marque", "Marque", "texte"),
    champ("modele", "Modèle", "texte"),
    champ("numeroSerie", "N° de série", "texte"),
    champ("dateAchat", LIBELLE_DATE_ACHAT, "date"),
    champ("dureeGarantie", LIBELLE_DUREE_GARANTIE, "duree"),
  ],
  plante: [
    champ("espece", "Espèce", "texte"),
    champ("variete", "Variété", "texte"),
    champ("miseEnTerre", "Date de mise en terre", "date"),
  ],
  vehicule: [
    champ("immatriculation", "Immatriculation", "texte"),
    champ("miseEnCirculation", "Mise en circulation", "date"),
  ],
  animal: [
    champ("naissance", "Naissance", "date"),
    champ("veterinaire", "Vétérinaire", "texte"),
    champ("puce", "N° de puce", "texte"),
  ],
  contrat: [
    champ("anniversaire", "Date anniversaire", "date"),
    champ("preavis", "Préavis de résiliation", "duree"),
    champ("montant", "Montant", "montant"),
  ],
  document: [
    champ("emission", "Date d'émission", "date"),
    champ("expiration", LIBELLE_EXPIRATION, "date"),
  ],
  personne: [champ("naissance", LIBELLE_NAISSANCE, "jour")],
  lieu: [],
  sejour: [],
};

/* ------------------------------------------------------------------------ */
/* Lecture du formulaire                                                    */
/* ------------------------------------------------------------------------ */

/** Vide, ou seulement des espaces : absent. */
const vide = (valeur: unknown) =>
  typeof valeur === "string" && valeur.trim() === "" ? undefined : valeur;

const texte = z.string().trim().max(120, "120 caractères au plus.").optional();

const date = z.preprocess(
  vide,
  z.iso.date({ error: "Date invalide." }).optional(),
);

const nombre = z.preprocess(
  vide,
  z.coerce
    .number({ error: "Un nombre entier est attendu." })
    .int("Un nombre entier est attendu.")
    .min(1, "1 au moins.")
    .max(99, "99 au plus.")
    .optional(),
);

const unite = z.preprocess(
  vide,
  z.enum(["month", "year"], { error: "Unité inconnue." }).default("year"),
);

/** « 12,50 € », « 1 200 » : la virgule, les espaces et le symbole tolérés. */
const montant = z.preprocess(
  valeur =>
    typeof valeur === "string"
      ? vide(valeur.replace(/[\s\u00a0\u202f€]/g, "").replace(",", "."))
      : valeur,
  z.coerce
    .number({ error: "Un montant est attendu, comme 12,50." })
    .min(0, "Un montant ne peut pas être négatif.")
    .max(1_000_000, "1 000 000 € au plus.")
    .transform(v => Math.round(v * 100) / 100)
    .optional(),
);

const entierFacultatif = (min: number, max: number, message: string) =>
  z.preprocess(
    vide,
    z.coerce
      .number({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message)
      .optional(),
  );

/** Le jour, le mois et l'année d'une naissance : ensemble, et possibles. */
function jourValide(cle: string) {
  return (lu: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const jour = lu[`${cle}Jour`] as number | undefined;
    const mois = lu[`${cle}Mois`] as number | undefined;
    const annee = lu[`${cle}Annee`] as number | undefined;

    if (jour === undefined && mois === undefined) {
      if (annee !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [`${cle}Jour`],
          message: "Le jour et le mois sont nécessaires.",
        });
      }

      return;
    }

    if (jour === undefined || mois === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [`${cle}Jour`],
        message: "Le jour et le mois sont nécessaires.",
      });

      return;
    }

    // Sans année, le 29 février reste possible.
    const date = new Date(Date.UTC(annee ?? 2000, mois - 1, jour));

    if (date.getUTCMonth() !== mois - 1) {
      ctx.addIssue({
        code: "custom",
        path: [`${cle}Jour`],
        message: "Ce jour n'existe pas.",
      });
    }
  };
}

function schema(nature: Nature) {
  const forme: Record<string, z.ZodType> = {};
  const jours: string[] = [];

  for (const { cle, type } of INFOS[nature]) {
    if (type === "jour") {
      forme[`${cle}Jour`] = entierFacultatif(1, 31, "Un jour entre 1 et 31.");
      forme[`${cle}Mois`] = entierFacultatif(1, 12, "Un mois entre 1 et 12.");
      forme[`${cle}Annee`] = entierFacultatif(
        1900,
        2100,
        "Une année entre 1900 et 2100.",
      );
      jours.push(cle);
    } else if (type === "duree") {
      forme[`${cle}Nombre`] = nombre;
      forme[`${cle}Unite`] = unite;
    } else {
      forme[cle] = { texte, date, montant }[type];
    }
  }

  return z.object(forme).superRefine((lu, ctx) => {
    for (const cle of jours) {
      jourValide(cle)(lu, ctx);
    }
  });
}

function attribut(
  { libelle, type, cle }: ChampInfo,
  lu: Readonly<Record<string, unknown>>,
): Attribut | null {
  if (type === "jour") {
    const jour = lu[`${cle}Jour`] as number | undefined;
    const mois = lu[`${cle}Mois`] as number;
    const annee = (lu[`${cle}Annee`] as number | undefined) ?? null;

    return jour === undefined
      ? null
      : { libelle, type, valeur: { jour, mois, annee } };
  }

  if (type === "duree") {
    const count = lu[`${cle}Nombre`] as number | undefined;
    const unit = lu[`${cle}Unite`] as "month" | "year";

    return count === undefined
      ? null
      : { libelle, type, valeur: { count, unit } };
  }

  const valeur = lu[cle];

  if (valeur === undefined || valeur === "") {
    return null;
  }

  return type === "montant"
    ? { libelle, type, valeur: valeur as number }
    : { libelle, type, valeur: valeur as string };
}

/** Les infos saisies pour une nature : les attributs remplis, ou les erreurs. */
export function lireInfos(
  nature: Nature,
  champs: Readonly<Record<string, unknown>>,
): Resultat<Attribut[]> {
  const lu = lire(schema(nature), champs);

  if (!lu.ok) {
    return lu;
  }

  return {
    ok: true,
    valeur: INFOS[nature]
      .map(c => attribut(c, lu.valeur as Record<string, unknown>))
      .filter(a => a !== null),
  };
}

/* ------------------------------------------------------------------------ */
/* Sur la fiche                                                             */
/* ------------------------------------------------------------------------ */

const libelles = (nature: Nature) => new Set(INFOS[nature].map(c => c.libelle));

/** Les infos de la nature, remplacées ; les autres attributs, gardés après elles. */
export function avecInfos(
  attributs: readonly Attribut[],
  nature: Nature,
  infos: readonly Attribut[],
): Attribut[] {
  const siennes = libelles(nature);

  return [...infos, ...attributs.filter(a => !siennes.has(a.libelle))];
}

/** Les attributs qui ne sont pas des infos de la nature. */
export function horsInfos(
  attributs: readonly Attribut[],
  nature: Nature,
): Attribut[] {
  const siennes = libelles(nature);

  return attributs.filter(a => !siennes.has(a.libelle));
}

/** Les infos d'une fiche, dans l'ordre de sa nature ; seulement les remplies. */
export function infosDe(
  attributs: readonly Attribut[],
  nature: Nature,
): Attribut[] {
  return INFOS[nature]
    .map(c => attributs.find(a => a.libelle === c.libelle && a.type === c.type))
    .filter(a => a !== undefined);
}

/** Les valeurs d'une fiche, pour pré-remplir le formulaire de ses infos. */
export function valeursInfos(
  attributs: readonly Attribut[],
  nature: Nature,
): Record<string, string> {
  const valeurs: Record<string, string> = {};

  for (const { cle, libelle } of INFOS[nature]) {
    const a = attributs.find(x => x.libelle === libelle);

    if (a?.type === "jour") {
      valeurs[`${cle}Jour`] = String(a.valeur.jour);
      valeurs[`${cle}Mois`] = String(a.valeur.mois);
      valeurs[`${cle}Annee`] =
        a.valeur.annee === null ? "" : String(a.valeur.annee);
    } else if (a?.type === "duree") {
      valeurs[`${cle}Nombre`] = String(a.valeur.count);
      valeurs[`${cle}Unite`] = a.valeur.unit;
    } else if (a?.type === "montant") {
      valeurs[cle] = String(a.valeur).replace(".", ",");
    } else if (a !== undefined) {
      valeurs[cle] = String(a.valeur);
    }
  }

  return valeurs;
}

/* ------------------------------------------------------------------------ */
/* Échéances dérivées (§ 5.2)                                               */
/* ------------------------------------------------------------------------ */

/** Le renouvellement d'un document : 3 mois, pour les délais de mairie. */
export const PREAVIS_RENOUVELLEMENT_JOURS = 90;

export type EcheanceDerivee = Omit<
  NouvelleEcheance,
  "ficheId" | "derniereFois" | "categorie"
> & {
  /** L'attribut source : c'est par lui que l'échéance retrouve sa fiche. */
  readonly source: string;
};

function dateDe(attributs: readonly Attribut[], libelle: string) {
  const a = attributs.find(x => x.libelle === libelle);

  return a?.type === "date" ? a.valeur : null;
}

function dureeDe(attributs: readonly Attribut[], libelle: string) {
  const a = attributs.find(x => x.libelle === libelle);

  return a?.type === "duree" ? a.valeur : null;
}

/**
 * Les échéances que les infos d'une fiche appellent. Vide quand la source
 * manque : l'échéance existante est alors retirée.
 */
export function echeancesDerivees(
  nature: Nature,
  titre: string,
  attributs: readonly Attribut[],
): EcheanceDerivee[] {
  if (nature === "equipement") {
    const achat = dateDe(attributs, LIBELLE_DATE_ACHAT);
    const duree = dureeDe(attributs, LIBELLE_DUREE_GARANTIE);

    return achat === null || duree === null
      ? []
      : [
          {
            source: LIBELLE_DATE_ACHAT,
            titre: titreGarantie(titre),
            recurrence: {
              kind: "derived",
              sourceDate: achat,
              offset: duree,
              source: LIBELLE_DATE_ACHAT,
            },
            // Comme le formulaire Garantie (§ 3.8d).
            toleranceJours: 0,
            preavisJours: PREAVIS_GARANTIE_JOURS,
            tenue: "souple",
            importance: "memoire",
          },
        ];
  }

  if (nature === "document") {
    const expiration = dateDe(attributs, LIBELLE_EXPIRATION);

    return expiration === null
      ? []
      : [
          {
            source: LIBELLE_EXPIRATION,
            titre: `Renouveler — ${titre}`,
            recurrence: {
              kind: "once",
              on: expiration,
              source: LIBELLE_EXPIRATION,
            },
            toleranceJours: 0,
            preavisJours: PREAVIS_RENOUVELLEMENT_JOURS,
            tenue: "ferme",
            importance: "important",
          },
        ];
  }

  return [];
}

/** La marque saisie, ramenée à celle du foyer qu'elle désigne : « bosch » → « Bosch ». */
export function avecMarqueConnue(
  infos: readonly Attribut[],
  connues: readonly string[],
): Attribut[] {
  return infos.map(a =>
    a.libelle === "Marque" && a.type === "texte"
      ? // Jamais `null` : seule une saisie absente l'est.
        { ...a, valeur: marqueConnue(a.valeur, connues) as string }
      : a,
  );
}
