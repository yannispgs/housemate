import { describe, expect, it } from "vitest";
import {
  modelName,
  signed,
  type WeekData,
  type WeekNight,
  weeklyReviewMail,
} from "./frost-week";

// Nuits fictives : aucun relevé réel du foyer dans ce dépôt public.

const deg = (texte: string) => texte.replaceAll(" °C", " °C");

const night = (fields: Partial<WeekNight> & { night: string }): WeekNight => ({
  exteriorAt20h: 6,
  verandaAt20h: 9,
  forecastMinimum: 2,
  estimate: 6,
  lowerBound: 1,
  alert: false,
  heated: false,
  minExterior: 3,
  minVeranda: 6.5,
  ...fields,
});

const WEEK: WeekData = {
  nights: [
    night({ night: "2026-12-06" }),
    night({
      night: "2026-12-07",
      forecastMinimum: 0,
      estimate: 4,
      lowerBound: -0.2,
      alert: true,
      minExterior: -1.5,
      minVeranda: 2.9,
    }),
    night({ night: "2026-12-08", heated: true, minVeranda: 12 }),
  ],
  models: [
    {
      night: "2026-12-06",
      source: "open-meteo",
      model: "ecmwf_ifs",
      minimum: 2.5,
    },
    { night: "2026-12-06", source: "open-meteo", model: "icon_d2", minimum: 0 },
    {
      night: "2026-12-07",
      source: "open-meteo",
      model: "ecmwf_ifs",
      minimum: -1,
    },
    { night: "2026-12-07", source: "open-meteo", model: "icon_d2", minimum: 1 },
  ],
  alerts: [
    {
      night: "2026-12-07",
      title: "Le citronnier",
      location: "Véranda",
      damageThreshold: 0,
      lowerBound: -0.2,
    },
  ],
  scores: [{ source: "open-meteo", model: "ecmwf_ifs", rmse: 0.9 }],
};

describe("modelName", () => {
  it("donne le nom d'usage, ou l'identifiant faute de mieux", () => {
    expect(modelName("open-meteo", "meteofrance_arome_france_hd")).toBe(
      "AROME",
    );
    expect(modelName("autre", "modele")).toBe("autre/modele");
  });
});

describe("signed", () => {
  it("signe toujours l'écart, sans « +0 » ni « −0 »", () => {
    expect(signed(1.04)).toBe(deg("+1,0 °C"));
    expect(signed(-0.44)).toBe(deg("−0,4 °C"));
    expect(signed(-0.04)).toBe(deg("0,0 °C"));
  });
});

