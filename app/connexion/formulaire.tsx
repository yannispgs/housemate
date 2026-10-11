"use client";

import { useActionState } from "react";
import { ETAT_INITIAL } from "@/lib/auth/connexion";
import { connexion } from "./actions";

// Le champ en pilule de la refonte (DeadlineCard), mais en 16 px : en dessous,
// Safari sur iPhone zoome sur le champ dès qu'on le touche.
const CHAMP =
  "h-11 w-full min-w-0 rounded-full border border-border bg-surface px-4 text-base leading-none text-ink outline-none focus:border-brand-border";
// Le bouton secondaire : même pilule, sans fond.
const BOUTON_SECONDAIRE =
  "min-h-11 w-full cursor-pointer rounded-full border border-border bg-transparent px-5 text-[15px] font-semibold text-ink hover:bg-grid disabled:opacity-60";
// Les intertitres de la refonte (Réglages : « APPARENCE »).
const LIBELLE =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";
// Le bouton principal de la refonte (DeadlineCard) : pilule, texte blanc.
const BOUTON =
  "min-h-11 w-full cursor-pointer rounded-full bg-brand-strong px-5 text-[15px] font-semibold text-white hover:brightness-[1.08] active:brightness-[.92] disabled:opacity-60";

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
          <p className="m-0 text-[14.5px] leading-[1.45] text-ink-secondary">
            Si <strong className="text-ink">{etat.email}</strong> a accès à
            HouseMate, un code à six chiffres vient d'y être envoyé.
          </p>
          <label className="flex flex-col gap-2.5">
            <span className={LIBELLE}>Code reçu</span>
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
        <label className="flex flex-col gap-2.5">
          <span className={LIBELLE}>Adresse e-mail</span>
          <input
            name="email"
            type="email"
            className={CHAMP}
            autoComplete="email"
            required
          />
        </label>
      )}

      {etat.etape === "code" && etat.info !== undefined ? (
        <p role="status" className="m-0 text-[13.5px] text-ink-secondary">
          {etat.info}
        </p>
      ) : null}

      {erreur === undefined ? null : (
        <p role="alert" className="m-0 text-[13.5px] text-ink-critical">
          {erreur}
        </p>
      )}

      <button type="submit" className={BOUTON} disabled={enCours}>
        {etat.etape === "code" ? "Se connecter" : "Recevoir un code"}
      </button>

      {etat.etape === "code" ? (
        <>
          {/* Sans valider le champ du code : on le redemande justement. */}
          <button
            type="submit"
            name="intention"
            value="renvoyer"
            formNoValidate
            className={BOUTON_SECONDAIRE}
            disabled={enCours}
          >
            Renvoyer le code
          </button>
          <a
            href="/connexion"
            className="text-center text-[13.5px] text-ink-secondary underline"
          >
            Changer d'adresse
          </a>
        </>
      ) : null}
    </form>
  );
}
