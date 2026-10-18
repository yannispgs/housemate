import { describe, expect, it } from "vitest";
import {
  type IdsByTable,
  newIds,
  planSeedMerge,
  type TableSnapshot,
} from "@/lib/db/seed-merge";

const ids = (entries: Record<string, string[]>): IdsByTable =>
  new Map(Object.entries(entries).map(([t, list]) => [t, new Set(list)]));

const fiches: TableSnapshot = {
  name: "fiches",
  references: [{ column: "foyer_id", table: "foyers" }],
  rows: [
    { id: "f-fictive", foyer_id: "foyer" },
    { id: "f-saisie", foyer_id: "foyer" },
  ],
};

const echeances: TableSnapshot = {
  name: "echeances",
  references: [
    { column: "foyer_id", table: "foyers" },
    { column: "fiche_id", table: "fiches" },
  ],
  rows: [
    { id: "e-fictive", foyer_id: "foyer", fiche_id: null },
    { id: "e-de-fiche-fictive", foyer_id: "foyer", fiche_id: "f-fictive" },
    { id: "e-saisie", foyer_id: "foyer", fiche_id: "f-saisie" },
    { id: "e-seule", foyer_id: "foyer", fiche_id: null },
  ],
};

const completions: TableSnapshot = {
  name: "completions",
  references: [
    { column: "echeance_id", table: "echeances" },
    { column: "corrige", table: "completions" },
  ],
  rows: [
    // La correction avant l'originale : à remettre dans l'ordre.
    { id: "c-correction", echeance_id: "e-saisie", corrige: "c-originale" },
    { id: "c-originale", echeance_id: "e-saisie", corrige: null },
    { id: "c-fictive", echeance_id: "e-fictive", corrige: null },
  ],
};

const foyers: TableSnapshot = {
  name: "foyers",
  references: [],
  rows: [{ id: "foyer" }],
};

const names = (rows: readonly { readonly [k: string]: unknown }[]) =>
  rows.map(r => r.id);

describe("planSeedMerge", () => {
  it("garde la saisie et écarte le jeu fictif avec ce qui s'y rattache", () => {
    const plan = planSeedMerge(
      [completions, echeances, fiches, foyers],
      ids({ fiches: ["f-fictive"], echeances: ["e-fictive"] }),
    );

    expect(plan.map(t => t.name)).toEqual([
      "foyers",
      "fiches",
      "echeances",
      "completions",
    ]);
    expect(plan.map(t => names(t.rows))).toEqual([
      ["foyer"],
      ["f-saisie"],
      ["e-saisie", "e-seule"],
      ["c-originale", "c-correction"],
    ]);
  });

  it("écarte la correction d'une complétion écartée", () => {
    const table: TableSnapshot = {
      name: "completions",
      references: [{ column: "corrige", table: "completions" }],
      rows: [
        { id: "c3", corrige: "c2" },
        { id: "c2", corrige: "c1" },
        { id: "c1", corrige: null },
        { id: "autre", corrige: null },
      ],
    };

    const [plan] = planSeedMerge([table], ids({ completions: ["c1"] }));

    expect(names(plan?.rows ?? [])).toEqual(["autre"]);
  });

  it("garde une ligne sans identifiant tant que ses références tiennent", () => {
    const membres: TableSnapshot = {
      name: "groupe_membres",
      references: [{ column: "groupe_id", table: "groupes" }],
      rows: [{ groupe_id: "g-fictif" }, { groupe_id: "g-saisi" }],
    };

    const [plan] = planSeedMerge([membres], ids({ groupes: ["g-fictif"] }));

    expect(plan?.rows).toEqual([{ groupe_id: "g-saisi" }]);
  });

  it("ignore une référence vers une table absente du relevé", () => {
    const [plan] = planSeedMerge(
      [
        {
          name: "fiches",
          references: [{ column: "cree_par", table: "membres" }],
          rows: [{ id: "f", cree_par: "m" }],
        },
      ],
      new Map(),
    );

    expect(names(plan?.rows ?? [])).toEqual(["f"]);
  });

  it("refuse des références circulaires entre tables", () => {
    const a: TableSnapshot = {
      name: "a",
      references: [{ column: "b_id", table: "b" }],
      rows: [],
    };
    const b: TableSnapshot = {
      name: "b",
      references: [{ column: "a_id", table: "a" }],
      rows: [],
    };

    expect(() => planSeedMerge([a, b], new Map())).toThrow(/circulaires/);
  });
});

describe("newIds", () => {
  it("rend ce qui est apparu, table par table", () => {
    const added = newIds(
      ids({ fiches: ["a"], echeances: ["x"] }),
      ids({ fiches: ["a", "b"], echeances: ["x"], consommables: ["c"] }),
    );

    expect(added).toEqual(ids({ fiches: ["b"], consommables: ["c"] }));
  });
});
