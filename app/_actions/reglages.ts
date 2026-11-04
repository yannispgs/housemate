"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  enregistrerAbonnement,
  retirerAbonnement,
} from "@/lib/data/push-store";
import { reglagesSaisis } from "@/lib/data/resumes";
import { enregistrerReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";

/** La section Notifications de Réglages : le tableau et mes résumés (§ 6). */
export async function enregistrerResumes(saisie: unknown): Promise<void> {
  const reglages = reglagesSaisis.parse(saisie);

  await enMonNom(tx => enregistrerReglagesResumes(tx, reglages));

  revalidatePath("/reglages");
}

const abonnement = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** « Activer sur cet appareil » : l'abonnement que le navigateur a créé. */
export async function abonnerAppareil(saisie: unknown): Promise<void> {
  const valeur = abonnement.parse(saisie);

  await enMonNom(tx => enregistrerAbonnement(tx, valeur));
}

/** « Désactiver sur cet appareil ». */
export async function desabonnerAppareil(endpoint: unknown): Promise<void> {
  const valeur = abonnement.shape.endpoint.parse(endpoint);

  await enMonNom(tx => retirerAbonnement(tx, valeur));
}
