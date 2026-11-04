import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  dernierPassage,
  dernierReussi,
  lireTables,
  noterPassage,
} from "@/lib/export/export-store";
import { TABLES } from "@/lib/export/instantane";
import { DIRECT_URL } from "./env";

/**
 * L'export en base (migration 0013) : toutes les tables lues en
 * propriétaire, sous leur forme JSON, et le journal des passages.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });
const E = "a".repeat(64);

afterAll(async () => {
  await owner.end();
});

beforeEach(async () => {
  await owner`delete from app.exports`;
});

describe("lireTables", () => {
  it("lit chaque table exportée, valeurs en JSON", async () => {
    const [foyer] = await owner`
      insert into app.foyers (nom) values ('L''export') returning id::text`;
    const [membre] = await owner`
      insert into app.membres (foyer_id, auth_user_id)
      values (${foyer?.id}, ${`export-${crypto.randomUUID()}`}) returning id::text`;
    const [fiche] = await owner`
      insert into app.fiches (foyer_id, nature, titre, attributs, cree_par)
      values (${foyer?.id}, 'equipement', 'Chaudière', ${owner.json([{ libelle: "Marque", type: "texte", valeur: "Viessmann" }])}, ${membre?.id})
      returning id::text`;

    const tables = await lireTables(owner);

    expect(Object.keys(tables).sort()).toEqual([...TABLES].sort());
    const lue = tables.fiches.find(f => f.id === fiche?.id);
    expect(lue).toMatchObject({
      titre: "Chaudière",
      attributs: [{ libelle: "Marque", type: "texte", valeur: "Viessmann" }],
      foyer_id: foyer?.id,
    });
    expect(typeof lue?.cree_le).toBe("string");
  });
});

describe("le journal", () => {
  it("est vide au départ", async () => {
    expect(await dernierPassage(owner)).toBeNull();
    expect(await dernierReussi(owner)).toBeNull();
  });

  it("rend le dernier passage, et le dernier réussi à part", async () => {
    await noterPassage(
      owner,
      "exporte",
      E,
      "housemate-2026-10-21.tar.gz.age",
      "12 octets",
    );
    await noterPassage(owner, "inchange", E, null, null);
    const [reussi] = await owner`select max(le) as le from app.exports`;
    await noterPassage(owner, "echec", null, null, "quota");

    expect(await dernierPassage(owner)).toMatchObject({
      issue: "echec",
      empreinte: null,
    });
    expect(await dernierReussi(owner)).toEqual(reussi?.le);
  });

  it("refuse un passage incohérent", async () => {
    await expect(
      noterPassage(owner, "exporte", E, null, null),
    ).rejects.toThrow();
    await expect(
      noterPassage(owner, "inchange", null, null, null),
    ).rejects.toThrow();
    await expect(
      noterPassage(owner, "inchange", "court", null, null),
    ).rejects.toThrow();
  });

  it("reste fermé aux comptes", async () => {
    await expect(
      owner.begin(async tx => {
        await tx`set local role authenticated`;
        await tx`select * from app.exports`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
