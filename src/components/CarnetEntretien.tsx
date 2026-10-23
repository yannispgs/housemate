"use client";

/**
 * La section « Carnet d'entretien » d'une fiche (SPEC § 5.3, décisions du
 * 23/10/2026) : ce qui a été fait, du plus récent au plus ancien ; les
 * dernières entrées, puis « Tout voir ».
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useEffect, useState } from "react";
import {
  ancreCarnet,
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

  // Un repère du graphique mène à une date du carnet (#carnet-AAAA-MM-JJ) :
  // tout montrer si elle est au-delà des premières entrées, puis y aller.
  useEffect(() => {
    const suivre = () => {
      const ancre = globalThis.location.hash.slice(1);

      if (ancre.startsWith("carnet-")) {
        setTout(true);
        requestAnimationFrame(() =>
          document.getElementById(ancre)?.scrollIntoView({ block: "center" }),
        );
      }
    };

    suivre();
    globalThis.addEventListener("hashchange", suivre);

    return () => globalThis.removeEventListener("hashchange", suivre);
  }, []);

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel count={entrees.length}>Carnet d'entretien</SectionLabel>
      {entrees.length === 0 ? (
        <span className="text-[13.5px] text-ink-secondary">
          Rien de noté pour l'instant.
        </span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {montrees.map((entree, index) => (
            <li
              key={`${entree.genre} ${entree.le} ${entree.libelle}`}
              id={
                montrees[index - 1]?.le === entree.le
                  ? undefined
                  : ancreCarnet(entree.le)
              }
              className="scroll-mt-4 flex flex-col gap-0.5"
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
