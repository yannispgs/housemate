"use client";

/**
 * « Fait » sur un consommable (SPEC § 5.3) : avant d'enregistrer, la date du
 * remplacement (aujourd'hui, modifiable) et, au compteur, le kilométrage —
 * facultatif, laissé vide, l'estimation n'étant qu'une indication. Pas
 * d'« Annuler » après coup : cette étape évite l'erreur de doigt.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useState } from "react";
import type { RemplacementView } from "@/lib/ui/deadline";
import { BOUTON, BOUTON_SECONDAIRE, CHAMP, Champ } from "./forms/Champ";

const KM = new Intl.NumberFormat("fr-FR");

export function ConfirmerRemplacement({
  remplacement,
  aujourdhui,
  onConfirm,
  onClose,
}: Readonly<{
  remplacement: RemplacementView;
  /** AAAA-MM-JJ. */
  aujourdhui: string;
  onConfirm: (le: string, compteur: string) => Promise<string | null>;
  onClose: () => void;
}>) {
  const [le, setLe] = useState(aujourdhui);
  const [compteur, setCompteur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const confirmer = () => {
    setEnvoi(true);
    setErreur(null);
    onConfirm(le, compteur)
      .then(message => setErreur(message))
      .catch(() => setErreur("L'enregistrement a échoué. Réessaie."))
      .finally(() => setEnvoi(false));
  };

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border p-3.5">
      <Champ libelle="Remplacé le">
        <input
          type="date"
          value={le}
          max={aujourdhui}
          onChange={event => setLe(event.target.value)}
          className={CHAMP}
          required
        />
      </Champ>
      {remplacement.auCompteur && (
        <Champ
          libelle="Kilométrage (facultatif)"
          aide="Sans lui, la fiche signalera qu'il manque."
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={compteur}
            onChange={event => setCompteur(event.target.value)}
            placeholder={
              remplacement.estimation === null
                ? "km au compteur"
                : `environ ${KM.format(remplacement.estimation)} km`
            }
            className={CHAMP}
          />
        </Champ>
      )}
      {erreur && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreur}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className={BOUTON_SECONDAIRE}
          disabled={envoi}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={confirmer}
          className={BOUTON}
          disabled={envoi || le === ""}
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}
