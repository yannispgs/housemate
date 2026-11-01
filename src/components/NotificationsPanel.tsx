"use client";

/**
 * La section Notifications de Réglages (SPEC § 6, décisions du 18/10/2026) :
 * le tableau des méthodes × niveaux d'importance, puis les deux résumés par
 * e-mail. Chaque changement s'enregistre aussitôt.
 *
 * ⚠️ Provisoire : la section n'est pas encore dessinée dans Claude Design
 * (a-dessiner.md). La colonne Push attend la PR des notifications push.
 */
import { useState, useTransition } from "react";
import {
  HORIZONS,
  type Horizon,
  JOURS,
  type Perimetre,
  type ReglagesResumes,
} from "@/lib/data/resumes";
import {
  IMPORTANCE_LABELS,
  IMPORTANCES,
  type Importance,
} from "@/lib/ui/deadline";
import { LIBELLE, LISTE } from "./forms/Champ";
import { Panel } from "./Screen";

const AIDE = "text-[12.5px] leading-normal text-pretty text-ink-secondary";

function Bascule({
  on,
  onChange,
  label,
  disabled = false,
}: Readonly<{
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex h-7 w-[46px] flex-none cursor-pointer rounded-full border-0 p-[3px] disabled:cursor-default disabled:opacity-40"
      style={{
        background: on ? "var(--brand-strong)" : "var(--baseline)",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <span className="size-[22px] rounded-full bg-white shadow-[var(--shadow-sm)]" />
    </button>
  );
}

function Ligne({
  titre,
  children,
}: Readonly<{ titre: string; children: React.ReactNode }>) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-[15px] leading-[1.3] text-ink">{titre}</span>
      {children}
    </div>
  );
}

function Segments<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: Readonly<{
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}>) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 gap-0.5 rounded-full border-0 bg-grid p-[3px]"
    >
      {options.map(([option, libelle]) => {
        const on = option === value;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option)}
            className="h-[38px] flex-1 cursor-pointer rounded-full border text-[13.5px] leading-none font-semibold"
            style={{
              background: on ? "var(--surface)" : "transparent",
              borderColor: on ? "var(--brand-border)" : "transparent",
              color: on ? "var(--ink-primary)" : "var(--ink-secondary)",
            }}
          >
            {libelle}
          </button>
        );
      })}
    </fieldset>
  );
}

const HEURES = Array.from({ length: 24 }, (_, h) => h);

function ChoixHeure({
  value,
  onChange,
  label,
}: Readonly<{ value: number; onChange: (h: number) => void; label: string }>) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      className={LISTE}
      // Une largeur fixe : `w-full` vient de `LISTE`, une classe ne l'écraserait pas.
      style={{ width: "6.5rem", flex: "none" }}
    >
      {HEURES.map(h => (
        <option key={h} value={h}>
          {h} h
        </option>
      ))}
    </select>
  );
}

const PERIMETRES: readonly (readonly [Perimetre, string])[] = [
  ["moi", "Ce qui me concerne"],
  ["foyer", "Tout le foyer"],
];

const HORIZON_OPTIONS = HORIZONS.map(
  h => [h, `${h} jours`] as const satisfies readonly [Horizon, string],
);

