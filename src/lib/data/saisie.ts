/**
 * Ce que la personne saisit pour ajouter une fiche, une échéance ou une
 * garantie, validé, puis traduit en lignes à enregistrer. Logique pure : les
 * champs arrivent du formulaire en texte, la base reçoit des valeurs sûres.
 *
 * Première version (décisions du foyer, 2026-10-13) : fiche vierge, échéance
 * aux quatre récurrences courantes, et garantie — qui crée d'un geste la fiche
 * de l'objet et l'échéance de fin de garantie, dérivée de la date d'achat
 * (§ 5.2) : 2 ans et un mois de préavis par défaut.
 */
import { z } from "zod";
import {
  type RecurrenceJson,
  serializeRecurrence,
} from "@/lib/data/recurrence-json";
import { NATURES } from "@/lib/data/views";
import type { Month } from "@/lib/domain/month";
import {
  compare,
  daysBetween,
  daysInMonth,
  fromISO,
  type PlainDate,
  plainDate,
} from "@/lib/domain/plain-date";
import type { Duration, ScheduledRecurrence } from "@/lib/domain/recurrence";
import { leadKey, type Reminder, reminderDate } from "@/lib/domain/reminders";
import { IMPORTANCES } from "@/lib/ui/deadline";

/* ------------------------------------------------------------------------ */
/* Attributs de fiche (§ 4.2)                                               */
/* ------------------------------------------------------------------------ */

export type Attribut =
  | {
      readonly libelle: string;
      readonly type: "texte";
      readonly valeur: string;
    }
  | { readonly libelle: string; readonly type: "date"; readonly valeur: string }
  | {
      readonly libelle: string;
      readonly type: "duree";
      readonly valeur: {
        readonly count: number;
        readonly unit: "month" | "year";
      };
    };

/* ------------------------------------------------------------------------ */
/* Champs                                                                   */
/* ------------------------------------------------------------------------ */

