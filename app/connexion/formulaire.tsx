"use client";

import { useActionState } from "react";
import { ETAT_INITIAL } from "@/lib/auth/connexion";
import { connexion } from "./actions";

const CHAMP =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-ink";
const BOUTON =
  "min-h-11 w-full rounded-md bg-brand px-4 text-base font-semibold text-brand-ink disabled:opacity-60";

/** Les deux étapes de la connexion : l'adresse, puis le code reçu. */
export function FormulaireConnexion() {
  const [etat, agir, enCours] = useActionState(connexion, ETAT_INITIAL);
  const erreur = etat.etape === "connecte" ? undefined : etat.erreur;

  return (
    <form action={agir} className="flex flex-col gap-4">
      {etat.etape === "code" ? (
        <>
          <input type="hidden" name="etape" value="code" />
          <input type="hidden" name="email" value={etat.email} />
          <p className="text-sm text-ink-secondary">
            Si <strong className="text-ink">{etat.email}</strong> a accès à
            HouseMate, un code à six chiffres vient d'y être envoyé.
          </p>
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span>Code reçu</span>
            <input
              name="code"
              className={`${CHAMP} tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span>Adresse e-mail</span>
          <input
            name="email"
            type="email"
            className={CHAMP}
            autoComplete="email"
            required
          />
        </label>
      )}

      {erreur === undefined ? null : (
        <p role="alert" className="text-sm text-ink-critical">
          {erreur}
        </p>
      )}

      <button type="submit" className={BOUTON} disabled={enCours}>
        {etat.etape === "code" ? "Se connecter" : "Recevoir un code"}
      </button>

      {etat.etape === "code" ? (
        <a
          href="/connexion"
          className="text-center text-sm text-ink-secondary underline"
        >
          Changer d'adresse ou redemander un code
        </a>
      ) : null}
    </form>
  );
}
