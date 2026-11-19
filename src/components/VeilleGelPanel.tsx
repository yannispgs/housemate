"use client";

/**
 * La section « Veille gel » des réglages (SPEC § 12.8, décisions du 26/10 et
 * du 19/11/2026) : une marge mesurée par emplacement, Dehors et Véranda, celle
 * en vigueur et celle que la veille propose après assez de nuits froides. Rien
 * ne change sans « Appliquer ».
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design.
 */
import { useState, useTransition } from "react";
import type { MarginLocationView, MarginView } from "@/lib/ui/frost";
import { CheckIcon } from "./icons";
import { Panel } from "./Screen";

const PANEL_LABEL =
  "text-[11.5px] leading-none font-semibold uppercase tracking-[.11em] text-ink-muted";

type Appliquer = (proposition: string) => Promise<string | null>;

function Marge({
  marge,
  appliquer,
}: Readonly<{ marge: MarginLocationView; appliquer?: Appliquer }>) {
  const [appliquee, setAppliquee] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const proposition = marge.proposition;

  return (
    <section aria-label={marge.libelle} className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] leading-[1.3] text-ink">
          Marge · {marge.libelle}
        </span>
        <span className="font-display text-[15px] text-ink">
          {appliquee && proposition ? proposition.valeur : marge.actuelle}
        </span>
      </span>
      <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
        {appliquee ? "Appliquée aujourd'hui." : marge.origine} {marge.role}
      </span>

      {proposition && !appliquee && (
        <section
          aria-label={`Marge proposée · ${marge.libelle}`}
          className="flex flex-col gap-2.5 rounded-[var(--radius-md)] bg-grid p-3"
        >
          <span className="text-[15px] leading-[1.3] text-ink">
            Proposée : {proposition.valeur}
          </span>
          <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
            {proposition.base}
          </span>
          {erreur && (
            <span role="alert" className="text-[13px] text-ink-critical">
              {erreur}
            </span>
          )}
          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                setErreur(null);
                const probleme = appliquer
                  ? await appliquer(proposition.id)
                  : null;

                if (probleme === null) {
                  setAppliquee(true);
                } else {
                  setErreur(probleme);
                }
              })
            }
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 self-start rounded-full border border-border bg-surface px-[18px] font-display text-[14px] text-ink hover:bg-grid disabled:opacity-60"
          >
            <CheckIcon size={15} color="var(--ink-muted)" />
            Appliquer
          </button>
        </section>
      )}
    </section>
  );
}

export function VeilleGelPanel({
  marge,
  appliquer,
}: Readonly<{
  marge: MarginView;
  /** Server action ; absente en démo. */
  appliquer?: Appliquer;
}>) {
  return (
    <Panel className="gap-4 p-[18px]">
      <span className={PANEL_LABEL}>Veille gel</span>
      {marge.map(m => (
        <Marge key={m.emplacement} marge={m} appliquer={appliquer} />
      ))}
    </Panel>
  );
}