/** Un champ texte du formulaire : espaces retirés, vide = absent. */
const texteFacultatif = z
  .string()
  .trim()
  .max(120, "120 caractères au plus.")
  .transform(v => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform(v => v ?? null);

const titre = z
  .string({ error: "Un nom est nécessaire." })
  .trim()
  .min(1, "Un nom est nécessaire.")
  .max(120, "120 caractères au plus.");

const dateIso = z.iso.date({ error: "Date invalide." });

const entier = (min: number, max: number) =>
  z.coerce
    .number({ error: "Un nombre entier est attendu." })
    .int("Un nombre entier est attendu.")
    .min(min, `${min} au moins.`)
    .max(max, `${max} au plus.`);

const unite = z.enum(["day", "week", "month", "year"], {
  error: "Unité inconnue.",
});

/* ------------------------------------------------------------------------ */
/* Un mois ou une saison au lieu d'une date (décision du foyer, 2026-10-18)  */
/* ------------------------------------------------------------------------ */

export const PRECISIONS = ["jour", "mois", "saison"] as const;
export type Precision = (typeof PRECISIONS)[number];

/**
 * Les saisons météorologiques, en mois entiers : l'hiver commence en
 * décembre et finit en février de l'année suivante.
 */
export const SAISONS = {
  printemps: { libelle: "Printemps (mars à mai)", debut: 3, mois: 3 },
  ete: { libelle: "Été (juin à août)", debut: 6, mois: 3 },
  automne: { libelle: "Automne (septembre à novembre)", debut: 9, mois: 3 },
  hiver: { libelle: "Hiver (décembre à février)", debut: 12, mois: 3 },
} as const;
export type Saison = keyof typeof SAISONS;

/** Une année sans 29 février : la période d'une échéance annuelle. */
const ANNEE_ORDINAIRE = 2027;

/** Le premier et le dernier jour d'un mois ou d'une saison, cette année-là. */
export function bornesPeriode(
  annee: number,
  periode: { readonly mois: number } | { readonly saison: Saison },
): { readonly debut: PlainDate; readonly fin: PlainDate } {
  const [premier, nombre] =
    "mois" in periode
      ? [periode.mois, 1]
      : [SAISONS[periode.saison].debut, SAISONS[periode.saison].mois];
  const dernier = premier + nombre - 1;
  const anneeFin = annee + Math.floor((dernier - 1) / 12);
  const moisFin = ((dernier - 1) % 12) + 1;

  return {
    debut: plainDate(annee, premier, 1),
    fin: plainDate(anneeFin, moisFin, daysInMonth(anneeFin, moisFin as Month)),
  };
}

/* ------------------------------------------------------------------------ */
/* Catégories (§ 5.4)                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Les thèmes de départ (décision du foyer, 2026-10-17). La liste s'enrichit à
 * l'usage : toute catégorie déjà employée par le foyer y est proposée.
 */
export const CATEGORIES_DE_DEPART = [
  "Administratif",
  "Bricolage",
  "Cuisine",
  "Fêtes",
  "Jardin",
  "Maison",
  "Nettoyage",
  "Santé",
  "Véhicule",
] as const;

const cle = (categorie: string) =>
  categorie.trim().toLocaleLowerCase("fr").normalize("NFC");

/** Une liste sans vides ni doublons de casse, dans l'ordre alphabétique. */
function sansDoublon(valeurs: readonly string[]): string[] {
  const parCle = new Map<string, string>();

  for (const valeur of valeurs) {
    if (valeur.trim() !== "" && !parCle.has(cle(valeur))) {
      parCle.set(cle(valeur), valeur.trim());
    }
  }

  return [...parCle.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Les catégories à proposer : celles de départ et celles déjà employées. */
export function categoriesProposees(employees: readonly string[]): string[] {
  return sansDoublon([...CATEGORIES_DE_DEPART, ...employees]);
}

/**
 * Une saisie, ramenée à la valeur connue dont elle ne diffère que par la
 * casse ou les espaces.
 */
function valeurConnue(
  saisie: string | null,
  connues: readonly string[],
): string | null {
  if (saisie === null) {
    return null;
  }

  return connues.find(c => cle(c) === cle(saisie)) ?? saisie.trim();
}

/**
 * Une catégorie saisie, ramenée à une catégorie connue quand elle n'en diffère
 * que par la casse ou les espaces : « cuisine », « Cuisine␣ » → « Cuisine ».
 */
export const categorieConnue = valeurConnue;

/* ------------------------------------------------------------------------ */
/* Marques                                                                  */
/* ------------------------------------------------------------------------ */

/** Les marques déjà saisies par le foyer, sans doublon de casse. */
export const marquesConnues = sansDoublon;

/** Une marque saisie, ramenée à la marque connue qu'elle désigne : « bosch » → « Bosch ». */
export const marqueConnue = valeurConnue;

export const SUGGESTIONS_MAX = 6;

/** Pour comparer sans tenir compte de la casse ni des accents. */
const pli = (texte: string) =>
  texte.trim().normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");

/**
 * Les marques connues qui égalent ou contiennent la saisie, à mesure qu'on
 * l'écrit (décision du foyer, 2026-10-21), sans tenir compte de la casse ni
 * des accents : celle qui l'égale d'abord, puis celles qui commencent par
 * elle, puis les autres ; six au plus.
 */
export function marquesSuggerees(
  saisie: string,
  connues: readonly string[],
): string[] {
  const cherche = pli(saisie);

  if (cherche === "") {
    return [];
  }

  const rang = (marque: string) => {
    const pliee = pli(marque);

    if (pliee === cherche) {
      return 0;
    }

    return pliee.startsWith(cherche) ? 1 : 2;
  };

  return connues
    .filter(marque => pli(marque).includes(cherche))
    .map(marque => ({ marque, rang: rang(marque) }))
    .sort((a, b) => a.rang - b.rang || a.marque.localeCompare(b.marque, "fr"))
    .slice(0, SUGGESTIONS_MAX)
    .map(s => s.marque);
}

/* ------------------------------------------------------------------------ */
/* Fiche vierge                                                             */
/* ------------------------------------------------------------------------ */

export const ficheSaisie = z.object({
  nature: z.enum(NATURES, { error: "Nature inconnue." }),
  titre,
  categorie: texteFacultatif,
});

export type FicheSaisie = z.infer<typeof ficheSaisie>;

export interface NouvelleFiche {
  readonly nature: (typeof NATURES)[number];
  readonly titre: string;
  readonly categorie: string | null;
  readonly attributs: readonly Attribut[];
}

/* ------------------------------------------------------------------------ */
/* Échéance                                                                 */
/* ------------------------------------------------------------------------ */

/** Les rappels qu'on peut ajouter d'un geste à une échéance (§ 6). */
export const RAPPELS_MAX = 5;

/** Un rappel à la main : « X unités avant », et ses canaux. Vide : aucun. */
const rappelSaisi = z.object({
  nombre: z
    // Le vide d'abord : `entier` lirait "" comme 0, « le jour même ».
    .union([z.literal(""), entier(0, 1000)])
    .optional()
    .transform(v => (v === "" ? undefined : v)),
  unite: z
    .enum(["day", "week", "month"], { error: "Unité inconnue." })
    .optional(),
  email: z.literal("on").optional(),
  push: z.literal("on").optional(),
});

type RappelSaisi = z.infer<typeof rappelSaisi>;

const CHAMP_RAPPEL = /^rappel(\d)(Nombre|Unite|Email|Push)$/;

/**
 * Les champs `rappel0Nombre`, `rappel0Unite`… du formulaire, regroupés en une
 * liste `rappels`, dans l'ordre de leur numéro. Le formulaire envoie des
 * champs à plat : deux champs du même nom n'en feraient qu'un.
 */
function regrouperRappels(champs: unknown): unknown {
  if (typeof champs !== "object" || champs === null) {
    return champs;
  }

  const rappels: Record<string, unknown>[] = [];
  const autres: Record<string, unknown> = {};

  for (const [nom, valeur] of Object.entries(champs)) {
    const trouve = CHAMP_RAPPEL.exec(nom);

    if (trouve === null) {
      autres[nom] = valeur;
    } else {
      const [, rang, champ] = trouve as unknown as [string, string, string];
      const rappel = rappels[Number(rang)] ?? {};
      rappel[champ.toLowerCase()] = valeur;
      rappels[Number(rang)] = rappel;
    }
  }

  return { ...autres, rappels: Array.from(rappels, r => r ?? {}) };
}

function rappelDe(r: RappelSaisi): Reminder | null {
  if (r.nombre === undefined) {
    return null;
  }

  return {
    amount: r.nombre,
    unit: r.unite ?? "day",
    channels: [
      ...(r.email ? (["email"] as const) : []),
      ...(r.push ? (["push"] as const) : []),
    ],
  };
}

export const echeanceSaisie = z.preprocess(
  regrouperRappels,
  z
    .object({
      titre,
      categorie: texteFacultatif,
      importance: z.enum(IMPORTANCES, { error: "Importance inconnue." }),
      tenue: z.enum(["souple", "ferme"], { error: "Tenue inconnue." }),
      // Absente pour une échéance ferme : elle n'a pas de tolérance.
      toleranceJours: entier(0, 365).optional(),
      preavisJours: entier(0, 3650),
      ficheId: z
        .union([z.uuid(), z.literal("")])
        .optional()
        .transform(v => v || null),
      motif: z.enum(["once", "interval", "annual", "sinceCompletion"], {
        error: "Récurrence inconnue.",
      }),
      // Pour « N après la dernière fois » : la dernière fois, facultative.
      // Pour les autres : la date de l'échéance, ou de la première occurrence.
      date: z
        .union([dateIso, z.literal("")])
        .optional()
        .transform(v => v || null),
      nombre: entier(1, 1000).optional(),
      unite: unite.optional(),
      // « Une seule fois » et « chaque année » : un jour précis, ou un mois,
      // ou une saison. Le mois et la saison font de toute la période le temps
      // de le faire.
      precision: z
        .enum(PRECISIONS, { error: "Précision inconnue." })
        .optional()
        .transform(v => v ?? "jour"),
      mois: entier(1, 12).optional(),
      saison: z
        .enum(Object.keys(SAISONS) as [Saison, ...Saison[]], {
          error: "Saison inconnue.",
        })
        .optional(),
      annee: entier(2000, 2200).optional(),
      // Des rappels à la main, facultatifs (§ 6) : un mois avant pour ne pas
      // oublier, puis la veille…
      rappels: z
        .array(rappelSaisi)
        .max(RAPPELS_MAX, `${RAPPELS_MAX} rappels au plus.`),
      // L'exception push (§ 6) : vide, le tableau des réglages décide.
      notifier: z
        .enum(["", "oui", "non"], { error: "Choix inconnu." })
        .optional()
        .transform(v => (v === "oui" || v === "non" ? v === "oui" : null)),
    })
    .superRefine((s, ctx) => {
      const delais = new Set<string>();

      for (const [rang, saisi] of s.rappels.entries()) {
        const rappel = rappelDe(saisi);

        if (rappel === null) {
          continue;
        }

        if (rappel.channels.length === 0) {
          ctx.addIssue({
            code: "custom",
            path: ["rappels", rang],
            message: "Choisis au moins un canal : e-mail ou notification.",
          });
        }

        // Une semaine et sept jours sont le même délai (§ 6).
        if (delais.has(leadKey(rappel))) {
          ctx.addIssue({
            code: "custom",
            path: ["rappels", rang],
            message: "Un autre rappel tombe déjà à ce délai.",
          });
        }

        delais.add(leadKey(rappel));
      }

      verifierPeriode(s, ctx);

      if (
        (s.motif === "interval" || s.motif === "sinceCompletion") &&
        (s.nombre === undefined || s.unite === undefined)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["nombre"],
          message: "Indique tous les combien.",
        });
      }
    }),
);

export type EcheanceSaisie = z.infer<typeof echeanceSaisie>;

/**
 * Une date pour un jour précis ; le mois ou la saison sinon, et l'année pour
 * une seule fois.
 */
function verifierPeriode(s: EcheanceSaisie, ctx: z.RefinementCtx): void {
  const periode = precisionDe(s);

  if (periode === "jour" && s.motif !== "sinceCompletion" && s.date === null) {
    ctx.addIssue({
      code: "custom",
      path: ["date"],
      message: "Indique une date.",
    });
  }

  if (periode === "mois" && s.mois === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["mois"],
      message: "Indique le mois.",
    });
  }

  if (periode === "saison" && s.saison === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["saison"],
      message: "Indique la saison.",
    });
  }

  if (periode !== "jour" && s.motif === "once" && s.annee === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["annee"],
      message: "Indique l'année.",
    });
  }
}

