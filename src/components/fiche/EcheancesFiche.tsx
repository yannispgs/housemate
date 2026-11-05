"use client";

/**
 * La section « Échéances » d'une fiche : ses échéances liées, de la plus
 * proche à la plus lointaine ; un tap ouvre la carte de l'une d'elles dans
 * une modale (décision du foyer, 04/11/2026).
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import type { EcheanceDeFiche } from "@/lib/data/views";
import { Panel, SectionLabel } from "../Screen";
import {
  type ActionsFiche,
  type JourFiche,
  LigneOuvrante,
  useModaleEcheance,
} from "./ModaleEcheance";

export function EcheancesFiche({
  echeances,
  actions,
  jour,
}: Readonly<{
  echeances: readonly EcheanceDeFiche[];
  actions: ActionsFiche;
  jour: JourFiche;
}>) {
  const { ouvrir, rendu } = useModaleEcheance(actions, jour);

  return (
    <Panel className="gap-1 p-[18px]">
      <SectionLabel count={echeances.length}>Échéances</SectionLabel>
      <ul className="m-0 flex list-none flex-col divide-y divide-grid p-0">
        {echeances.map(({ id, titre, quand, vue }) => (
          <li key={id}>
            <LigneOuvrante onClick={vue && (() => ouvrir(vue))}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] text-ink">{titre}</span>
                {quand && (
                  <span className="flex-none text-[12.5px] text-ink-secondary">
                    {quand}
                  </span>
                )}
              </span>
            </LigneOuvrante>
          </li>
        ))}
      </ul>
      {rendu}
    </Panel>
  );
}
