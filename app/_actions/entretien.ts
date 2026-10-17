"use server";

import { revalidatePath } from "next/cache";
import {
  lire,
  remplacementSaisie,
  remplacementValide,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import { remplacerConsommable } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { fromISO } from "@/lib/domain/plain-date";

/**
 * « Fait » sur un consommable, une fois la date et le compteur confirmés
 * (§ 5.3). Rend `null` si c'est enregistré, sinon ce qui ne va pas.
 */
export async function remplacer(
  consommableId: string,
  le: string,
  compteur: string,
): Promise<string | null> {
  const saisie = lire(remplacementSaisie, { consommableId, le, compteur });

  if (!saisie.ok) {
    return Object.values(saisie.erreurs)[0] ?? "Saisie invalide.";
  }

  if (!remplacementValide(saisie.valeur, aujourdhuiAParis())) {
    return "La date ne peut pas être dans le futur.";
  }

  await enMonNom(tx =>
    remplacerConsommable(
      tx,
      saisie.valeur.consommableId,
      fromISO(saisie.valeur.le),
      saisie.valeur.compteur,
    ),
  );
  revalidatePath("/");
  revalidatePath("/a-venir");

  return null;
}
