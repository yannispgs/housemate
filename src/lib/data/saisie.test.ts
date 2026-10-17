import { describe, expect, it } from "vitest";
import {
  achatValide,
  CATEGORIES_DE_DEPART,
  categorieConnue,
  categoriesProposees,
  echeanceSaisie,
  ficheSaisie,
  garantieSaisie,
  lire,
  nouvelleEcheance,
  nouvelleGarantie,
  remplacementSaisie,
  remplacementValide,
} from "@/lib/data/saisie";
import { fromISO } from "@/lib/domain/plain-date";

const echeance = (champs: Record<string, string>) =>
  lire(echeanceSaisie, {
    titre: "Purger les radiateurs",
    importance: "normal",
    tenue: "souple",
    toleranceJours: "3",
    preavisJours: "7",
    motif: "once",
    date: "2026-11-01",
    ...champs,
  });

describe("fiche vierge", () => {
  it("accepte une nature, un nom et une catégorie facultative", () => {
    expect(
      lire(ficheSaisie, {
        nature: "plante",
        titre: " Le citronnier ",
        categorie: "",
      }),
    ).toEqual({
      ok: true,
      valeur: { nature: "plante", titre: "Le citronnier", categorie: null },
    });
  });

  it("refuse un nom vide et une nature inconnue, en le disant", () => {
    expect(lire(ficheSaisie, { nature: "robot", titre: "  " })).toEqual({
      ok: false,
      erreurs: { nature: "Nature inconnue.", titre: "Un nom est nécessaire." },
    });
  });

  it("refuse un nom trop long", () => {
    const r = lire(ficheSaisie, { nature: "lieu", titre: "x".repeat(121) });

    expect(r).toMatchObject({ ok: false, erreurs: { titre: /120/ } });
  });
});

describe("échéance", () => {
  it("une seule fois, à une date", () => {
    const r = echeance({});

    expect(r.ok && nouvelleEcheance(r.valeur)).toEqual({
      titre: "Purger les radiateurs",
      categorie: null,
      recurrence: { kind: "once", on: "2026-11-01" },
      toleranceJours: 3,
      preavisJours: 7,
      tenue: "souple",
      importance: "normal",
      ficheId: null,
      derniereFois: null,
    });
  });

  it("tous les N, à partir d'une date", () => {
    const r = echeance({ motif: "interval", nombre: "3", unite: "month" });

    expect(r.ok && nouvelleEcheance(r.valeur).recurrence).toEqual({
      kind: "interval",
      anchor: "2026-11-01",
      every: { count: 3, unit: "month" },
    });
  });

  it("chaque année, au jour et au mois de la date", () => {
    const r = echeance({ motif: "annual", date: "2027-03-15" });

    expect(r.ok && nouvelleEcheance(r.valeur).recurrence).toEqual({
      kind: "annual",
      month: 3,
      day: 15,
    });
  });

  it("N après la dernière fois, qui devient une première complétion", () => {
    const r = echeance({
      motif: "sinceCompletion",
      nombre: "2",
      unite: "week",
      date: "2026-10-06",
    });

    expect(r.ok && nouvelleEcheance(r.valeur)).toMatchObject({
      recurrence: {
        kind: "sinceCompletion",
        after: { count: 2, unit: "week" },
      },
      derniereFois: "2026-10-06",
    });
  });

  it("N après la dernière fois, sans dernière fois connue", () => {
    const r = echeance({
      motif: "sinceCompletion",
      nombre: "2",
      unite: "week",
      date: "",
    });

    expect(r.ok && nouvelleEcheance(r.valeur).derniereFois).toBeNull();
  });

  it("exige une date, sauf pour « depuis la dernière fois »", () => {
    expect(echeance({ date: "" })).toEqual({
      ok: false,
      erreurs: { date: "Indique une date." },
    });
  });

  it("exige « tous les combien » pour un intervalle", () => {
    expect(echeance({ motif: "interval" })).toEqual({
      ok: false,
      erreurs: { nombre: "Indique tous les combien." },
    });
  });

  it("refuse une tolérance négative et une importance inconnue", () => {
    expect(echeance({ toleranceJours: "-1", importance: "urgent" })).toEqual({
      ok: false,
      erreurs: {
        toleranceJours: "0 au moins.",
        importance: "Importance inconnue.",
      },
    });
  });

  it("rattache à une fiche, ou à aucune", () => {
    const id = "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c";

    expect(echeance({ ficheId: id })).toMatchObject({
      ok: true,
      valeur: { ficheId: id },
    });
    expect(echeance({ ficheId: "pas-un-id" })).toMatchObject({ ok: false });
  });
});

