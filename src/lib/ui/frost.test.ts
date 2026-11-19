import { describe, expect, it } from "vitest";
import {
  destinationProposee,
  type FrostRow,
  frostCard,
  marginView,
} from "@/lib/ui/frost";

const ligne = (over: Partial<FrostRow>): FrostRow => ({
  nuit: "2026-12-14",
  chauffee: false,
  ficheId: "f",
  titre: "Une plante",
  emplacementDuSoir: "Extérieur",
  emplacement: "Extérieur",
  niveau: "alerte",
  estimation: -1,
  borneBasse: -7.5,
  seuilDegats: -5,
  seuilMort: -10,
  ...over,
});

const deg = (texte: string) => texte.replaceAll(" °C", " °C");

describe("frostCard", () => {
  it("ne dit rien sans plante", () => {
    expect(frostCard([])).toBeNull();
  });

  it("groupe Extérieur puis Véranda, les alertes d'abord", () => {
    const card = frostCard([
      ligne({
        ficheId: "c",
        titre: "Le citronnier",
        emplacementDuSoir: "Véranda",
        emplacement: "Véranda",
        niveau: "indisponible",
        estimation: null,
        borneBasse: null,
        seuilDegats: 0,
      }),
      ligne({ ficheId: "r", titre: "Le romarin", niveau: "vigilance" }),
      ligne({ ficheId: "l", titre: "Le laurier rose" }),
    ]);

    expect(card).toMatchObject({ nuit: "2026-12-14", alerte: true });
    expect(
      card?.sections.map(s => [s.emplacement, s.plantes.map(p => p.titre)]),
    ).toEqual([
      ["Extérieur", ["Le laurier rose", "Le romarin"]],
      ["Véranda", ["Le citronnier"]],
    ]);
    expect(card?.sections.flatMap(s => s.plantes.map(p => p.detail))).toEqual([
      deg("Jusqu'à −7,5 °C · dégâts dès −5 °C"),
      deg("À surveiller · jusqu'à −7,5 °C, dégâts dès −5 °C"),
      deg("Impossible d'estimer ce soir · dégâts dès 0 °C"),
    ]);
  });

  it("n'est qu'à surveiller sans alerte, et dit si la véranda est chauffée", () => {
    expect(
      frostCard([ligne({ niveau: "vigilance", chauffee: true })]),
    ).toMatchObject({ alerte: false, chauffee: true });
  });

  it("dit où une plante a été déplacée depuis l'alerte", () => {
    const plantes = frostCard([
      ligne({ ficheId: "a", emplacement: "Véranda" }),
      ligne({ ficheId: "b", emplacement: null }),
      ligne({ ficheId: "c" }),
    ])?.sections[0]?.plantes;

    expect(plantes?.map(p => p.deplaceeVers)).toEqual(["Véranda", null, null]);
  });

  it("donne la frise, avec son explication", () => {
    const frise = (over: Partial<FrostRow>) =>
      frostCard([ligne(over)])?.sections[0]?.plantes[0]?.range;

    expect(frise({})).toEqual({
      lowerBound: -7.5,
      estimate: -1,
      margin: 6.5,
      damageThreshold: -5,
      deathThreshold: -10,
      explanation:
        "Le pire cas passe sous le seuil de dégâts, sans atteindre celui de mort.",
    });
    expect(frise({ borneBasse: -10 })?.explanation).toContain(
      "sous le seuil de mort",
    );
    expect(frise({ niveau: "vigilance", borneBasse: -4 })?.explanation).toBe(
      "Le pire cas reste au-dessus du seuil de dégâts, mais à moins de 2 °C.",
    );
    // Sans seuil de mort ou sans estimation, pas de frise.
    expect(frise({ seuilMort: null })).toBeNull();
    expect(frise({ estimation: null, borneBasse: null })).toBeNull();
  });
});

describe("destinationProposee", () => {
  it("rentre en véranda une plante du dehors", () => {
    expect(destinationProposee("Extérieur", ["Salon"])).toBe("Véranda");
  });

  it("propose une pièce pour une plante de la véranda, sinon rien", () => {
    expect(destinationProposee("Véranda", ["Extérieur", "Salon"])).toBe(
      "Salon",
    );
    expect(destinationProposee("Véranda", ["Extérieur", "Véranda"])).toBe("");
  });
});

describe("marginView", () => {
  const sansRien = (emplacement: "Extérieur" | "Véranda") => ({
    emplacement,
    actuelle: null,
    appliqueeLe: null,
    proposition: null,
  });

  it("part des réglages de départ, et montre la proposition", () => {
    expect(
      marginView([
        {
          ...sansRien("Extérieur"),
          proposition: { id: "3", valeur: 1.2, nuits: 14, ecart: 1.7 },
        },
        sansRien("Véranda"),
      ]),
    ).toEqual([
      {
        emplacement: "Extérieur",
        libelle: "Dehors",
        actuelle: deg("2 °C"),
        origine: "Réglage de départ, en attendant 10 nuits froides mesurées.",
        role: "Retranchée au minimum annoncé pour chaque plante dehors, avec les marges du sol et du radiatif.",
        proposition: {
          id: "3",
          valeur: deg("1,2 °C"),
          base: deg(
            "D'après 14 nuits froides : le minimum extérieur a fini au pire 1,7 °C sous le minimum attendu. Avec cette marge, le réel finirait au plus 0,5 °C sous le pire cas.",
          ),
        },
      },
      {
        emplacement: "Véranda",
        libelle: "Véranda",
        // Modèle 1,1 + prévision 2.
        actuelle: deg("3,1 °C"),
        origine: deg(
          "Réglage de départ : marges du modèle (1,1 °C) et de la prévision additionnées, plus 1,5 °C de radiatif, en attendant 10 nuits froides mesurées.",
        ),
        role: "",
        proposition: null,
      },
    ]);
  });

  it("dit quand une marge a été appliquée, et ce qu'elle fait", () => {
    const [exterieur, veranda] = marginView([
      {
        ...sansRien("Extérieur"),
        actuelle: 1.3,
        appliqueeLe: new Date("2026-11-20T08:15:00Z"),
      },
      {
        ...sansRien("Véranda"),
        actuelle: 0.6,
        appliqueeLe: new Date("2026-11-21T08:15:00Z"),
        proposition: { id: "4", valeur: 0.3, nuits: 12, ecart: 0 },
      },
    ]);

    expect(exterieur?.actuelle).toBe(deg("1,3 °C"));
    expect(exterieur?.origine).toBe("Appliquée le 20 novembre 2026.");
    expect(veranda?.actuelle).toBe(deg("0,6 °C"));
    expect(veranda?.role).toBe(
      deg(
        "Retranchée au minimum estimé de la véranda, avec 0,5 °C de radiatif.",
      ),
    );
    expect(veranda?.proposition?.base).toBe(
      deg(
        "D'après 12 nuits froides : la véranda a fini au-dessus du minimum attendu chaque fois. Avec cette marge, le réel finirait au plus 0,5 °C sous le pire cas.",
      ),
    );
  });

  it("ne montre rien hors d'un foyer", () => {
    expect(marginView([])).toEqual([]);
  });
});
