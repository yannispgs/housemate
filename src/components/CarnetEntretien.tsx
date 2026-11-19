"use client";

/**
 * La section « Carnet d'entretien » d'une fiche (SPEC § 5.3, décisions du
 * 23/10 et du 04/11/2026) : une ligne par consommable, avec son dernier et
 * son prochain remplacement (date, et kilométrage s'il compte) ; un tap
 * ouvre sa carte d'échéance dans une modale. En dessous, « Noter une
 * intervention », puis l'historique par intervention, du plus récent au plus
 * ancien, replié ; en tête, les dépenses de l'année et de la précédente.
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useState } from "react";
import {
  depensesDuCarnet,
  type EntreeCarnet,
  enteteEntree,
  euros,
  type InterventionCarnet,
  interventionsDuCarnet,
} from "@/lib/data/carnet";
import type { LigneConsommable } from "@/lib/data/views";
import {
  type ActionsFiche,
  type JourFiche,
  LigneOuvrante,
  useModaleEcheance,
} from "./fiche/ModaleEcheance";
import {
  NoterIntervention,
  type OptionsIntervention,
} from "./NoterIntervention";
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
  interventions,
}: Readonly<{ interventions: readonly InterventionCarnet[] }>) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
        className="min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] text-ink underline"
      >
        {ouvert
          ? "Masquer l'historique"
          : `Historique (${interventions.length})`}
      </button>
      {ouvert && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {interventions.map(intervention => (
            <li key={intervention.cle} className="flex flex-col gap-0.5">
              <span className="text-[12.5px] text-ink-secondary">
                {enteteEntree(intervention)}
              </span>
              {intervention.lignes.map(ligne => (
                <span
                  key={`${ligne.genre} ${ligne.libelle}`}
                  className="text-[15px] text-ink"
                >
                  {ligne.libelle}
                </span>
              ))}
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
  intervention,
}: Readonly<{
  consommables: readonly LigneConsommable[];
  entrees: readonly EntreeCarnet[];
  actions: ActionsFiche;
  jour: JourFiche;
  intervention: OptionsIntervention;
}>) {
  const { ouvrir, rendu } = useModaleEcheance(actions, jour);
  const interventions = interventionsDuCarnet(entrees);
  const depenses = depensesDuCarnet(
    interventions,
    Number(jour.iso.slice(0, 4)),
  );

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel count={consommables.length}>
        Carnet d'entretien
      </SectionLabel>
      {depenses.length > 0 && (
        <span className="text-[13.5px] text-ink-secondary">
          Dépensé :{" "}
          {depenses.map(d => `${euros(d.total)} en ${d.annee}`).join(", ")}
        </span>
      )}
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
      <NoterIntervention options={intervention} aujourdhui={jour.iso} />
      {interventions.length > 0 && <Historique interventions={interventions} />}
    </Panel>
  );
}
