"use client";

/**
 * Le titre d'une fiche, renommable sur place (SPEC § 4.2, décision du
 * 25/10/2026) : le crayon ouvre le champ, Entrée ou ✓ enregistre, Échap
 * annule. ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { renommer } from "../../../app/_actions/fiche";
import { CHAMP } from "../forms/Champ";
import { CheckIcon, PencilIcon } from "../icons";

const ICONE =
  "inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted hover:bg-grid hover:text-ink disabled:opacity-60";

export function TitreFiche({
  ficheId,
  titre,
}: Readonly<{ ficheId: string; titre: string }>) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(titre);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);

  // Le champ s'ouvre sur le crayon : on y place le curseur.
  useEffect(() => {
    if (edition) {
      champ.current?.focus();
    }
  }, [edition]);

  const fermer = () => {
    setEdition(false);
    setErreur(null);
  };

  if (!edition) {
    return (
      <span className="inline-flex items-center gap-1">
        {titre}
        <button
          type="button"
          aria-label="Renommer"
          className={ICONE}
          onClick={() => {
            setBrouillon(titre);
            setEdition(true);
          }}
        >
          <PencilIcon size={18} />
        </button>
      </span>
    );
  }

  // Pas de <form> : le titre est dans un <h1>, qui n'en accepte pas.
  const enregistrer = () =>
    demarrer(async () => {
      const probleme = await renommer(ficheId, brouillon);

      if (probleme === null) {
        fermer();
        router.refresh();
      } else {
        setErreur(probleme);
      }
    });

  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1">
        <input
          ref={champ}
          aria-label="Nom de la fiche"
          value={brouillon}
          maxLength={120}
          onChange={event => setBrouillon(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape") {
              fermer();
            } else if (event.key === "Enter") {
              event.preventDefault();
              enregistrer();
            }
          }}
          className={`${CHAMP} font-display text-[20px]`}
        />
        <button
          type="button"
          onClick={enregistrer}
          aria-label="Enregistrer le nom"
          className={ICONE}
          disabled={enCours}
        >
          <CheckIcon size={20} />
        </button>
      </span>
      {erreur && (
        <span className="text-[13px] font-normal text-ink-critical">
          {erreur}
        </span>
      )}
    </span>
  );
}
