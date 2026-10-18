import { describe, expect, it } from "vitest";
import {
  achatValide,
  CATEGORIES_DE_DEPART,
  categorieConnue,
  categoriesProposees,
  echeanceSaisie,
  erreursDesRappels,
  ficheSaisie,
  garantieSaisie,
  lire,
  marqueConnue,
  marquesConnues,
  marquesSuggerees,
  nouvelleEcheance,
  nouvelleGarantie,
  RAPPEL_PASSE,
  RAPPELS_MAX,
  rappelsDejaPasses,
  remplacementSaisie,
  remplacementValide,
  SUGGESTIONS_MAX,
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

describe("échéance, exception push", () => {
  it("toujours, jamais, ou selon le tableau", () => {
    const exception = (notifier?: string) => {
      const r = echeance(notifier === undefined ? {} : { notifier });

      return r.ok && nouvelleEcheance(r.valeur).notifier;
    };

    expect(exception("oui")).toBe(true);
    expect(exception("non")).toBe(false);
    expect(exception("")).toBeNull();
    expect(exception()).toBeNull();
    expect(echeance({ notifier: "peut-être" })).toEqual({
      ok: false,
      erreurs: { notifier: "Choix inconnu." },
    });
  });
});

describe("échéance, rappels à la main", () => {
  it("lit plusieurs rappels et leurs canaux, dans l'ordre", () => {
    const r = echeance({
      rappel0Nombre: "1",
      rappel0Unite: "month",
      rappel0Email: "on",
      rappel1Nombre: "1",
      rappel1Unite: "day",
      rappel1Email: "on",
      rappel1Push: "on",
    });

    expect(r.ok && nouvelleEcheance(r.valeur).rappels).toEqual([
      { amount: 1, unit: "month", channels: ["email"] },
      { amount: 1, unit: "day", channels: ["email", "push"] },
    ]);
  });

  it("ignore un rappel sans délai, et prend les jours par défaut", () => {
    const r = echeance({
      rappel0Nombre: "",
      rappel0Email: "on",
      rappel2Nombre: "3",
      rappel2Push: "on",
    });

    expect(r.ok && nouvelleEcheance(r.valeur).rappels).toEqual([
      { amount: 3, unit: "day", channels: ["push"] },
    ]);
    expect(echeance({})).toMatchObject({ ok: true, valeur: { rappels: [] } });
  });

  it("⚠️ refuse un rappel sans canal, ou à une unité inconnue, à son rang", () => {
    expect(
      echeance({
        rappel0Nombre: "2",
        rappel0Email: "on",
        rappel1Nombre: "3",
      }),
    ).toEqual({
      ok: false,
      erreurs: {
        "rappels.1": "Choisis au moins un canal : e-mail ou notification.",
      },
    });
    expect(
      echeance({
        rappel0Nombre: "1",
        rappel0Unite: "year",
        rappel0Email: "on",
      }),
    ).toEqual({ ok: false, erreurs: { "rappels.0": "Unité inconnue." } });
  });

  it("⚠️ refuse deux rappels au même délai : une semaine vaut sept jours", () => {
    expect(
      echeance({
        rappel0Nombre: "1",
        rappel0Unite: "week",
        rappel0Email: "on",
        rappel1Nombre: "7",
        rappel1Unite: "day",
        rappel1Push: "on",
      }),
    ).toEqual({
      ok: false,
      erreurs: { "rappels.1": "Un autre rappel tombe déjà à ce délai." },
    });
  });

  it(`refuse plus de ${RAPPELS_MAX} rappels`, () => {
    const champs = Object.fromEntries(
      Array.from({ length: RAPPELS_MAX + 1 }, (_, rang) => [
        [`rappel${rang}Nombre`, String(rang + 1)],
        [`rappel${rang}Email`, "on"],
      ]).flat(),
    );

    expect(echeance(champs)).toEqual({
      ok: false,
      erreurs: { rappels: `${RAPPELS_MAX} rappels au plus.` },
    });
  });

  it("ne lit pas autre chose qu'un formulaire", () => {
    expect(echeanceSaisie.safeParse(null).success).toBe(false);
  });

  it("⚠️ repère les rappels déjà passés, pour une échéance unique seulement", () => {
    const valeur = (champs: Record<string, string>) => {
      const r = echeance(champs);

      if (!r.ok) {
        throw new Error("saisie refusée");
      }

      return r.valeur;
    };
    const aujourdhui = fromISO("2026-10-25");
    // Le 1er novembre : une semaine avant tombe aujourd'hui, six jours avant
    // demain, un mois avant est passé.
    const trois = {
      rappel0Nombre: "1",
      rappel0Unite: "week",
      rappel0Email: "on",
      rappel1Nombre: "6",
      rappel1Email: "on",
      rappel2Nombre: "1",
      rappel2Unite: "month",
      rappel2Email: "on",
    };

    expect(rappelsDejaPasses(valeur(trois), aujourdhui)).toEqual([0, 2]);
    expect(
      rappelsDejaPasses(
        valeur({ ...trois, motif: "interval", nombre: "1", unite: "month" }),
        aujourdhui,
      ),
    ).toEqual([]);
    expect(
      rappelsDejaPasses(
        valeur({
          ...trois,
          motif: "sinceCompletion",
          date: "",
          nombre: "1",
          unite: "month",
        }),
        aujourdhui,
      ),
    ).toEqual([]);
    expect(
      rappelsDejaPasses(
        valeur({ rappel0Nombre: "", rappel0Email: "on" }),
        aujourdhui,
      ),
    ).toEqual([]);
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
      rappels: [],
      notifier: null,
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

describe("marques : proposées à mesure qu'on les écrit", () => {
  const connues = marquesConnues([
    "Bosch",
    "bosch ",
    "Brandt",
    "De'Longhi",
    "Électrolux",
    "Rosières",
    "Ambosch",
    "  ",
  ]);

  it("garde les marques du foyer sans vide ni doublon de casse", () => {
    expect(connues).toEqual([
      "Ambosch",
      "Bosch",
      "Brandt",
      "De'Longhi",
      "Électrolux",
      "Rosières",
    ]);
  });

  it("propose celle qui égale la saisie, puis celles qui la commencent, puis celles qui la contiennent", () => {
    expect(marquesSuggerees("bosch", [...connues, "Boschmann"])).toEqual([
      "Bosch",
      "Boschmann",
      "Ambosch",
    ]);
    expect(marquesSuggerees("b", connues)).toEqual([
      "Bosch",
      "Brandt",
      "Ambosch",
    ]);
  });

  it("ne tient compte ni de la casse, ni des accents, ni des espaces autour", () => {
    expect(marquesSuggerees("  ELECTRO", connues)).toEqual(["Électrolux"]);
    expect(marquesSuggerees("rosie", connues)).toEqual(["Rosières"]);
  });

  it("ne propose rien pour une saisie vide ou sans correspondance", () => {
    expect(marquesSuggerees("", connues)).toEqual([]);
    expect(marquesSuggerees("   ", connues)).toEqual([]);
    expect(marquesSuggerees("Miele", connues)).toEqual([]);
  });

  it(`en propose ${SUGGESTIONS_MAX} au plus`, () => {
    const nombreuses = Array.from({ length: 10 }, (_, i) => `Marque ${i}`);

    expect(marquesSuggerees("marque", nombreuses)).toHaveLength(
      SUGGESTIONS_MAX,
    );
  });

  it("ramène une marque saisie à la marque connue qu'elle désigne", () => {
    expect(marqueConnue(" bosch ", connues)).toBe("Bosch");
    expect(marqueConnue(" Miele ", connues)).toBe("Miele");
    expect(marqueConnue(null, connues)).toBeNull();
  });
});

describe("erreurs des rappels pendant la saisie", () => {
  const aujourdhui = fromISO("2026-10-25");
  // Le formulaire tel qu'il s'ouvre : pas encore de nom.
  const formulaire = {
    importance: "normal",
    tenue: "souple",
    toleranceJours: "3",
    preavisJours: "7",
    motif: "once",
    date: "2026-11-01",
  };

  it("signale un rappel déjà passé, sans attendre le nom", () => {
    expect(
      erreursDesRappels(
        {
          ...formulaire,
          rappel0Nombre: "1",
          rappel0Email: "on",
          rappel1Nombre: "1",
          rappel1Unite: "week",
          rappel1Email: "on",
        },
        aujourdhui,
      ),
    ).toEqual({ "rappels.1": RAPPEL_PASSE });
  });

  it("ne garde que les erreurs des rappels", () => {
    expect(
      erreursDesRappels(
        {
          ...formulaire,
          preavisJours: "-1",
          rappel0Nombre: "1",
          rappel0Unite: "year",
          rappel0Email: "on",
        },
        aujourdhui,
      ),
    ).toEqual({ "rappels.0": "Unité inconnue." });
    expect(
      erreursDesRappels({ ...formulaire, rappel0Nombre: "2" }, aujourdhui),
    ).toEqual({
      "rappels.0": "Choisis au moins un canal : e-mail ou notification.",
    });
    expect(erreursDesRappels(formulaire, aujourdhui)).toEqual({});
  });
});
