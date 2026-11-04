"use client";

/**
 * Son rappel pour l'anniversaire d'une personne (SPEC § 4.1, décision du
 * 27/10/2026) : chacun le sien, que lui seul voit. ⚠️ Provisoire : pas encore
 * dessiné dans Claude Design.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  NIVEAU_LABELS,
  NIVEAUX,
  type Niveau,
  preavisLisible,
  type ReglagesAnniversaires,
} from "@/lib/data/anniversaires";
import { choisirRappel } from "../../../app/_actions/anniversaires";
import { Panel, SectionLabel } from "../Screen";

const OPTIONS: readonly (Niveau | null)[] = [...NIVEAUX, null];

export function AnniversaireFiche({
  ficheId,
  niveau,
  reglages,
  avecDate,
}: Readonly<{
  ficheId: string;
  niveau: Niveau | null;
  reglages: ReglagesAnniversaires;
  /** Sans date de naissance, rien à rappeler. */
  avecDate: boolean;
}>) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const choisir = (choisi: Niveau | null) =>
    demarrer(async () => {
      const probleme = await choisirRappel(ficheId, choisi);
      setErreur(probleme);

      if (probleme === null) {
        router.refresh();
      }
    });

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel>Mon rappel d'anniversaire</SectionLabel>
      <fieldset
        aria-label="Mon rappel d'anniversaire"
        disabled={!avecDate || enCours}
        className="m-0 flex min-w-0 gap-0.5 rounded-full border-0 bg-grid p-[3px] disabled:opacity-60"
      >
        {OPTIONS.map(option => {
          const on = option === niveau;

          return (
            <button
              key={option ?? "aucun"}
              type="button"
              aria-pressed={on}
              onClick={() => choisir(option)}
              className="h-[38px] flex-1 cursor-pointer rounded-full border text-[13.5px] leading-none font-semibold disabled:cursor-default"
              style={{
                background: on ? "var(--surface)" : "transparent",
                borderColor: on ? "var(--brand-border)" : "transparent",
                color: on ? "var(--ink-primary)" : "var(--ink-secondary)",
              }}
            >
              {option === null ? "Pas de rappel" : NIVEAU_LABELS[option]}
            </button>
          );
        })}
      </fieldset>
      <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
        {avecDate
          ? `Cadeau : ${preavisLisible(reglages.cadeau.preavisJours)} ; sans cadeau : ${preavisLisible(reglages.simple.preavisJours)}. Ce rappel n'est visible que de toi ; ses délais se règlent dans les réglages.`
          : "Renseigne la date de naissance pour choisir un rappel."}
      </span>
      {erreur && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreur}
        </span>
      )}
    </Panel>
  );
}