export function NotificationsPanel({
  initial,
  enregistrer,
}: Readonly<{
  initial: ReglagesResumes;
  /** Server action ; `null` en démonstration (rien n'est enregistré). */
  enregistrer: ((reglages: ReglagesResumes) => Promise<void>) | null;
}>) {
  const [reglages, setReglages] = useState(initial);
  const [etat, setEtat] = useState<"" | "enregistre" | "erreur">("");
  const [enCours, demarrer] = useTransition();

  const changer = (patch: Partial<ReglagesResumes>) => {
    const suivants = { ...reglages, ...patch };
    setReglages(suivants);

    if (enregistrer === null) {
      return;
    }

    demarrer(async () => {
      try {
        await enregistrer(suivants);
        setEtat("enregistre");
      } catch {
        setEtat("erreur");
      }
    });
  };
  const email = (niveau: Importance, on: boolean) =>
    changer({ email: { ...reglages.email, [niveau]: on } });

  return (
    <>
      <Panel className="gap-3 p-[18px]">
        <span className={LIBELLE}>Notifications</span>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[12.5px] text-ink-secondary">
              <th className="pb-1 font-normal">Importance</th>
              <th className="w-16 pb-1 text-center font-normal">Push</th>
              <th className="w-16 pb-1 text-center font-normal">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {IMPORTANCES.map(niveau => (
              <tr key={niveau} className="h-11 border-t border-border">
                <th className="text-[15px] font-normal text-ink">
                  {IMPORTANCE_LABELS[niveau]}
                </th>
                <td className="text-center text-ink-muted">—</td>
                <td>
                  <span className="flex justify-center">
                    <Bascule
                      on={reglages.email[niveau]}
                      onChange={on => email(niveau, on)}
                      label={`E-mail · ${IMPORTANCE_LABELS[niveau]}`}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <span className={AIDE}>
          E-mail : le niveau figure dans les résumés ci-dessous, jamais un
          message par échéance. Push : bientôt, avec les notifications sur le
          téléphone.
        </span>
      </Panel>

      <Panel className="gap-3 p-[18px]">
        <span className={LIBELLE}>Résumés par e-mail</span>
        <Ligne titre="Chaque semaine">
          <Bascule
            on={reglages.hebdo}
            onChange={hebdo => changer({ hebdo })}
            label="Résumé hebdomadaire"
          />
        </Ligne>
        {reglages.hebdo && (
          <div className="flex gap-2.5">
            <select
              aria-label="Jour du résumé hebdomadaire"
              value={reglages.hebdoJour}
              onChange={event =>
                changer({ hebdoJour: Number(event.target.value) })
              }
              className={LISTE}
              style={{ flex: 1 }}
            >
              {JOURS.map((jour, index) => (
                <option key={jour} value={index + 1}>
                  Le {jour}
                </option>
              ))}
            </select>
            <ChoixHeure
              value={reglages.hebdoHeure}
              onChange={hebdoHeure => changer({ hebdoHeure })}
              label="Heure du résumé hebdomadaire"
            />
          </div>
        )}
        <Ligne titre="Chaque jour">
          <Bascule
            on={reglages.quotidien}
            onChange={quotidien => changer({ quotidien })}
            label="Résumé quotidien"
          />
        </Ligne>
        {!reglages.quotidien && (
          // Un rappel par e-mail le fait partir quand même (§ 6, décision du
          // 29/10/2026) : sans cela, il ne serait jamais reçu.
          <span className={AIDE}>
            Désactivé, il part quand même à {reglages.quotidienHeure} h les
            jours où tombe un rappel par e-mail : ceux ajoutés à une échéance
            {reglages.email.critique &&
              ", et le jour même d'une critique (colonne E-mail)"}
            . Il ne contient alors que ces rappels.
          </span>
        )}
        {reglages.quotidien && (
          <div className="flex items-center justify-between gap-2.5">
            <span className={`${AIDE} flex-1`}>
              Seulement s'il y a quelque chose.
            </span>
            <ChoixHeure
              value={reglages.quotidienHeure}
              onChange={quotidienHeure => changer({ quotidienHeure })}
              label="Heure du résumé quotidien"
            />
          </div>
        )}

        <span className="pt-2 text-[12.5px] text-ink-secondary">
          Jusqu'où regarder
        </span>
        <Segments
          label="Horizon"
          options={HORIZON_OPTIONS}
          value={reglages.horizonJours}
          onChange={horizonJours => changer({ horizonJours })}
        />
        <span className="pt-2 text-[12.5px] text-ink-secondary">Pour qui</span>
        <Segments
          label="Périmètre"
          options={PERIMETRES}
          value={reglages.perimetre}
          onChange={perimetre => changer({ perimetre })}
        />
        <Ligne titre="Rappeler les retards">
          <Bascule
            on={reglages.retards}
            onChange={retards => changer({ retards })}
            label="Rappeler les retards"
          />
        </Ligne>
        <span className={AIDE} aria-live="polite">
          {enCours && "Enregistrement…"}
          {!enCours && etat === "enregistre" && "Enregistré."}
          {!enCours &&
            etat === "erreur" &&
            "Pas enregistré : réessaie dans un instant."}
        </span>
      </Panel>
    </>
  );
}
