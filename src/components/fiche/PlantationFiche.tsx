"use client";

/**
 * En pot ou en terre, l'emplacement et les seuils de gel d'une plante, sur sa
 * fiche (SPEC § 12.2, § 12.4) : lus d'un coup d'œil, modifiables avec le même
 * crayon que le titre. Sans seuil de dégâts, la veille gel ne la suit pas.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { celsius } from "@/lib/data/fiche-vue";
import type { Plantation } from "@/lib/data/plantes";
import { situer } from "../../../app/_actions/fiche";
import { BOUTON, BOUTON_SECONDAIRE } from "../forms/Champ";
import { ChampsPlante } from "../forms/ChampsPlante";
import { PencilIcon } from "../icons";
import { Panel, SectionLabel } from "../Screen";

/** Un champ texte du formulaire ; vide s'il manque (ou n'est pas du texte). */
const texte = (valeur: FormDataEntryValue | null) =>
  typeof valeur === "string" ? valeur : "";

const enCelsius = (valeur: number | null) =>
  valeur === null ? null : celsius(valeur);

export function PlantationFiche({
  ficheId,
  plantation,
  emplacements,
}: Readonly<{
  ficheId: string;
  plantation: Plantation;
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
              const probleme = await situer(ficheId, {
                potOuTerre: texte(champs.get("potOuTerre")),
                emplacement: texte(champs.get("emplacement")),
                seuilDegats: texte(champs.get("seuilDegats")),
                seuilMort: texte(champs.get("seuilMort")),
              });

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
          <ChampsPlante emplacements={emplacements} plantation={plantation} />
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
              ["Pot ou terre", plantation.pot],
              ["Emplacement", plantation.emplacement],
              ["Seuil de dégâts", enCelsius(plantation.seuilDegats)],
              ["Seuil de mort", enCelsius(plantation.seuilMort)],
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
