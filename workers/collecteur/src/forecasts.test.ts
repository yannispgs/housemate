import { describe, expect, it } from "vitest";
import {
  metNorwayUrl,
  openMeteoUrl,
  parseMetNorway,
  parseOpenMeteo,
} from "./forecasts";

// Extraits de réponses réelles (27/09/2026), réduits à quelques heures.
const OPEN_METEO = {
  hourly: {
    time: [1_790_546_400, 1_790_550_000, 1_790_553_600],
    temperature_2m_meteofrance_arome_france_hd: [20.6, 20.0, null],
    temperature_2m_gfs_seamless: [18.0, 17.2, 16.6],
  },
};

const MET_NORWAY = {
  properties: {
    meta: { updated_at: "2026-09-27T19:17:15Z" },
    timeseries: [
      {
        time: "2026-09-27T22:00:00Z",
        data: { instant: { details: { air_temperature: 20.5 } } },
      },
      {
        time: "2026-09-27T23:00:00Z",
        data: { instant: { details: { air_temperature: -1.4 } } },
      },
      {
        time: "2026-10-01T12:00:00Z",
        data: { instant: { details: { air_temperature: 15 } } },
      },
    ],
  },
};

describe("openMeteoUrl", () => {
  it("demande tous les modèles, 72 h, en instants UTC", () => {
    const url = new URL(
      openMeteoUrl({ latitude: 45, longitude: 5 }, "temperature_2m"),
    );

    expect(url.searchParams.get("models")?.split(",")).toHaveLength(6);
    expect(url.searchParams.get("forecast_hours")).toBe("72");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("hourly")).toBe("temperature_2m");
  });

  it("ne demande que la variable voulue", () => {
    const url = new URL(
      openMeteoUrl({ latitude: 45, longitude: 5 }, "precipitation"),
    );

    expect(url.searchParams.get("hourly")).toBe("precipitation");
  });
});

describe("parseOpenMeteo", () => {
  const points = parseOpenMeteo(OPEN_METEO);

  it("donne une ligne par modèle et par heure disponible", () => {
    expect(points).toHaveLength(5);
  });

  it("omet les heures au-delà de la portée d'un modèle", () => {
    const arome = points.filter(
      point => point.model === "meteofrance_arome_france_hd",
    );

    expect(arome.map(point => point.temperature)).toEqual([20.6, 20.0]);
  });

  it("date chaque valeur en UTC, sans émission déclarée", () => {
    expect(points[0]).toEqual({
      source: "open-meteo",
      model: "meteofrance_arome_france_hd",
      issuedAt: null,
      target: new Date("2026-09-27T22:00:00Z"),
      temperature: 20.6,
    });
  });

  it("refuse une réponse sans série horaire", () => {
    expect(() => parseOpenMeteo({ error: true })).toThrow(/série horaire/);
  });
});

describe("metNorwayUrl", () => {
  it("arrondit les coordonnées à 4 décimales", () => {
    expect(metNorwayUrl({ latitude: 45.123_456, longitude: 5.987_65 })).toBe(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=45.1235&lon=5.9877",
    );
  });
});

describe("parseMetNorway", () => {
  const now = new Date("2026-09-27T20:00:00Z");
  const points = parseMetNorway(MET_NORWAY, now);

  it("ne garde que l'horizon de 72 h", () => {
    expect(points.map(point => point.temperature)).toEqual([20.5, -1.4]);
  });

  it("porte l'émission déclarée par la source", () => {
    expect(points[0]?.issuedAt).toEqual(new Date("2026-09-27T19:17:15Z"));
  });

  it("saute un pas sans température au lieu d'inventer une valeur", () => {
    const points = parseMetNorway(
      {
        properties: {
          timeseries: [
            {
              time: "2026-09-27T22:00:00Z",
              data: { instant: { details: {} } },
            },
            {
              time: "2026-09-27T23:00:00Z",
              data: { instant: { details: { air_temperature: 12 } } },
            },
          ],
        },
      },
      now,
    );

    expect(points.map(point => point.temperature)).toEqual([12]);
    expect(points[0]?.issuedAt).toBeNull();
  });

  it("refuse une réponse sans série temporelle", () => {
    expect(() => parseMetNorway({}, now)).toThrow(/série temporelle/);
  });
});
