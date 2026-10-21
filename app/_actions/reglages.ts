"use server";

import { revalidatePath } from "next/cache";
import { reglagesSaisis } from "@/lib/data/resumes";
import { enregistrerReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";

/** La section Notifications de Réglages : mes résumés, en entier (§ 6). */
export async function enregistrerResumes(saisie: unknown): Promise<void> {
  const reglages = reglagesSaisis.parse(saisie);

  await enMonNom(tx => enregistrerReglagesResumes(tx, reglages));

  revalidatePath("/reglages");
}