/** Seules « une seule fois » et « chaque année » se donnent par période. */
function precisionDe(
  s: Pick<EcheanceSaisie, "motif" | "precision">,
): Precision {
  return s.motif === "once" || s.motif === "annual" ? s.precision : "jour";
}

/** La période choisie, l'année venue ; `null` pour un jour précis. */
function periodeDe(
  s: EcheanceSaisie,
): { readonly debut: PlainDate; readonly fin: PlainDate } | null {
  const precision = precisionDe(s);

  if (precision === "jour") {
    return null;
  }

  // `superRefine` garantit le mois, la saison et, pour une seule fois, l'année.
  const annee =
    s.motif === "once" ? (s.annee ?? ANNEE_ORDINAIRE) : ANNEE_ORDINAIRE;

  return bornesPeriode(
    annee,
    precision === "mois"
      ? { mois: s.mois ?? 1 }
      : { saison: s.saison ?? "printemps" },
  );
}

/**
 * La tolérance : toute la période pour un mois ou une saison (on a jusqu'à
 * sa fin) ; aucune pour une échéance ferme, qui est en retard dès le
 * lendemain (décision du foyer, 2026-10-18) ; sinon celle saisie.
 */
function toleranceDe(s: EcheanceSaisie): number {
  const periode = periodeDe(s);

  if (periode !== null) {
    return daysBetween(periode.debut, periode.fin);
  }

  return s.tenue === "ferme" ? 0 : (s.toleranceJours ?? 0);
}

