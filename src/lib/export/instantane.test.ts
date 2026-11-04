import { describe, expect, it } from "vitest";
import {
  empreinte,
  FORMAT,
  instantane,
  jsonCanonique,
  type Ligne,
  TABLES,
  type Table,
} from "./instantane";

function tablesVides(): Record<Table, Ligne[]> {
  return Object.fromEntries(TABLES.map(t => [t, []])) as unknown as Record<
    Table,
    Ligne[]
  >;
}

describe("jsonCanonique", () => {
  it("trie les clés à tous les niveaux, sans espace", () => {
    expect(
      jsonCanonique({ b: 1, a: { d: [3, { f: null, e: true }], c: "x" } }),
    ).toBe('{"a":{"c":"x","d":[3,{"e":true,"f":null}]},"b":1}');
  });

  it("donne le même texte quel que soit l'ordre d'insertion", () => {
    expect(jsonCanonique({ x: 1, y: 2 })).toBe(jsonCanonique({ y: 2, x: 1 }));
  });
});

describe("instantane", () => {
  it("ordonne les lignes par identifiant, sinon par contenu", () => {
    const tables = {
      ...tablesVides(),
      fiches: [{ id: "b" }, { id: "a" }, { id: "b" }],
      groupe_membres: [
        { groupe_id: "g", membre_id: "2" },
        { groupe_id: "g", membre_id: "1" },
      ],
    };
    const i = instantane(tables);

    expect(i.format).toBe(FORMAT);
    expect(i.tables.fiches.map(l => l.id)).toEqual(["a", "b", "b"]);
    expect(i.tables.groupe_membres.map(l => l.membre_id)).toEqual(["1", "2"]);
    expect(Object.keys(i.tables)).toEqual([...TABLES]);
  });

  it("ne modifie pas les tableaux reçus", () => {
    const fiches = [{ id: "b" }, { id: "a" }];
    instantane({ ...tablesVides(), fiches });

    expect(fiches.map(l => l.id)).toEqual(["b", "a"]);
  });
});

describe("empreinte", () => {
  it("est le SHA-256 hexadécimal du texte", () => {
    expect(empreinte("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
