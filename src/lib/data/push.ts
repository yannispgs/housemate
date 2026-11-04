/**
 * Les notifications push (SPEC § 6, décisions du 18/10/2026) : ce qui
 * notifie ce matin, et ce que dit la notification. Logique pure ; l'envoi
 * est dans `envoi-push.ts`.
 *
 * La colonne « Push » du tableau dit quels niveaux notifient ; la fréquence
 * est une règle générale, la même pour toutes les tenues :
 * - une critique, chaque matin tant qu'elle est à faire ;
 * - les autres niveaux, une seule fois, le matin où elles arrivent ;
 * - un rappel « par notification », le matin de son jour.
 * Plusieurs échéances le même matin : une seule notification.
 *
 * L'exception d'une échéance l'emporte sur le tableau : la faire notifier,
 * ou la faire taire, rappels compris.
 */
import { compare, type PlainDate, toISO } from "@/lib/domain/plain-date";
import { reminderDate } from "@/lib/domain/reminders";
import type { Importance } from "@/lib/ui/deadline";
import type { ContenuResume } from "./resumes";
import {
  ACTIONNABLE,
  IMPORTANCE_RANK,
  type Situee,
  situer,
  situerConsommable,
  whenText,
} from "./views";

/** L'heure de Paris où part la notification du matin. */
export const HEURE_PUSH = 8;

export type Motif = "rappel" | "critique" | "arrivee";

export interface ElementPush {
  /** L'élément et son occurrence : la clé de son annonce au journal. */
  readonly cle: string;
  readonly titre: string;
  readonly ficheTitre: string | null;
  readonly due: PlainDate;
  readonly importance: Importance;
  readonly motif: Motif;
}

const cleDe = (prefixe: string, id: string) => `${prefixe}-${id}`;

/** La clé d'une arrivée au journal : l'élément, et le jour de l'occurrence. */
export const cleAnnonce = ({ cle, due }: Pick<ElementPush, "cle" | "due">) =>
  `${cle}@${toISO(due)}`;

/** Un rappel « par notification » qui tombe aujourd'hui, avant la date. */
function rappelDuJour(s: Situee, today: PlainDate): boolean {
  return (
    s.occurrence.state !== "retard" &&
    s.row.rappels.some(
      r =>
        r.channels.includes("push") &&
        compare(reminderDate(s.occurrence.due, r), today) === 0,
    )
  );
}

/**
 * Ce qui notifie ce matin. `annonces` : les arrivées déjà notifiées
 * (`cleAnnonce`) ; une arrivée n'est annoncée qu'une fois par occurrence.
 * Seulement ce qui me concerne : à moi, à mon groupe, au foyer.
 */
export function aNotifier(
  { echeances, consommables }: ContenuResume,
  today: PlainDate,
  push: Readonly<Record<Importance, boolean>>,
  annonces: ReadonlySet<string>,
): ElementPush[] {
  const motif = (
    cle: string,
    due: PlainDate,
    importance: Importance,
    voulu: boolean,
    actionnable: boolean,
  ): Motif | null => {
    if (!voulu || !actionnable) {
      return null;
    }

    if (importance === "critique") {
      return "critique";
    }

    return annonces.has(cleAnnonce({ cle, due })) ? null : "arrivee";
  };

  const depuisEcheances = echeances
    .filter(row => row.pourMoi && row.notifier !== false)
    .map(row => situer(row, today))
    .filter((s): s is Situee => s !== null)
    .map(s => {
      const cle = cleDe("e", s.row.id);
      const m = rappelDuJour(s, today)
        ? "rappel"
        : motif(
            cle,
            s.occurrence.due,
            s.importance,
            s.row.notifier === true || push[s.importance],
            ACTIONNABLE.has(s.occurrence.state),
          );

      return m === null
        ? null
        : {
            cle,
            titre: s.row.titre,
            ficheTitre: s.row.ficheTitre,
            due: s.occurrence.due,
            importance: s.importance,
            motif: m,
          };
    });
  const depuisConsommables = consommables.map(row => {
    const c = situerConsommable(row, today);
    const cle = cleDe("c", row.id);
    const m =
      c &&
      motif(
        cle,
        c.due,
        c.importance,
        push[c.importance],
        ACTIONNABLE.has(c.state),
      );

    return c === null || m === null
      ? null
      : {
          cle,
          titre: row.intitule,
          ficheTitre: row.ficheTitre,
          due: c.due,
          importance: c.importance,
          motif: m,
        };
  });

  return [...depuisEcheances, ...depuisConsommables]
    .filter((e): e is ElementPush => e !== null)
    .sort(
      (a, b) =>
        compare(a.due, b.due) ||
        IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance],
    );
}

export interface MessagePush {
  readonly title: string;
  readonly body: string;
  /** Où l'ouvrir dans l'app. */
  readonly url: string;
}

function quand(e: ElementPush, today: PlainDate): string {
  const texte = whenText(e.due, today);

  return e.motif === "rappel" ? `rappel, ${texte}` : texte;
}

const nom = (e: ElementPush) =>
  [e.titre, e.ficheTitre ?? ""].filter(Boolean).join(" · ");

/** Une notification pour tout le matin, jamais une par échéance. */
export function messagePush(
  elements: readonly ElementPush[],
  today: PlainDate,
): MessagePush {
  const [seul] = elements;

  if (elements.length === 1 && seul !== undefined) {
    return {
      title: nom(seul),
      body: quand(seul, today).replace(/^./, c => c.toUpperCase()),
      url: "/",
    };
  }

  return {
    title: `${elements.length} échéances ce matin`,
    body: elements.map(e => `${nom(e)} — ${quand(e, today)}`).join("\n"),
    url: "/",
  };
}
