"use client";

/** Ajouter une fiche vierge. ⚠️ Provisoire : pas encore dessiné. */
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";
import { NATURE_LABELS, NATURES } from "@/lib/data/views";
import { ajouterFiche } from "../../../app/_actions/ajout";
import { BOUTON, CHAMP, Champ, LISTE } from "../forms/Champ";
import { ChoixCategorie } from "../forms/ChoixCategorie";
import { useEnvoi } from "../forms/envoi";

export function FicheForm({
  categories,
}: Readonly<{ categories: readonly string[] }>) {
  const [etat, agir, enCours] = useActionState(ajouterFiche, ETAT_AJOUT);
  const envoyer = useEnvoi(agir);
  const router = useRouter();
  const erreurs = etat.etape === "saisie" ? (etat.erreurs ?? {}) : {};

  useEffect(() => {
    if (etat.etape === "creee") {
      router.push(`/fiches/${etat.ficheId}`);
    }
  }, [etat, router]);

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-4">
      <Champ libelle="Nature" erreur={erreurs.nature}>
        <select name="nature" defaultValue="equipement" className={LISTE}>
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
      <button type="submit" className={BOUTON} disabled={enCours}>
        Créer la fiche
      </button>
    </form>
  );
}
