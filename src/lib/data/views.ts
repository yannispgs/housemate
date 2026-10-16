/**
 * Des lignes de la base aux vues des écrans : l'Inventaire (fiches), l'Accueil
 * et À venir (échéances). Logique pure : l'état de chaque échéance vient du
 * domaine (`occurrence.ts`), l'importance effective aussi (`importance.ts`).
 *
 * L'accueil suit la SPEC § 10.1 : rang 1, les tâches critiques à faire ;
 * rang 3, les autres tâches à faire (dues, en tolérance, en retard) ; rang 4,
 * celles en préavis. Le rang 2 (événement en cours) viendra avec les séjours.
 * Une échéance dormante n'est qu'à « À venir ».
 */
import {
  type Importance as DomainImportance,
  effectiveImportance,
} from "@/lib/domain/importance";
import {
  type CurrentOccurrence,
  currentOccurrence,
  type OccurrenceState,
} from "@/lib/domain/occurrence";
import {
  addDays,
  compare,
  daysBetween,
  type PlainDate,
  toISO,
} from "@/lib/domain/plain-date";
import type { ScheduledRecurrence } from "@/lib/domain/recurrence";
import type {
  CategoryIcon,
  DeadlineView,
  Importance,
  StatusTone,
  Tenure,
} from "@/lib/ui/deadline";
import type { RecordNature, RecordView } from "@/lib/ui/inventory";
import { asRow, type UpcomingItem, type UpcomingRow } from "@/lib/ui/upcoming";

/* ------------------------------------------------------------------------ */
/* Fiches                                                                   */
/* ------------------------------------------------------------------------ */

export const NATURES = [
  "equipement",
  "plante",
  "vehicule",
  "animal",
  "contrat",
  "document",
  "personne",
  "lieu",
  "sejour",
] as const;

export type Nature = (typeof NATURES)[number];

export const NATURE_LABELS: Readonly<Record<Nature, RecordNature>> = {
  equipement: "Équipement",
  plante: "Plante",
  vehicule: "Véhicule",
  animal: "Animal",
  contrat: "Contrat",
  document: "Document",
  personne: "Personne",
  lieu: "Lieu",
  sejour: "Séjour",
};

export interface FicheRow {
  readonly id: string;
  readonly nature: Nature;
  readonly titre: string;
  readonly categorie: string | null;
}

/** Sans catégorie, une fiche se range sous « Sans catégorie ». */
export const SANS_CATEGORIE = "Sans catégorie";

export function recordViews(fiches: readonly FicheRow[]): RecordView[] {
  return fiches.map(fiche => ({
    title: fiche.titre,
    nature: NATURE_LABELS[fiche.nature],
    category: fiche.categorie ?? SANS_CATEGORIE,
    descriptor: "",
  }));
}

/* ------------------------------------------------------------------------ */
/* Échéances                                                                */
/* ------------------------------------------------------------------------ */

export interface CompletionRow {
  /** L'occurrence traitée, par sa date due. */
  readonly occurrence: PlainDate;
  /** La date réelle du geste. */
  readonly faiteLe: PlainDate;
}

export interface EcheanceRow {
  readonly id: string;
  readonly titre: string;
  readonly categorie: string | null;
  /** `null` : récurrence illisible ou d'un motif pas encore pris en charge. */
  readonly recurrence: ScheduledRecurrence | null;
  readonly toleranceJours: number;
  /** `null` : pas de préavis réglé, 7 jours par défaut (§ 10.1). */
  readonly preavisJours: number | null;
  readonly tenue: Tenure;
  readonly importance: Importance;
  readonly ficheTitre: string | null;
  /** Déjà traduit pour la personne qui regarde : « Foyer », « Moi »… */
  readonly destinataire: string;
  /** Jour de création : aucune occurrence n'est cherchée avant. */
  readonly creeLe: PlainDate;
  readonly completions: readonly CompletionRow[];
}

/** Les niveaux de la base et de l'écran, vers ceux du domaine, et retour. */
const TO_DOMAIN: Readonly<Record<Importance, DomainImportance>> = {
  critique: "critical",
  important: "important",
  normal: "normal",
  memoire: "memo",
};

