"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EtatAjout } from "@/lib/data/ajout-etat";
import {
  achatValide,
  echeanceSaisie,
  ficheSaisie,
  garantieSaisie,
  lire,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import { creerEcheance, creerFiche, creerGarantie } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";

const champs = (formulaire: FormData) =>
  Object.fromEntries(
    [...formulaire.entries()].filter(([, v]) => typeof v === "string"),
  );

function rafraichir(): void {
  revalidatePath("/");
  revalidatePath("/a-venir");
  revalidatePath("/inventaire");
}

/**
 * La garantie : la fiche de l'objet et sa fin de garantie. Rend la fiche
 * créée : le navigateur y joint ensuite la facture, puis l'ouvre.
 */
export async function ajouterGarantie(
  _precedent: EtatAjout,
  formulaire: FormData,
): Promise<EtatAjout> {
  const saisie = lire(garantieSaisie, champs(formulaire));

  if (!saisie.ok) {
    return { etape: "saisie", erreurs: saisie.erreurs };
  }

  if (!achatValide(saisie.valeur, aujourdhuiAParis())) {
    return {
      etape: "saisie",
      erreurs: { dateAchat: "La date d'achat ne peut pas être dans le futur." },
    };
  }

  const ficheId = await enMonNom(tx =>
    creerGarantie(tx, nouvelleGarantie(saisie.valeur)),
  );
  rafraichir();

  return { etape: "creee", ficheId };
}

export async function ajouterFiche(
  _precedent: EtatAjout,
  formulaire: FormData,
): Promise<EtatAjout> {
  const saisie = lire(ficheSaisie, champs(formulaire));

  if (!saisie.ok) {
    return { etape: "saisie", erreurs: saisie.erreurs };
  }

  const ficheId = await enMonNom(tx =>
    creerFiche(tx, { ...saisie.valeur, attributs: [] }),
  );
  rafraichir();

  return { etape: "creee", ficheId };
}

export async function ajouterEcheance(
  _precedent: EtatAjout,
  formulaire: FormData,
): Promise<EtatAjout> {
  const saisie = lire(echeanceSaisie, champs(formulaire));

  if (!saisie.ok) {
    return { etape: "saisie", erreurs: saisie.erreurs };
  }

  await enMonNom(tx => creerEcheance(tx, nouvelleEcheance(saisie.valeur)));
  rafraichir();
  redirect("/a-venir");
}
