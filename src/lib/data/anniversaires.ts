/**
 * L'anniversaire d'une personne, par membre (SPEC § 4.1, décisions du 27 et du
 * 28/10/2026) : chacun choisit sur la fiche « cadeau », « sans cadeau » ou
 * « pas de rappel », et règle pour lui-même le préavis et l'importance des
 * deux premiers.
 */
import { z } from "zod";
import { LIBELLE_NAISSANCE } from "@/lib/data/infos";
import type { RecurrenceJson } from "@/lib/data/recurrence-json";
import type { Attribut } from "@/lib/data/saisie";
import type { Month } from "@/lib/domain/month";
import { IMPORTANCES, type Importance } from "@/lib/ui/deadline";

export const NIVEAUX = ["cadeau", "simple"] as const;
export type Niveau = (typeof NIVEAUX)[number];

export const NIVEAU_LABELS: Readonly<Record<Niveau, string>> = {
  cadeau: "Cadeau",
  simple: "Sans cadeau",
};

export interface ReglageNiveau {
  readonly preavisJours: number;
  readonly importance: Importance;
}

export type ReglagesAnniversaires = Readonly<Record<Niveau, ReglageNiveau>>;

/** Ceux de départ : un cadeau se prépare deux mois avant, un mot la veille. */
export const REGLAGES_PAR_DEFAUT: ReglagesAnniversaires = {
  cadeau: { preavisJours: 60, importance: "normal" },
  simple: { preavisJours: 1, importance: "memoire" },
};

export function titreAnniversaire(niveau: Niveau, nom: string): string {
  return niveau === "cadeau"
    ? `Cadeau — anniversaire de ${nom}`
    : `Anniversaire de ${nom}`;
}

/**
 * La récurrence annuelle de la date de naissance, ou `null` sans date. Elle ne
 * nomme pas sa source : l'échéance n'est pas dérivée de la fiche pour tout le
 * foyer, elle appartient à un membre (voir `suivreAnniversaires`).
 */
export function recurrenceAnniversaire(
  attributs: readonly Attribut[],
): RecurrenceJson | null {
  const a = attributs.find(x => x.libelle === LIBELLE_NAISSANCE);

  return a?.type === "jour"
    ? {
        kind: "annual",
        month: a.valeur.mois as Month,
        day: a.valeur.jour,
      }
    : null;
}

/* ------------------------------------------------------------------------ */
/* Le préavis, en jours, semaines ou mois                                   */
/* ------------------------------------------------------------------------ */

export const UNITES_PREAVIS = ["jour", "semaine", "mois"] as const;
export type UnitePreavis = (typeof UNITES_PREAVIS)[number];

const JOURS_PAR_UNITE: Readonly<Record<UnitePreavis, number>> = {
  jour: 1,
  semaine: 7,
  mois: 30,
};

export const UNITE_LABELS: Readonly<Record<UnitePreavis, string>> = {
  jour: "jour(s)",
  semaine: "semaine(s)",
  mois: "mois",
};

/** Le préavis dans la plus grande unité qui le dit sans reste. */
export function preavisEnUnite(jours: number): {
  nombre: number;
  unite: UnitePreavis;
} {
  if (jours > 0 && jours % 30 === 0) {
    return { nombre: jours / 30, unite: "mois" };
  }

  if (jours > 0 && jours % 7 === 0) {
    return { nombre: jours / 7, unite: "semaine" };
  }

  return { nombre: jours, unite: "jour" };
}

/** « 2 mois avant », « 1 jour avant », « le jour même ». */
export function preavisLisible(jours: number): string {
  if (jours === 0) {
    return "le jour même";
  }

  const { nombre, unite } = preavisEnUnite(jours);
  const mot = unite === "mois" ? "mois" : `${unite}${nombre > 1 ? "s" : ""}`;

  return `${nombre} ${mot} avant`;
}

const PREAVIS_MAX = 366;

const reglageNiveau = z
  .object({
    nombre: z.coerce
      .number({ error: "Un nombre, s'il te plaît." })
      .int("Un nombre entier.")
      .min(0, "Pas de préavis négatif."),
    unite: z.enum(UNITES_PREAVIS, { error: "Choisis une unité." }),
    importance: z.enum(IMPORTANCES, { error: "Choisis une importance." }),
  })
  .transform(({ nombre, unite, importance }) => ({
    preavisJours: nombre * JOURS_PAR_UNITE[unite],
    importance,
  }))
  .refine(r => r.preavisJours <= PREAVIS_MAX, {
    message: "Un an de préavis au plus.",
    path: ["nombre"],
  });

/** Les champs du formulaire des réglages : `cadeauNombre`, `simpleUnite`… */
export const reglagesSaisie = z
  .object({
    cadeauNombre: z.unknown(),
    cadeauUnite: z.unknown(),
    cadeauImportance: z.unknown(),
    simpleNombre: z.unknown(),
    simpleUnite: z.unknown(),
    simpleImportance: z.unknown(),
  })
  .transform((champs, ctx) => {
    const lus: Partial<Record<Niveau, ReglageNiveau>> = {};

    for (const niveau of NIVEAUX) {
      const lu = reglageNiveau.safeParse({
        nombre: champs[`${niveau}Nombre`],
        unite: champs[`${niveau}Unite`],
        importance: champs[`${niveau}Importance`],
      });

      if (lu.success) {
        lus[niveau] = lu.data;
      } else {
        for (const issue of lu.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: [`${niveau}${capitale(String(issue.path[0]))}`],
          });
        }
      }
    }

    return lus as ReglagesAnniversaires;
  });

function capitale(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}