const FROM_DOMAIN: Readonly<Record<DomainImportance, Importance>> = {
  critical: "critique",
  important: "important",
  normal: "normal",
  memo: "memoire",
};

/** Préavis par défaut d'une tâche dont personne n'a réglé le préavis. */
export const PREAVIS_PAR_DEFAUT = 7;

interface Situee {
  readonly row: EcheanceRow;
  readonly occurrence: CurrentOccurrence;
  readonly importance: Importance;
  readonly raised: boolean;
}

function situer(row: EcheanceRow, today: PlainDate): Situee | null {
  if (row.recurrence === null) {
    return null;
  }

  const noticeDays = row.preavisJours ?? PREAVIS_PAR_DEFAUT;
  const lastDone = row.completions
    .map(c => c.faiteLe)
    .sort(compare)
    .at(-1);
  const occurrence = currentOccurrence({
    recurrence: row.recurrence,
    tenue: row.tenue,
    toleranceDays: row.toleranceJours,
    noticeDays,
    completed: row.completions.map(c => c.occurrence),
    lastDone,
    since: row.creeLe,
    today,
  });

  if (occurrence === null) {
    return null;
  }

  const { importance, raised } = effectiveImportance({
    base: TO_DOMAIN[row.importance],
    firm: row.tenue === "ferme",
    noticeDays: row.preavisJours ?? undefined,
    today,
    due: occurrence.due,
  });

  return { row, occurrence, importance: FROM_DOMAIN[importance], raised };
}

const STATE_LABELS: Readonly<Record<OccurrenceState, string>> = {
  dormante: "à venir",
  preavis: "en préavis",
  due: "due",
  tolerance: "en tolérance",
  retard: "en retard",
};

const LONG = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function longDate(day: PlainDate): string {
  return LONG.format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
}

/** « aujourd'hui », « demain », « dans 19 jours », « depuis 2 jours ». */
export function whenText(due: PlainDate, today: PlainDate): string {
  const days = daysBetween(today, due);

  if (days === 0) {
    return "aujourd'hui";
  }

  if (days === 1) {
    return "demain";
  }

  if (days === -1) {
    return "depuis hier";
  }

  return days > 0 ? `dans ${days} jours` : `depuis ${-days} jours`;
}

const NOTES: Readonly<Record<Importance, string>> = {
  critique: "notifiée",
  important: "récap",
  normal: "récap",
  memoire: "écran seulement",
};

function tone(state: OccurrenceState, importance: Importance): StatusTone {
  if (state === "retard") {
    return "critical";
  }

  if (state === "preavis" || state === "dormante") {
    return importance === "critique" ? "serious" : "warning";
  }

  return importance === "critique" ? "critical" : "serious";
}

/** L'icône d'une carte, devinée de la catégorie ; générique à défaut. */
export function iconFor(categorie: string | null): CategoryIcon {
  const c = (categorie ?? "").toLowerCase();

  if (/garantie/.test(c)) {
    return "warranty";
  }

  if (/v[ée]hicule|voiture/.test(c)) {
    return "vehicle";
  }

  if (/jardin|plante/.test(c)) {
    return "fertiliser";
  }

  return "generic";
}

const SHORT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function shortDate(day: PlainDate): string {
  return SHORT.format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
}

function detail(s: Situee, today: PlainDate): string {
  const { row, occurrence } = s;
  const parts = [longDate(occurrence.due)];

  if (occurrence.state === "preavis") {
    const notice = row.preavisJours ?? PREAVIS_PAR_DEFAUT;
    const open = notice - daysBetween(today, occurrence.due);
    parts.push(`préavis ouvert depuis ${open} jours sur ${notice}`);
  }

  if (row.ficheTitre !== null) {
    parts.push(row.ficheTitre);
  }

  return parts.join(" · ");
}

