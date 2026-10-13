import { describe, expect, it } from "vitest";
import {
  type EcheanceRow,
  homeDeadlines,
  iconFor,
  nextUpText,
  occurrenceACocher,
  recordViews,
  SANS_CATEGORIE,
  upcomingItems,
  whenText,
} from "@/lib/data/views";
import { fromISO } from "@/lib/domain/plain-date";

const d = fromISO;
const TODAY = d("2026-10-13");

const echeance = (overrides: Partial<EcheanceRow>): EcheanceRow => ({
  id: "e",
  titre: "Échéance",
  categorie: "Maison",
  recurrence: { kind: "once", on: d("2026-10-13") },
  toleranceJours: 3,
  preavisJours: 7,
  tenue: "souple",
  importance: "normal",
  ficheTitre: null,
  destinataire: "Foyer",
  creeLe: d("2026-10-01"),
  completions: [],
  ...overrides,
});

describe("recordViews", () => {
  it("traduit la nature et range une fiche sans catégorie", () => {
    expect(
      recordViews([
        { id: "f", nature: "vehicule", titre: "La voiture", categorie: null },
      ]),
    ).toEqual([
      {
        id: "f",
        title: "La voiture",
        nature: "Véhicule",
        category: SANS_CATEGORIE,
        descriptor: "",
      },
    ]);
  });
});

describe("homeDeadlines — l'accueil (§ 10.1)", () => {
  const ids = (rows: EcheanceRow[]) =>
    homeDeadlines(rows, TODAY).map(view => view.id);

  it("ordonne : critiques à faire, autres à faire, puis préavis", () => {
    expect(
      ids([
        echeance({
          id: "preavis",
          recurrence: { kind: "once", on: d("2026-10-16") },
        }),
        echeance({ id: "due" }),
        echeance({ id: "critique", importance: "critique" }),
      ]),
    ).toEqual(["critique", "due", "preavis"]);
  });

  it("⚠️ une critique en préavis reste au rang 4, en tête de son rang", () => {
    expect(
      ids([
        echeance({ id: "due" }),
        echeance({
          id: "preavis-normal",
          recurrence: { kind: "once", on: d("2026-10-15") },
        }),
        echeance({
          id: "preavis-critique",
          importance: "critique",
          recurrence: { kind: "once", on: d("2026-10-18") },
        }),
      ]),
    ).toEqual(["due", "preavis-critique", "preavis-normal"]);
  });

  it("n'affiche ni une échéance dormante, ni une échéance faite", () => {
    expect(
      ids([
        echeance({
          id: "dormante",
          recurrence: { kind: "once", on: d("2026-12-01") },
        }),
        echeance({
          id: "faite",
          completions: [{ occurrence: TODAY, faiteLe: TODAY }],
        }),
        echeance({ id: "illisible", recurrence: null }),
      ]),
    ).toEqual([]);
  });

  it("habille la carte : état, quand, détail, teinte, historique", () => {
    const [view] = homeDeadlines(
      [
        echeance({
          id: "ferme",
          tenue: "ferme",
          toleranceJours: 1,
          recurrence: {
            kind: "interval",
            anchor: d("2026-09-10"),
            every: { count: 1, unit: "month" },
          },
          creeLe: d("2026-09-01"),
          ficheTitre: "La chaudière",
          completions: [
            { occurrence: d("2026-09-10"), faiteLe: d("2026-09-11") },
          ],
        }),
      ],
      TODAY,
    );

    expect(view).toMatchObject({
      state: "en retard",
      when: "depuis 3 jours",
      detail: "10 octobre 2026 · La chaudière",
      tone: "critical",
      verb: "Fait",
      canPostpone: false,
      history: [{ date: "11 sept.", text: "Fait" }],
    });
  });

  it("garde les trois derniers gestes, du plus récent au plus ancien", () => {
    const [view] = homeDeadlines(
      [
        echeance({
          recurrence: {
            kind: "interval",
            anchor: d("2026-09-01"),
            every: { count: 1, unit: "week" },
          },
          creeLe: d("2026-09-01"),
          completions: ["01", "08", "15", "22"].map(jour => ({
            occurrence: d(`2026-09-${jour}`),
            faiteLe: d(`2026-09-${jour}`),
          })),
        }),
      ],
      TODAY,
    );

    expect(view?.history.map(h => h.date)).toEqual([
      "22 sept.",
      "15 sept.",
      "8 sept.",
    ]);
  });

  it("teinte une critique : alerte à faire, sérieuse en préavis", () => {
    const [due, preavis] = homeDeadlines(
      [
        echeance({ id: "due", importance: "critique" }),
        echeance({
          id: "preavis",
          importance: "critique",
          recurrence: { kind: "once", on: d("2026-10-16") },
        }),
      ],
      TODAY,
    );

    expect(due?.tone).toBe("critical");
    expect(preavis?.tone).toBe("serious");
  });

  it("départage deux échéances du même rang par leur date", () => {
    expect(
      ids([
        echeance({
          id: "hier",
          recurrence: { kind: "once", on: d("2026-10-12") },
        }),
        echeance({
          id: "avant-hier",
          recurrence: { kind: "once", on: d("2026-10-11") },
        }),
      ]),
    ).toEqual(["avant-hier", "hier"]);
  });

  it("range une échéance sans catégorie sous « Sans catégorie »", () => {
    const [view] = homeDeadlines([echeance({ categorie: null })], TODAY);
    const [item] = upcomingItems([echeance({ categorie: null })], TODAY);

    expect(view?.category).toBe(SANS_CATEGORIE);
    expect(item?.category).toBe(SANS_CATEGORIE);
  });

  it("décrit l'ouverture du préavis", () => {
    const [view] = homeDeadlines(
      [echeance({ recurrence: { kind: "once", on: d("2026-10-18") } })],
      TODAY,
    );

    expect(view?.detail).toBe(
      "18 octobre 2026 · préavis ouvert depuis 2 jours sur 7",
    );
    expect(view?.tone).toBe("warning");
  });

  it("⚠️ fait monter une échéance ferme qui approche (handoff, règle 3)", () => {
    const [view] = homeDeadlines(
      [
        echeance({
          tenue: "ferme",
          preavisJours: 60,
          recurrence: { kind: "once", on: d("2026-11-01") },
        }),
      ],
      TODAY,
    );

    expect(view).toMatchObject({ importance: "important", raised: true });
  });

  it("donne un préavis de 7 jours à une échéance qui n'en a pas", () => {
    expect(
      ids([
        echeance({
          id: "sans-preavis",
          preavisJours: null,
          recurrence: { kind: "once", on: d("2026-10-20") },
        }),
      ]),
    ).toEqual(["sans-preavis"]);
  });
});

