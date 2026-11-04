import { describe, expect, it } from "vitest";
import {
  aNotifier,
  cleAnnonce,
  type ElementPush,
  messagePush,
} from "@/lib/data/push";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import type { ConsommableRow } from "@/lib/data/store";
import type { EcheanceRow } from "@/lib/data/views";
import { fromISO } from "@/lib/domain/plain-date";

const d = fromISO;
/** Un lundi. */
const LUNDI = d("2026-10-19");
const PUSH = REGLAGES_PAR_DEFAUT.push;
const AUCUNE = new Set<string>();

const echeance = (overrides: Partial<EcheanceRow>): EcheanceRow => ({
  id: "e",
  titre: "Échéance",
  categorie: "Maison",
  recurrence: { kind: "once", on: LUNDI },
  toleranceJours: 3,
  preavisJours: 7,
  tenue: "souple",
  importance: "normal",
  ficheId: null,
  ficheTitre: null,
  destinataire: "Foyer",
  pourMoi: true,
  creeLe: d("2026-10-01"),
  completions: [],
  rappels: [],
  notifier: null,
  ...overrides,
});

const consommable = (
  overrides: Partial<ConsommableRow> = {},
): ConsommableRow => ({
  id: "c",
  intitule: "Filtre à air",
  ficheId: "f",
  ficheTitre: "La voiture",
  categorie: "Véhicule",
  tenue: "souple",
  seuil: 0.075,
  dureeKm: null,
  dureeTemps: { count: 1, unit: "year" },
  remplacements: [{ le: d("2025-10-19"), compteur: null }],
  releves: [],
  ...overrides,
});

const notifier = (
  echeances: readonly EcheanceRow[],
  {
    consommables = [],
    push = PUSH,
    annonces = AUCUNE,
  }: {
    consommables?: readonly ConsommableRow[];
    push?: typeof PUSH;
    annonces?: ReadonlySet<string>;
  } = {},
) =>
  aNotifier({ echeances, consommables }, LUNDI, push, annonces).map(e => [
    e.titre,
    e.motif,
  ]);

describe("aNotifier, selon le tableau", () => {
  it("par défaut : critique et important à faire, rien d'autre", () => {
    expect(
      notifier([
        echeance({ id: "1", titre: "Critique", importance: "critique" }),
        echeance({ id: "2", titre: "Importante", importance: "important" }),
        echeance({ id: "3", titre: "Normale" }),
        echeance({ id: "4", titre: "Mémoire", importance: "memoire" }),
        echeance({
          id: "5",
          titre: "Plus tard",
          importance: "critique",
          recurrence: { kind: "once", on: d("2026-11-30") },
        }),
      ]),
    ).toEqual([
      ["Critique", "critique"],
      ["Importante", "arrivee"],
    ]);
  });

  it("suit les niveaux cochés", () => {
    expect(
      notifier(
        [
          echeance({ id: "1", titre: "Critique", importance: "critique" }),
          echeance({ id: "3", titre: "Normale" }),
        ],
        { push: { ...PUSH, critique: false, normal: true } },
      ),
    ).toEqual([["Normale", "arrivee"]]);
  });

  it("une critique revient chaque matin, même en retard", () => {
    const enRetard = echeance({
      titre: "En retard",
      importance: "critique",
      tenue: "ferme",
      recurrence: { kind: "once", on: d("2026-10-10") },
    });
    const annonces = new Set([
      cleAnnonce({ cle: "e-e", due: d("2026-10-10") }),
    ]);

    expect(notifier([enRetard], { annonces })).toEqual([
      ["En retard", "critique"],
    ]);
  });

  it("les autres niveaux, une fois par occurrence", () => {
    const importante = echeance({
      titre: "Importante",
      importance: "important",
    });

    expect(
      notifier([importante], {
        annonces: new Set([cleAnnonce({ cle: "e-e", due: LUNDI })]),
      }),
    ).toEqual([]);
    // Annoncée pour une occurrence précédente : celle-ci est nouvelle.
    expect(
      notifier([importante], {
        annonces: new Set([cleAnnonce({ cle: "e-e", due: d("2025-10-19") })]),
      }),
    ).toEqual([["Importante", "arrivee"]]);
  });

  it("seulement ce qui me concerne, et ce qui se situe", () => {
    expect(
      notifier([
        echeance({ importance: "critique", pourMoi: false }),
        echeance({ importance: "critique", recurrence: null }),
      ]),
    ).toEqual([]);
  });
});

