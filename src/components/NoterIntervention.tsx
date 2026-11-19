"use client";

/**
 * « Noter une intervention » depuis le carnet d'entretien (SPEC § 5.3,
 * décisions du 23/10/2026) : la date, le kilométrage si la fiche a un
 * compteur, ce qui a été fait — les consommables du plan et les échéances
 * liées à cocher, et des lignes libres pour ce qui est hors plan —, puis le
 * coût de l'ensemble. Tout s'enregistre d'un coup.
 *
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design (a-dessiner.md).
 */
import { useState } from "react";
import type { ChampsIntervention } from "@/lib/data/saisie";
import { BOUTON, BOUTON_SECONDAIRE, CHAMP, Champ } from "./forms/Champ";
import { Modale } from "./Modale";

/** Ce que la fiche propose de cocher. */
export interface OptionsIntervention {
  readonly ficheId: string;
  /** La fiche a un compteur : le kilométrage est demandé. */
  readonly auCompteur: boolean;
  readonly consommables: readonly { id: string; intitule: string }[];
  /** Les échéances liées qui ont une occurrence à cocher. */
  readonly echeances: readonly { id: string; titre: string }[];
  readonly noter: (champs: ChampsIntervention) => Promise<string | null>;
}

function Case({
  libelle,
  detail,
  coche,
  basculer,
}: Readonly<{
  libelle: string;
  detail?: string;
  coche: boolean;
  basculer: () => void;
}>) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={coche}
        onChange={basculer}
        className="size-5 flex-none accent-[var(--brand-strong)]"
      />
      <span className="text-[15px] text-ink">
        {libelle}
        {detail && (
          <span className="ml-1.5 text-[12.5px] text-ink-secondary">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}

function basculerDans(liste: readonly string[], id: string): readonly string[] {
  return liste.includes(id) ? liste.filter(x => x !== id) : [...liste, id];
}

function Formulaire({
  options,
  aujourdhui,
  fermer,
}: Readonly<{
  options: OptionsIntervention;
  aujourdhui: string;
  fermer: () => void;
}>) {
  const [le, setLe] = useState(aujourdhui);
  const [compteur, setCompteur] = useState("");
  const [cout, setCout] = useState("");
  const [consommables, setConsommables] = useState<readonly string[]>([]);
  const [echeances, setEcheances] = useState<readonly string[]>([]);
  const [libres, setLibres] = useState<readonly string[]>([]);
  const [libre, setLibre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const ajouterLibre = () => {
    const ligne = libre.trim();

    // Deux fois la même ligne ne dit rien de plus.
    if (ligne !== "" && !libres.includes(ligne)) {
      setLibres([...libres, ligne]);
      setLibre("");
    }
  };

  const enregistrer = () => {
    setEnvoi(true);
    setErreur(null);
    options
      .noter({
        ficheId: options.ficheId,
        le,
        compteur,
        cout,
        consommables,
        echeances,
        // Une ligne tapée sans « Ajouter » compte aussi.
        libres:
          libre.trim() === "" || libres.includes(libre.trim())
            ? libres
            : [...libres, libre.trim()],
      })
      .then(message => {
        if (message === null) {
          fermer();
        } else {
          setErreur(message);
        }
      })
      .catch(() => setErreur("L'enregistrement a échoué. Réessaie."))
      .finally(() => setEnvoi(false));
  };

  return (
    <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-[18px] bg-surface p-[18px]">
      <h2 className="m-0 font-display text-[18px] text-ink">
        Noter une intervention
      </h2>
      <Champ libelle="Faite le">
        <input
          type="date"
          value={le}
          max={aujourdhui}
          onChange={event => setLe(event.target.value)}
          className={CHAMP}
          required
        />
      </Champ>
      {options.auCompteur && (
        <Champ
          libelle="Kilométrage (facultatif)"
          aide="Il devient aussi un relevé du compteur."
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={compteur}
            onChange={event => setCompteur(event.target.value)}
            placeholder="km au compteur"
            className={CHAMP}
          />
        </Champ>
      )}

      <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
        <legend className="mb-1 p-0 text-[12.5px] text-ink-secondary">
          Ce qui a été fait
        </legend>
        {options.consommables.map(c => (
          <Case
            key={c.id}
            libelle={c.intitule}
            coche={consommables.includes(c.id)}
            basculer={() => setConsommables(basculerDans(consommables, c.id))}
          />
        ))}
        {options.echeances.map(e => (
          <Case
            key={e.id}
            libelle={e.titre}
            detail="échéance"
            coche={echeances.includes(e.id)}
            basculer={() => setEcheances(basculerDans(echeances, e.id))}
          />
        ))}
        {libres.map(ligne => (
          <span
            key={ligne}
            className="flex min-h-11 items-center justify-between gap-3"
          >
            <span className="text-[15px] text-ink">{ligne}</span>
            <button
              type="button"
              onClick={() => setLibres(libres.filter(l => l !== ligne))}
              className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-[13.5px] text-ink underline"
            >
              Retirer
            </button>
          </span>
        ))}
        <span className="flex items-end gap-2">
          <Champ libelle="Autre chose (hors plan)">
            <input
              type="text"
              value={libre}
              maxLength={120}
              onChange={event => setLibre(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  ajouterLibre();
                }
              }}
              placeholder="Plaquettes AR"
              className={CHAMP}
            />
          </Champ>
          <button
            type="button"
            onClick={ajouterLibre}
            disabled={libre.trim() === ""}
            className="min-h-11 flex-none cursor-pointer rounded-full border border-border bg-transparent px-4 text-[14px] text-ink disabled:opacity-60"
          >
            Ajouter
          </button>
        </span>
      </fieldset>

      <Champ
        libelle="Coût (facultatif)"
        aide="Pour toute l'intervention, en euros."
      >
        <input
          type="text"
          inputMode="decimal"
          value={cout}
          onChange={event => setCout(event.target.value)}
          placeholder="0,00"
          className={CHAMP}
        />
      </Champ>

      {erreur && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreur}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={fermer}
          className={BOUTON_SECONDAIRE}
          disabled={envoi}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={enregistrer}
          className={BOUTON}
          disabled={envoi || le === ""}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

export function NoterIntervention({
  options,
  aujourdhui,
}: Readonly<{
  options: OptionsIntervention;
  /** AAAA-MM-JJ, à Paris. */
  aujourdhui: string;
}>) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={BOUTON_SECONDAIRE}
      >
        Noter une intervention
      </button>
      {ouvert && (
        <Modale
          titre="Noter une intervention"
          fermerEnDehors={false}
          onClose={() => setOuvert(false)}
          className="w-[min(100%-32px,460px)]"
        >
          {fermer => (
            <Formulaire
              options={options}
              aujourdhui={aujourdhui}
              fermer={fermer}
            />
          )}
        </Modale>
      )}
    </>
  );
}
