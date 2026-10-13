"use client";

/** Joindre un fichier à une fiche existante. ⚠️ Provisoire. */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BOUTON_SECONDAIRE, CHAMP, Champ } from "../forms/Champ";
import { envoyerPieceJointe } from "../forms/fichier";

export function AjouterPiece({ ficheId }: Readonly<{ ficheId: string }>) {
  const fichier = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [nom, setNom] = useState("Facture");
  const [etat, setEtat] = useState<"repos" | "envoi" | string>("repos");

  const envoyer = async () => {
    const choisi = fichier.current?.files?.[0];

    if (choisi === undefined) {
      setEtat("Choisis d'abord une photo ou un PDF.");
      return;
    }

    setEtat("envoi");
    const erreur = await envoyerPieceJointe(ficheId, choisi, nom).catch(
      () => "L'envoi a échoué.",
    );

    if (erreur === null) {
      setEtat("repos");
      if (fichier.current) {
        fichier.current.value = "";
      }
      router.refresh();
    } else {
      setEtat(erreur);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Champ libelle="Nom">
        <input
          value={nom}
          onChange={event => setNom(event.target.value)}
          className={CHAMP}
          maxLength={120}
        />
      </Champ>
      <Champ
        libelle="Fichier"
        aide="Une photo ou un PDF, 4 Mo au plus. La photo est réduite et nettoyée de sa position GPS avant l'envoi."
        erreur={etat !== "repos" && etat !== "envoi" ? etat : undefined}
      >
        <input
          ref={fichier}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="text-[14px] text-ink"
        />
      </Champ>
      <button
        type="button"
        onClick={envoyer}
        className={BOUTON_SECONDAIRE}
        disabled={etat === "envoi"}
      >
        {etat === "envoi" ? "Envoi…" : "Joindre"}
      </button>
    </div>
  );
}