function deadlineView(s: Situee, today: PlainDate): DeadlineView {
  const { row, occurrence } = s;

  return {
    id: row.id,
    title: row.titre,
    detail: detail(s, today),
    state: STATE_LABELS[occurrence.state],
    when: whenText(occurrence.due, today),
    category: row.categorie ?? SANS_CATEGORIE,
    recipient: row.destinataire,
    verb: "Fait",
    note: NOTES[s.importance],
    importance: s.importance,
    raised: s.raised,
    tenure: row.tenue,
    tone: tone(occurrence.state, s.importance),
    icon: iconFor(row.categorie),
    window: null,
    frostRange: null,
    // Reporter n'existe que pour les préparatifs d'un séjour (§ 3.6).
    canPostpone: false,
    history: [...row.completions]
      .sort((a, b) => compare(b.faiteLe, a.faiteLe))
      .slice(0, 3)
      .map(c => ({ date: shortDate(c.faiteLe), text: "Fait" })),
    plants: null,
  };
}

const ACTIONNABLE: ReadonlySet<OccurrenceState> = new Set([
  "due",
  "tolerance",
  "retard",
]);

const IMPORTANCE_RANK: Readonly<Record<Importance, number>> = {
  critique: 0,
  important: 1,
  normal: 2,
  memoire: 3,
};

/** Le rang d'accueil (§ 10.1) ; `null` : pas à l'accueil. */
function homeRank(s: Situee): 1 | 3 | 4 | null {
  if (ACTIONNABLE.has(s.occurrence.state)) {
    return s.importance === "critique" ? 1 : 3;
  }

  return s.occurrence.state === "preavis" ? 4 : null;
}

/** L'occurrence que « Fait » coche aujourd'hui ; `null` s'il n'y en a pas. */
export function occurrenceACocher(
  row: EcheanceRow,
  today: PlainDate,
): PlainDate | null {
  const s = situer(row, today);

  return s === null || s.occurrence.state === "dormante"
    ? null
    : s.occurrence.due;
}

/** L'accueil : rangs 1, 3 et 4, puis le plus pressant devant. */
export function homeDeadlines(
  rows: readonly EcheanceRow[],
  today: PlainDate,
): DeadlineView[] {
  return rows
    .map(row => situer(row, today))
    .filter((s): s is Situee => s !== null && homeRank(s) !== null)
    .sort(
      (a, b) =>
        (homeRank(a) ?? 9) - (homeRank(b) ?? 9) ||
        // En préavis, la critique passe en tête de son rang.
        IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] ||
        compare(a.occurrence.due, b.occurrence.due),
    )
    .map(s => deadlineView(s, today));
}

/** À venir : toute échéance qui a une occurrence, à sa date. */
export function upcomingItems(
  rows: readonly EcheanceRow[],
  today: PlainDate,
): UpcomingItem[] {
  return rows
    .map(row => situer(row, today))
    .filter((s): s is Situee => s !== null)
    .sort((a, b) => compare(a.occurrence.due, b.occurrence.due))
    .map(s => ({
      date: toISO(s.occurrence.due),
      title: s.row.titre,
      detail: s.row.ficheTitre ?? "",
      category: s.row.categorie ?? SANS_CATEGORIE,
      importance: s.importance,
      raised: s.raised,
      tenure: s.row.tenue,
    }));
}

/**
 * Ce que dit un accueil vide : la prochaine échéance, et quand elle
 * apparaîtra (« quand son préavis s'ouvrira »). `null` s'il n'y a rien.
 */
export function nextUpText(
  rows: readonly EcheanceRow[],
  today: PlainDate,
): string | null {
  const next = rows
    .map(row => situer(row, today))
    .filter((s): s is Situee => s?.occurrence.state === "dormante")
    .sort((a, b) => compare(a.occurrence.due, b.occurrence.due))[0];

  if (next === undefined) {
    return null;
  }

  return `Le prochain rendez-vous est le ${longDate(next.occurrence.due)} : ${next.row.titre.toLowerCase()}. Il apparaîtra ici quand son préavis s'ouvrira.`;
}

/* ------------------------------------------------------------------------ */
/* Récap                                                                    */
/* ------------------------------------------------------------------------ */

export interface Recap {
  readonly coming: UpcomingRow[];
  readonly comingNote: string;
  readonly done: UpcomingRow[];
}

