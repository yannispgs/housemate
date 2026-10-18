import { describe, expect, it } from "vitest";
import type { ConsommableRow } from "@/lib/data/store";
import {
  type EcheanceRow,
  homeDeadlines,
  iconFor,
  libelleFoyer,
  nextUpText,
  occurrenceACocher,
  recap,
  recordViews,
  SANS_CATEGORIE,
  semaineDuRecap,
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

describe("semaineDuRecap", () => {
  it.each([
    ["2026-10-13", "2026-10-12", "2026-10-18"],
    ["2026-10-17", "2026-10-12", "2026-10-18"],
    // Le dimanche soir, le récap parle de la semaine qui commence.
    ["2026-10-18", "2026-10-19", "2026-10-25"],
  ])("le %s : du %s au %s", (jour, lundi, dimanche) => {
    expect(semaineDuRecap(d(jour))).toEqual({
      lundi: d(lundi),
      dimanche: d(dimanche),
    });
  });
});

describe("recap — le récap de la semaine", () => {
  const once = (on: string) => ({ kind: "once" as const, on: d(on) });

  it("garde la semaine, et ce qui traîne encore, dans l'ordre des dates", () => {
    const { coming } = recap(
      [
        echeance({
          id: "loin",
          titre: "Plus tard",
          recurrence: once("2026-10-25"),
        }),
        echeance({
          titre: "Jeudi",
          recurrence: once("2026-10-15"),
          ficheTitre: "La voiture",
        }),
        echeance({ titre: "Lundi", recurrence: once("2026-10-12") }),
        echeance({
          titre: "En retard",
          tenue: "ferme",
          recurrence: once("2026-10-08"),
        }),
      ],
      TODAY,
    );

    expect(
      coming.map(r => [r.weekday, r.dayOfMonth, r.title, r.detail]),
    ).toEqual([
      ["jeu", "08", "En retard", "en retard depuis 5 jours"],
      ["lun", "12", "Lundi", "en tolérance depuis hier"],
      ["jeu", "15", "Jeudi", "La voiture"],
    ]);
  });

  it("⚠️ n'y met jamais une échéance pour mémoire", () => {
    const { coming, done } = recap(
      [
        echeance({
          importance: "memoire",
          recurrence: once("2026-10-15"),
          completions: [
            { occurrence: d("2026-10-10"), faiteLe: d("2026-10-10") },
          ],
        }),
      ],
      TODAY,
    );

    expect(coming).toEqual([]);
    expect(done).toEqual([]);
  });

  it.each([
    [0, "Aucune échéance ferme cette semaine : tout peut glisser."],
    [1, "Une seule échéance ferme cette semaine. Le reste peut glisser."],
    [2, "2 échéances fermes cette semaine."],
  ])("compte %i échéance(s) ferme(s)", (fermes, note) => {
    const rows = Array.from({ length: 2 }, (_, i) =>
      echeance({
        id: `e${i}`,
        tenue: i < fermes ? "ferme" : "souple",
        recurrence: once("2026-10-16"),
      }),
    );

    expect(recap(rows, TODAY).comingNote).toBe(note);
  });

  it("montre ce qui a été fait ces sept derniers jours, le plus récent d'abord", () => {
    const { done } = recap(
      [
        echeance({
          titre: "Engrais",
          ficheTitre: "Citronnier",
          recurrence: {
            kind: "interval",
            anchor: d("2026-09-01"),
            every: { count: 1, unit: "day" },
          },
          completions: [
            { occurrence: d("2026-10-06"), faiteLe: d("2026-10-06") },
            { occurrence: d("2026-10-07"), faiteLe: d("2026-10-07") },
            { occurrence: d("2026-10-13"), faiteLe: d("2026-10-13") },
          ],
        }),
      ],
      TODAY,
    );

    expect(done.map(r => [r.weekday, r.dayOfMonth, r.title, r.detail])).toEqual(
      [
        ["mar", "13", "Engrais", "Citronnier"],
        ["mer", "07", "Engrais", "Citronnier"],
      ],
    );
  });

  it("range sans catégorie ce qui n'en a pas", () => {
    const { coming, done } = recap(
      [
        echeance({
          categorie: null,
          recurrence: once("2026-10-15"),
          completions: [
            { occurrence: d("2026-10-01"), faiteLe: d("2026-10-12") },
          ],
        }),
      ],
      TODAY,
    );

    expect(coming[0]?.category).toBe(SANS_CATEGORIE);
    expect(done[0]).toMatchObject({ category: SANS_CATEGORIE, detail: "" });
  });
});

describe("libelleFoyer", () => {
  it.each([
    ["Foyer Dulong", "Foyer · Dulong"],
    ["Dulong", "Foyer · Dulong"],
    ["  foyer de démonstration ", "Foyer · Démonstration"],
    ["Foyer d'Artagnan", "Foyer · Artagnan"],
    ["Foyer des Martin", "Foyer · Martin"],
    // Sans « Foyer » devant, rien n'est retiré.
    ["Des Martin", "Foyer · Des Martin"],
    ["Foyer", ""],
    ["   ", ""],
    [null, ""],
  ])("« %s » → « %s »", (nom, libelle) => {
    expect(libelleFoyer(nom)).toBe(libelle);
  });
});

describe("consommables à l'accueil et dans À venir (§ 5.3)", () => {
  // 50 km par jour ; 118 250 km au 13 octobre.
  const RELEVES = [
    { le: d("2025-10-13"), valeur: 100_000 },
    { le: d("2026-10-13"), valeur: 118_250 },
  ];
  const conso = (champs: Partial<ConsommableRow>): ConsommableRow => ({
    id: "c",
    intitule: "Vidange",
    ficheTitre: "La voiture",
    categorie: "Véhicule",
    tenue: "ferme",
    seuil: 0.075,
    dureeKm: 15_000,
    dureeTemps: null,
    remplacements: [{ le: d("2026-03-01"), compteur: 104_000 }],
    releves: RELEVES,
    ...champs,
  });
  const vue = (c: ConsommableRow) =>
    homeDeadlines([], TODAY, [c]).find(v => v.id === `consommable-${c.id}`);

  it("entre à l'accueil en préavis, sans bouton, avec une date estimée", () => {
    // Limite 119 000 : 750 km, 15 jours ; préavis 7,5 % = 23 jours.
    expect(vue(conso({}))).toMatchObject({
      title: "Vidange",
      state: "en préavis",
      when: "dans 15 jours",
      verb: "",
      tenure: "ferme",
      importance: "normal",
      category: "Véhicule",
      icon: "vehicle",
      detail: "vers le 28 octobre 2026, estimé au compteur · La voiture",
      history: [{ text: expect.stringMatching(/^Remplacé à 104.000 km$/) }],
    });
  });

  it("⚠️ en retard, il monte à critique et passe au rang 1", () => {
    const ids = homeDeadlines([echeance({ id: "due" })], TODAY, [
      conso({ remplacements: [{ le: d("2026-01-01"), compteur: 100_000 }] }),
    ]).map(v => [v.id, v.importance, v.state]);

    expect(ids).toEqual([
      ["consommable-c", "critique", "en retard"],
      ["due", "normal", "due"],
    ]);
  });

  it("souple, dû aujourd'hui : à faire, au rang 3, sans monter", () => {
    expect(
      vue(
        conso({
          tenue: "souple",
          dureeKm: null,
          dureeTemps: { count: 1, unit: "day" },
          remplacements: [{ le: d("2026-10-12"), compteur: null }],
          categorie: null,
        }),
      ),
    ).toMatchObject({
      state: "due",
      importance: "normal",
      raised: false,
      tenure: "souple",
      detail: "13 octobre 2026 · La voiture",
      category: SANS_CATEGORIE,
      history: [{ text: "Remplacé" }],
    });
  });

  it("⚠️ souple et en retard : reste dû, normal, derrière les critiques", () => {
    const ids = homeDeadlines(
      [echeance({ id: "critique", importance: "critique" })],
      TODAY,
      [
        conso({
          tenue: "souple",
          remplacements: [{ le: d("2026-01-01"), compteur: 100_000 }],
        }),
      ],
    ).map(v => [v.id, v.importance, v.state]);

    expect(ids).toEqual([
      ["critique", "critique", "due"],
      ["consommable-c", "normal", "en retard"],
    ]);
  });

  it("ferme : important à la moitié du préavis, en kilomètres", () => {
    // Limite 118 500 km, 118 250 au compteur : 250 km restants sur 1 125.
    expect(
      vue(
        conso({ remplacements: [{ le: d("2026-03-01"), compteur: 103_500 }] }),
      ),
    ).toMatchObject({ importance: "important", raised: true });
  });

  it("le seuil de l'objet ouvre le préavis plus tôt", () => {
    // 2 750 km restants : hors du préavis à 7,5 % (1 125), dedans à 20 %.
    const loin = conso({
      remplacements: [{ le: d("2026-03-01"), compteur: 106_000 }],
    });

    expect(vue(loin)).toBeUndefined();
    expect(vue({ ...loin, seuil: 0.2 })).toMatchObject({ state: "en préavis" });
  });

  it("loin : seulement dans À venir, à sa date estimée", () => {
    const courroie = conso({
      intitule: "Courroie",
      dureeKm: 120_000,
      remplacements: [{ le: d("2020-01-01"), compteur: 50_000 }],
    });

    expect(vue(courroie)).toBeUndefined();
    expect(upcomingItems([], TODAY, [courroie])).toEqual([
      {
        date: "2029-08-13",
        title: "Courroie",
        detail: "La voiture · date estimée au compteur",
        category: "Véhicule",
        importance: "normal",
        raised: false,
        tenure: "ferme",
      },
    ]);
  });

  it("À venir range consommables et échéances par date", () => {
    const items = upcomingItems(
      [
        echeance({
          titre: "Plus tard",
          recurrence: { kind: "once", on: d("2026-12-01") },
        }),
      ],
      TODAY,
      [
        conso({
          dureeKm: null,
          dureeTemps: { count: 1, unit: "month" },
          remplacements: [{ le: d("2026-10-01"), compteur: null }],
          categorie: null,
        }),
      ],
    );

    expect(items.map(i => [i.date, i.title, i.detail, i.category])).toEqual([
      ["2026-11-01", "Vidange", "La voiture", SANS_CATEGORIE],
      ["2026-12-01", "Plus tard", "", "Maison"],
    ]);
  });

  it("montre les derniers remplacements, le plus récent d'abord", () => {
    expect(
      vue(
        conso({
          remplacements: [
            { le: d("2025-09-01"), compteur: null },
            { le: d("2026-03-01"), compteur: 104_000 },
          ],
        }),
      )?.history.map(h => h.text),
    ).toEqual([expect.stringMatching(/^Remplacé à /), "Remplacé"]);
  });

  it("rien pour un consommable sans remplacement noté", () => {
    const sans = conso({ remplacements: [] });

    expect(homeDeadlines([], TODAY, [sans])).toEqual([]);
    expect(upcomingItems([], TODAY, [sans])).toEqual([]);
  });
});
