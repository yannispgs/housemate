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
import { attributsPlante, type PotOuTerre } from "@/lib/data/plantes";
import {
  type Attribut,
  type EcheanceSaisie,
  echeanceSaisie,
  type GarantieSaisie,
  garantieSaisie,
  type NouvelleEcheance,
  type NouvelleFiche,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import type { DureeDeVie, NouvellePieceJointe } from "@/lib/data/store";
import type { TenueConsommable } from "@/lib/domain/entretien";
import {
  addDays,
  addMonths,
  type PlainDate,
  toISO,
} from "@/lib/domain/plain-date";

type Garantie = ReturnType<typeof nouvelleGarantie>;

/**
 * La facture fictive, déposée une fois pour toutes dans le stockage des
 * previews (`housemate-previews`, 2026-10-16) : toutes les previews la
 * référencent, aucune ne la dépose.
 */
export const FACTURE_FICTIVE: Omit<NouvellePieceJointe, "ficheId"> = {
  nom: "Facture (fictive)",
  typeMime: "application/pdf",
  taille: 708,
  cle: "demo/facture-fictive.pdf",
};

export interface GarantieFictive {
  readonly garantie: Garantie;
  /** Les pièces jointes de sa fiche (`ficheId` posé à l'insertion). */
  readonly pieces: readonly Omit<NouvellePieceJointe, "ficheId">[];
}

export interface ConsommableFictif {
  readonly intitule: string;
  readonly duree: DureeDeVie;
  /** Sa tenue propre ; `null` : celle de l'objet. */
  readonly tenue: TenueConsommable | null;
  readonly remplacements: readonly {
    readonly le: PlainDate;
    readonly compteur: number | null;
  }[];
}

export interface FicheFictive {
  readonly fiche: NouvelleFiche;
  /** Les échéances rattachées à cette fiche (`ficheId` posé à l'insertion). */
  readonly echeances: readonly NouvelleEcheance[];
  /** Les réglages d'entretien de l'objet ; `null` : ceux par défaut. */
  readonly entretien: {
    readonly tenue: TenueConsommable;
    readonly seuil: number;
  } | null;
  /** Le plan d'entretien (§ 5.3), vide le plus souvent. */
  readonly consommables: readonly ConsommableFictif[];
  /** Les relevés du compteur de la fiche. */
  readonly releves: readonly {
    readonly le: PlainDate;
    readonly valeur: number;
  }[];
}

export interface JeuFictif {
  readonly fiches: readonly FicheFictive[];
  readonly garanties: readonly GarantieFictive[];
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
  const garantie = (
    s: GarantieSaisie,
    pieces: GarantieFictive["pieces"] = [],
  ): GarantieFictive => ({
    garantie: nouvelleGarantie(garantieSaisie.parse(s)),
    pieces,
  });
  const fiche = (
    nature: NouvelleFiche["nature"],
    titre: string,
    categorie: string,
    echeances: readonly NouvelleEcheance[] = [],
    attributs: readonly Attribut[] = [],
  ): FicheFictive => ({
    fiche: { nature, titre, categorie, attributs },
    echeances,
    entretien: null,
    consommables: [],
    releves: [],
  });
  // En pot ou en terre, l'emplacement (§ 12.4) et les seuils de gel (§ 12.2) :
  // de quoi essayer le filtre et la veille gel.
  const plante = (
    pot: PotOuTerre,
    emplacement: string,
    seuilDegats: number,
    seuilMort: number,
  ) => attributsPlante({ pot, emplacement, seuilDegats, seuilMort });
  const texte = (libelle: string, valeur: string): Attribut => ({
    libelle,
    type: "texte",
    valeur,
  });
  const date = (libelle: string, valeur: string): Attribut => ({
    libelle,
    type: "date",
    valeur,
  });

  return {
    fiches: [
      {
        ...fiche(
          "vehicule",
          "La voiture",
          "Véhicule",
          [
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
          ],
          [
            texte("Immatriculation", "AA-000-AA"),
            date("Mise en circulation", toISO(addMonths(today, -70))),
          ],
        ),
        // Environ 40 km par jour (§ 5.3, rythme).
        releves: [
          { le: addDays(today, -730), valeur: 61_000 },
          { le: addDays(today, -365), valeur: 75_600 },
          { le: addDays(today, -150), valeur: 84_200 },
          { le: addDays(today, -20), valeur: 89_400 },
        ],
        // Une voiture se tient à temps : ses consommables montent (§ 5.3).
        entretien: { tenue: "ferme", seuil: 0.075 },
        consommables: [
          // Limite à 91 000 km, 90 200 estimés : en préavis, à l'accueil.
          {
            intitule: "Vidange",
            tenue: null,
            duree: { compteur: 15_000, temps: { count: 1, unit: "year" } },
            remplacements: [{ le: addDays(today, -200), compteur: 76_000 }],
          },
          // Loin : seulement dans À venir, à une date estimée.
          {
            intitule: "Courroie de distribution",
            tenue: null,
            duree: { compteur: 120_000, temps: { count: 10, unit: "year" } },
            remplacements: [{ le: addMonths(today, -70), compteur: 0 }],
          },
          // Souple malgré la voiture ferme : en retard, mais sans monter.
          {
            intitule: "Essuie-glaces",
            tenue: "souple",
            duree: { compteur: null, temps: { count: 1, unit: "year" } },
            remplacements: [{ le: addDays(today, -380), compteur: null }],
          },
        ],
      },
      fiche(
        "plante",
        "Le citronnier en pot",
        "Jardin",
        [
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
        ],
        plante("En pot", "Extérieur", -5, -10),
      ),
      fiche(
        "plante",
        "Le laurier rose",
        "Jardin",
        [
          echeance({
            titre: "Hivernage du laurier rose",
            categorie: "Jardin",
            motif: "once",
            date: jour(30),
            preavisJours: 10,
          }),
        ],
        plante("En pot", "Véranda", 0, -5),
      ),
      fiche(
        "plante",
        "Le rosier grimpant",
        "Jardin",
        [
          // Fait il y a trois jours : figure au récap.
          echeance({
            titre: "Fleurs fanées du rosier",
            categorie: "Jardin",
            motif: "sinceCompletion",
            date: jour(-3),
            nombre: 15,
            unite: "day",
          }),
        ],
        plante("En terre", "Extérieur", -20, -25),
      ),
      fiche(
        "equipement",
        "La chaudière",
        "Maison",
        [
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
        ],
        [
          texte("Marque", "Marque fictive"),
          date("Mise en service", toISO(addMonths(today, -40))),
        ],
      ),
      fiche("equipement", "Le détecteur de fumée", "Maison", [
        // Critique et à faire : rang 1 de l'accueil, en tête de tout.
        echeance({
          titre: "Changer la pile du détecteur de fumée",
          categorie: "Maison",
          motif: "sinceCompletion",
          date: toISO(addDays(addMonths(today, -12), -2)),
          nombre: 1,
          unite: "year",
          tenue: "ferme",
          importance: "critique",
          toleranceJours: 7,
        }),
      ]),
      fiche("equipement", "L'aspirateur", "Nettoyage", [
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
      fiche("personne", "Mamie", "Fêtes", [
        echeance({
          titre: "Anniversaire de Mamie",
          categorie: "Fêtes",
          motif: "annual",
          date: jour(25),
          importance: "important",
          preavisJours: 21,
        }),
      ]),
      fiche(
        "document",
        "Le passeport",
        "Administratif",
        [
          // Loin : seulement dans À venir.
          echeance({
            titre: "Renouveler le passeport",
            categorie: "Administratif",
            motif: "once",
            date: toISO(addMonths(today, 18)),
            tenue: "ferme",
            importance: "important",
            toleranceJours: 0,
            preavisJours: 60,
          }),
        ],
        [date("Date d'expiration", toISO(addMonths(today, 24)))],
      ),
      fiche("lieu", "La véranda", "Maison"),
    ],
    garanties: [
      // Fin de garantie dans trois semaines : en préavis, pour mémoire.
      garantie(
        {
          titre: "Le lave-linge",
          marque: "Marque fictive",
          modele: null,
          categorie: "Nettoyage",
          dateAchat: toISO(addDays(addMonths(today, -24), 21)),
          dureeNombre: 2,
          dureeUnite: "year",
        },
        [FACTURE_FICTIVE],
      ),
      garantie({
        titre: "La balance de cuisine",
        marque: null,
        modele: null,
        categorie: "Cuisine",
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
        categorie: "Cuisine",
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
