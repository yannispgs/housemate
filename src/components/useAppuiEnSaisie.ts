"use client";

/**
 * Pendant la frappe, l'en-tête et la barre d'onglets s'effacent
 * (`.masque-en-saisie`, voir `globals.css`). Un tap sur un bouton fait perdre
 * le focus au champ dès l'appui : si l'en-tête revenait aussitôt, la page
 * descendrait sous le doigt (Safari ne compense pas le défilement), et le
 * relâchement tomberait à côté du bouton.
 *
 * Un appui qui commence pendant la frappe les garde donc effacées jusqu'au
 * relâchement, via `data-appui-en-saisie` sur la racine.
 */
import { useEffect } from "react";
import { ouvreLeClavier } from "@/lib/ui/clavier";

export function useAppuiEnSaisie() {
  useEffect(() => {
    const racine = document.documentElement;

    const appui = () => {
      const champ = document.activeElement;

      if (champ instanceof HTMLElement && ouvreLeClavier(champ)) {
        racine.dataset.appuiEnSaisie = "";
      }
    };

    // Après le clic, qui suit le relâchement dans la même tâche.
    const relachement = () => {
      window.setTimeout(() => delete racine.dataset.appuiEnSaisie);
    };

    document.addEventListener("pointerdown", appui, true);
    document.addEventListener("pointerup", relachement, true);
    document.addEventListener("pointercancel", relachement, true);

    return () => {
      document.removeEventListener("pointerdown", appui, true);
      document.removeEventListener("pointerup", relachement, true);
      document.removeEventListener("pointercancel", relachement, true);
      delete racine.dataset.appuiEnSaisie;
    };
  }, []);
}
