"use client";

/**
 * Une modale (`<dialog>`) : Échap la referme toujours ; un clic en dehors de
 * son contenu aussi, si `fermerEnDehors` (décision du foyer, 04/11/2026).
 *
 * Le fond de la modale est le `<dialog>` lui-même : un clic qui commence et
 * finit dessus, hors du contenu, la referme. Un geste commencé dans le
 * contenu (sélection de texte glissée dehors) ne compte pas. Le clavier a
 * déjà Échap : l'écoute passe par le navigateur, pas par un `onClick`.
 */
import { type ReactNode, useEffect, useRef } from "react";

export function Modale({
  titre,
  fermerEnDehors,
  onClose,
  className = "",
  children,
}: Readonly<{
  /** Le nom de la modale pour les lecteurs d'écran. */
  titre: string;
  fermerEnDehors: boolean;
  /** Appelé une fois la modale refermée, quelle que soit la façon. */
  onClose: () => void;
  className?: string;
  /** Le contenu ; `fermer` referme la modale. */
  children: (fermer: () => void) => ReactNode;
}>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogue = ref.current;

    if (dialogue === null) {
      return;
    }

    // Rejouée en développement (StrictMode) : ne pas l'ouvrir deux fois.
    if (!dialogue.open) {
      dialogue.showModal();
    }

    let depuisLeFond = false;
    const appui = (event: PointerEvent) => {
      depuisLeFond = event.target === dialogue;
    };
    const clic = (event: MouseEvent) => {
      if (fermerEnDehors && depuisLeFond && event.target === dialogue) {
        dialogue.close();
      }
    };

    dialogue.addEventListener("pointerdown", appui);
    dialogue.addEventListener("click", clic);

    // Pas de `close()` au démontage : il préviendrait `onClose`, et la
    // modale rejouée se refermerait. Retirée de la page, elle disparaît.
    return () => {
      dialogue.removeEventListener("pointerdown", appui);
      dialogue.removeEventListener("click", clic);
    };
  }, [fermerEnDehors]);

  return (
    <dialog
      ref={ref}
      aria-label={titre}
      onClose={onClose}
      className={`m-auto border-0 bg-transparent p-0 backdrop:bg-black/40 ${className}`}
    >
      {children(() => ref.current?.close())}
    </dialog>
  );
}
