import { describe, expect, it } from "vitest";
import { mailFor } from "./frost-run";
import type { PendingMessage } from "./frost-store";
import {
  assessPlants,
  blendForecasts,
  celsius,
  frostMail,
  type NightFacts,
  nightMessage,
  type PlantNight,
  type WatchedPlant,
} from "./frost-watch";

const tonight = [
  { source: "open-meteo", model: "arome", minimum: -2 },
  { source: "open-meteo", model: "icon_d2", minimum: -1 },
  { source: "met-norway", model: "locationforecast", minimum: 1 },
];

const scored = (model: string, rmse: number, nights = 20) => ({
  source: model === "locationforecast" ? "met-norway" : "open-meteo",
  model,
  nights,
  rmse,
});

describe("blendForecasts", () => {
  it("fait une moyenne simple tant qu'aucun modèle n'est noté", () => {
    const blend = blendForecasts(tonight, [scored("arome", 0.5, 4)]);

    expect(blend?.minimum).toBe(-0.7);
    expect(blend?.method).toBe("moyenne simple de 3 modèles, pas encore notés");
    expect(blend?.models.map(entry => entry.weight)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
  });

  it("donne plus de poids aux modèles fiables", () => {
    // Erreurs 0,5 et 1 : poids 4 et 1, soit 80 % et 20 %.
    const blend = blendForecasts(tonight.slice(0, 2), [
      scored("arome", 0.5),
      scored("icon_d2", 1),
    ]);

    expect(blend?.models.map(entry => entry.weight)).toEqual([0.8, 0.2]);
    expect(blend?.minimum).toBe(-1.8);
    expect(blend?.method).toBe(
      "moyenne de 2 modèles sur 2, pondérée par leur fiabilité",
    );
  });

  it("écarte un modèle plus de deux fois moins fiable que le meilleur", () => {
    const blend = blendForecasts(tonight, [
      scored("arome", 0.5),
      scored("icon_d2", 0.8),
      scored("locationforecast", 1.2),
    ]);

    expect(blend?.models[2]?.weight).toBe(0);
    expect(blend?.method).toBe(
      "moyenne de 2 modèles sur 3, pondérée par leur fiabilité",
    );
  });

  it("ne laisse pas un modèle chanceux écraser les autres", () => {
    // Une erreur de 0,05 sur quelques nuits est ramenée au plancher de 0,3.
    const blend = blendForecasts(tonight.slice(0, 2), [
      scored("arome", 0.05),
      scored("icon_d2", 0.6),
    ]);

    expect(blend?.models[0]?.weight).toBeCloseTo(0.8);
  });

  it("fait peser un modèle pas encore noté comme un modèle moyen", () => {
    const blend = blendForecasts(tonight, [
      scored("arome", 0.5),
      scored("icon_d2", 1),
    ]);

    // Poids bruts 4, 1, et la médiane des deux, 2,5.
    expect(blend?.models.map(entry => entry.weight)).toEqual([
      4 / 7.5,
      1 / 7.5,
      2.5 / 7.5,
    ]);
  });

  it("prend la médiane du milieu quand les modèles notés sont en nombre impair", () => {
    const blend = blendForecasts(
      [...tonight, { source: "open-meteo", model: "ecmwf_ifs", minimum: 0 }],
      [
        scored("arome", 0.5),
        scored("icon_d2", 1),
        scored("locationforecast", 0.8),
      ],
    );

    // Poids bruts 4, 1 et 1/0,64 = 1,5625 : la médiane, 1,5625, va à ECMWF.
    expect(blend?.models[3]?.weight).toBeCloseTo(blend?.models[2]?.weight ?? 0);
  });

  it("ne retient rien sans prévision", () => {
    expect(blendForecasts([], [])).toBeNull();
  });
});

const plant = (
  title: string,
  location: WatchedPlant["location"],
  damageThreshold: number | null,
  deathThreshold: number | null = null,
): WatchedPlant => ({
  id: title,
  title,
  location,
  damageThreshold,
  deathThreshold,
  reservedTo: null,
});

const CITRONNIER = plant("Le citronnier", "Véranda", 0, -5);
const LAURIER = plant("Le laurier rose", "Extérieur", -5, -10);
const ROSIER = plant("Le rosier", "Extérieur", -20, -25);
const SANS_SEUIL = plant("Le figuier", "Extérieur", null);

describe("assessPlants", () => {
  const night = {
    forecastMinimum: -1,
    exterior: { estimate: -1, lowerBound: -7.5 },
    veranda: { estimate: 3, lowerBound: 1.5 },
  };

  it("juge chaque plante au pire cas de son emplacement", () => {
    const levels = assessPlants([CITRONNIER, LAURIER, ROSIER], night).map(p => [
      p.title,
      p.lowerBound,
      p.level,
    ]);

    expect(levels).toEqual([
      // 1,5 °C : à moins de 2 °C au-dessus de 0.
      ["Le citronnier", 1.5, "vigilance"],
      ["Le laurier rose", -7.5, "alerte"],
      ["Le rosier", -7.5, null],
    ]);
  });

  it("garde une plante sans seuil, sans niveau", () => {
    expect(assessPlants([SANS_SEUIL], night)[0]).toMatchObject({
      estimate: -1,
      level: null,
    });
  });

  it("dit la véranda indisponible sans relevés, si la nuit peut l'atteindre", () => {
    const blind = { ...night, veranda: null };

    expect(assessPlants([CITRONNIER], blind)[0]).toMatchObject({
      estimate: null,
      lowerBound: null,
      level: "indisponible",
    });
    // −1 annoncé, seuil à −10 : plus de 5 °C au-dessus, rien à craindre.
    expect(
      assessPlants([plant("Le palmier", "Véranda", -10)], blind)[0]?.level,
    ).toBeNull();
    // Dehors n'a pas besoin des relevés.
    expect(assessPlants([LAURIER], blind)[0]?.level).toBe("alerte");
  });
});

describe("nightMessage", () => {
  const at = (level: PlantNight["level"]): PlantNight => ({
    ...LAURIER,
    estimate: null,
    lowerBound: null,
    level,
  });

  it("ouvre l'épisode par une alerte, le prolonge par des rappels", () => {
    expect(nightMessage([at("vigilance"), at("alerte")], false)).toBe("alerte");
    expect(nightMessage([at("alerte"), at("indisponible")], true)).toBe(
      "rappel",
    );
  });

  it("dit l'impossibilité, et se tait pour la seule vigilance", () => {
    expect(nightMessage([at("indisponible")], true)).toBe("indisponible");
    expect(nightMessage([at("vigilance"), at(null)], true)).toBeNull();
    expect(nightMessage([], false)).toBeNull();
  });
});

describe("celsius", () => {
  it("écrit à la française, avec un vrai signe moins", () => {
    expect(celsius(-2.46)).toBe("−2,5 °C");
    expect(celsius(3)).toBe("3,0 °C");
  });
});

const VERANDA = {
  estimate: 2.1,
  extrapolation: "low",
  verandaAt20h: 4.2,
  exteriorAt20h: 1.5,
} as const;

const facts: NightFacts = {
  forecast: { minimum: -3, method: "moyenne de 5 modèles sur 5" },
  veranda: VERANDA,
  missing: [],
};

const nightOf = (
  base: WatchedPlant,
  estimate: number | null,
  lowerBound: number | null,
  level: PlantNight["level"],
): PlantNight => ({ ...base, estimate, lowerBound, level });

describe("frostMail", () => {
  const plants = [
    nightOf(CITRONNIER, 2.1, -6, "alerte"),
    nightOf(LAURIER, -3, -9.5, "alerte"),
    nightOf(ROSIER, -3, -9.5, null),
    nightOf(plant("Le romarin", "Extérieur", -10), -3, -9.5, "vigilance"),
    nightOf(SANS_SEUIL, -3, -9.5, null),
  ];

  it("groupe par emplacement, et dit quoi faire", () => {
    const mail = frostMail("alerte", facts, plants);

    expect(mail.subject).toBe(
      "Gel possible cette nuit : Le citronnier et Le laurier rose",
    );
    expect(mail.text).toBe(
      [
        "Il peut geler cette nuit. Protéger ce soir : Le citronnier et Le laurier rose.",
        "",
        "Véranda : chauffer",
        "Minimum attendu : 2,1 °C. Relevés de 20 h : véranda 4,2 °C, extérieur 1,5 °C.",
        "- Le citronnier : pire cas −6,0 °C, 6,0 °C sous son seuil de dégâts (0,0 °C) ; sous son seuil de mort (−5,0 °C).",
        "Le modèle de la véranda n'a encore jamais vu de gel : sa marge est doublée ce soir.",
        "",
        "Dehors : protéger",
        "Minimum annoncé : −3,0 °C, et jusqu'à 1,5 °C de moins au ras du sol.",
        "- Le laurier rose : pire cas −9,5 °C, 4,5 °C sous son seuil de dégâts (−5,0 °C) ; mort à −10,0 °C.",
        "- Le romarin (à surveiller) : pire cas −9,5 °C, 0,5 °C au-dessus de son seuil de dégâts (−10,0 °C).",
        "",
        "Dehors, la nuit descendra à −3,0 °C (moyenne de 5 modèles sur 5).",
        "Pas suivies, faute de seuil de dégâts sur leur fiche : Le figuier.",
        "",
        "Tant que l'épisode dure, un rappel court arrivera chaque soir.",
      ].join("\n"),
    );
  });

  it("fait court pour un rappel, et ne montre que les emplacements concernés", () => {
    const mail = frostMail(
      "rappel",
      { ...facts, veranda: { ...VERANDA, extrapolation: "none" } },
      [nightOf(CITRONNIER, 0.5, 0, "alerte"), nightOf(ROSIER, -3, -9, null)],
    );

    expect(mail.subject).toBe("Gel encore cette nuit : Le citronnier");
    expect(mail.text).toContain(
      "L'épisode froid continue. Protéger encore ce soir : Le citronnier.",
    );
    expect(mail.text).toContain("au niveau de son seuil de dégâts (0,0 °C)");
    expect(mail.text).not.toContain("Dehors :");
    expect(mail.text).not.toContain("marge est doublée");
    expect(mail.text).not.toContain("rappel court");
    expect(mail.text).not.toContain("Pas suivies");
  });

  it("dit ce qu'il n'a pas pu estimer, à côté de ce qu'il a pu", () => {
    const mail = frostMail(
      "indisponible",
      {
        ...facts,
        veranda: null,
        missing: ["le relevé de la véranda", "le relevé extérieur"],
      },
      [
        nightOf(CITRONNIER, null, null, "indisponible"),
        nightOf(LAURIER, -3, -4, "vigilance"),
      ],
    );

    expect(mail.subject).toBe("Veille de gel impossible ce soir");
    expect(mail.text).toContain("Véranda : impossible d'estimer");
    expect(mail.text).toContain(
      "Il manque le relevé de la véranda et le relevé extérieur : impossible d'estimer le minimum de la véranda.",
    );
    expect(mail.text).toContain("- Le citronnier (seuil de dégâts 0,0 °C)");
    expect(mail.text).toContain("Dehors : à surveiller");
  });
});

describe("mailFor", () => {
  const pending: PendingMessage = {
    night: "2026-12-14",
    message: "alerte",
    exteriorAt20h: 1.5,
    verandaAt20h: 4.2,
    forecastMinimum: -3,
    forecastMethod: "moyenne simple de 5 modèles, pas encore notés",
    estimate: 2.1,
    modelMargin: 1.1,
    lowerBound: -4,
    extrapolation: "none",
  };

  const blind = (over: Partial<PendingMessage>) =>
    mailFor({ ...pending, message: "indisponible", ...over }, [
      nightOf(CITRONNIER, null, null, "indisponible"),
    ]);

  it("rebâtit le mail à partir de la ligne du journal et de ses plantes", () => {
    const mail = mailFor(pending, [nightOf(CITRONNIER, 2.1, -4, "alerte")]);

    expect(mail.subject).toBe("Gel possible cette nuit : Le citronnier");
    expect(mail.text).toContain(
      "Minimum attendu : 2,1 °C. Relevés de 20 h : véranda 4,2 °C, extérieur 1,5 °C.",
    );
    expect(mail.text).toContain("- Le citronnier : pire cas −4,0 °C");
  });

  it("nomme le seul capteur muet", () => {
    expect(blind({ exteriorAt20h: null }).text).toContain(
      "Il manque le relevé extérieur :",
    );
    expect(blind({ verandaAt20h: null }).text).toContain(
      "Il manque le relevé de la véranda :",
    );
  });

  it("dit l'impossibilité quand les deux relevés manquaient", () => {
    const mail = blind({
      verandaAt20h: null,
      exteriorAt20h: null,
      estimate: null,
      modelMargin: null,
      lowerBound: null,
      extrapolation: null,
    });

    expect(mail.text).toContain(
      "Il manque le relevé de la véranda et le relevé extérieur",
    );
  });
});
