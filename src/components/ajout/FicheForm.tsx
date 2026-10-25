"use client";

/** Ajouter une fiche vierge. ⚠️ Provisoire : pas encore dessiné. */
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";
import { NATURE_LABELS, NATURES } from "@/lib/data/views";
import { ajouterFiche } from "../../../app/_actions/ajout";
import { BOUTON, CHAMP, Champ, LISTE } from "../forms/Champ";
import { ChampsPlante } from "../forms/ChampsPlante";
import { ChoixCategorie } from "../forms/ChoixCategorie";

export function FicheForm({
  categories,
  emplacements,
}: Readonly<{
  categories: readonly string[];
  emplacements: readonly string[];
}>) {
  const [etat, agir, enCours] = useActionState(ajouterFiche, ETAT_AJOUT);
  const [nature, setNature] = useState<string>("equipement");
  const router = useRouter();
  const erreurs = etat.etape === "saisie" ? (etat.erreurs ?? {}) : {};

  useEffect(() => {
    if (etat.etape === "creee") {
      router.push(`/fiches/${etat.ficheId}`);
    }
  }, [etat, router]);

  return (
    <form action={agir} className="flex flex-col gap-4">
      <Champ libelle="Nature" erreur={erreurs.nature}>
        <select
          name="nature"
          value={nature}
          onChange={event => setNature(event.target.value)}
          className={LISTE}
        >
          {NATURES.map(nature => (
            <option key={nature} value={nature}>
              {NATURE_LABELS[nature]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Nom" erreur={erreurs.titre}>
        <input name="titre" className={CHAMP} required maxLength={120} />
      </Champ>
      <ChoixCategorie categories={categories} erreur={erreurs.categorie} />
      {nature === "plante" && (
        <ChampsPlante emplacements={emplacements} erreurs={erreurs} />
      )}
      <button type="submit" className={BOUTON} disabled={enCours}>
        Créer la fiche
      </button>
    </form>
  );
}
