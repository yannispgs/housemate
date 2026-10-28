"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NIVEAUX, reglagesSaisie } from "@/lib/data/anniversaires";
import { lire } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import { choisirAnniversaire, reglerAnniversaires } from "@/lib/data/store";

const choix = z.enum(NIVEAUX).nullable();

function rafraichir(): void {
  revalidatePath("/");
  revalidatePath("/a-venir");
}

/**
 * Son rappel pour l'anniversaire d'une personne (§ 4.1, décision du
 * 27/10/2026) : « cadeau », « simple », ou `null` pour aucun. Rend `null` si
 * c'est enregistré, sinon ce qui ne va pas.
 */
export async function choisirRappel(
  ficheId: string,
  niveau: string | null,
): Promise<string | null> {
  const id = z.uuid().safeParse(ficheId);
  const lu = choix.safeParse(niveau);

  if (!id.success || !lu.success) {
    return "Choix invalide.";
  }

  const fait = await enMonNom(tx => choisirAnniversaire(tx, id.data, lu.data));

  if (fait === "introuvable") {
    return "Fiche introuvable.";
  }

  if (fait === "sans-date") {
    return "Renseigne d'abord la date de naissance.";
  }

  revalidatePath(`/fiches/${id.data}`);
  rafraichir();

  return null;
}

/**
 * Ses réglages d'anniversaire (§ 4.1, décisions du 28/10/2026). Rend `null`
 * si c'est enregistré, sinon les erreurs par champ.
 */
export async function reglerRappels(
  saisie: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, string>> | null> {
  const lu = lire(reglagesSaisie, saisie);

  if (!lu.ok) {
    return lu.erreurs;
  }

  await enMonNom(tx => reglerAnniversaires(tx, lu.valeur));
  revalidatePath("/reglages");
  rafraichir();

  return null;
}
