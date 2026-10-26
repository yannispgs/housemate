/**
 * La carte « Gel cette nuit » de l'accueil (SPEC § 12.8, décisions du
 * 26/10/2026) : les plantes de la nuit en cours, groupées par emplacement,
 * Extérieur puis Véranda. Logique pure.
 */
import { celsius } from "@/lib/data/fiche-vue";
import { DEFAULT_FORECAST_MARGIN, MARGIN_PROPOSAL } from "@/lib/domain/frost";
import type { FrostRange } from "@/lib/ui/deadline";

export type FrostLocation = "Extérieur" | "Véranda";
export type FrostLevel = "alerte" | "vigilance" | "indisponible";

/** Une plante de la nuit, telle que lue en base (`lireVeilleGel`). */
export interface FrostRow {
  readonly nuit: string;
  readonly chauffee: boolean;
  readonly ficheId: string;
  readonly titre: string;
  readonly emplacementDuSoir: FrostLocation;
  readonly emplacement: string | null;
  readonly niveau: FrostLevel;
  readonly estimation: number | null;
  readonly borneBasse: number | null;
  readonly seuilDegats: number;
  readonly seuilMort: number | null;
}

export interface FrostPlantView {
  readonly ficheId: string;
  readonly titre: string;
  readonly niveau: FrostLevel;
  /** Ce que la nuit lui réserve, en une ligne. */
  readonly detail: string;
  /** Là où elle a été déplacée depuis l'alerte, sinon `null`. */
  readonly deplaceeVers: string | null;
  /**
   * La frise du handoff de design, dépliée sous la plante ; `null` sans
   * estimation ou sans seuil de mort pour la borner.
   */
  readonly range: FrostRange | null;
}

export interface FrostSectionView {
  readonly emplacement: FrostLocation;
  readonly plantes: readonly FrostPlantView[];
}

export interface FrostCardView {
  readonly nuit: string;
  /** La véranda est déclarée chauffée cette nuit. */
  readonly chauffee: boolean;
  /** Au moins une plante en alerte ; sinon, il n'y a qu'à surveiller. */
  readonly alerte: boolean;
  readonly sections: readonly FrostSectionView[];
}

const ORDRE: readonly FrostLevel[] = ["alerte", "indisponible", "vigilance"];
const EMPLACEMENTS: readonly FrostLocation[] = ["Extérieur", "Véranda"];

function detail(row: FrostRow): string {
  const degats = `dégâts dès ${celsius(row.seuilDegats)}`;

  if (row.borneBasse === null) {
    return `Impossible d'estimer ce soir · ${degats}`;
  }

  const pireCas = celsius(row.borneBasse);

  return row.niveau === "vigilance"
    ? `À surveiller · jusqu'à ${pireCas}, ${degats}`
    : `Jusqu'à ${pireCas} · ${degats}`;
}

function explication(borneBasse: number, degats: number, mort: number): string {
  if (borneBasse <= mort) {
    return "Le pire cas passe sous le seuil de mort : la protéger ce soir, sans faute.";
  }

  return borneBasse <= degats
    ? "Le pire cas passe sous le seuil de dégâts, sans atteindre celui de mort."
    : "Le pire cas reste au-dessus du seuil de dégâts, mais à moins de 2 °C.";
}

function range(row: FrostRow): FrostRange | null {
  const { estimation, borneBasse, seuilMort } = row;

  if (estimation === null || borneBasse === null || seuilMort === null) {
    return null;
  }

  return {
    lowerBound: borneBasse,
    estimate: estimation,
    margin: Math.round((estimation - borneBasse) * 10) / 10,
    damageThreshold: row.seuilDegats,
    deathThreshold: seuilMort,
    explanation: explication(borneBasse, row.seuilDegats, seuilMort),
  };
}

/** La carte de la nuit en cours, ou `null` s'il n'y a rien à en dire. */
export function frostCard(rows: readonly FrostRow[]): FrostCardView | null {
  const [premiere] = rows;

  if (premiere === undefined) {
    return null;
  }

  const sections = EMPLACEMENTS.map(emplacement => ({
    emplacement,
    plantes: rows
      .filter(row => row.emplacementDuSoir === emplacement)
      .sort((a, b) => ORDRE.indexOf(a.niveau) - ORDRE.indexOf(b.niveau))
      .map(row => ({
        ficheId: row.ficheId,
        titre: row.titre,
        niveau: row.niveau,
        detail: detail(row),
        deplaceeVers:
          row.emplacement !== null && row.emplacement !== emplacement
            ? row.emplacement
            : null,
        range: range(row),
      })),
  })).filter(section => section.plantes.length > 0);

  return {
    nuit: premiere.nuit,
    chauffee: premiere.chauffee,
    alerte: rows.some(row => row.niveau === "alerte"),
    sections,
  };
}

/**
 * L'emplacement présélectionné par « Déplacer » : la véranda pour une plante
 * du dehors (décision du 26/10/2026) ; pour une plante de la véranda, le
 * premier autre emplacement connu.
 */
export function destinationProposee(
  depuis: FrostLocation,
  emplacements: readonly string[],
): string {
  if (depuis === "Extérieur") {
    return "Véranda";
  }

  return emplacements.find(e => e !== depuis && e !== "Extérieur") ?? "";
}

/** La marge de prévision telle que la base la rend (`app.marge_prevision`). */
export interface MarginRow {
  readonly actuelle: number | null;
  readonly appliqueeLe: Date | null;
  readonly proposition: {
    readonly id: string;
    readonly valeur: number;
    readonly nuits: number;
    readonly erreur: number;
  } | null;
}

export interface MarginView {
  readonly actuelle: string;
  /** D'où elle vient : appliquée, ou le réglage de départ. */
  readonly origine: string;
  readonly proposition: {
    readonly id: string;
    readonly valeur: string;
    readonly base: string;
  } | null;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Le panneau « Veille gel » des réglages (SPEC § 12.8, décisions du 26/10/2026). */
export function marginView(row: MarginRow): MarginView {
  const p = row.proposition;

  return {
    actuelle: celsius(row.actuelle ?? DEFAULT_FORECAST_MARGIN),
    origine:
      row.appliqueeLe === null
        ? `Réglage de départ, en attendant ${MARGIN_PROPOSAL.minNights} nuits froides mesurées.`
        : `Appliquée le ${JOUR.format(row.appliqueeLe)}.`,
    proposition:
      p === null
        ? null
        : {
            id: p.id,
            valeur: celsius(p.valeur),
            base: `D'après ${p.nuits} nuits froides : la prévision s'est trompée de ${celsius(p.erreur)} en moyenne quadratique. La marge en couvre deux fois l'erreur.`,
          },
  };
}
