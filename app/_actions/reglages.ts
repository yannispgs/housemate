"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { basculement, reglagesCrecheSaisis } from "@/lib/data/creche";
import {
  abonnerRappelCreche,
  desabonnerRappelCreche,
  enregistrerReglagesCreche,
  lireExceptionsCreche,
  lireReglagesCreche,
  poserExceptionCreche,
  retirerExceptionCreche,
} from "@/lib/data/creche-store";
import {
  enregistrerAbonnement,
  retirerAbonnement,
} from "@/lib/data/push-store";
import { reglagesSaisis } from "@/lib/data/resumes";
import { enregistrerReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";
import { fromISO } from "@/lib/domain/plain-date";

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

/** La section Rappel de crèche : les réglages du foyer (§ 12.9). */
export async function enregistrerCreche(saisie: unknown): Promise<void> {
  const reglages = reglagesCrecheSaisis.parse(saisie);

  await enMonNom(tx => enregistrerReglagesCreche(tx, reglages));

  revalidatePath("/reglages");
}

/** « Recevoir le rappel » : un choix personnel. */
export async function recevoirCreche(oui: unknown): Promise<void> {
  const valeur = z.boolean().parse(oui);

  await enMonNom(valeur ? abonnerRappelCreche : desabonnerRappelCreche);

  revalidatePath("/reglages");
}

/**
 * Un clic sur un jour du calendrier de crèche : il l'inverse (§ 12.9). Le
 * nouvel état se calcule ici, sur ce qui est en base, et non sur l'écran.
 */
export async function basculerJourCreche(jour: unknown): Promise<void> {
  const iso = z.iso.date().parse(jour);

  await enMonNom(async tx => {
    const suivante = basculement(
      fromISO(iso),
      await lireReglagesCreche(tx),
      await lireExceptionsCreche(tx, iso, iso),
    );

    await (suivante === null
      ? retirerExceptionCreche(tx, iso)
      : poserExceptionCreche(tx, suivante));
  });

  revalidatePath("/reglages");
}
