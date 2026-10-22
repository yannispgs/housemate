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
import {
  addDays,
  addMonths,
  compare,
  daysInMonth,
  fromISO,
  type PlainDate,
  plainDate,
  toISO,
} from "@/lib/domain/plain-date";
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
import { type InstantParis, jourIso } from "./resumes";

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
 * Un jour qui s'écarte de la semaine habituelle, saisi dans le calendrier :
 * `creche` vrai pour un jour inhabituel où on l'emmène, faux pour un jour
 * habituel sans crèche (vacances, fermeture, agenda du foyer).
 */
export interface ExceptionCreche {
  /** AAAA-MM-JJ. */
  readonly jour: string;
  readonly creche: boolean;
}

/** Y a-t-il crèche ce jour-là, compte tenu des exceptions saisies ? */
export function estJourDeCreche(
  jour: PlainDate,
  reglages: ReglagesCreche,
  exceptions: readonly ExceptionCreche[] = [],
): boolean {
  const settings = { ...DEFAULT_SCHOOL_RUN, weekdays: reglages.jours };

  return isSchoolDay(jour, settings, {
    closures: [],
    skippedDays: exceptions.filter(e => !e.creche).map(e => fromISO(e.jour)),
    extraDays: exceptions.filter(e => e.creche).map(e => fromISO(e.jour)),
  });
}

/**
 * Un clic sur un jour du calendrier l'inverse. L'exception qui en résulte, ou
 * `null` quand le jour revient à la semaine habituelle (l'exception se
 * retire). Calculé sur l'état réel du jour, pas sur l'exception seule : un
 * clic change toujours ce qu'on voit, même si les jours habituels ont changé
 * depuis la saisie.
 */
export function basculement(
  jour: PlainDate,
  reglages: ReglagesCreche,
  exceptions: readonly ExceptionCreche[],
): ExceptionCreche | null {
  const voulu = !estJourDeCreche(jour, reglages, exceptions);

  return voulu === estJourDeCreche(jour, reglages)
    ? null
    : { jour: toISO(jour), creche: voulu };
}

/** Les exceptions après un clic sur ce jour. */
export function apresBasculement(
  jour: PlainDate,
  reglages: ReglagesCreche,
  exceptions: readonly ExceptionCreche[],
): ExceptionCreche[] {
  const iso = toISO(jour);
  const suivante = basculement(jour, reglages, exceptions);
  const autres = exceptions.filter(e => e.jour !== iso);

  return suivante === null ? autres : [...autres, suivante];
}

/** Combien de mois montre le calendrier : on sait un ou deux mois d'avance. */
export const MOIS_DU_CALENDRIER = 2;

/** Du jour même à la fin du dernier mois montré, en AAAA-MM-JJ. */
export function periodeDuCalendrier(aujourdhui: PlainDate): {
  du: string;
  au: string;
} {
  const dernier = addMonths(
    plainDate(aujourdhui.year, aujourdhui.month, 1),
    MOIS_DU_CALENDRIER - 1,
  );

  return {
    du: toISO(aujourdhui),
    au: toISO(
      plainDate(
        dernier.year,
        dernier.month,
        daysInMonth(dernier.year, dernier.month),
      ),
    ),
  };
}

export interface CaseDuCalendrier {
  readonly iso: string;
  readonly jour: number;
  /** Crèche ce jour-là, exceptions comprises. */
  readonly creche: boolean;
  /** Un jour de crèche de la semaine habituelle. */
  readonly habituel: boolean;
  /** Avant aujourd'hui : plus rien à y changer. */
  readonly passe: boolean;
}

export interface MoisDuCalendrier {
  /** « octobre 2026 ». */
  readonly titre: string;
  /** Les cases vides avant le 1er, la semaine commençant le lundi. */
  readonly decalage: number;
  readonly cases: readonly CaseDuCalendrier[];
}

const MOIS = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Le calendrier des jours de crèche, du mois en cours au suivant. */
export function calendrierCreche(
  aujourdhui: PlainDate,
  reglages: ReglagesCreche,
  exceptions: readonly ExceptionCreche[],
): MoisDuCalendrier[] {
  const premier = plainDate(aujourdhui.year, aujourdhui.month, 1);

  return Array.from({ length: MOIS_DU_CALENDRIER }, (_, rang) => {
    const debut = addMonths(premier, rang);
    const cases = Array.from(
      { length: daysInMonth(debut.year, debut.month) },
      (_, index) => {
        const jour = addDays(debut, index);

        return {
          iso: toISO(jour),
          jour: jour.day,
          creche: estJourDeCreche(jour, reglages, exceptions),
          habituel: estJourDeCreche(jour, reglages),
          passe: compare(jour, aujourdhui) < 0,
        };
      },
    );

    return {
      titre: MOIS.format(new Date(Date.UTC(debut.year, debut.month - 1, 1))),
      decalage: jourIso(debut) - 1,
      cases,
    };
  });
}

/**
 * Le jour de crèche qu'annonce un appel à cette heure : demain, si c'est un
 * jour de crèche et que l'heure du rappel est venue ; sinon rien.
 */
export function crecheAnnoncee(
  instant: InstantParis,
  reglages: ReglagesCreche,
  exceptions: readonly ExceptionCreche[] = [],
): PlainDate | null {
  if (instant.heure < HEURE_RAPPEL) {
    return null;
  }

  const demain = addDays(instant.jour, 1);

  return estJourDeCreche(demain, reglages, exceptions) ? demain : null;
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
