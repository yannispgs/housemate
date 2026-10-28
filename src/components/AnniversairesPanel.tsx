"use client";

/**
 * Ses délais d'anniversaire (SPEC § 4.1, décisions du 28/10/2026) : le
 * préavis et l'importance de « cadeau » et de « sans cadeau », pour soi seul.
 * Les rappels déjà créés suivent, sauf ceux réglés à la main. ⚠️ Provisoire :
 * pas encore dessiné dans Claude Design.
 */
import { useState, useTransition } from "react";
import {
  NIVEAU_LABELS,
  NIVEAUX,
  preavisEnUnite,
  type ReglagesAnniversaires,
  UNITE_LABELS,
  UNITES_PREAVIS,
} from "@/lib/data/anniversaires";
import { IMPORTANCE_LABELS, IMPORTANCES } from "@/lib/ui/deadline";
import { BOUTON, Champ, LISTE, NOMBRE } from "./forms/Champ";
import { Panel } from "./Screen";

const PANEL_LABEL =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";

export function AnniversairesPanel({
  reglages,
  regler,
}: Readonly<{
  reglages: ReglagesAnniversaires;
  /** Server action ; rend les erreurs par champ, ou `null`. */
  regler: (
    saisie: Readonly<Record<string, string>>,
  ) => Promise<Readonly<Record<string, string>> | null>;
}>) {
  const [erreurs, setErreurs] = useState<Readonly<Record<string, string>>>({});
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, demarrer] = useTransition();

  return (
    <Panel className="gap-3 p-[18px]">
      <span className={PANEL_LABEL}>Anniversaires</span>
      <form
        className="flex flex-col gap-4"
        onChange={() => setEnregistre(false)}
        onSubmit={event => {
          event.preventDefault();
          const champs = Object.fromEntries(
            [...new FormData(event.currentTarget).entries()].filter(
              (e): e is [string, string] => typeof e[1] === "string",
            ),
          );
          demarrer(async () => {
            const probleme = await regler(champs);
            setErreurs(probleme ?? {});
            setEnregistre(probleme === null);
          });
        }}
      >
        {NIVEAUX.map(niveau => {
          const { nombre, unite } = preavisEnUnite(
            reglages[niveau].preavisJours,
          );
          const libelle = NIVEAU_LABELS[niveau];

          return (
            <Champ
              key={niveau}
              libelle={libelle}
              erreur={
                erreurs[`${niveau}Nombre`] ??
                erreurs[`${niveau}Unite`] ??
                erreurs[`${niveau}Importance`]
              }
            >
              <span className="flex items-center gap-2.5">
                <input
                  name={`${niveau}Nombre`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={366}
                  defaultValue={nombre}
                  className={NOMBRE}
                  aria-label={`${libelle} : préavis`}
                />
                <select
                  name={`${niveau}Unite`}
                  defaultValue={unite}
                  className={`${LISTE} flex-1`}
                  aria-label={`${libelle} : unité du préavis`}
                >
                  {UNITES_PREAVIS.map(u => (
                    <option key={u} value={u}>
                      {UNITE_LABELS[u]}
                    </option>
                  ))}
                </select>
                <span className="flex-none text-[15px] text-ink-secondary">
                  avant
                </span>
              </span>
              <select
                name={`${niveau}Importance`}
                defaultValue={reglages[niveau].importance}
                className={LISTE}
                aria-label={`${libelle} : importance`}
              >
                {IMPORTANCES.map(i => (
                  <option key={i} value={i}>
                    {IMPORTANCE_LABELS[i]}
                  </option>
                ))}
              </select>
            </Champ>
          );
        })}
        <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
          Pour toi seulement. Tes rappels déjà choisis suivent, sauf ceux que tu
          as réglés à la main.
        </span>
        <span className="flex items-center gap-3">
          <button type="submit" className={BOUTON} disabled={enCours}>
            Enregistrer
          </button>
          {enregistre && (
            <span role="status" className="text-[13px] text-ink-secondary">
              Enregistré.
            </span>
          )}
        </span>
      </form>
    </Panel>
  );
}
