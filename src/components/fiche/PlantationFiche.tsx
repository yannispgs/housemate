"use client";

/**
 * En pot ou en terre, et l'emplacement d'une plante, sur sa fiche (SPEC
 * § 12.4) : lus d'un coup d'œil, modifiables avec le même crayon que le titre.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SituationPlante } from "@/lib/data/plantes";
import { situer } from "../../../app/_actions/fiche";
import { BOUTON, BOUTON_SECONDAIRE } from "../forms/Champ";
import { ChampsPlante } from "../forms/ChampsPlante";
import { PencilIcon } from "../icons";
import { Panel, SectionLabel } from "../Screen";

export function PlantationFiche({
  ficheId,
  situation,
  emplacements,
}: Readonly<{
  ficheId: string;
  situation: SituationPlante;
  emplacements: readonly string[];
}>) {
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <Panel className="gap-3 p-[18px]">
      <span className="flex items-center justify-between">
        <SectionLabel>Plantation</SectionLabel>
        {!edition && (
          <button
            type="button"
            aria-label="Modifier la plantation"
            onClick={() => setEdition(true)}
            className="-my-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted hover:bg-grid hover:text-ink"
          >
            <PencilIcon size={17} />
          </button>
        )}
      </span>

      {edition ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            const champs = new FormData(event.currentTarget);
            demarrer(async () => {
              const probleme = await situer(
                ficheId,
                String(champs.get("potOuTerre") ?? ""),
                String(champs.get("emplacement") ?? ""),
              );

              if (probleme === null) {
                setEdition(false);
                setErreur(null);
                router.refresh();
              } else {
                setErreur(probleme);
              }
            });
          }}
        >
          <ChampsPlante emplacements={emplacements} situation={situation} />
          {erreur && (
            <span className="text-[13px] text-ink-critical">{erreur}</span>
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className={BOUTON_SECONDAIRE}
              onClick={() => {
                setEdition(false);
                setErreur(null);
              }}
            >
              Annuler
            </button>
            <button type="submit" className={BOUTON} disabled={enCours}>
              Enregistrer
            </button>
          </span>
        </form>
      ) : (
        <dl className="m-0 flex flex-col gap-2.5">
          {(
            [
              ["Pot ou terre", situation.pot],
              ["Emplacement", situation.emplacement],
            ] as const
          ).map(([libelle, valeur]) => (
            <div key={libelle} className="flex flex-col gap-0.5">
              <dt className="text-[12.5px] text-ink-secondary">{libelle}</dt>
              <dd
                className={`m-0 text-[15px] ${valeur === null ? "text-ink-muted" : "text-ink"}`}
              >
                {valeur ?? "Non renseigné"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}
