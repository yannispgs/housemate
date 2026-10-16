"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enMonNom } from "@/lib/data/server";
import {
  annulerCompletions,
  completer,
  listerEcheances,
} from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { occurrenceACocher } from "@/lib/data/views";

const id = z.uuid();

/**
 * « Fait » sur une carte de l'accueil : coche l'occurrence en cours,
 * aujourd'hui. Rend l'id de la complétion (pour « Annuler »), ou `null` s'il
 * n'y avait rien à cocher.
 */
export async function cocher(echeanceId: string): Promise<string | null> {
  const echeance = id.parse(echeanceId);
  const today = aujourdhuiAParis();
  const completion = await enMonNom(async tx => {
    const row = (await listerEcheances(tx)).find(r => r.id === echeance);
    const occurrence = row && occurrenceACocher(row, today);

    return occurrence ? completer(tx, echeance, occurrence, today) : null;
  });

  revalidatePath("/");
  revalidatePath("/a-venir");

  return completion;
}

/** « Annuler » : annule les complétions faites depuis l'accueil. */
export async function annuler(completionIds: readonly string[]): Promise<void> {
  const ids = z.array(id).parse(completionIds);

  await enMonNom(tx => annulerCompletions(tx, ids));

  revalidatePath("/");
  revalidatePath("/a-venir");
}
