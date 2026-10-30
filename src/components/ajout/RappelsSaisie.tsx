"use client";

/**
 * Les rappels d'une échéance, ajoutés à la main (§ 6) : un mois avant pour ne
 * pas l'oublier, puis la veille… Chacun a son délai, son unité et ses canaux.
 * Les champs sont numérotés dans l'ordre affiché (`rappel0Nombre`…) : le
 * formulaire arrive à plat, deux champs du même nom n'en feraient qu'un.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useRef, useState } from "react";
import { RAPPELS_MAX } from "@/lib/data/saisie";
import { BOUTON_SECONDAIRE, LIBELLE, LISTE, NOMBRE } from "../forms/Champ";

const CASE = "size-5 accent-[var(--brand-strong)]";

export function RappelsSaisie({
  erreurs,
}: Readonly<{ erreurs: Readonly<Record<string, string>> }>) {
  // Une clé stable par rappel : en retirer un ne vide pas les suivants.
  const suivant = useRef(0);
  const [cles, setCles] = useState<readonly number[]>([]);

  const ajouter = () => {
    setCles(actuelles => [...actuelles, suivant.current]);
    suivant.current += 1;
  };

  return (
    <fieldset className="flex flex-col gap-2.5 border-0 p-0">
      <legend className={`${LIBELLE} mb-2.5 p-0`}>Rappels (facultatif)</legend>
      <span className="text-[12.5px] leading-normal text-ink-secondary">
        Combien de temps avant la date. Par e-mail, ils figurent dans le résumé
        du jour.
      </span>
      {cles.map((cle, rang) => (
        <div
          key={cle}
          className="flex flex-col gap-1 border-b border-border pb-2.5"
        >
          <span className="flex items-center gap-2.5">
            <input
              name={`rappel${rang}Nombre`}
              type="number"
              inputMode="numeric"
              min={0}
              required
              className={NOMBRE}
              aria-label={`Délai du rappel ${rang + 1}`}
            />
            <select
              name={`rappel${rang}Unite`}
              defaultValue="day"
              className={`${LISTE} flex-1`}
              aria-label={`Unité du rappel ${rang + 1}`}
            >
              <option value="day">jours avant</option>
              <option value="week">semaines avant</option>
              <option value="month">mois avant</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setCles(actuelles => actuelles.filter(c => c !== cle))
              }
              className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[22px] leading-none text-ink-secondary hover:bg-grid"
              aria-label={`Retirer le rappel ${rang + 1}`}
            >
              ×
            </button>
          </span>
          <span className="flex gap-5 text-[15px] text-ink">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name={`rappel${rang}Email`}
                defaultChecked
                className={CASE}
              />
              <span>Par e-mail</span>
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name={`rappel${rang}Push`}
                className={CASE}
              />
              <span>Par notification</span>
            </label>
          </span>
          {erreurs[`rappels.${rang}`] && (
            <span role="alert" className="text-[13px] text-ink-critical">
              {erreurs[`rappels.${rang}`]}
            </span>
          )}
        </div>
      ))}
      {erreurs.rappels && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreurs.rappels}
        </span>
      )}
      {cles.length < RAPPELS_MAX && (
        <button type="button" onClick={ajouter} className={BOUTON_SECONDAIRE}>
          {cles.length === 0 ? "Ajouter un rappel" : "Ajouter un autre rappel"}
        </button>
      )}
    </fieldset>
  );
}
