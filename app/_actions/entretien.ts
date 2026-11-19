"use server";

import { revalidatePath } from "next/cache";
import {
  type ChampsIntervention,
  interventionSaisie,
  interventionValide,
  lire,
  remplacementSaisie,
  remplacementValide,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  listerEcheances,
  noterIntervention,
  remplacerConsommable,
} from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { occurrenceACocher } from "@/lib/data/views";
import { fromISO, type PlainDate } from "@/lib/domain/plain-date";

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

/**
 * « Noter une intervention » depuis le carnet (§ 5.3) : tout ce qui est
 * coché, d'un coup. Une échéance liée coche son occurrence en cours, à la
 * date de l'intervention. Rend `null` si c'est enregistré, sinon ce qui ne
 * va pas.
 */
export async function intervenir(
  champs: ChampsIntervention,
): Promise<string | null> {
  const saisie = lire(interventionSaisie, { ...champs });

  if (!saisie.ok) {
    return Object.values(saisie.erreurs)[0] ?? "Saisie invalide.";
  }

  const today = aujourdhuiAParis();

  if (!interventionValide(saisie.valeur, today)) {
    return "La date ne peut pas être dans le futur.";
  }

  const { valeur } = saisie;

  await enMonNom(async tx => {
    const rows = await listerEcheances(tx);
    const echeances = valeur.echeances.flatMap(id => {
      const row = rows.find(r => r.id === id);
      const occurrence: PlainDate | null =
        row === undefined ? null : occurrenceACocher(row, today);

      return occurrence === null ? [] : [{ id, occurrence }];
    });

    await noterIntervention(tx, {
      ficheId: valeur.ficheId,
      le: fromISO(valeur.le),
      compteur: valeur.compteur,
      cout: valeur.cout,
      consommables: valeur.consommables,
      echeances,
      libres: valeur.libres,
    });
  });
  revalidatePath("/");
  revalidatePath("/a-venir");
  revalidatePath(`/fiches/${valeur.ficheId}`);

  return null;
}
