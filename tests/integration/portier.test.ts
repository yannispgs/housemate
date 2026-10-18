import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  estAutorisee,
  noterAppareil,
  rattacher,
  type Sql,
} from "@/lib/auth/store";
import { DIRECT_URL } from "./env";

/**
 * Les accès de l'authentification (migration 0006), éprouvés sous le rôle
 * `portier` et non en propriétaire : lui contourne la RLS et les droits.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

let foyer: string;

beforeEach(async () => {
  await owner`delete from app.appareils`;
  await owner`delete from app.liste_blanche`;
  await owner`grant portier to current_user with set true`;
  const [row] = await owner`
    insert into app.foyers (nom) values ('Foyer du portier') returning id`;
  foyer = row?.id as string;
  await owner`
    insert into app.liste_blanche (email, foyer_id)
    values ('parent@exemple.fr', ${foyer})`;
});

/** Exécute `run` sous le rôle `portier`, dans une transaction annulée ensuite. */
async function asPortier<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  let result: T | undefined;

  await owner
    .begin(async tx => {
      await tx`set local role portier`;
      result = await run(tx as unknown as Sql);
      throw new Error("rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.message === "rollback")) {
        throw error;
      }
    });

  return result as T;
}

describe("liste blanche", () => {
  it("reconnaît une adresse de la liste, et seulement elle", async () => {
    expect(await asPortier(sql => estAutorisee(sql, "parent@exemple.fr"))).toBe(
      true,
    );
    expect(await asPortier(sql => estAutorisee(sql, "intrus@exemple.fr"))).toBe(
      false,
    );
  });

  it("⚠️ le portier ne peut pas modifier la liste blanche", async () => {
    await expect(
      asPortier(
        sql =>
          sql`insert into app.liste_blanche (email, foyer_id)
              values ('intrus@exemple.fr', ${foyer})`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("⚠️ le portier ne lit ni fiches ni échéances", async () => {
    await expect(
      asPortier(sql => sql`select * from app.fiches`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asPortier(sql => sql`select * from app.echeances`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("rattachement d'un nouveau compte", () => {
  it("crée le membre dans le foyer de son adresse, une seule fois", async () => {
    const membres = await asPortier(async sql => {
      await rattacher(sql, "compte-1", "parent@exemple.fr");
      // Un webhook réessayé : rien de plus.
      await rattacher(sql, "compte-1", "parent@exemple.fr");

      return sql`
        select m.foyer_id, a.email from app.membres m
        join app.adresses a on a.membre_id = m.id
        where m.auth_user_id = 'compte-1'`;
    });

    expect(membres).toEqual([{ foyer_id: foyer, email: "parent@exemple.fr" }]);
  });

  it("⚠️ un membre ne lit pas les adresses", async () => {
    await expect(
      owner.begin(async tx => {
        await tx`set local role authenticated`;

        return tx`select * from app.adresses`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne crée rien pour une adresse hors liste", async () => {
    const membres = await asPortier(async sql => {
      await rattacher(sql, "compte-2", "intrus@exemple.fr");

      return sql`select 1 from app.membres where auth_user_id = 'compte-2'`;
    });

    expect(membres).toEqual([]);
  });
});

describe("registre des appareils", () => {
  const EMPREINTE = "a".repeat(64);

  it("signale un appareil nouveau, puis le reconnaît", async () => {
    const [premiere, seconde] = await asPortier(async sql => [
      await noterAppareil(sql, "compte-1", EMPREINTE, "Safari sur iPhone"),
      await noterAppareil(sql, "compte-1", EMPREINTE, "Safari sur iPhone"),
    ]);

    expect(premiere).toBe(true);
    expect(seconde).toBe(false);
  });

  it("un appareil connu d'un compte est nouveau pour un autre", async () => {
    const [moi, conjoint] = await asPortier(async sql => [
      await noterAppareil(sql, "compte-1", EMPREINTE, "Safari sur iPhone"),
      await noterAppareil(sql, "compte-2", EMPREINTE, "Safari sur iPhone"),
    ]);

    expect(moi).toBe(true);
    expect(conjoint).toBe(true);
  });

  it("refuse une empreinte qui n'en est pas une", async () => {
    await expect(
      asPortier(sql =>
        noterAppareil(sql, "compte-1", "identifiant-en-clair", "x"),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
