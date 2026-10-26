"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emplacementConnu, emplacementsProposes } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  declarerNuitChauffee,
  deplacerPlante,
  listerEmplacements,
} from "@/lib/data/store";

const emplacement = z
  .string()
  .trim()
  .min(1, "Choisis un emplacement.")
  .max(120, "120 caractères au plus.");

/**
 * « Déplacer » une plante depuis la carte de gel (SPEC § 12.8, décision du
 * 26/10/2026) : son emplacement change jusqu'au prochain changement. Rend
 * `null` si c'est enregistré, sinon ce qui ne va pas.
 */
export async function deplacer(
  ficheId: string,
  vers: string,
): Promise<string | null> {
  const id = z.uuid().safeParse(ficheId);
  const lu = emplacement.safeParse(vers);

  if (!id.success) {
    return "Plante introuvable.";
  }

  if (!lu.success) {
    return lu.error.issues[0]?.message ?? "Emplacement invalide.";
  }

  const fait = await enMonNom(async tx =>
    deplacerPlante(
      tx,
      id.data,
      // Un emplacement qui ne diffère d'un connu que par la casse y est ramené.
      emplacementConnu(
        lu.data,
        emplacementsProposes(await listerEmplacements(tx)),
      ) ?? lu.data,
    ),
  );

  if (!fait) {
    return "Plante introuvable.";
  }

  revalidatePath("/");
  revalidatePath(`/fiches/${id.data}`);
  revalidatePath("/inventaire");

  return null;
}

/**
 * « Chauffer » la véranda cette nuit (§ 12.8 c), ou se raviser. Rend `null`
 * si c'est enregistré.
 */
export async function chauffer(chauffee: boolean): Promise<string | null> {
  const fait = await enMonNom(tx =>
    declarerNuitChauffee(tx, new Date(), chauffee === true),
  );

  if (!fait) {
    return "La nuit est passée : rien à déclarer.";
  }

  revalidatePath("/");

  return null;
}
