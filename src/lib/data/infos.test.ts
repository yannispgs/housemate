import { describe, expect, it } from "vitest";
import {
  avecInfos,
  avecMarqueConnue,
  echeancesDerivees,
  horsInfos,
  INFOS,
  infosDe,
  lireInfos,
  valeursInfos,
} from "@/lib/data/infos";
import type { Attribut } from "@/lib/data/saisie";
import { NATURES } from "@/lib/data/views";

const tele: Attribut[] = [
  { libelle: "Marque", type: "texte", valeur: "Samsung" },
  { libelle: "Date d'achat", type: "date", valeur: "2025-03-12" },
  {
    libelle: "Durée de garantie",
    type: "duree",
    valeur: { count: 2, unit: "year" },
  },
];

describe("INFOS", () => {
  it("donne à chaque nature des champs aux noms uniques", () => {
    for (const nature of NATURES) {
      const cles = INFOS[nature].map(c => c.cle);

      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  it("suit le tableau du SPEC, sans le lieu", () => {
    expect(INFOS.equipement.map(c => c.libelle)).toEqual([
      "Marque",
      "Modèle",
      "N° de série",
      "Date d'achat",
      "Durée de garantie",
    ]);
    expect(INFOS.contrat.map(c => c.type)).toEqual([
      "date",
      "duree",
      "montant",
    ]);
    expect(INFOS.personne.map(c => c.type)).toEqual(["jour"]);
    expect(INFOS.lieu).toEqual([]);
  });
});

describe("lireInfos", () => {
  it("rend les infos remplies, dans l'ordre de la nature", () => {
    expect(
      lireInfos("equipement", {
        dureeGarantieNombre: "2",
        dureeGarantieUnite: "year",
        marque: " Samsung ",
        modele: "",
        numeroSerie: "   ",
        dateAchat: "2025-03-12",
        titre: "La télé",
      }),
    ).toEqual({ ok: true, valeur: tele });
  });

  it("ne garde rien d'une fiche laissée vide", () => {
    expect(lireInfos("document", { emission: "", expiration: "" })).toEqual({
      ok: true,
      valeur: [],
    });
    expect(lireInfos("lieu", {})).toEqual({ ok: true, valeur: [] });
  });

  it("lit un montant écrit à la française", () => {
    expect(
      lireInfos("contrat", {
        montant: "1 234,567 €",
        preavisNombre: "2",
        preavisUnite: "month",
      }),
    ).toEqual({
      ok: true,
      valeur: [
        {
          libelle: "Préavis de résiliation",
          type: "duree",
          valeur: { count: 2, unit: "month" },
        },
        { libelle: "Montant", type: "montant", valeur: 1234.57 },
      ],
    });
  });

  it("ignore une unité sans nombre", () => {
    expect(
      lireInfos("contrat", { preavisNombre: "", preavisUnite: "month" }),
    ).toEqual({ ok: true, valeur: [] });
  });

  it("dit ce qui ne va pas, champ par champ", () => {
    expect(
      lireInfos("contrat", {
        anniversaire: "2026-02-30",
        preavisNombre: "1,5",
        montant: "beaucoup",
      }),
    ).toEqual({
      ok: false,
      erreurs: {
        anniversaire: "Date invalide.",
        preavisNombre: "Un nombre entier est attendu.",
        montant: "Un montant est attendu, comme 12,50.",
      },
    });
    expect(lireInfos("contrat", { montant: "-3" })).toMatchObject({
      erreurs: { montant: "Un montant ne peut pas être négatif." },
    });
    expect(lireInfos("animal", { puce: "x".repeat(121) })).toMatchObject({
      erreurs: { puce: "120 caractères au plus." },
    });
  });
});

describe("sur la fiche", () => {
  const autres: Attribut[] = [
    { libelle: "Couleur", type: "texte", valeur: "Noire" },
    { libelle: "Marque", type: "texte", valeur: "Sony" },
  ];

  it("remplace les infos de la nature, garde les autres attributs", () => {
    expect(avecInfos(autres, "equipement", tele)).toEqual([
      ...tele,
      { libelle: "Couleur", type: "texte", valeur: "Noire" },
    ]);
    expect(avecInfos(autres, "equipement", [])).toEqual([autres[0]]);
  });

  it("sépare les infos des autres attributs", () => {
    const attributs = [autres[0] as Attribut, ...tele];

    expect(infosDe(attributs, "equipement")).toEqual(tele);
    expect(horsInfos(attributs, "equipement")).toEqual([autres[0]]);
  });

  it("pré-remplit le formulaire", () => {
    expect(
      valeursInfos(
        [...tele, { libelle: "Montant", type: "montant", valeur: 9.9 }],
        "equipement",
      ),
    ).toEqual({
      marque: "Samsung",
      dateAchat: "2025-03-12",
      dureeGarantieNombre: "2",
      dureeGarantieUnite: "year",
    });
    expect(
      valeursInfos(
        [{ libelle: "Montant", type: "montant", valeur: 9.9 }],
        "contrat",
      ),
    ).toEqual({ montant: "9,9" });
  });

  it("ramène la marque à celle du foyer", () => {
    expect(avecMarqueConnue(tele, ["SAMSUNG"])[0]).toEqual({
      libelle: "Marque",
      type: "texte",
      valeur: "SAMSUNG",
    });
    expect(avecMarqueConnue(tele, [])).toEqual(tele);
  });
});

describe("echeancesDerivees", () => {
  it("⚠️ dérive la fin de garantie d'un équipement (§ 5.2)", () => {
    expect(echeancesDerivees("equipement", "La télé", tele)).toEqual([
      {
        source: "Date d'achat",
        titre: "Fin de garantie — La télé",
        recurrence: {
          kind: "derived",
          sourceDate: "2025-03-12",
          offset: { count: 2, unit: "year" },
          source: "Date d'achat",
        },
        toleranceJours: 0,
        preavisJours: 30,
        tenue: "souple",
        importance: "memoire",
      },
    ]);
  });

  it("n'en dérive pas sans la date d'achat ou la durée", () => {
    expect(
      echeancesDerivees("equipement", "La télé", tele.slice(0, 2)),
    ).toEqual([]);
    expect(
      echeancesDerivees("equipement", "La télé", [
        tele[0] as Attribut,
        tele[2] as Attribut,
      ]),
    ).toEqual([]);
  });

  it("fait renouveler un document trois mois avant son expiration", () => {
    expect(
      echeancesDerivees("document", "Le passeport", [
        { libelle: "Date d'expiration", type: "date", valeur: "2031-05-01" },
      ]),
    ).toEqual([
      {
        source: "Date d'expiration",
        titre: "Renouveler — Le passeport",
        recurrence: {
          kind: "once",
          on: "2031-05-01",
          source: "Date d'expiration",
        },
        toleranceJours: 0,
        preavisJours: 90,
        tenue: "ferme",
        importance: "important",
      },
    ]);
    expect(echeancesDerivees("document", "Le passeport", [])).toEqual([]);
  });

  it("ne dérive rien d'un contrat pour l'instant (§ 4.8)", () => {
    expect(
      echeancesDerivees("contrat", "L'assurance", [
        { libelle: "Date anniversaire", type: "date", valeur: "2026-03-01" },
      ]),
    ).toEqual([]);
  });
});

describe("une date de naissance", () => {
  const lue = (champs: Record<string, string>) => lireInfos("personne", champs);

  it("se lit avec ou sans l'année", () => {
    expect(
      lue({ naissanceJour: "12", naissanceMois: "3", naissanceAnnee: "1958" }),
    ).toEqual({
      ok: true,
      valeur: [
        {
          libelle: "Date de naissance",
          type: "jour",
          valeur: { jour: 12, mois: 3, annee: 1958 },
        },
      ],
    });
    expect(lue({ naissanceJour: "29", naissanceMois: "2" })).toEqual({
      ok: true,
      valeur: [
        {
          libelle: "Date de naissance",
          type: "jour",
          valeur: { jour: 29, mois: 2, annee: null },
        },
      ],
    });
    expect(lue({ naissanceJour: "", naissanceMois: "" })).toEqual({
      ok: true,
      valeur: [],
    });
  });

  it.each([
    [{ naissanceJour: "12" }, "Le jour et le mois sont nécessaires."],
    [{ naissanceMois: "3" }, "Le jour et le mois sont nécessaires."],
    [{ naissanceAnnee: "1958" }, "Le jour et le mois sont nécessaires."],
    [{ naissanceJour: "31", naissanceMois: "4" }, "Ce jour n'existe pas."],
    [
      { naissanceJour: "29", naissanceMois: "2", naissanceAnnee: "2023" },
      "Ce jour n'existe pas.",
    ],
    [{ naissanceJour: "32", naissanceMois: "1" }, "Un jour entre 1 et 31."],
    [{ naissanceJour: "1", naissanceMois: "13" }, "Un mois entre 1 et 12."],
    [
      { naissanceJour: "1", naissanceMois: "1", naissanceAnnee: "1800" },
      "Une année entre 1900 et 2100.",
    ],
  ])("refuse %o", (champs, message) => {
    const lu = lue(champs);

    expect(lu.ok).toBe(false);
    expect(Object.values(lu.ok ? {} : lu.erreurs)).toContain(message);
  });

  it("pré-remplit le formulaire", () => {
    expect(
      valeursInfos(
        [
          {
            libelle: "Date de naissance",
            type: "jour",
            valeur: { jour: 12, mois: 3, annee: null },
          },
        ],
        "personne",
      ),
    ).toEqual({ naissanceJour: "12", naissanceMois: "3", naissanceAnnee: "" });
    expect(
      valeursInfos(
        [
          {
            libelle: "Date de naissance",
            type: "jour",
            valeur: { jour: 1, mois: 1, annee: 1990 },
          },
        ],
        "personne",
      ),
    ).toEqual({
      naissanceJour: "1",
      naissanceMois: "1",
      naissanceAnnee: "1990",
    });
  });
});
