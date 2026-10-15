/**
 * Le jeu de données fictif des previews : « à l'image du foyer » (décision du
 * 2026-10-10), jamais ses vraies données. Un couple et un jeune enfant, une
 * maison avec une véranda et un jardin, une voiture. ⚠️ Le dépôt est public :
 * aucun prénom réel, aucune commune, aucune date de vie réelle.
 *
 * Toutes les dates sont relatives au jour où la preview est remplie
 * (décision du 2026-10-12) : une preview ouverte aujourd'hui montre des
 * échéances dues, en préavis, en retard et faites, quel que soit le jour.
 *
 * Chaque saisie passe par la même validation que le formulaire d'ajout :
 * le jeu ne peut pas contenir ce que l'app refuserait.
 */
import {
  type EcheanceSaisie,
  echeanceSaisie,
  type GarantieSaisie,
  garantieSaisie,
  type NouvelleEcheance,
  type NouvelleFiche,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import {
  addDays,
  addMonths,
  type PlainDate,
  toISO,
} from "@/lib/domain/plain-date";

type Garantie = ReturnType<typeof nouvelleGarantie>;

export interface FicheFictive {
  readonly fiche: NouvelleFiche;
  /** Les échéances rattachées à cette fiche (`ficheId` posé à l'insertion). */
  readonly echeances: readonly NouvelleEcheance[];
}

export interface JeuFictif {
  readonly fiches: readonly FicheFictive[];
  readonly garanties: readonly Garantie[];
  /** Les échéances sans fiche : un rendez-vous, une corvée. */
  readonly echeances: readonly NouvelleEcheance[];
}

type Saisie = Partial<EcheanceSaisie> & Pick<EcheanceSaisie, "titre" | "motif">;

export function jeuFictif(today: PlainDate): JeuFictif {
  const jour = (n: number) => toISO(addDays(today, n));
  const echeance = (s: Saisie): NouvelleEcheance =>
    nouvelleEcheance(
      echeanceSaisie.parse({
        importance: "normal",
        tenue: "souple",
        toleranceJours: 3,
        preavisJours: 7,
        ...s,
      }),
    );
  const garantie = (s: GarantieSaisie): Garantie =>
    nouvelleGarantie(garantieSaisie.parse(s));
  const fiche = (
    nature: NouvelleFiche["nature"],
    titre: string,
    categorie: string,
    echeances: readonly NouvelleEcheance[] = [],
  ): FicheFictive => ({
    fiche: { nature, titre, categorie, attributs: [] },
    echeances,
  });

  return {
    fiches: [
      fiche("vehicule", "La voiture", "Véhicule", [
        // Ferme, en préavis : son importance monte à l'approche (§ 3.8a).
        echeance({
          titre: "Contrôle technique",
          categorie: "Véhicule",
          motif: "once",
          date: jour(45),
          tenue: "ferme",
          toleranceJours: 0,
          preavisJours: 60,
        }),
        echeance({
          titre: "Révision de la voiture",
          categorie: "Véhicule",
          motif: "interval",
          date: jour(120),
          nombre: 1,
          unite: "year",
          preavisJours: 30,
        }),
      ]),
      fiche("plante", "Le citronnier en pot", "Jardin", [
        // Depuis la dernière fois (motif 4) : en préavis.
        echeance({
          titre: "Engrais du citronnier",
          categorie: "Jardin",
          motif: "sinceCompletion",
          date: jour(-13),
          nombre: 15,
          unite: "day",
        }),
        echeance({
          titre: "Rentrer le citronnier sous abri",
          categorie: "Jardin",
          motif: "annual",
          date: jour(5),
          tenue: "ferme",
          importance: "important",
          toleranceJours: 2,
          preavisJours: 14,
        }),
      ]),
      fiche("plante", "Le laurier rose", "Jardin", [
        echeance({
          titre: "Hivernage du laurier rose",
          categorie: "Jardin",
          motif: "once",
          date: jour(30),
          preavisJours: 10,
        }),
      ]),
      fiche("plante", "Le rosier grimpant", "Jardin", [
        // Fait il y a trois jours : figure au récap.
        echeance({
          titre: "Fleurs fanées du rosier",
          categorie: "Jardin",
          motif: "sinceCompletion",
          date: jour(-3),
          nombre: 15,
          unite: "day",
        }),
      ]),
      fiche("equipement", "La chaudière", "Maison", [
        echeance({
          titre: "Entretien annuel de la chaudière",
          categorie: "Maison",
          motif: "interval",
          date: jour(70),
          nombre: 1,
          unite: "year",
          tenue: "ferme",
          importance: "important",
          toleranceJours: 0,
          preavisJours: 30,
        }),
      ]),
      fiche("equipement", "L'aspirateur", "Maison", [
        // Dû depuis quelques jours : à faire, rang 3 de l'accueil.
        echeance({
          titre: "Changer le filtre de l'aspirateur",
          categorie: "Maison",
          motif: "sinceCompletion",
          date: toISO(addDays(addMonths(today, -3), -4)),
          nombre: 3,
          unite: "month",
          toleranceJours: 7,
        }),
      ]),
      fiche("contrat", "Le contrat d'électricité", "Administratif", [
        echeance({
          titre: "Comparer les offres d'électricité",
          categorie: "Administratif",
          motif: "annual",
          date: jour(200),
          importance: "memoire",
          preavisJours: 30,
        }),
      ]),
      fiche("contrat", "L'assurance habitation", "Administratif", [
        echeance({
          titre: "Comparer l'assurance habitation",
          categorie: "Administratif",
          motif: "annual",
          date: jour(100),
          preavisJours: 30,
        }),
      ]),
      fiche("personne", "Mamie", "Occasions", [
        echeance({
          titre: "Anniversaire de Mamie",
          categorie: "Occasions",
          motif: "annual",
          date: jour(25),
          importance: "important",
          preavisJours: 21,
        }),
      ]),
      fiche("lieu", "La véranda", "Maison"),
    ],
    garanties: [
      // Fin de garantie dans trois semaines : en préavis, pour mémoire.
      garantie({
        titre: "Le lave-linge",
        marque: "Marque fictive",
        modele: null,
        categorie: "Maison",
        dateAchat: toISO(addDays(addMonths(today, -24), 21)),
        dureeNombre: 2,
        dureeUnite: "year",
      }),
      garantie({
        titre: "La balance de cuisine",
        marque: null,
        modele: null,
        categorie: "Maison",
        dateAchat: jour(-60),
        dureeNombre: 2,
        dureeUnite: "year",
      }),
    ],
    echeances: [
      echeance({
        titre: "Changer les draps",
        categorie: "Maison",
        motif: "sinceCompletion",
        date: jour(-10),
        nombre: 2,
        unite: "week",
      }),
      // Critique, en préavis : en tête du rang 4.
      echeance({
        titre: "Rendez-vous de vaccination de l'enfant",
        categorie: "Santé",
        motif: "once",
        date: jour(20),
        tenue: "ferme",
        importance: "critique",
        toleranceJours: 0,
        preavisJours: 30,
      }),
      // Ferme et dépassée : en retard, rang 3. Une échéance ponctuelle à date
      // passée ne le pourrait pas : aucune occurrence n'est cherchée avant le
      // jour de création, qui est aujourd'hui.
      echeance({
        titre: "Purger les radiateurs",
        categorie: "Maison",
        motif: "sinceCompletion",
        date: toISO(addDays(addMonths(today, -12), -20)),
        nombre: 1,
        unite: "year",
        tenue: "ferme",
        toleranceJours: 7,
      }),
      echeance({
        titre: "Détartrer la cafetière",
        categorie: "Maison",
        motif: "sinceCompletion",
        date: jour(-40),
        nombre: 1,
        unite: "month",
      }),
      // Loin : n'apparaît qu'À venir, et dans « le prochain rendez-vous ».
      echeance({
        titre: "Renouveler le nom de domaine",
        categorie: "Administratif",
        motif: "once",
        date: jour(300),
        tenue: "ferme",
        importance: "important",
        toleranceJours: 0,
        preavisJours: 30,
      }),
    ],
  };
}