export interface NouvelleEcheance {
  readonly titre: string;
  readonly categorie: string | null;
  readonly recurrence: RecurrenceJson;
  readonly toleranceJours: number;
  readonly preavisJours: number;
  readonly tenue: "souple" | "ferme";
  readonly importance: (typeof IMPORTANCES)[number];
  readonly ficheId: string | null;
  /** « N après la dernière fois » : la dernière fois, à enregistrer comme fait. */
  readonly derniereFois: string | null;
  /** Les rappels ajoutés à la main. */
  readonly rappels: readonly Reminder[];
  /** Mon exception push : notifier toujours, jamais, ou selon le tableau. */
  readonly notifier: boolean | null;
}

function rappelsDe(s: EcheanceSaisie): Reminder[] {
  return s.rappels.map(rappelDe).filter(r => r !== null);
}

function recurrenceDe(s: EcheanceSaisie): ScheduledRecurrence {
  // `superRefine` garantit une date, ou une période, hors « depuis la
  // dernière fois ». Une période commence le premier jour.
  const date = periodeDe(s)?.debut ?? fromISO(s.date ?? "1970-01-01");
  const every = { count: s.nombre ?? 1, unit: s.unite ?? "day" } as Duration;

  switch (s.motif) {
    case "once":
      return { kind: "once", on: date };
    case "interval":
      // La première occurrence tombe à la date choisie, puis tous les N.
      return { kind: "interval", anchor: date, every };
    case "annual":
      return { kind: "annual", month: date.month as Month, day: date.day };
    case "sinceCompletion":
      return { kind: "sinceCompletion", after: every };
  }
}

