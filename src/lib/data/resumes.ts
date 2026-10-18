/**
 * Les résumés par e-mail (SPEC § 6, décisions du 18/10/2026) : quand ils
 * partent, et ce qu'ils disent. Logique pure ; l'envoi est dans
 * `envoi-resumes.ts`.
 *
 * Jamais un e-mail par échéance : un résumé regroupe tout, et un résumé vide
 * ne part pas.
 */
import { z } from "zod";
import type { MailContent } from "@/lib/auth/messages";
import type { OccurrenceState } from "@/lib/domain/occurrence";
import {
  addDays,
  compare,
  daysBetween,
  type PlainDate,
} from "@/lib/domain/plain-date";
import { defaultReminders, reminderDate } from "@/lib/domain/reminders";
import {
  IMPORTANCE_LABELS,
  type Importance,
  type Tenure,
} from "@/lib/ui/deadline";
import type { ConsommableRow } from "./store";
import {
  ACTIONNABLE,
  type ConsommableSitue,
  type EcheanceRow,
  IMPORTANCE_RANK,
  type Situee,
  shortDate,
  situer,
  situerConsommable,
  TO_DOMAIN,
  whenText,
} from "./views";

export type SorteResume = "hebdo" | "quotidien";

export const HORIZONS = [7, 14, 30] as const;
export type Horizon = (typeof HORIZONS)[number];

export type Perimetre = "moi" | "foyer";

export interface ReglagesResumes {
  readonly hebdo: boolean;
  /** 1 = lundi … 7 = dimanche (ISO 8601). */
  readonly hebdoJour: number;
  /** Heure de Paris, 0 à 23. */
  readonly hebdoHeure: number;
  readonly quotidien: boolean;
  readonly quotidienHeure: number;
  /** Jusqu'où le résumé regarde devant, aujourd'hui compris. */
  readonly horizonJours: Horizon;
  readonly retards: boolean;
  readonly perimetre: Perimetre;
  /** La colonne « E-mail » du tableau des notifications. */
  readonly email: Readonly<Record<Importance, boolean>>;
  /** La colonne « Push » : les niveaux qui notifient (`push.ts`). */
  readonly push: Readonly<Record<Importance, boolean>>;
}

/** Sans réglage enregistré : ce que le foyer a décidé le 18/10/2026. */
export const REGLAGES_PAR_DEFAUT: ReglagesResumes = {
  hebdo: true,
  hebdoJour: 1,
  hebdoHeure: 6,
  quotidien: false,
  quotidienHeure: 7,
  horizonJours: 7,
  retards: true,
  perimetre: "moi",
  email: { critique: true, important: true, normal: true, memoire: false },
  push: { critique: true, important: true, normal: false, memoire: false },
};

const heure = z.number().int().min(0).max(23);
const coche = z.boolean();
const parNiveau = z.object({
  critique: coche,
  important: coche,
  normal: coche,
  memoire: coche,
});

/** Ce que la section Notifications de Réglages envoie : tout, d'un bloc. */
export const reglagesSaisis = z.object({
  hebdo: coche,
  hebdoJour: z.number().int().min(1).max(7),
  hebdoHeure: heure,
  quotidien: coche,
  quotidienHeure: heure,
  horizonJours: z.union(HORIZONS.map(h => z.literal(h))),
  retards: coche,
  perimetre: z.enum(["moi", "foyer"]),
  email: parNiveau,
  push: parNiveau,
}) satisfies z.ZodType<ReglagesResumes>;

export const JOURS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

/** Le jour de la semaine, 1 = lundi … 7 = dimanche. */
export function jourIso(day: PlainDate): number {
  const jour = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();

  return jour === 0 ? 7 : jour;
}

/** L'instant vu de Paris : son jour et son heure. */
export interface InstantParis {
  readonly jour: PlainDate;
  readonly heure: number;
}

/**
 * Les résumés dont l'heure est passée aujourd'hui. Appelé chaque heure, un
 * résumé manqué part donc à l'appel suivant, le jour même ; le journal des
 * envois empêche qu'il parte deux fois.
 */
