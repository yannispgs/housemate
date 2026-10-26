"use client";

/**
 * La carte « Gel cette nuit » de l'accueil (SPEC § 12.8, décisions du
 * 26/10/2026) : une seule carte, une sous-section par emplacement. « Déplacer »
 * change l'emplacement d'une plante (la véranda présélectionnée pour une plante
 * du dehors) ; « Chauffer » déclare la nuit chauffée pour toute la véranda.
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design.
 */
import { useState, useTransition } from "react";
import { cardFrame } from "@/lib/ui/deadline";
import {
  destinationProposee,
  type FrostCardView,
  type FrostLevel,
  type FrostLocation,
  type FrostPlantView,
} from "@/lib/ui/frost";
import { FrostRangePanel } from "./FrostRangePanel";
import { CHAMP, LISTE } from "./forms/Champ";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, FrostIcon } from "./icons";
import { SectionLabel } from "./Screen";

/** Les gestes réels, quand l'accueil lit la base (absents en démo). */
export interface FrostActions {
  readonly deplacer: (ficheId: string, vers: string) => Promise<string | null>;
  readonly chauffer: (chauffee: boolean) => Promise<string | null>;
}

const PILULE =
  "inline-flex min-h-11 flex-none cursor-pointer items-center rounded-full border border-border bg-surface px-[18px] font-display text-[14px] text-ink hover:bg-grid disabled:opacity-60";

const AUTRE = "__autre__";

const TEINTE: Record<FrostLevel, string> = {
  alerte: "text-ink-critical",
  indisponible: "text-ink-warning",
  vigilance: "text-ink-secondary",
};

function Deplacement({
  plante,
  depuis,
  emplacements,
  onDone,
  onCancel,
  deplacer,
}: Readonly<{
  plante: FrostPlantView;
  depuis: FrostLocation;
  emplacements: readonly string[];
  onDone: (vers: string) => void;
  onCancel: () => void;
  deplacer?: FrostActions["deplacer"];
}>) {
  const ailleurs = emplacements.filter(e => e !== depuis);
  const [choix, setChoix] = useState(
    destinationProposee(depuis, ailleurs) || AUTRE,
  );
  const [autre, setAutre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const vers = choix === AUTRE ? autre.trim() : choix;

  return (
    <form
      className="flex flex-col gap-2.5 pt-1"
      onSubmit={event => {
        event.preventDefault();
        demarrer(async () => {
          const probleme = deplacer
            ? await deplacer(plante.ficheId, vers)
            : null;

          if (probleme === null) {
            onDone(vers);
          } else {
            setErreur(probleme);
          }
        });
      }}
    >
      <select
        aria-label={`Déplacer ${plante.titre} vers`}
        value={choix}
        onChange={event => setChoix(event.target.value)}
        className={LISTE}
      >
        {ailleurs.map(emplacement => (
          <option key={emplacement} value={emplacement}>
            {emplacement}
          </option>
        ))}
        <option value={AUTRE}>Autre pièce…</option>
      </select>
      {choix === AUTRE && (
        <input
          aria-label="Autre pièce"
          value={autre}
          onChange={event => setAutre(event.target.value)}
          maxLength={120}
          placeholder="Salon, chambre…"
          className={CHAMP}
          required
        />
      )}
      {erreur && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreur}
        </span>
      )}
      <span className="flex gap-2">
        <button type="button" className={PILULE} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className={PILULE}
          disabled={enCours || vers === ""}
        >
          Déplacer
        </button>
      </span>
    </form>
  );
}

function Fait({ children }: Readonly<{ children: string }>) {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-[13px] text-ink-secondary">
      <CheckIcon size={15} color="var(--ink-muted)" />
      {children}
    </span>
  );
}