/**
 * Les rangs des rappels d'une échéance « une seule fois » qui tomberaient
 * aujourd'hui ou avant : ils ne préviendraient de rien, la saisie les refuse
 * (§ 6). Pour une échéance qui revient, un rappel passé vaudra pour les
 * suivantes.
 */
export function rappelsDejaPasses(
  s: EcheanceSaisie,
  today: PlainDate,
): number[] {
  const recurrence = recurrenceDe(s);

  if (recurrence.kind !== "once") {
    return [];
  }

  return s.rappels.flatMap((saisi, rang) => {
    const rappel = rappelDe(saisi);

    return rappel !== null &&
      compare(reminderDate(recurrence.on, rappel), today) <= 0
      ? [rang]
      : [];
  });
}

export const RAPPEL_PASSE =
  "Ce rappel tomberait aujourd'hui ou avant : choisis un délai plus court.";

/**
 * Les erreurs des rappels, tels que le formulaire les contient à l'instant :
 * de quoi les montrer pendant la saisie, avant l'envoi. Le reste peut être
 * encore incomplet (pas de nom) : seules comptent celles des rappels.
 */
export function erreursDesRappels(
  champs: Readonly<Record<string, unknown>>,
  today: PlainDate,
): Record<string, string> {
  const saisie = lire(echeanceSaisie, { ...champs, titre: "—" });

  if (!saisie.ok) {
    return Object.fromEntries(
      Object.entries(saisie.erreurs).filter(
        ([cle]) => cle === "rappels" || cle.startsWith("rappels."),
      ),
    );
  }

  return Object.fromEntries(
    rappelsDejaPasses(saisie.valeur, today).map(rang => [
      `rappels.${rang}`,
      RAPPEL_PASSE,
    ]),
  );
}

export function nouvelleEcheance(s: EcheanceSaisie): NouvelleEcheance {
  return {
    titre: s.titre,
    // Liée à une fiche, elle en hérite la catégorie (§ 5.4) : rien à garder.
    categorie: s.ficheId === null ? s.categorie : null,
    recurrence: serializeRecurrence(recurrenceDe(s)),
    toleranceJours: toleranceDe(s),
    preavisJours: s.preavisJours,
    tenue: s.tenue,
    importance: s.importance,
    ficheId: s.ficheId,
    derniereFois: s.motif === "sinceCompletion" ? s.date : null,
    rappels: rappelsDe(s),
    notifier: s.notifier,
  };
}

/* ------------------------------------------------------------------------ */
/* Remplacement d'un consommable (§ 5.3)                                    */
/* ------------------------------------------------------------------------ */