export function resumesDus(
  reglages: ReglagesResumes,
  { jour, heure }: InstantParis,
): SorteResume[] {
  const dus: SorteResume[] = [];

  if (
    reglages.hebdo &&
    jourIso(jour) === reglages.hebdoJour &&
    heure >= reglages.hebdoHeure
  ) {
    dus.push("hebdo");
  }

  // Le quotidien se compose chaque jour à son heure, voulu ou non : un
  // rappel par e-mail du jour suffit à le faire partir (§ 6).
  if (heure >= reglages.quotidienHeure) {
    dus.push("quotidien");
  }

  return dus;
}

/**
 * Ce dont parle un résumé : une échéance ou un consommable, ramené à ce que
 * le message en dit.
 */
interface Element {
  readonly cle: string;
  readonly titre: string;
  readonly ficheTitre: string | null;
  readonly due: PlainDate;
  readonly state: OccurrenceState;
  readonly importance: Importance;
  readonly tenue: Tenure;
  /** Daté au compteur : une estimation. */
  readonly estimee: boolean;
}

interface Fait {
  readonly titre: string;
  readonly ficheTitre: string | null;
  readonly le: PlainDate;
}

const depuisEcheance = (s: Situee): Element => ({
  cle: `e-${s.row.id}`,
  titre: s.row.titre,
  ficheTitre: s.row.ficheTitre,
  due: s.occurrence.due,
  state: s.occurrence.state,
  importance: s.importance,
  tenue: s.row.tenue,
  estimee: false,
});

const depuisConsommable = (c: ConsommableSitue): Element => ({
  cle: `c-${c.row.id}`,
  titre: c.row.intitule,
  ficheTitre: c.row.ficheTitre,
  due: c.due,
  state: c.state,
  importance: c.importance,
  tenue: c.row.tenue,
  estimee: c.estimee,
});

const trier = (a: Element, b: Element) =>
  compare(a.due, b.due) ||
  IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];

function ligne(e: Element, today: PlainDate, quand: boolean): string {
  const marques = [
    e.importance === "critique" || e.importance === "important"
      ? IMPORTANCE_LABELS[e.importance].toLowerCase()
      : "",
    e.tenue === "ferme" ? "ferme" : "",
    e.estimee ? "estimé au compteur" : "",
  ].filter(Boolean);
  const date = quand ? whenText(e.due, today) : shortDate(e.due);
  const suite = [e.titre, e.ficheTitre ?? ""].filter(Boolean);
  const fin = marques.length > 0 ? ` (${marques.join(", ")})` : "";

  return `- ${date} · ${suite.join(" · ")}${fin}`;
}

function section(titre: string, lignes: readonly string[]): string[] {
  return lignes.length === 0 ? [] : [titre, ...lignes, ""];
}

function pluriel(n: number): string {
  return n === 1 ? "1 échéance" : `${n} échéances`;
}

const dansLaSemaine = (le: PlainDate, today: PlainDate) =>
  daysBetween(le, today) >= 0 && daysBetween(le, today) < 7;

/**
 * Les échéances dont un rappel « par e-mail » tombe aujourd'hui (§ 6) :
 * ceux ajoutés à la main, demande explicite, toujours ; celui que donne
 * l'importance (une critique, le jour même) si la colonne E-mail garde ce
 * niveau. Seulement ce qui me concerne, quel que soit le périmètre.
 */
function rappelsDuJour(
  rows: readonly EcheanceRow[],
  today: PlainDate,
  email: ReglagesResumes["email"],
): Situee[] {
  return rows
    .filter(row => row.pourMoi)
    .map(row => situer(row, today))
    .filter(
      (s): s is Situee =>
        s !== null &&
        // Un rappel prévient AVANT : rien pour ce qui est déjà en retard.
        s.occurrence.state !== "retard" &&
        [
          ...(email[s.row.importance]
            ? defaultReminders(TO_DOMAIN[s.row.importance])
            : []),
          ...s.row.rappels,
        ]
          .filter(r => r.channels.includes("email"))
          .some(r => compare(reminderDate(s.occurrence.due, r), today) === 0),
    );
}

/** Ce que la personne voit, et ce qui a été fait dans la semaine. */
export interface ContenuResume {
  readonly echeances: readonly EcheanceRow[];
  readonly consommables: readonly ConsommableRow[];
}

