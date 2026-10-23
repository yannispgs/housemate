"use client";

/**
 * La section « Carnet d'entretien » d'une fiche (SPEC § 5.3, décisions du
 * 23/10/2026) : ce qui a été fait, du plus récent au plus ancien ; les
 * dernières entrées, puis « Tout voir ».
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useState } from "react";
import {
  ENTREES_VISIBLES,
  type EntreeCarnet,
  enteteEntree,
} from "@/lib/data/carnet";
import { Panel, SectionLabel } from "./Screen";

export function CarnetEntretien({
  entrees,
}: Readonly<{ entrees: readonly EntreeCarnet[] }>) {
  const [tout, setTout] = useState(false);
  const montrees = tout ? entrees : entrees.slice(0, ENTREES_VISIBLES);

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel count={entrees.length}>Carnet d'entretien</SectionLabel>
      {entrees.length === 0 ? (
        <span className="text-[13.5px] text-ink-secondary">
          Rien de noté pour l'instant.
        </span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {montrees.map(entree => (
            <li
              key={`${entree.genre} ${entree.le} ${entree.libelle}`}
              className="flex flex-col gap-0.5"
            >
              <span className="text-[12.5px] text-ink-secondary">
                {enteteEntree(entree)}
              </span>
              <span className="text-[15px] text-ink">{entree.libelle}</span>
            </li>
          ))}
        </ol>
      )}
      {entrees.length > ENTREES_VISIBLES && (
        <button
          type="button"
          onClick={() => setTout(!tout)}
          className="min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] text-ink underline"
        >
          {tout ? "Voir moins" : `Tout voir (${entrees.length})`}
        </button>
      )}
    </Panel>
  );
}
