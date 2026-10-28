import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertForecasts,
  insertReadings,
  type Sql,
} from "../../workers/collecteur/src/store";
import { DIRECT_URL } from "./env";

// Le propriétaire prépare et vérifie ; les écritures passent par le rôle du
// collecteur, pour tester aussi ses droits.
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

beforeEach(async () => {
  await owner`delete from meteo.releves`;
  await owner`delete from meteo.previsions`;
  await owner`grant meteo_ecriture to current_user`;
});

/** Exécute `run` avec les seuls droits du collecteur, dans une transaction. */
async function asCollector(run: (sql: Sql) => Promise<void>): Promise<void> {
  await owner.begin(async tx => {
    await tx`set local role meteo_ecriture`;
    await run(tx as unknown as Sql);
  });
}

const at = new Date("2026-12-14T19:00:00Z");

describe("insertReadings", () => {
  it("enregistre les deux capteurs", async () => {
    await asCollector(sql =>
      insertReadings(sql, [
        { sensor: "exterieur", at, temperature: -2.3, humidity: 91 },
        { sensor: "veranda", at, temperature: 4.1, humidity: null },
      ]),
    );

    const rows = await owner`
      select capteur, temperature::float as t, humidite, origine
      from meteo.releves order by capteur`;

    expect(rows).toEqual([
      { capteur: "exterieur", t: -2.3, humidite: 91, origine: "api" },
      { capteur: "veranda", t: 4.1, humidite: null, origine: "api" },
    ]);
  });

  it("ignore un relevé déjà enregistré au même instant", async () => {
    const reading = {
      sensor: "veranda",
      at,
      temperature: 4.1,
      humidity: 70,
    } as const;

    await asCollector(sql => insertReadings(sql, [reading]));
    await asCollector(sql => insertReadings(sql, [reading]));

    const [row] = await owner`select count(*)::int as count from meteo.releves`;

    expect(row?.count).toBe(1);
  });

  it("ne touche pas la base quand il n'y a rien à écrire", async () => {
    await expect(
      asCollector(sql => insertReadings(sql, [])),
    ).resolves.toBeUndefined();
  });
});

describe("insertForecasts", () => {
  it("fige chaque prévision avec son heure de récupération", async () => {
    const retrievedAt = new Date("2026-12-14T19:00:05Z");

    await asCollector(sql =>
      insertForecasts(sql, retrievedAt, [
        {
          source: "open-meteo",
          model: "icon_eu",
          issuedAt: null,
          target: new Date("2026-12-15T06:00:00Z"),
          temperature: -4.5,
        },
        {
          source: "met-norway",
          model: "locationforecast",
          issuedAt: new Date("2026-12-14T18:12:00Z"),
          target: new Date("2026-12-15T06:00:00Z"),
          temperature: -3.9,
        },
      ]),
    );

    const rows = await owner`
      select source, recuperee_le, emise_le, temperature::float as t
      from meteo.previsions order by source`;

    expect(rows).toEqual([
      {
        source: "met-norway",
        recuperee_le: retrievedAt,
        emise_le: new Date("2026-12-14T18:12:00Z"),
        t: -3.9,
      },
      {
        source: "open-meteo",
        recuperee_le: retrievedAt,
        emise_le: null,
        t: -4.5,
      },
    ]);
  });
});

describe("sans rien à écrire", () => {
  it("n'envoie aucune requête pour une liste de prévisions vide", async () => {
    await expect(
      asCollector(sql => insertForecasts(sql, new Date(), [])),
    ).resolves.toBeUndefined();
  });
});

describe("droits du collecteur", () => {
  it("ne peut rien lire, même ce qu'il écrit", async () => {
    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_ecriture`;
        await tx`select * from meteo.releves`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuse un capteur inconnu", async () => {
    await expect(
      asCollector(sql =>
        insertReadings(sql, [
          // biome-ignore lint/suspicious/noExplicitAny: on force exprès une valeur hors du type
          { sensor: "salon" as any, at, temperature: 20, humidity: 50 },
        ]),
      ),
    ).rejects.toThrow(/releves_capteur_check/);
  });
});