describe("garantie — la fiche de l'objet et sa fin de garantie", () => {
  const balance = {
    titre: "Balance",
    marque: "Terraillon",
    modele: "",
    categorie: "Salle de bain",
    dateAchat: "2026-10-13",
    dureeNombre: "2",
    dureeUnite: "year",
  };

  it("crée la fiche de l'objet, avec ses attributs", () => {
    const r = lire(garantieSaisie, balance);

    expect(r.ok && nouvelleGarantie(r.valeur).fiche).toEqual({
      nature: "equipement",
      titre: "Balance",
      categorie: "Salle de bain",
      attributs: [
        { libelle: "Marque", type: "texte", valeur: "Terraillon" },
        { libelle: "Date d'achat", type: "date", valeur: "2026-10-13" },
        {
          libelle: "Durée de garantie",
          type: "duree",
          valeur: { count: 2, unit: "year" },
        },
      ],
    });
  });

  it("⚠️ dérive la fin de garantie de la date d'achat (§ 5.2)", () => {
    const r = lire(garantieSaisie, { ...balance, modele: "Ultra" });

    expect(r.ok && nouvelleGarantie(r.valeur).echeance).toEqual({
      titre: "Fin de garantie — Balance",
      // Liée à l'objet : elle en hérite la catégorie (§ 5.4).
      categorie: null,
      recurrence: {
        kind: "derived",
        sourceDate: "2026-10-13",
        offset: { count: 2, unit: "year" },
      },
      toleranceJours: 0,
      preavisJours: 30,
      tenue: "souple",
      importance: "memoire",
    });
    expect(r.ok && nouvelleGarantie(r.valeur).fiche.attributs[1]).toEqual({
      libelle: "Modèle",
      type: "texte",
      valeur: "Ultra",
    });
  });

  it("se passe de marque et de modèle", () => {
    const r = lire(garantieSaisie, { ...balance, marque: "", modele: "" });

    expect(
      r.ok && nouvelleGarantie(r.valeur).fiche.attributs.map(a => a.libelle),
    ).toEqual(["Date d'achat", "Durée de garantie"]);
  });

  it("accepte une garantie en mois", () => {
    const r = lire(garantieSaisie, {
      ...balance,
      dureeNombre: "6",
      dureeUnite: "month",
    });

    expect(
      r.ok && nouvelleGarantie(r.valeur).echeance.recurrence,
    ).toMatchObject({ offset: { count: 6, unit: "month" } });
  });

  it("refuse une date d'achat dans le futur", () => {
    const r = lire(garantieSaisie, balance);

    expect(r.ok && achatValide(r.valeur, fromISO("2026-10-13"))).toBe(true);
    expect(r.ok && achatValide(r.valeur, fromISO("2026-10-12"))).toBe(false);
  });

  it("exige un nom, une date et une durée", () => {
    expect(
      lire(garantieSaisie, {
        titre: "",
        dateAchat: "13/10/2026",
        dureeNombre: "0",
        dureeUnite: "year",
      }),
    ).toEqual({
      ok: false,
      erreurs: {
        titre: "Un nom est nécessaire.",
        dateAchat: "Date invalide.",
        dureeNombre: "1 au moins.",
      },
    });
  });
});

describe("lire", () => {
  it("rattache une erreur sans champ au formulaire", () => {
    const r = lire(
      echeanceSaisie.refine(() => false, "Refusé."),
      {
        titre: "x",
        importance: "normal",
        tenue: "souple",
        toleranceJours: "0",
        preavisJours: "0",
        motif: "once",
        date: "2026-11-01",
      },
    );

    expect(r).toEqual({ ok: false, erreurs: { formulaire: "Refusé." } });
  });
});

describe("catégories (§ 5.4)", () => {
  it("propose les thèmes de départ et ceux du foyer, sans doublon de casse", () => {
    expect(categoriesProposees(["cuisine ", "Bateau", "  "])).toEqual(
      [...CATEGORIES_DE_DEPART, "Bateau"].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    );
  });

  it("ramène une saisie à la catégorie connue qu'elle désigne", () => {
    const connues = categoriesProposees([]);

    expect(categorieConnue("  cuisine ", connues)).toBe("Cuisine");
    expect(categorieConnue("SANTÉ", connues)).toBe("Santé");
    expect(categorieConnue(" Bateau ", connues)).toBe("Bateau");
    expect(categorieConnue(null, connues)).toBeNull();
  });

  it("⚠️ une échéance liée à une fiche ne garde pas de catégorie", () => {
    const base = {
      titre: "Vidange",
      categorie: "Véhicule",
      importance: "normal",
      tenue: "souple",
      toleranceJours: "3",
      preavisJours: "7",
      motif: "once",
      date: "2026-11-01",
    };
    const liee = lire(echeanceSaisie, {
      ...base,
      ficheId: "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c",
    });
    const seule = lire(echeanceSaisie, base);

    expect(liee.ok && nouvelleEcheance(liee.valeur).categorie).toBeNull();
    expect(seule.ok && nouvelleEcheance(seule.valeur).categorie).toBe(
      "Véhicule",
    );
  });
});

describe("remplacement d'un consommable (§ 5.3)", () => {
  const ID = "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c";

  it("accepte un kilométrage, ou son absence", () => {
    expect(
      lire(remplacementSaisie, {
        consommableId: ID,
        le: "2026-10-17",
        compteur: "90200",
      }),
    ).toEqual({
      ok: true,
      valeur: { consommableId: ID, le: "2026-10-17", compteur: 90_200 },
    });
    expect(
      lire(remplacementSaisie, {
        consommableId: ID,
        le: "2026-10-17",
        compteur: "",
      }),
    ).toMatchObject({ ok: true, valeur: { compteur: null } });
    expect(
      lire(remplacementSaisie, { consommableId: ID, le: "2026-10-17" }),
    ).toMatchObject({ ok: true, valeur: { compteur: null } });
  });

  it("refuse un kilométrage négatif ou décimal, et un consommable inconnu", () => {
    for (const compteur of ["-1", "12.5"]) {
      expect(
        lire(remplacementSaisie, {
          consommableId: ID,
          le: "2026-10-17",
          compteur,
        }),
      ).toMatchObject({ ok: false, erreurs: { compteur: expect.any(String) } });
    }
    expect(
      lire(remplacementSaisie, { consommableId: "x", le: "2026-10-17" }),
    ).toMatchObject({
      ok: false,
      erreurs: { consommableId: "Consommable inconnu." },
    });
  });

  it("⚠️ refuse une date dans le futur", () => {
    const saisie = { consommableId: ID, le: "2026-10-18", compteur: null };

    expect(remplacementValide(saisie, fromISO("2026-10-17"))).toBe(false);
    expect(
      remplacementValide(
        { ...saisie, le: "2026-10-17" },
        fromISO("2026-10-17"),
      ),
    ).toBe(true);
  });
});
