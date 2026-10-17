"use client";

/**
 * Choisir la catégorie — un thème (SPEC § 5.4) — dans la liste du foyer, ou
 * en créer une nouvelle : la liste s'enrichit à l'usage. ⚠️ Provisoire : pas
 * encore dessiné dans Claude Design.
 */
import { useState } from "react";
import { CHAMP, Champ, LISTE } from "./Champ";

const NOUVELLE = "__nouvelle__";

export function ChoixCategorie({
  categories,
  erreur,
}: Readonly<{ categories: readonly string[]; erreur?: string }>) {
  const [choix, setChoix] = useState("");
  const nouvelle = choix === NOUVELLE;

  return (
    <Champ
      libelle="Catégorie"
      aide="Un thème : Cuisine, Bricolage, Santé… pas une pièce."
      erreur={erreur}
    >
      <select
        // Le champ texte porte la valeur quand on crée une catégorie.
        name={nouvelle ? undefined : "categorie"}
        value={choix}
        onChange={event => setChoix(event.target.value)}
        className={LISTE}
      >
        <option value="">Aucune</option>
        {categories.map(categorie => (
          <option key={categorie} value={categorie}>
            {categorie}
          </option>
        ))}
        <option value={NOUVELLE}>Nouvelle catégorie…</option>
      </select>
      {nouvelle && (
        <input
          name="categorie"
          className={CHAMP}
          maxLength={120}
          placeholder="Nom de la catégorie"
          aria-label="Nouvelle catégorie"
          // biome-ignore lint/a11y/noAutofocus: le champ n'apparaît que sur demande, juste après le choix.
          autoFocus
          required
        />
      )}
    </Champ>
  );
}
