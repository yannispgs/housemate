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
import {
  addDays,
  compare,
  daysBetween,
  type PlainDate,
} from "@/lib/domain/plain-date";
import { IMPORTANCE_LABELS, type Importance } from "@/lib/ui/deadline";
import {
  ACTIONNABLE,
  type EcheanceRow,
  IMPORTANCE_RANK,
  type Situee,
  shortDate,
  situer,
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
};

const heure = z.number().int().min(0).max(23);
const coche = z.boolean();

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
  email: z.object({
    critique: coche,
    important: coche,
    normal: coche,
    memoire: coche,
  }),
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

  if (reglages.quotidien && heure >= reglages.quotidienHeure) {
    dus.push("quotidien");
  }

  return dus;
}

const trier = (a: Situee, b: Situee) =>
  compare(a.occurrence.due, b.occurrence.due) ||
  IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];

function ligne(s: Situee, today: PlainDate, quand: boolean): string {
  const marques = [
    s.importance === "critique" || s.importance === "important"
      ? IMPORTANCE_LABELS[s.importance].toLowerCase()
      : "",
    s.row.tenue === "ferme" ? "ferme" : "",
  ].filter(Boolean);
  const date = quand
    ? whenText(s.occurrence.due, today)
    : shortDate(s.occurrence.due);
  const suite = [s.row.titre, s.row.ficheTitre ?? ""].filter(Boolean);
  const fin = marques.length > 0 ? ` (${marques.join(", ")})` : "";

  return `- ${date} · ${suite.join(" · ")}${fin}`;
}

function section(titre: string, lignes: readonly string[]): string[] {
  return lignes.length === 0 ? [] : [titre, ...lignes, ""];
}

function pluriel(n: number): string {
  return n === 1 ? "1 échéance" : `${n} échéances`;
}

/**
 * Le résumé d'une personne, ou `null` s'il n'y a rien à dire.
 *
 * - « À faire » : ce qui est dû ou en tolérance ;
 * - « En retard » : si la personne le veut ;
 * - « À venir » : jusqu'à l'horizon ;
 * - « Fait » (hebdomadaire seulement) : les sept derniers jours.
 *
 * Seuls les niveaux cochés dans la colonne « E-mail » figurent, et seulement
 * ce qui la concerne si elle l'a choisi.
 */
export function composerResume(
  rows: readonly EcheanceRow[],
  today: PlainDate,
  sorte: SorteResume,
  reglages: ReglagesResumes,
  lienReglages: string,
): MailContent | null {
  const retenues = rows.filter(
    row => reglages.perimetre === "foyer" || row.pourMoi,
  );
  const situees = retenues
    .map(row => situer(row, today))
    .filter((s): s is Situee => s !== null && reglages.email[s.importance])
    .sort(trier);
  const limite = addDays(today, reglages.horizonJours - 1);

  const aFaire = situees.filter(
    s => ACTIONNABLE.has(s.occurrence.state) && s.occurrence.state !== "retard",
  );
  const enRetard = reglages.retards
    ? situees.filter(s => s.occurrence.state === "retard")
    : [];
  const aVenir = situees.filter(
    s =>
      !ACTIONNABLE.has(s.occurrence.state) &&
      compare(s.occurrence.due, limite) <= 0,
  );
  const faites =
    sorte === "hebdo"
      ? retenues
          .filter(row => reglages.email[row.importance])
          .flatMap(row =>
            row.completions
              .filter(
                c =>
                  daysBetween(c.faiteLe, today) >= 0 &&
                  daysBetween(c.faiteLe, today) < 7,
              )
              .map(c => ({ row, faiteLe: c.faiteLe })),
          )
          .sort((a, b) => compare(b.faiteLe, a.faiteLe))
      : [];

  const nombre = aFaire.length + enRetard.length + aVenir.length;

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
      "À faire",
      aFaire.map(s => ligne(s, today, true)),
    ),
    ...section(
      "En retard",
      enRetard.map(s => ligne(s, today, true)),
    ),
    ...section(
      `À venir, ${horizon}`,
      aVenir.map(s => ligne(s, today, false)),
    ),
    ...section(
      "Fait ces sept derniers jours",
      faites.map(({ row, faiteLe }) => {
        const suite = [row.titre, row.ficheTitre ?? ""].filter(Boolean);

        return `- ${shortDate(faiteLe)} · ${suite.join(" · ")}`;
      }),
    ),
    `Régler ces résumés : ${lienReglages}`,
    "",
    "HouseMate",
  ].join("\n");

  return { subject, text };
}
