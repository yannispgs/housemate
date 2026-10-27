"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { avecMarqueConnue, lireInfos } from "@/lib/data/infos";
import {
  emplacementConnu,
  emplacementsProposes,
  lire,
  marquesConnues,
  planteSaisie,
  titreSaisie,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  deriver,
  listerEmplacements,
  listerMarques,
  modifierInfos,
  modifierPlante,
  natureDeFiche,
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

  const fait = await enMonNom(async tx => {
    const renommee = await renommerFiche(tx, id.data, saisie.valeur.titre);

    // Une échéance dérivée porte le nom de sa fiche : elle le suit.
    if (renommee) {
      await deriver(tx, id.data);
    }

    return renommee;
  });

  if (!fait) {
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

/**
 * Les infos de base d'une fiche (§ 4.1, décisions du 27/10/2026), et les
 * échéances qui en dérivent. Rend `null` si c'est enregistré, sinon les
 * erreurs par champ (`formulaire` : la fiche elle-même).
 */
export async function renseigner(
  ficheId: string,
  saisie: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, string>> | null> {
  const id = z.uuid().safeParse(ficheId);

  if (!id.success) {
    return { formulaire: INTROUVABLE };
  }

  const erreurs = await enMonNom(async tx => {
    const nature = await natureDeFiche(tx, id.data);

    if (nature === null) {
      return { formulaire: INTROUVABLE };
    }

    const lu = lireInfos(nature, saisie);

    if (!lu.ok) {
      return lu.erreurs;
    }

    await modifierInfos(
      tx,
      id.data,
      avecMarqueConnue(lu.valeur, marquesConnues(await listerMarques(tx))),
    );

    return null;
  });

  if (erreurs === null) {
    rafraichir(id.data);
  }

  return erreurs;
}