export function FrostCard({
  card,
  emplacements,
  actions,
}: Readonly<{
  card: FrostCardView;
  emplacements: readonly string[];
  actions?: FrostActions;
}>) {
  // Ce qui a été fait depuis l'ouverture de la page, avant le rafraîchissement.
  const [deplacees, setDeplacees] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [depliee, setDepliee] = useState<string | null>(null);
  const [chauffee, setChauffee] = useState(card.chauffee);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const frame = cardFrame(card.alerte ? "critique" : "normal");

  const basculer = (valeur: boolean) =>
    demarrer(async () => {
      setErreur(null);
      const probleme = actions ? await actions.chauffer(valeur) : null;

      if (probleme === null) {
        setChauffee(valeur);
      } else {
        setErreur(probleme);
      }
    });

  return (
    <article
      aria-label="Gel cette nuit"
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface px-[13px] pt-3 pb-4"
      style={{ border: `${frame.width} solid ${frame.color}` }}
    >
      <span className="flex items-center gap-[11px]">
        <span className="flex flex-none items-center text-ink-muted">
          <FrostIcon size={20} />
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[12px] leading-none font-bold uppercase tracking-[.09em] text-ink-secondary">
            {card.alerte ? "Alerte · ce soir" : "À surveiller · ce soir"}
          </span>
          <span className="font-display text-[19px] leading-[1.25] text-ink">
            Gel cette nuit
          </span>
        </span>
      </span>

      {card.sections.map(section => (
        <section
          key={section.emplacement}
          aria-label={section.emplacement}
          className="flex flex-col gap-3 border-t border-border pt-3"
        >
          <span className="flex min-h-11 items-center justify-between gap-3">
            <SectionLabel>{section.emplacement}</SectionLabel>
            {section.emplacement === "Véranda" &&
              (chauffee ? (
                <span className="flex items-center gap-2">
                  <Fait>Chauffée</Fait>
                  <button
                    type="button"
                    onClick={() => basculer(false)}
                    disabled={enCours}
                    className="touch-target cursor-pointer bg-transparent p-1.5 text-[12.5px] leading-none text-ink-secondary underline"
                  >
                    Annuler
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => basculer(true)}
                  disabled={enCours}
                  className={PILULE}
                >
                  Chauffer
                </button>
              ))}
          </span>

          {section.plantes.map(plante => {
            const vers = deplacees[plante.ficheId] ?? plante.deplaceeVers;
            const range = plante.range;
            const deplie = range !== null && depliee === plante.ficheId;
            const Chevron = deplie ? ChevronUpIcon : ChevronDownIcon;

            return (
              <div key={plante.ficheId} className="flex flex-col gap-2">
                <span className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={range === null}
                    aria-expanded={range === null ? undefined : deplie}
                    onClick={() => setDepliee(deplie ? null : plante.ficheId)}
                    className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 bg-transparent p-0 text-left disabled:cursor-default"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15px] text-ink">
                        {plante.titre}
                      </span>
                      <span className={`text-[13px] ${TEINTE[plante.niveau]}`}>
                        {plante.detail}
                      </span>
                    </span>
                    {range !== null && (
                      <span className="flex-none text-ink-muted">
                        <Chevron size={16} />
                      </span>
                    )}
                  </button>
                  {vers !== null && <Fait>{`Déplacée : ${vers}`}</Fait>}
                  {vers === null && ouverte !== plante.ficheId && (
                    <button
                      type="button"
                      className={PILULE}
                      onClick={() => setOuverte(plante.ficheId)}
                    >
                      Déplacer
                    </button>
                  )}
                </span>
                {deplie && <FrostRangePanel range={range} />}
                {vers === null && ouverte === plante.ficheId && (
                  <Deplacement
                    plante={plante}
                    depuis={section.emplacement}
                    emplacements={emplacements}
                    deplacer={actions?.deplacer}
                    onCancel={() => setOuverte(null)}
                    onDone={destination => {
                      setDeplacees(d => ({
                        ...d,
                        [plante.ficheId]: destination,
                      }));
                      setOuverte(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}

      {erreur && (
        <p role="alert" className="m-0 text-[13px] text-ink-critical">
          {erreur}
        </p>
      )}
    </article>
  );
}
