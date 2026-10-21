"use client";

/**
 * Garde en vue le champ où l'on écrit quand le clavier virtuel s'ouvre
 * (`@/lib/ui/clavier`). La zone visible est le « visual viewport » : sur
 * iPhone, la page garde sa hauteur sous le clavier ; seule cette zone rétrécit.
 *
 * Publie aussi la hauteur cachée, marge comprise, dans `--clavier` : les
 * conteneurs qui défilent s'en servent comme marge basse, pour que même le
 * dernier champ puisse remonter au-dessus du clavier.
 */
import { useEffect } from "react";
import {
  decalage,
  hauteurCachee,
  MARGE,
  ouvreLeClavier,
} from "@/lib/ui/clavier";

/** Le premier ancêtre qui défile : c'est lui qu'on décale. */
function conteneurDefilant(element: Element): HTMLElement | null {
  for (let p = element.parentElement; p !== null; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);

    if (overflowY === "auto" || overflowY === "scroll") {
      return p;
    }
  }

  return null;
}

/** Le temps que le clavier s'ouvre et que l'en-tête s'efface. */
const ATTENTE_MS = 120;

export function useChampVisible() {
  useEffect(() => {
    const zone = window.visualViewport;

    if (zone === null) {
      return;
    }

    const racine = document.documentElement;
    let minuterie = 0;

    const ajuster = () => {
      const champ = document.activeElement;
      const actif = champ instanceof HTMLElement && ouvreLeClavier(champ);
      racine.style.setProperty(
        "--clavier",
        `${actif ? hauteurCachee(racine.clientHeight, zone) + MARGE : 0}px`,
      );

      if (!actif) {
        return;
      }

      // Le champ, et la liste de suggestions qu'il ouvre le cas échéant.
      const rect = champ.getBoundingClientRect();
      const liste = champ.getAttribute("aria-controls");
      const suggestions =
        liste === null ? null : document.getElementById(liste);
      const bas = Math.max(
        rect.bottom,
        suggestions?.getBoundingClientRect().bottom ?? rect.bottom,
      );
      const pas = decalage(
        { haut: rect.top, bas },
        { haut: zone.offsetTop, bas: zone.offsetTop + zone.height },
      );

      if (pas !== 0) {
        conteneurDefilant(champ)?.scrollBy({ top: pas, behavior: "smooth" });
      }
    };

    const bientot = () => {
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(ajuster, ATTENTE_MS);
    };

    document.addEventListener("focusin", bientot);
    document.addEventListener("focusout", bientot);
    document.addEventListener("input", bientot);
    zone.addEventListener("resize", bientot);

    return () => {
      window.clearTimeout(minuterie);
      document.removeEventListener("focusin", bientot);
      document.removeEventListener("focusout", bientot);
      document.removeEventListener("input", bientot);
      zone.removeEventListener("resize", bientot);
    };
  }, []);
}