describe("weeklyReviewMail", () => {
  it("ne dit rien d'une semaine vide", () => {
    expect(
      weeklyReviewMail({ nights: [], models: [], alerts: [], scores: [] }),
    ).toBeNull();
  });

  it("résume la semaine, puis la détaille nuit par nuit", () => {
    const mail = weeklyReviewMail(WEEK);

    expect(mail?.subject).toBe(
      "Veille gel : bilan des nuits du 6 décembre au 8 décembre",
    );
    expect(mail?.text).toBe(
      deg(
        [
          "Bilan des nuits du 6 décembre au 8 décembre : ce qu'on attendait à 20 h, et ce qui s'est passé.",
          "Cible : le minimum réel de la véranda finit au plus 0,5 °C sous le pire cas, et au plus 3,0 °C au-dessus.",
          "Écarts : mesuré moins attendu ; négatif, la nuit a été plus froide qu'attendu.",
          "",
          "En bref",
          "- Véranda : l'estimation de 20 h s'est trompée de 0,8 °C en moyenne, au pire 1,1 °C plus froide qu'estimé (lun. 7 déc.).",
          "- Pire cas : le réel a fini entre +3,1 °C et +5,5 °C du pire cas : sûr, mais trop large 2 nuits sur 2 (plus de 3,0 °C au-dessus).",
          "- Prévision retenue (moyenne des modèles) : 1,2 °C d'écart moyen, au pire 1,5 °C plus froid qu'annoncé (lun. 7 déc.).",
          "- Modèles : le plus juste ECMWF (0,5 °C), le moins juste ICON-D2 (2,8 °C).",
          "- Alertes : 1 plante en alerte, 0 justifiée.",
          "",
          "Nuit par nuit",
          "dim. 6 déc.",
          "  Dehors : annoncé 2,0 °C, mesuré 3,0 °C (+1,0 °C).",
          "  Véranda : estimé 6,0 °C, pire cas 1,0 °C, mesuré 6,5 °C (+0,5 °C sur l'estimation, +5,5 °C sur le pire cas).",
          "  Modèles : ECMWF 2,5 °C (+0,5 °C) · ICON-D2 0,0 °C (+3,0 °C)",
          "lun. 7 déc.",
          "  Dehors : annoncé 0,0 °C, mesuré −1,5 °C (−1,5 °C).",
          "  Véranda : estimé 4,0 °C, pire cas −0,2 °C, mesuré 2,9 °C (−1,1 °C sur l'estimation, +3,1 °C sur le pire cas).",
          "  Modèles : ECMWF −1,0 °C (−0,5 °C) · ICON-D2 1,0 °C (−2,5 °C)",
          "  Alerte, Le citronnier : pire cas −0,2 °C, seuil 0,0 °C ; 2,9 °C mesuré : alerte de trop.",
          "mar. 8 déc.",
          "  Dehors : annoncé 2,0 °C, mesuré 3,0 °C (+1,0 °C).",
          "  Véranda : estimé 6,0 °C, pire cas 1,0 °C ; chauffée, hors bilan.",
          "",
          "Modèles météo, du plus juste au moins juste cette semaine",
          "- ECMWF : 0,5 °C d'écart moyen sur 2 nuits, pire −0,5 °C ; 0,9 °C sur 60 nuits.",
          "- ICON-D2 : 2,8 °C d'écart moyen sur 2 nuits, pire −2,5 °C.",
        ].join("\n"),
      ),
    );
  });

  it("dit quand la cible est manquée, et quand elle est tenue", () => {
    const limite = weeklyReviewMail({
      ...WEEK,
      nights: [night({ night: "2026-12-06", lowerBound: 7 })],
    });
    const tenue = weeklyReviewMail({
      ...WEEK,
      nights: [night({ night: "2026-12-06", lowerBound: 5 })],
    });

    expect(limite?.text).toContain(
      deg("le réel a fini entre −0,5 °C et −0,5 °C du pire cas : cible tenue."),
    );
    expect(
      weeklyReviewMail({
        ...WEEK,
        nights: [night({ night: "2026-12-06", lowerBound: 7.5 })],
      })?.text,
    ).toContain(deg("cible MANQUÉE, plus de 0,5 °C dessous (dim. 6 déc.)."));
    expect(tenue?.text).toContain(
      deg("entre +1,5 °C et +1,5 °C du pire cas : cible tenue."),
    );
  });

  it("juge une alerte justifiée, et dit ce qu'il ne peut pas juger", () => {
    const mail = weeklyReviewMail({
      nights: [
        night({ night: "2026-12-06", minExterior: -3, minVeranda: null }),
        night({ night: "2026-12-07", heated: true }),
        night({ night: "2026-12-08", minExterior: null, minVeranda: null }),
      ],
      models: [
        // À égalité : par ordre alphabétique.
        {
          night: "2026-12-06",
          source: "open-meteo",
          model: "icon_eu",
          minimum: -4,
        },
        {
          night: "2026-12-06",
          source: "open-meteo",
          model: "gfs_seamless",
          minimum: -2,
        },
      ],
      alerts: [
        {
          night: "2026-12-06",
          title: "Le laurier rose",
          location: "Extérieur",
          damageThreshold: -2,
          lowerBound: -6,
        },
        {
          night: "2026-12-06",
          title: "Le rosier",
          location: "Extérieur",
          damageThreshold: -3,
          lowerBound: -7,
        },
        {
          night: "2026-12-06",
          title: "Le citronnier",
          location: "Véranda",
          damageThreshold: 0,
          lowerBound: -1,
        },
        {
          night: "2026-12-07",
          title: "Le citronnier",
          location: "Véranda",
          damageThreshold: 0,
          lowerBound: -1,
        },
      ],
      scores: [],
    });

    expect(mail?.text).toContain(
      deg(
        "Le laurier rose : pire cas −6,0 °C, seuil −2,0 °C ; −3,0 °C mesuré : alerte justifiée.",
      ),
    );
    expect(mail?.text).toContain(
      deg(
        "Le citronnier : pire cas −1,0 °C, seuil 0,0 °C ; pas de minimum mesuré.",
      ),
    );
    expect(mail?.text).toContain("véranda chauffée, impossible de juger.");
    expect(mail?.text).toContain(
      "- Alertes : 4 plantes en alerte, 2 justifiées.",
    );
    expect(mail?.text).toContain("Véranda : aucune nuit à juger");
    expect(mail?.text).toContain(
      deg("Dehors : annoncé 2,0 °C, pas encore mesuré."),
    );
    expect(mail?.text).toContain(
      deg("le plus juste GFS (1,0 °C), le moins juste ICON-EU (1,0 °C)."),
    );
  });

  it("dit ce qui manque une nuit sans prévision ni estimation", () => {
    const mail = weeklyReviewMail({
      nights: [
        night({
          night: "2026-12-06",
          forecastMinimum: null,
          estimate: null,
          lowerBound: null,
          minExterior: null,
        }),
      ],
      models: [
        {
          night: "2026-12-06",
          source: "met-norway",
          model: "locationforecast",
          minimum: 1,
        },
      ],
      alerts: [],
      scores: [],
    });

    expect(mail?.text).toContain("Pas de prévision ce soir-là.");
    expect(mail?.text).toContain("Véranda : pas d'estimation");
    expect(mail?.text).toContain(deg("Modèles : MET Norway 1,0 °C"));
    expect(mail?.text).toContain("- Alertes : aucune.");
    expect(mail?.text).not.toContain("Modèles météo, du plus juste");
  });
});
