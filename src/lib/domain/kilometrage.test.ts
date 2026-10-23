import { describe, expect, it } from "vitest";
import type { Releve } from "./entretien";
import {
  anneesDeLaPeriode,
  compteurAu,
  courbe,
  debutDePeriode,
  kmParAn,
  PERIODE_PAR_DEFAUT,
} from "./kilometrage";
import { fromISO } from "./plain-date";

const r = (le: string, valeur: number): Releve => ({ le: fromISO(le), valeur });

const AUJOURDHUI = fromISO("2026-10-23");
// Volontairement dans le désordre : rien ne suppose des relevés triés.
const RELEVES = [
  r("2025-07-01", 110_000),
  r("2024-07-01", 100_000),
  r("2026-07-01", 118_000),
];

describe("compteurAu", () => {
  it("interpole entre les deux relevés qui encadrent la date", () => {
    // 184 jours sur 365 entre le 1er juillet 2024 et le 1er juillet 2025.
    expect(compteurAu(RELEVES, fromISO("2025-01-01"))).toBeCloseTo(
      100_000 + (10_000 * 184) / 365,
    );
    expect(compteurAu(RELEVES, fromISO("2025-07-01"))).toBe(110_000);
  });

  it("ne devine rien hors des relevés", () => {
    expect(compteurAu(RELEVES, fromISO("2024-01-01"))).toBeNull();
    expect(compteurAu(RELEVES, fromISO("2026-08-01"))).toBeNull();
    expect(compteurAu([], AUJOURDHUI)).toBeNull();
  });
});

describe("kmParAn", () => {
  it("compte chaque année civile, l'année en cours jusqu'au dernier relevé", () => {
    const annees = kmParAn(RELEVES, AUJOURDHUI);

    // 2024 n'a pas de relevé avant le 1er janvier : pas de barre.
    expect(annees.map(a => [a.annee, a.enCours])).toEqual([
      [2025, false],
      [2026, true],
    ]);
    expect(annees[0]?.km).toBe(
      Math.round(
        (compteurAu(RELEVES, fromISO("2026-01-01")) as number) -
          (compteurAu(RELEVES, fromISO("2025-01-01")) as number),
      ),
    );
    expect(annees[1]?.km).toBe(
      Math.round(
        118_000 - (compteurAu(RELEVES, fromISO("2026-01-01")) as number),
      ),
    );
  });

  it("ne marque pas « en cours » une année passée qui finit le dernier relevé", () => {
    expect(kmParAn(RELEVES, fromISO("2027-03-01"))).toEqual([
      expect.objectContaining({ annee: 2025, enCours: false }),
    ]);
    expect(kmParAn([], AUJOURDHUI)).toEqual([]);
  });
});

describe("anneesDeLaPeriode", () => {
  it("ne garde que les années qui commencent dans la période", () => {
    const annees = [2024, 2025, 2026].map(annee => ({
      annee,
      km: 1,
      enCours: false,
    }));

    expect(
      anneesDeLaPeriode(annees, fromISO("2024-10-23")).map(a => a.annee),
    ).toEqual([2025, 2026]);
    expect(
      anneesDeLaPeriode(annees, fromISO("2024-01-01")).map(a => a.annee),
    ).toEqual([2024, 2025, 2026]);
  });
});

describe("debutDePeriode", () => {
  it("remonte de N ans, ou au premier relevé pour « tout »", () => {
    expect(PERIODE_PAR_DEFAUT).toBe(2);
    expect(debutDePeriode(2, RELEVES, AUJOURDHUI)).toEqual(
      fromISO("2024-10-23"),
    );
    expect(debutDePeriode("tout", RELEVES, AUJOURDHUI)).toEqual(
      fromISO("2024-07-01"),
    );
    expect(debutDePeriode("tout", [], AUJOURDHUI)).toEqual(AUJOURDHUI);
  });
});

describe("courbe", () => {
  const DIMS = { largeur: 340, hauteur: 180, gauche: 40, bas: 20, haut: 10 };

  it("met à l'échelle les relevés et les repères de la période", () => {
    const c = courbe(
      RELEVES,
      [
        { le: fromISO("2026-03-03"), compteur: 115_000 },
        { le: fromISO("2020-01-01"), compteur: 50_000 },
      ],
      2,
      AUJOURDHUI,
      DIMS,
    );

    // Le relevé de juillet 2024 tombe avant la période de deux ans.
    expect(c.points.map(p => p.valeur)).toEqual([110_000, 118_000]);
    expect(c.reperes).toHaveLength(1);
    expect(c.reperes[0]?.index).toBe(0);
    expect(c.graduationsX.map(g => g.annee)).toEqual([2025, 2026]);
    expect(c.graduationsY.map(g => g.km)).toEqual([
      110_000, 112_000, 114_000, 116_000, 118_000,
    ]);

    for (const p of [...c.points, ...c.reperes]) {
      expect(p.x).toBeGreaterThanOrEqual(DIMS.gauche);
      expect(p.x).toBeLessThanOrEqual(DIMS.largeur);
      expect(p.y).toBeGreaterThanOrEqual(DIMS.haut);
      expect(p.y).toBeLessThanOrEqual(DIMS.hauteur - DIMS.bas);
    }
    // Le plus récent est le plus à droite, et le plus haut.
    expect(c.points[1]?.x).toBeGreaterThan(c.points[0]?.x as number);
    expect(c.points[1]?.y).toBeLessThan(c.points[0]?.y as number);
  });

  it("tient debout avec un seul relevé, le jour même, ou sans rien", () => {
    const seul = courbe([r("2026-10-23", 0)], [], "tout", AUJOURDHUI, DIMS);

    expect(seul.points).toEqual([
      expect.objectContaining({ x: DIMS.gauche, y: DIMS.hauteur - DIMS.bas }),
    ]);
    expect(seul.graduationsY.map(g => g.km)).toEqual([0, 1000]);
    expect(courbe([], [], 2, AUJOURDHUI, DIMS)).toEqual({
      points: [],
      reperes: [],
      graduationsX: [],
      graduationsY: [],
    });
  });
});
