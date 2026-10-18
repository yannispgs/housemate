import { describe, expect, it } from "vitest";
import {
  type Consommable,
  compteurEstime,
  etatConsommable,
  importanceConsommable,
  type Releve,
  rythme,
} from "@/lib/domain/entretien";
import { fromISO } from "@/lib/domain/plain-date";

const d = fromISO;
const TODAY = d("2026-10-15");
const r = (le: string, valeur: number): Releve => ({ le: d(le), valeur });

/** 50 km par jour sur la dernière année. */
const UN_AN = [r("2025-10-15", 100_000), r("2026-10-15", 118_250)];

describe("rythme — kilomètres par jour (§ 5.3)", () => {
  it("se calcule du premier au dernier relevé", () => {
    expect(rythme(UN_AN, TODAY)).toBe(50);
  });

  it("⚠️ n'existe pas avec un seul relevé, ni si le compteur n'avance pas", () => {
    expect(rythme([r("2026-10-15", 100)], TODAY)).toBeNull();
    expect(rythme([], TODAY)).toBeNull();
    expect(
      rythme([r("2025-10-15", 100), r("2026-10-15", 100)], TODAY),
    ).toBeNull();
  });

  it("retient le rythme récent quand on roule davantage", () => {
    const releves = [
      r("2024-10-15", 0),
      r("2026-04-15", 10_950),
      r("2026-10-15", 21_900),
    ];

    // Sur deux ans : 30 km/j ; sur six mois : près de 60.
    expect(rythme(releves, TODAY)).toBeCloseTo(10_950 / 183);
  });

  it("⚠️ garde le rythme de référence quand on roule moins : jamais d'alerte retardée", () => {
    const releves = [
      r("2024-10-15", 0),
      r("2026-04-15", 20_000),
      r("2026-10-15", 21_000),
    ];

    expect(rythme(releves, TODAY)).toBeCloseTo(21_000 / 730);
  });

  it("ignore un rythme récent fondé sur des relevés trop rapprochés", () => {
    const releves = [
      r("2024-10-15", 0),
      r("2026-09-01", 10_000),
      r("2026-10-15", 20_000),
    ];

    expect(rythme(releves, TODAY)).toBeCloseTo(20_000 / 730);
  });

  it("prend tout l'historique quand les deux ans n'ont qu'un relevé", () => {
    expect(
      rythme([r("2023-01-01", 0), r("2026-10-15", 13_830)], TODAY),
    ).toBeCloseTo(13_830 / 1383);
  });

  it("ne tient pas compte d'un relevé daté de demain", () => {
    expect(rythme([...UN_AN, r("2027-01-01", 999_999)], TODAY)).toBe(50);
  });
});

describe("compteurEstime", () => {
  it("prolonge le dernier relevé au rythme", () => {
    expect(compteurEstime(UN_AN, d("2026-10-25"))).toBe(118_250 + 500);
  });

  it("rend le dernier relevé sans rythme, rien sans relevé", () => {
    expect(compteurEstime([r("2026-01-01", 42)], TODAY)).toBe(42);
    expect(compteurEstime([], TODAY)).toBeNull();
  });
});

