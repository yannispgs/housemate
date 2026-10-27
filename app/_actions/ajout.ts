"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EtatAjout } from "@/lib/data/ajout-etat";
import { avecMarqueConnue, lireInfos } from "@/lib/data/infos";
import { attributsPlante } from "@/lib/data/plantes";
import {
  achatValide,
  categorieConnue,
  categoriesProposees,
  echeanceSaisie,
  emplacementConnu,
  emplacementsProposes,
  ficheSaisie,
  garantieSaisie,
  lire,
  marqueConnue,
  marquesConnues,
  nouvelleEcheance,
  nouvelleGarantie,
} from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  creerEcheance,
  creerFiche,
  creerGarantie,
  deriver,
  listerCategories,
  listerEmplacements,
  listerMarques,
  type Tx,
} from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";

const champs = (formulaire: FormData) =>
  Object.fromEntries(
    [...formulaire.entries()].filter(([, v]) => typeof v === "string"),
  );

/**
 * La catégorie saisie, ramenée à une catégorie connue du foyer quand elle
 * n'en diffère que par la casse ou les espaces (§ 5.4).
 */
async function categorie(
  tx: Tx,
  saisie: string | null,
): Promise<string | null> {
  return categorieConnue(
    saisie,
    categoriesProposees(await listerCategories(tx)),
  );
}

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

  const ficheId = await enMonNom(async tx =>
    creerGarantie(
      tx,
      nouvelleGarantie({
        ...saisie.valeur,
        categorie: await categorie(tx, saisie.valeur.categorie),
        marque: marqueConnue(
          saisie.valeur.marque,
          marquesConnues(await listerMarques(tx)),
        ),
      }),
    ),
  );
  rafraichir();

  return { etape: "creee", ficheId };
}

export async function ajouterFiche(
  _precedent: EtatAjout,
  formulaire: FormData,
): Promise<EtatAjout> {
  const saisis = champs(formulaire);
  const saisie = lire(ficheSaisie, saisis);

  if (!saisie.ok) {
    return { etape: "saisie", erreurs: saisie.erreurs };
  }

  // Les infos de base de sa nature (§ 4.1, décisions du 27/10/2026).
  const infos = lireInfos(saisie.valeur.nature, saisis);

  if (!infos.ok) {
    return { etape: "saisie", erreurs: infos.erreurs };
  }

  const { potOuTerre, emplacement, seuilDegats, seuilMort, ...fiche } =
    saisie.valeur;
  const ficheId = await enMonNom(async tx => {
    const id = await creerFiche(tx, {
      ...fiche,
      categorie: await categorie(tx, fiche.categorie),
      attributs: [
        ...avecMarqueConnue(
          infos.valeur,
          marquesConnues(await listerMarques(tx)),
        ),
        // La section « Plantation » : d'une plante seulement (§ 12.2, § 12.4).
        ...(fiche.nature === "plante"
          ? attributsPlante({
              pot: potOuTerre,
              seuilDegats,
              seuilMort,
              emplacement: emplacementConnu(
                emplacement,
                emplacementsProposes(await listerEmplacements(tx)),
              ),
            })
          : []),
      ],
    });
    // Une date d'achat et une garantie, une expiration : leur échéance.
    await deriver(tx, id);

    return id;
  });
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

  await enMonNom(async tx =>
    creerEcheance(
      tx,
      nouvelleEcheance({
        ...saisie.valeur,
        categorie: await categorie(tx, saisie.valeur.categorie),
      }),
    ),
  );
  rafraichir();
  redirect("/a-venir");
}