/**
 * Le résumé d'une personne, ou `null` s'il n'y a rien à dire.
 *
 * - « Rappels du jour » (quotidien seulement) : les rappels par e-mail qui
 *   tombent aujourd'hui, même hors de l'horizon. Ils suffisent à faire
 *   partir le quotidien, même si la personne ne l'a pas voulu : seuls eux y
 *   figurent alors ;
 * - « À faire » : ce qui est dû ou en tolérance ;
 * - « En retard » : si la personne le veut ;
 * - « À venir » : jusqu'à l'horizon ;
 * - « Fait » (hebdomadaire seulement) : les sept derniers jours.
 *
 * Échéances et consommables du plan d'entretien, ensemble. Seuls les niveaux
 * cochés dans la colonne « E-mail » figurent, et seulement ce qui concerne la
 * personne si elle l'a choisi (un consommable concerne tout le foyer).
 */
export function composerResume(
  { echeances, consommables }: ContenuResume,
  today: PlainDate,
  sorte: SorteResume,
  reglages: ReglagesResumes,
  lienReglages: string,
): MailContent | null {
  const rappels =
    sorte === "quotidien"
      ? rappelsDuJour(echeances, today, reglages.email)
          .map(depuisEcheance)
          .sort(trier)
      : [];
  const complet = sorte === "hebdo" || reglages.quotidien;
  const retenues = echeances.filter(
    row => reglages.perimetre === "foyer" || row.pourMoi,
  );
  const dejaRappelees = new Set(rappels.map(e => e.cle));
  const elements = complet
    ? [
        ...retenues
          .map(row => situer(row, today))
          .filter((s): s is Situee => s !== null)
          .map(depuisEcheance),
        ...consommables
          .map(row => situerConsommable(row, today))
          .filter((c): c is ConsommableSitue => c !== null)
          .map(depuisConsommable),
      ]
        .filter(e => reglages.email[e.importance] && !dejaRappelees.has(e.cle))
        .sort(trier)
    : [];
  const limite = addDays(today, reglages.horizonJours - 1);

  const aFaire = elements.filter(
    e => ACTIONNABLE.has(e.state) && e.state !== "retard",
  );
  const enRetard = reglages.retards
    ? elements.filter(e => e.state === "retard")
    : [];
  const aVenir = elements.filter(
    e => !ACTIONNABLE.has(e.state) && compare(e.due, limite) <= 0,
  );
  const faites: Fait[] =
    sorte === "hebdo"
      ? [
          ...retenues
            .filter(row => reglages.email[row.importance])
            .flatMap(row =>
              row.completions.map(c => ({
                titre: row.titre,
                ficheTitre: row.ficheTitre,
                le: c.faiteLe,
              })),
            ),
          ...consommables.flatMap(row =>
            row.remplacements.map(r => ({
              titre: row.intitule,
              ficheTitre: row.ficheTitre,
              le: r.le,
            })),
          ),
        ]
          .filter(f => dansLaSemaine(f.le, today))
          .sort((a, b) => compare(b.le, a.le))
      : [];

  const nombre =
    rappels.length + aFaire.length + enRetard.length + aVenir.length;

  if (nombre === 0 && faites.length === 0) {
    return null;
  }

  const horizon =
    reglages.horizonJours === 7
      ? "les sept prochains jours"
      : `les ${reglages.horizonJours} prochains jours`;
  const subject =
    sorte === "hebdo"
      ? `Votre semaine : ${pluriel(nombre)}`
      : `Aujourd'hui : ${pluriel(nombre)}`;
  const text = [
    "Bonjour,",
    "",
    ...section(
      "Rappels du jour",
      rappels.map(e => ligne(e, today, true)),
    ),
    ...section(
      "À faire",
      aFaire.map(e => ligne(e, today, true)),
    ),
    ...section(
      "En retard",
      enRetard.map(e => ligne(e, today, true)),
    ),
    ...section(
      `À venir, ${horizon}`,
      aVenir.map(e => ligne(e, today, false)),
    ),
    ...section(
      "Fait ces sept derniers jours",
      faites.map(f => {
        const suite = [f.titre, f.ficheTitre ?? ""].filter(Boolean);

        return `- ${shortDate(f.le)} · ${suite.join(" · ")}`;
      }),
    ),
    `Régler ces résumés : ${lienReglages}`,
    "",
    "HouseMate",
  ].join("\n");

  return { subject, text };
}