describe("upcomingItems — À venir", () => {
  it("donne toute échéance à sa date, dormantes comprises, dans l'ordre", () => {
    expect(
      upcomingItems(
        [
          echeance({
            id: "tard",
            titre: "Tard",
            recurrence: { kind: "once", on: d("2026-12-01") },
          }),
          echeance({ id: "tot", titre: "Tôt", ficheTitre: "La télé" }),
        ],
        TODAY,
      ),
    ).toEqual([
      {
        date: "2026-10-13",
        title: "Tôt",
        detail: "La télé",
        category: "Maison",
        importance: "normal",
        raised: false,
        tenure: "souple",
      },
      expect.objectContaining({ date: "2026-12-01", title: "Tard" }),
    ]);
  });
});

describe("nextUpText — l'accueil vide", () => {
  it("annonce la prochaine échéance dormante", () => {
    expect(
      nextUpText(
        [
          echeance({
            titre: "Rentrer le citronnier",
            recurrence: { kind: "once", on: d("2026-11-01") },
          }),
        ],
        TODAY,
      ),
    ).toBe(
      "Le prochain rendez-vous est le 1 novembre 2026 : rentrer le citronnier. Il apparaîtra ici quand son préavis s'ouvrira.",
    );
  });

  it("choisit la plus proche des échéances dormantes", () => {
    expect(
      nextUpText(
        [
          echeance({
            titre: "Plus tard",
            recurrence: { kind: "once", on: d("2027-01-01") },
          }),
          echeance({
            titre: "Bientôt",
            recurrence: { kind: "once", on: d("2026-11-01") },
          }),
        ],
        TODAY,
      ),
    ).toContain("bientôt");
  });

  it("ne dit rien s'il n'y a rien à venir", () => {
    expect(nextUpText([], TODAY)).toBeNull();
  });
});

describe("occurrenceACocher — le bouton « Fait »", () => {
  it("coche l'occurrence en cours, même en préavis", () => {
    expect(occurrenceACocher(echeance({}), TODAY)).toEqual(TODAY);
    expect(
      occurrenceACocher(
        echeance({ recurrence: { kind: "once", on: d("2026-10-16") } }),
        TODAY,
      ),
    ).toEqual(d("2026-10-16"));
  });

  it("ne coche ni une échéance dormante, ni une échéance terminée", () => {
    expect(
      occurrenceACocher(
        echeance({ recurrence: { kind: "once", on: d("2026-12-01") } }),
        TODAY,
      ),
    ).toBeNull();
    expect(
      occurrenceACocher(
        echeance({ completions: [{ occurrence: TODAY, faiteLe: TODAY }] }),
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("textes et icônes", () => {
  it.each([
    ["2026-10-13", "aujourd'hui"],
    ["2026-10-14", "demain"],
    ["2026-10-20", "dans 7 jours"],
    ["2026-10-12", "depuis hier"],
    ["2026-10-10", "depuis 3 jours"],
  ])("whenText %s → %s", (due, texte) => {
    expect(whenText(d(due), TODAY)).toBe(texte);
  });

  it.each([
    ["Garanties", "warranty"],
    ["Véhicule", "vehicle"],
    ["Jardin", "fertiliser"],
    ["Administratif", "generic"],
    [null, "generic"],
  ])("iconFor %s → %s", (categorie, icone) => {
    expect(iconFor(categorie)).toBe(icone);
  });
});