describe("etatConsommable — l'échéance d'un consommable", () => {
  const courroie = (champs: Partial<Consommable> = {}): Consommable => ({
    dureeKm: 80_000,
    dureeTemps: { count: 10, unit: "year" },
    remplacements: [{ le: d("2020-10-15"), compteur: 50_000 }],
    ...champs,
  });

  it("retient le plus proche des deux termes, avec 7,5 % de préavis", () => {
    // Limite à 130 000 km ; 118 250 aujourd'hui ; 50 km/j → 235 jours.
    expect(etatConsommable(courroie(), UN_AN, TODAY)).toEqual({
      echeance: d("2027-06-07"),
      preavisJours: 120,
      // 11 750 km restants sur un préavis de 6 000 km.
      reste: expect.closeTo(11_750 / 6000, 5),
      terme: "compteur",
      donneeManquante: false,
      releveAttendu: false,
    });
  });

  it("⚠️ suit sa durée de vie : 100 000 km au lieu de 80 000 repoussent l'échéance", () => {
    expect(
      etatConsommable(courroie({ dureeKm: 100_000 }), UN_AN, TODAY).echeance,
    ).toEqual(d("2028-07-11"));
  });

  it("compte depuis le dernier remplacement", () => {
    const etat = etatConsommable(
      courroie({
        remplacements: [
          { le: d("2026-06-01"), compteur: 112_000 },
          { le: d("2020-10-15"), compteur: 50_000 },
        ],
      }),
      UN_AN,
      TODAY,
    );

    // Limite 192 000 km, atteinte à 50 km/j bien avant les dix ans.
    expect(etat.echeance).toEqual(d("2030-10-29"));
  });

  it("calcule un consommable purement calendaire", () => {
    expect(
      etatConsommable(
        {
          dureeKm: null,
          dureeTemps: { count: 3, unit: "month" },
          remplacements: [{ le: d("2026-08-01"), compteur: null }],
        },
        [],
        TODAY,
      ),
    ).toEqual({
      echeance: d("2026-11-01"),
      preavisJours: 7,
      reste: expect.closeTo(17 / 7, 5),
      terme: "temps",
      donneeManquante: false,
      releveAttendu: false,
    });
  });

  it("⚠️ un remplacement sans compteur : terme calendaire seul, donnée manquante", () => {
    expect(
      etatConsommable(
        courroie({ remplacements: [{ le: d("2020-10-15"), compteur: null }] }),
        UN_AN,
        TODAY,
      ),
    ).toEqual({
      echeance: d("2030-10-15"),
      preavisJours: 274,
      reste: expect.closeTo(1461 / 274, 5),
      terme: "temps",
      donneeManquante: true,
      releveAttendu: false,
    });
  });

  it("⚠️ un compteur sans rythme : donnée manquante, et pas d'échéance kilométrique", () => {
    expect(
      etatConsommable(
        courroie({ dureeTemps: null }),
        [r("2026-10-15", 118_250)],
        TODAY,
      ),
    ).toMatchObject({ echeance: null, donneeManquante: true });
  });

  it("rien sans aucun remplacement noté", () => {
    expect(
      etatConsommable(courroie({ remplacements: [] }), UN_AN, TODAY),
    ).toEqual({
      echeance: null,
      preavisJours: 0,
      reste: null,
      terme: null,
      donneeManquante: true,
      releveAttendu: false,
    });
  });

  describe("relevé à redemander", () => {
    // 50 km/j jusqu'au 1er mai, plus de relevé depuis : 26 600 estimés.
    const perimes = [r("2025-05-01", 0), r("2026-05-01", 18_250)];
    const filtre = (compteur: number): Consommable => ({
      dureeKm: 10_000,
      dureeTemps: null,
      remplacements: [{ le: d("2025-01-01"), compteur }],
    });

    it("⚠️ quand le relevé a plus de 3 mois et que la limite approche", () => {
      // Limite 28 000 : 1 400 km restants, moins de 20 %.
      expect(
        etatConsommable(filtre(18_000), perimes, TODAY).releveAttendu,
      ).toBe(true);
    });

    it("pas quand la limite est loin", () => {
      expect(
        etatConsommable(filtre(25_000), perimes, TODAY).releveAttendu,
      ).toBe(false);
    });

    it("pas quand le relevé est récent", () => {
      expect(
        etatConsommable(filtre(18_000), perimes, d("2026-07-15")).releveAttendu,
      ).toBe(false);
    });
  });
});

describe("seuil réglé par l'objet", () => {
  const vidange: Consommable = {
    dureeKm: 15_000,
    dureeTemps: null,
    remplacements: [{ le: d("2026-01-01"), compteur: 104_000 }],
  };

  it("élargit le préavis, et la part restante avec lui", () => {
    // 750 km restants : préavis de 1 125 km à 7,5 %, de 2 250 km à 15 %.
    expect(etatConsommable(vidange, UN_AN, TODAY)).toMatchObject({
      preavisJours: 23,
      reste: expect.closeTo(750 / 1125, 5),
    });
    expect(etatConsommable(vidange, UN_AN, TODAY, 0.15)).toMatchObject({
      preavisJours: 45,
      reste: expect.closeTo(750 / 2250, 5),
    });
  });

  it("garde un préavis d'au moins un jour", () => {
    expect(
      etatConsommable(
        {
          dureeKm: null,
          dureeTemps: { count: 1, unit: "day" },
          remplacements: [{ le: d("2026-10-14"), compteur: null }],
        },
        [],
        TODAY,
      ),
    ).toMatchObject({ preavisJours: 1, reste: 0 });
  });
});

describe("importanceConsommable — la montée, en proportion seulement", () => {
  it.each([
    [1, "normal"],
    [0.51, "normal"],
    [0.5, "important"],
    [0.11, "important"],
    [0.1, "critical"],
    [0, "critical"],
    [-0.3, "critical"],
  ] as const)("ferme, reste %f du préavis → %s", (reste, importance) => {
    expect(importanceConsommable("ferme", reste)).toBe(importance);
  });

  it("⚠️ souple : ne monte jamais, même au-delà de la limite", () => {
    expect(importanceConsommable("souple", -2)).toBe("normal");
  });
});
