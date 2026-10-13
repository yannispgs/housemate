"use client";

/**
 * Ajouter une garantie : la fiche de l'objet, sa fin de garantie (dérivée de
 * la date d'achat) et, facultative, sa facture. ⚠️ Provisoire : pas encore
 * dessiné dans Claude Design.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";
import { ajouterGarantie } from "../../../app/_actions/ajout";
import { BOUTON, CHAMP, Champ, LISTE } from "../forms/Champ";
import { envoyerPieceJointe } from "../forms/fichier";

export function GarantieForm({ aujourdhui }: Readonly<{ aujourdhui: string }>) {
  const [etat, agir, enCours] = useActionState(ajouterGarantie, ETAT_AJOUT);
  const facture = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [envoi, setEnvoi] = useState<"aucun" | "en cours" | string>("aucun");
  const erreurs = etat.etape === "saisie" ? (etat.erreurs ?? {}) : {};

  // La garantie créée, on joint la facture, puis on ouvre la fiche.
  useEffect(() => {
    if (etat.etape !== "creee") {
      return;
    }

    const fichier = facture.current?.files?.[0];

    if (fichier === undefined) {
      router.push(`/fiches/${etat.ficheId}`);
      return;
    }

    setEnvoi("en cours");
    envoyerPieceJointe(etat.ficheId, fichier, "Facture")
      .catch(() => "L'envoi de la facture a échoué.")
      .then(erreur => {
        if (erreur === null) {
          router.push(`/fiches/${etat.ficheId}`);
        } else {
          setEnvoi(erreur);
        }
      });
  }, [etat, router]);

  if (etat.etape === "creee" && envoi !== "aucun" && envoi !== "en cours") {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[14.5px] text-ink">
          La garantie est enregistrée, mais pas la facture : {envoi}
        </p>
        <Link href={`/fiches/${etat.ficheId}`} className="text-ink underline">
          Ouvrir la fiche pour joindre la facture
        </Link>
      </div>
    );
  }

  return (
    <form action={agir} className="flex flex-col gap-4">
      <Champ libelle="Objet" erreur={erreurs.titre}>
        <input name="titre" className={CHAMP} required maxLength={120} />
      </Champ>
      <Champ libelle="Marque" erreur={erreurs.marque}>
        <input name="marque" className={CHAMP} maxLength={120} />
      </Champ>
      <Champ libelle="Modèle" erreur={erreurs.modele}>
        <input name="modele" className={CHAMP} maxLength={120} />
      </Champ>
      <Champ
        libelle="Catégorie"
        aide="Où l'objet se range dans l'inventaire : Cuisine, Salle de bain…"
        erreur={erreurs.categorie}
      >
        <input name="categorie" className={CHAMP} maxLength={120} />
      </Champ>
      <Champ libelle="Date d'achat" erreur={erreurs.dateAchat}>
        <input
          name="dateAchat"
          type="date"
          className={CHAMP}
          defaultValue={aujourdhui}
          max={aujourdhui}
          required
        />
      </Champ>
      <Champ
        libelle="Durée de garantie"
        aide="2 ans : la garantie légale d'un produit neuf."
        erreur={erreurs.dureeNombre ?? erreurs.dureeUnite}
      >
        <span className="flex gap-2.5">
          <input
            name="dureeNombre"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            defaultValue={2}
            className={`${CHAMP} w-24 flex-none`}
            required
            aria-label="Durée"
          />
          <select
            name="dureeUnite"
            defaultValue="year"
            className={LISTE}
            aria-label="Unité"
          >
            <option value="year">ans</option>
            <option value="month">mois</option>
          </select>
        </span>
      </Champ>
      <Champ
        libelle="Facture"
        aide="Une photo ou un PDF, 4 Mo au plus. La photo est réduite et nettoyée de sa position GPS avant l'envoi."
      >
        <input
          ref={facture}
          name="facture-locale"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="text-[14px] text-ink"
        />
      </Champ>

      <button
        type="submit"
        className={BOUTON}
        disabled={enCours || envoi === "en cours"}
      >
        {envoi === "en cours"
          ? "Envoi de la facture…"
          : "Enregistrer la garantie"}
      </button>
    </form>
  );
}
