"use client";

/**
 * La section Rappel de crèche de Réglages (SPEC § 12.9, décision du foyer du
 * 2026-10-22 : tout se règle ici, aucun prénom côté serveur). Les jours et
 * les prénoms valent pour le foyer ; recevoir le rappel est un choix
 * personnel. Chaque changement s'enregistre aussitôt — les prénoms, quand on
 * quitte le champ.
 *
 * ⚠️ Provisoire : la section n'est pas encore dessinée dans Claude Design
 * (a-dessiner.md).
 */
import { useState, useTransition } from "react";
import type { ReglagesCreche } from "@/lib/data/creche";
import { JOURS } from "@/lib/data/resumes";
import type { Weekday } from "@/lib/domain/school-run";
import { CHAMP, LIBELLE } from "./forms/Champ";
import { AIDE, Bascule, Ligne } from "./NotificationsPanel";
import { Panel } from "./Screen";

type Prenom = "enfant" | "parentSec" | "parentPluie";

const PRENOMS: readonly (readonly [Prenom, string, string])[] = [
  ["enfant", "L'enfant", "Son prénom"],
  ["parentSec", "Par temps sec, qui l'emmène", "Un prénom"],
  ["parentPluie", "S'il pleut, qui l'emmène", "Un prénom"],
];

export function CrechePanel({
  initial,
  recoit: recoitInitial,
  enregistrer,
  recevoir,
}: Readonly<{
  initial: ReglagesCreche;
  recoit: boolean;
  /** Server actions ; `null` en démonstration (rien n'est enregistré). */
  enregistrer: ((reglages: ReglagesCreche) => Promise<void>) | null;
  recevoir: ((oui: boolean) => Promise<void>) | null;
}>) {
  const [reglages, setReglages] = useState(initial);
  const [recoit, setRecoit] = useState(recoitInitial);
  const [etat, setEtat] = useState<"" | "enregistre" | "erreur">("");
  const [enCours, demarrer] = useTransition();

  const sauver = (action: () => Promise<void>) =>
    demarrer(async () => {
      try {
        await action();
        setEtat("enregistre");
      } catch {
        setEtat("erreur");
      }
    });

  const changer = (patch: Partial<ReglagesCreche>) => {
    const suivants = { ...reglages, ...patch };
    setReglages(suivants);

    if (enregistrer !== null) {
      sauver(() => enregistrer(suivants));
    }
  };

  const basculerJour = (jour: Weekday) =>
    changer({
      jours: reglages.jours.includes(jour)
        ? reglages.jours.filter(j => j !== jour)
        : [...reglages.jours, jour].sort((a, b) => a - b),
    });

  return (
    <Panel className="gap-3 p-[18px]">
      <span className={LIBELLE}>Rappel de crèche</span>
      <Ligne titre="Recevoir le rappel par e-mail">
        <Bascule
          on={recoit}
          onChange={oui => {
            setRecoit(oui);

            if (recevoir !== null) {
              sauver(() => recevoir(oui));
            }
          }}
          label="Recevoir le rappel de crèche"
        />
      </Ligne>
      <span className={AIDE}>
        La veille de chaque jour de crèche, à 22 h : qui emmène l'enfant, selon
        la pluie prévue de 8 h à 9 h. Si les prévisions hésitent, le message le
        dit. Les réglages ci-dessous valent pour tout le foyer.
      </span>

      <span className="pt-2 text-[12.5px] text-ink-secondary">
        Jours de crèche
      </span>
      <fieldset
        aria-label="Jours de crèche"
        className="m-0 flex min-w-0 gap-1 border-0 p-0"
      >
        {JOURS.map((nom, index) => {
          const jour = (index + 1) as Weekday;
          const on = reglages.jours.includes(jour);

          return (
            <button
              key={nom}
              type="button"
              aria-pressed={on}
              aria-label={nom}
              onClick={() => basculerJour(jour)}
              className="h-[38px] flex-1 cursor-pointer rounded-full border text-[13.5px] leading-none font-semibold capitalize"
              style={{
                background: on ? "var(--brand-strong)" : "transparent",
                borderColor: on ? "var(--brand-strong)" : "var(--baseline)",
                color: on ? "white" : "var(--ink-secondary)",
              }}
            >
              {nom.slice(0, 2)}
            </button>
          );
        })}
      </fieldset>

      {PRENOMS.map(([cle, libelle, indice]) => (
        <label key={cle} className="flex flex-col gap-1">
          <span className="text-[12.5px] text-ink-secondary">{libelle}</span>
          <input
            type="text"
            className={CHAMP}
            defaultValue={reglages[cle] ?? ""}
            placeholder={indice}
            maxLength={40}
            autoComplete="off"
            onBlur={event => {
              const valeur = event.target.value.trim() || null;

              if (valeur !== reglages[cle]) {
                changer({ [cle]: valeur });
              }
            }}
          />
        </label>
      ))}

      <span className={AIDE} aria-live="polite">
        {enCours && "Enregistrement…"}
        {!enCours && etat === "enregistre" && "Enregistré."}
        {!enCours &&
          etat === "erreur" &&
          "Pas enregistré : réessaie dans un instant."}
      </span>
    </Panel>
  );
}