export const remplacementSaisie = z.object({
  consommableId: z.uuid({ error: "Consommable inconnu." }),
  le: dateIso,
  // Facultatif : sans lui, la donnée manquante est signalée (§ 5.3). ⚠️ Le
  // vide se lit AVANT la conversion en nombre, qui en ferait 0 km.
  compteur: z.preprocess(
    v => (v === "" || v === undefined ? null : v),
    entier(0, 10_000_000).nullable(),
  ),
});

export type RemplacementSaisie = z.infer<typeof remplacementSaisie>;

/** Un remplacement ne peut pas être daté du futur. */
export function remplacementValide(
  saisie: RemplacementSaisie,
  today: PlainDate,
): boolean {
  return compare(fromISO(saisie.le), today) <= 0;
}

/* ------------------------------------------------------------------------ */
/* Garantie : la fiche de l'objet et sa fin de garantie                     */
/* ------------------------------------------------------------------------ */

export const GARANTIE_PAR_DEFAUT = { count: 2, unit: "year" } as const;
export const PREAVIS_GARANTIE_JOURS = 30;

export const garantieSaisie = z.object({
  titre,
  marque: texteFacultatif,
  modele: texteFacultatif,
  categorie: texteFacultatif,
  dateAchat: dateIso,
  dureeNombre: entier(1, 50),
  dureeUnite: z.enum(["month", "year"], { error: "Unité inconnue." }),
});

export type GarantieSaisie = z.infer<typeof garantieSaisie>;

/** Une date d'achat ne peut pas être dans le futur. */
export function achatValide(saisie: GarantieSaisie, today: PlainDate): boolean {
  return compare(fromISO(saisie.dateAchat), today) <= 0;
}

export function nouvelleGarantie(s: GarantieSaisie): {
  readonly fiche: NouvelleFiche;
  readonly echeance: Omit<
    NouvelleEcheance,
    "ficheId" | "derniereFois" | "rappels" | "notifier"
  >;
} {
  const duree = { count: s.dureeNombre, unit: s.dureeUnite } as const;
  const attributs: Attribut[] = [
    ...(s.marque
      ? [{ libelle: "Marque", type: "texte", valeur: s.marque } as const]
      : []),
    ...(s.modele
      ? [{ libelle: "Modèle", type: "texte", valeur: s.modele } as const]
      : []),
    { libelle: "Date d'achat", type: "date", valeur: s.dateAchat },
    { libelle: "Durée de garantie", type: "duree", valeur: duree },
  ];

  return {
    fiche: {
      nature: "equipement",
      titre: s.titre,
      categorie: s.categorie,
      attributs,
    },
    // Une garantie : souple, pour mémoire, sans « Reporter » (§ 3.8d), et
    // dérivée de la date d'achat (§ 5.2).
    echeance: {
      titre: `Fin de garantie — ${s.titre}`,
      // Liée à l'objet : elle en hérite la catégorie (§ 5.4).
      categorie: null,
      recurrence: serializeRecurrence({
        kind: "derived",
        sourceDate: fromISO(s.dateAchat),
        offset: duree,
      }),
      toleranceJours: 0,
      preavisJours: PREAVIS_GARANTIE_JOURS,
      tenue: "souple",
      importance: "memoire",
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Lecture du formulaire                                                    */
/* ------------------------------------------------------------------------ */

export type Resultat<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly erreurs: Readonly<Record<string, string>> };

/**
 * Valide les champs d'un formulaire ; une erreur par champ, en français. Dans
 * une liste, une erreur par élément : `rappels.1` pour le deuxième rappel.
 */
export function lire<T>(
  schema: z.ZodType<T>,
  champs: Readonly<Record<string, unknown>>,
): Resultat<T> {
  const parsed = schema.safeParse(champs);

  if (parsed.success) {
    return { ok: true, valeur: parsed.data };
  }

  const erreurs: Record<string, string> = {};

  for (const issue of parsed.error.issues) {
    const [champ = "formulaire", rang] = issue.path;
    const cle =
      typeof rang === "number" ? `${String(champ)}.${rang}` : String(champ);
    erreurs[cle] ??= issue.message;
  }

  return { ok: false, erreurs };
}
