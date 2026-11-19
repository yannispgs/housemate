"use client";

/**
 * La section « Carnet d'entretien » d'une fiche (SPEC § 5.3, décisions du
 * 23/10 et du 04/11/2026) : une ligne par consommable, avec son dernier et
 * son prochain remplacement (date, et kilométrage s'il compte) ; un tap
 * ouvre sa carte d'échéance dans une modale. En dessous, l'historique, du
 * plus récent au plus ancien, replié.
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useEffect, useState } from "react";
import {
  ancreCarnet,
  type EntreeCarnet,
  enteteEntree,
} from "@/lib/data/carnet";
import type { LigneConsommable } from "@/lib/data/views";
import {
  type ActionsFiche,
  type JourFiche,
  LigneOuvrante,
  useModaleEcheance,
} from "./fiche/ModaleEcheance";
import { Panel, SectionLabel } from "./Screen";

function Consommable({ ligne }: Readonly<{ ligne: LigneConsommable }>) {
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-ink">{ligne.intitule}</span>
        {ligne.donneeManquante ? (
          <span className="flex-none text-[12.5px] text-ink-warning">
            donnée manquante
          </span>
        ) : (
          ligne.quand && (
            <span className="flex-none text-[12.5px] text-ink-secondary">
              {ligne.quand}
            </span>
          )
        )}
      </span>
      <span className="text-[12.5px] text-ink-secondary">
        Dernier : {ligne.dernier ?? "jamais noté"}
      </span>
      {ligne.prochain && (
        <span className="text-[12.5px] text-ink-secondary">
          Prochain : {ligne.prochain}
        </span>
      )}
    </>
  );
}

function Historique({
  entrees,
}: Readonly<{ entrees: readonly EntreeCarnet[] }>) {
  const [ouvert, setOuvert] = useState(false);

  // Un repère du graphique mène à une date du carnet (#carnet-AAAA-MM-JJ) :
  // ouvrir l'historique, puis y aller.
  useEffect(() => {
    const suivre = () => {
      const ancre = globalThis.location.hash.slice(1);

      if (ancre.startsWith("carnet-")) {
        setOuvert(true);
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
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
        className="min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] text-ink underline"
      >
        {ouvert ? "Masquer l'historique" : `Historique (${entrees.length})`}
      </button>
      {ouvert && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {entrees.map((entree, index) => (
            <li
              key={`${entree.genre} ${entree.le} ${entree.libelle}`}
              id={
                entrees[index - 1]?.le === entree.le
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
    </div>
  );
}

export function CarnetEntretien({
  consommables,
  entrees,
  actions,
  jour,
}: Readonly<{
  consommables: readonly LigneConsommable[];
  entrees: readonly EntreeCarnet[];
  actions: ActionsFiche;
  jour: JourFiche;
}>) {
  const { ouvrir, rendu } = useModaleEcheance(actions, jour);

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel count={consommables.length}>
        Carnet d'entretien
      </SectionLabel>
      {consommables.length === 0 && entrees.length === 0 && (
        <span className="text-[13.5px] text-ink-secondary">
          Rien de noté pour l'instant.
        </span>
      )}
      {consommables.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-grid p-0">
          {consommables.map(ligne => (
            <li key={ligne.id}>
              <LigneOuvrante onClick={ligne.vue && (() => ouvrir(ligne.vue))}>
                <Consommable ligne={ligne} />
              </LigneOuvrante>
            </li>
          ))}
        </ul>
      )}
      {rendu}
      {entrees.length > 0 && <Historique entrees={entrees} />}
    </Panel>
  );
}