describe("aNotifier, l'exception d'une échéance", () => {
  it("la fait notifier quel que soit le tableau", () => {
    expect(notifier([echeance({ titre: "Normale", notifier: true })])).toEqual([
      ["Normale", "arrivee"],
    ]);
  });

  it("la tait, rappels compris", () => {
    expect(
      notifier([
        echeance({
          importance: "critique",
          notifier: false,
          rappels: [{ amount: 0, unit: "day", channels: ["push"] }],
        }),
      ]),
    ).toEqual([]);
  });
});

describe("aNotifier, les rappels par notification", () => {
  const plusTard = { kind: "once", on: d("2026-10-22") } as const;

  it("partent le matin de leur jour, même pour un niveau non coché", () => {
    expect(
      notifier([
        echeance({
          titre: "Rappelée",
          recurrence: plusTard,
          rappels: [{ amount: 3, unit: "day", channels: ["push"] }],
        }),
        echeance({
          id: "2",
          titre: "Par e-mail",
          recurrence: plusTard,
          rappels: [{ amount: 3, unit: "day", channels: ["email"] }],
        }),
        echeance({
          id: "3",
          titre: "Pas aujourd'hui",
          recurrence: plusTard,
          rappels: [{ amount: 2, unit: "day", channels: ["push"] }],
        }),
      ]),
    ).toEqual([["Rappelée", "rappel"]]);
  });

  it("rien pour ce qui est déjà en retard", () => {
    expect(
      notifier(
        [
          echeance({
            tenue: "ferme",
            recurrence: { kind: "once", on: d("2026-10-10") },
            rappels: [{ amount: 9, unit: "day", channels: ["push"] }],
          }),
        ],
        // Ferme et en retard, elle monte en critique : seul le rappel compte.
        { push: { ...PUSH, critique: false } },
      ),
    ).toEqual([]);
  });
});

describe("aNotifier, le plan d'entretien", () => {
  it("un consommable à faire notifie selon son niveau", () => {
    const voulu = { ...PUSH, normal: true };

    expect(
      notifier([], { consommables: [consommable()], push: voulu }),
    ).toEqual([["Filtre à air", "arrivee"]]);
    expect(notifier([], { consommables: [consommable()] })).toEqual([]);
    // Sans durée, il ne se situe pas.
    expect(
      notifier([], {
        consommables: [consommable({ dureeTemps: null })],
        push: voulu,
      }),
    ).toEqual([]);
  });
});

it("trie par date, puis par importance", () => {
  expect(
    notifier([
      echeance({
        id: "1",
        titre: "Lundi, importante",
        importance: "important",
      }),
      echeance({
        id: "2",
        titre: "Avant",
        importance: "important",
        recurrence: { kind: "once", on: d("2026-10-18") },
      }),
      echeance({ id: "3", titre: "Lundi, critique", importance: "critique" }),
    ]),
  ).toEqual([
    ["Avant", "arrivee"],
    ["Lundi, critique", "critique"],
    ["Lundi, importante", "arrivee"],
  ]);
});

describe("messagePush", () => {
  const element = (overrides: Partial<ElementPush>): ElementPush => ({
    cle: "e-1",
    titre: "Vidange",
    ficheTitre: "La voiture",
    due: LUNDI,
    importance: "critique",
    motif: "critique",
    ...overrides,
  });

  it("une seule échéance : son nom, et quand", () => {
    expect(messagePush([element({})], LUNDI)).toEqual({
      title: "Vidange · La voiture",
      body: "Aujourd'hui",
      url: "/",
    });
    expect(
      messagePush(
        [element({ ficheTitre: null, motif: "rappel", due: d("2026-10-22") })],
        LUNDI,
      ).body,
    ).toBe("Rappel, dans 3 jours");
  });

  it("plusieurs : une seule notification qui les regroupe", () => {
    expect(
      messagePush(
        [
          element({}),
          element({
            titre: "Assurance",
            ficheTitre: null,
            due: d("2026-10-17"),
          }),
        ],
        LUNDI,
      ),
    ).toEqual({
      title: "2 échéances ce matin",
      body: "Vidange · La voiture — aujourd'hui\nAssurance — depuis 2 jours",
      url: "/",
    });
  });
});