/**
 * La semaine du récap, du lundi au dimanche : celle de demain, comme le
 * sous-titre de l'écran (`recapWeek`). Le dimanche, c'est donc la suivante.
 */
export function semaineDuRecap(today: PlainDate): {
  lundi: PlainDate;
  dimanche: PlainDate;
} {
  const demain = addDays(today, 1);
  const jour = new Date(
    Date.UTC(demain.year, demain.month - 1, demain.day),
  ).getUTCDay();
  const lundi = addDays(demain, -((jour + 6) % 7));

  return { lundi, dimanche: addDays(lundi, 6) };
}

function noteDeLaSemaine(fermes: number): string {
  if (fermes === 0) {
    return "Aucune échéance ferme cette semaine : tout peut glisser.";
  }

  return fermes === 1
    ? "Une seule échéance ferme cette semaine. Le reste peut glisser."
    : `${fermes} échéances fermes cette semaine.`;
}

/**
 * Le récap (handoff de design, § C). « Ce qui vient » : les occurrences de la
 * semaine du récap, et celles déjà à faire qui traînent. « Fait » : les sept
 * derniers jours. Les échéances « pour mémoire » n'y figurent jamais (§ 6).
 */
export function recap(rows: readonly EcheanceRow[], today: PlainDate): Recap {
  const { lundi, dimanche } = semaineDuRecap(today);

  const coming = rows
    .map(row => situer(row, today))
    .filter(
      (s): s is Situee =>
        s !== null &&
        s.importance !== "memoire" &&
        compare(s.occurrence.due, dimanche) <= 0 &&
        (compare(s.occurrence.due, lundi) >= 0 ||
          ACTIONNABLE.has(s.occurrence.state)),
    )
    .sort(
      (a, b) =>
        compare(a.occurrence.due, b.occurrence.due) ||
        IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance],
    );

  const done = rows
    .filter(row => row.importance !== "memoire")
    .flatMap(row =>
      row.completions
        .filter(
          c =>
            compare(c.faiteLe, addDays(today, -6)) >= 0 &&
            compare(c.faiteLe, today) <= 0,
        )
        .map(c => ({ row, faiteLe: c.faiteLe })),
    )
    .sort((a, b) => compare(b.faiteLe, a.faiteLe));

  return {
    coming: coming.map(s => {
      const enRetard =
        ACTIONNABLE.has(s.occurrence.state) &&
        compare(s.occurrence.due, today) < 0;

      return asRow({
        date: toISO(s.occurrence.due),
        title: s.row.titre,
        detail: [
          enRetard
            ? `${STATE_LABELS[s.occurrence.state]} ${whenText(s.occurrence.due, today)}`
            : "",
          s.row.ficheTitre ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
        category: s.row.categorie ?? SANS_CATEGORIE,
        importance: s.importance,
        raised: s.raised,
        tenure: s.row.tenue,
      });
    }),
    comingNote: noteDeLaSemaine(
      coming.filter(s => s.row.tenue === "ferme").length,
    ),
    done: done.map(({ row, faiteLe }) =>
      asRow({
        date: toISO(faiteLe),
        title: row.titre,
        detail: row.ficheTitre ?? "",
        category: row.categorie ?? SANS_CATEGORIE,
        importance: row.importance,
        raised: false,
        tenure: row.tenue,
      }),
    ),
  };
}

/**
 * Ce que l'en-tête du bureau dit du foyer : « Foyer · Dulong » pour un foyer
 * nommé « Foyer Dulong » ou « Dulong ». Vide sans nom.
 */
export function libelleFoyer(nom: string | null): string {
  const brut = (nom ?? "").trim();
  const sansFoyer = brut.replace(/^foyer(?=\s|$)/i, "").trim();
  // « de », « des », « du », « d' » ne tombent qu'après « Foyer ».
  const reste =
    sansFoyer === brut ? brut : sansFoyer.replace(/^(?:d(?:es?|u)\s+|d')/i, "");

  if (reste === "") {
    return "";
  }

  return `Foyer · ${reste.charAt(0).toUpperCase()}${reste.slice(1)}`;
}
