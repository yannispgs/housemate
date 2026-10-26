"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  emplacementConnu,
  emplacementsProposes,
  lire,
  planteSaisie,
  titreSaisie,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  listerEmplacements,
  modifierPlante,
  renommerFiche,
} from "@/lib/data/store";

const INTROUVABLE = "Fiche introuvable.";

function rafraichir(ficheId: string): void {
  revalidatePath(`/fiches/${ficheId}`);
  revalidatePath("/inventaire");
  revalidatePath("/");
  revalidatePath("/a-venir");
}

/**
 * Renommer une fiche (§ 4.2, décision du 25/10/2026). Rend `null` si c'est
 * enregistré, sinon ce qui ne va pas.
 */
export async function renommer(
  ficheId: string,
  titre: string,
): Promise<string | null> {
  const id = z.uuid().safeParse(ficheId);
  const saisie = lire(titreSaisie, { titre });

  if (!id.success) {
    return INTROUVABLE;
  }

  if (!saisie.ok) {
    return Object.values(saisie.erreurs)[0] ?? "Saisie invalide.";
  }

  if (
    !(await enMonNom(tx => renommerFiche(tx, id.data, saisie.valeur.titre)))
  ) {
    return INTROUVABLE;
  }

  rafraichir(id.data);

  return null;
}

/** Les champs de la section « Plantation », tels que saisis. */
export interface ChampsPlantation {
  readonly potOuTerre: string;
  readonly emplacement: string;
  readonly seuilDegats: string;
  readonly seuilMort: string;
}

/**
 * En pot ou en terre, l'emplacement et les seuils de gel d'une plante
 * (§ 12.2, § 12.4). Un emplacement qui ne diffère d'un connu que par la casse
 * est ramené à celui-ci.
 */
export async function situer(
  ficheId: string,
  champs: ChampsPlantation,
): Promise<string | null> {
  const id = z.uuid().safeParse(ficheId);
  const saisie = lire(planteSaisie, { ...champs });

  if (!id.success) {
    return INTROUVABLE;
  }

  if (!saisie.ok) {
    return Object.values(saisie.erreurs)[0] ?? "Saisie invalide.";
  }

  const fait = await enMonNom(async tx =>
    modifierPlante(tx, id.data, {
      pot: saisie.valeur.potOuTerre,
      seuilDegats: saisie.valeur.seuilDegats,
      seuilMort: saisie.valeur.seuilMort,
      emplacement: emplacementConnu(
        saisie.valeur.emplacement,
        emplacementsProposes(await listerEmplacements(tx)),
      ),
    }),
  );

  if (!fait) {
    return INTROUVABLE;
  }

  rafraichir(id.data);

  return null;
}
