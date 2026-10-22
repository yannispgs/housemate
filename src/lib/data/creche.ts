/**
 * Le rappel de crèche (SPEC § 12.9) : la veille d'un jour de crèche, à 22 h,
 * qui emmène l'enfant selon la pluie prévue sur le trajet. Logique pure ; le
 * verdict vient de `school-run` (domaine), l'envoi est dans
 * `envoi-creche.ts`.
 *
 * Les prénoms et les jours sont des réglages du foyer, saisis dans l'app
 * (décision du 2026-10-22) : le message reste juste sans eux.
 */
import { z } from "zod";
import type { MailContent } from "@/lib/auth/messages";
import { addDays, type PlainDate, toISO } from "@/lib/domain/plain-date";
import {
  DEFAULT_SCHOOL_RUN,
  decideSchoolRun,
  isSchoolDay,
  type RainHour,
  type RainVerdict,
  rainOverWindow,
  type SchoolRunSettings,
  type Weekday,
} from "@/lib/domain/school-run";
import type { InstantParis } from "./resumes";

export interface ReglagesCreche {
  /** 1 = lundi … 7 = dimanche, triés. */
  readonly jours: readonly Weekday[];
  readonly enfant: string | null;
  readonly parentSec: string | null;
  readonly parentPluie: string | null;
}

export const REGLAGES_CRECHE_PAR_DEFAUT: ReglagesCreche = {
  jours: DEFAULT_SCHOOL_RUN.weekdays,
  enfant: null,
  parentSec: null,
  parentPluie: null,
};

const prenom = z
  .string()
  .trim()
  .max(40, "40 caractères au plus.")
  .transform(v => (v === "" ? null : v))
  .nullable();

export const reglagesCrecheSaisis = z.object({
  jours: z
    .array(z.number().int().min(1).max(7))
    .transform(jours => [...new Set(jours)].sort((a, b) => a - b) as Weekday[]),
  enfant: prenom,
  parentSec: prenom,
  parentPluie: prenom,
});

/** L'heure du rappel, à Paris : la veille au soir, pour régler son réveil. */
export const HEURE_RAPPEL = 22;

/**
 * Le jour de crèche qu'annonce un appel à cette heure : demain, si c'est un
 * jour de crèche et que l'heure du rappel est venue ; sinon rien. Pas encore
 * de calendrier des fermetures (à dessiner) : un rappel de trop coûte peu.
 */
export function crecheAnnoncee(
  instant: InstantParis,
  reglages: ReglagesCreche,
): PlainDate | null {
  if (instant.heure < HEURE_RAPPEL) {
    return null;
  }

  const demain = addDays(instant.jour, 1);
  const settings = { ...DEFAULT_SCHOOL_RUN, weekdays: reglages.jours };
  const ouvert = isSchoolDay(demain, settings, {
    closures: [],
    skippedDays: [],
    extraDays: [],
  });

  return ouvert ? demain : null;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const VERDICT: Record<RainVerdict, string> = {
  dry: "sec",
  rain: "pluie",
  doubt: "doute",
};

function mm(valeur: number): string {
  return `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1 })} mm`;
}

function creneau(s: SchoolRunSettings): string {
  return `de ${s.fromHour} h à ${s.toHour} h`;
}

function detailParModele(
  cumuls: ReadonlyMap<string, number>,
  s: SchoolRunSettings,
): string[] {
  if (cumuls.size === 0) {
    return ["Aucune prévision complète pour ce créneau."];
  }

  return [...cumuls]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modele, cumul]) => {
      const seul = decideSchoolRun(new Map([[modele, cumul]]), s).verdict;

      return `- ${modele} : ${mm(cumul)} (${VERDICT[seul]})`;
    });
}

/** Le rappel du soir pour ce jour de crèche, d'après la pluie prévue. */
export function composerRappelCreche(
  jour: PlainDate,
  pluie: readonly RainHour[],
  reglages: ReglagesCreche,
): MailContent {
  const s = DEFAULT_SCHOOL_RUN;
  const cumuls = rainOverWindow(pluie, jour, s);
  const { verdict } = decideSchoolRun(cumuls, s);
  const enfant = reglages.enfant ?? "l'enfant";
  const sec = reglages.parentSec ?? "le parent du temps sec";
  const pluvieux = reglages.parentPluie ?? "le parent des jours de pluie";
  const midi = new Date(`${toISO(jour)}T12:00:00Z`);
  const quand = `${creneau(s)} demain, ${JOUR.format(midi)}`;
  const message = {
    dry: {
      subject: `Crèche demain : ${sec} emmène ${enfant}`,
      text: `Pas de pluie prévue ${quand} : c'est ${sec} qui emmène ${enfant}.`,
    },
    rain: {
      subject: `Crèche demain : ${pluvieux} emmène ${enfant}, il va pleuvoir`,
      text: `Pluie prévue ${quand} : c'est ${pluvieux} qui emmène ${enfant}.`,
    },
    doubt: {
      subject: "Crèche demain : la pluie est incertaine",
      text: `Les prévisions hésitent ${quand} : ${pluvieux}, mets ton réveil au cas où.`,
    },
  }[verdict];

  return {
    subject: message.subject,
    text: [
      message.text,
      "",
      `Pluie prévue par modèle (sec sous ${mm(s.dryBelowMm)}, pluie à partir de ${mm(s.rainFromMm)}) :`,
      ...detailParModele(cumuls, s),
    ].join("\n"),
  };
}
