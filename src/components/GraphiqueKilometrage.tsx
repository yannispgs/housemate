"use client";

/**
 * La section « Kilométrage » d'une fiche (SPEC § 5.3, décisions du
 * 23/10/2026) : la courbe des relevés réels sur 1, 2 ou 5 ans ou tout
 * l'historique, un repère par intervention du carnet, et les kilomètres de
 * chaque année. Le calcul est dans `@/lib/domain/kilometrage`.
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useState } from "react";
import {
  ancreCarnet,
  enteteEntree,
  type RepereCarnet,
} from "@/lib/data/carnet";
import type { Releve } from "@/lib/domain/entretien";
import {
  anneesDeLaPeriode,
  courbe,
  debutDePeriode,
  kmParAn,
  PERIODE_PAR_DEFAUT,
  PERIODES,
  type Periode,
} from "@/lib/domain/kilometrage";
import { fromISO } from "@/lib/domain/plain-date";
import { Panel, SectionLabel } from "./Screen";

const COURBE = { largeur: 340, hauteur: 190, gauche: 48, bas: 20, haut: 10 };
const BARRES = { largeur: 340, hauteur: 110, haut: 16, bas: 18 };

const NOMBRE = new Intl.NumberFormat("fr-FR");

function libellePeriode(periode: Periode): string {
  if (periode === "tout") {
    return "Tout";
  }

  return periode === 1 ? "1 an" : `${periode} ans`;
}

export function GraphiqueKilometrage({
  releves,
  reperes,
  aujourdhui,
}: Readonly<{
  releves: readonly Releve[];
  reperes: readonly RepereCarnet[];
  /** AAAA-MM-JJ, à Paris. */
  aujourdhui: string;
}>) {
  const [periode, setPeriode] = useState<Periode>(PERIODE_PAR_DEFAUT);
  const [choisi, setChoisi] = useState<number | null>(null);
  const jour = fromISO(aujourdhui);
  const c = courbe(
    releves,
    reperes.map(r => ({ le: fromISO(r.le), compteur: r.compteur })),
    periode,
    jour,
    COURBE,
  );
  const debut = debutDePeriode(periode, releves, jour);
  const annees = anneesDeLaPeriode(kmParAn(releves, jour), debut);
  const repere = choisi === null ? undefined : reperes[choisi];

  return (
    <Panel className="gap-3 p-[18px]">
      <SectionLabel>Kilométrage</SectionLabel>

      <fieldset
        aria-label="Période"
        className="m-0 flex min-w-0 gap-1 border-0 p-0"
      >
        {PERIODES.map(p => (
          <button
            key={p}
            type="button"
            aria-pressed={p === periode}
            onClick={() => {
              setPeriode(p);
              setChoisi(null);
            }}
            className="h-9 flex-1 cursor-pointer rounded-full border text-[13px]"
            style={{
              background: p === periode ? "var(--brand-strong)" : "transparent",
              borderColor:
                p === periode ? "var(--brand-strong)" : "var(--baseline)",
              color: p === periode ? "white" : "var(--ink-secondary)",
            }}
          >
            {libellePeriode(p)}
          </button>
        ))}
      </fieldset>

      {c.points.length < 2 && (
        <span className="text-[13.5px] text-ink-secondary">
          Pas assez de relevés sur cette période pour tracer une courbe.
        </span>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${COURBE.largeur} ${COURBE.hauteur}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Compteur relevé au fil du temps"
        >
          {c.graduationsY.map(g => (
            <g key={g.km}>
              <line
                x1={COURBE.gauche}
                x2={COURBE.largeur}
                y1={g.y}
                y2={g.y}
                stroke="var(--grid)"
              />
              <text
                x={COURBE.gauche - 6}
                y={g.y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {NOMBRE.format(g.km)}
              </text>
            </g>
          ))}
          {c.graduationsX.map(g => (
            <g key={g.annee}>
              <line
                x1={g.x}
                x2={g.x}
                y1={COURBE.haut}
                y2={COURBE.hauteur - COURBE.bas}
                stroke="var(--grid)"
              />
              <text
                x={g.x}
                y={COURBE.hauteur - 5}
                textAnchor="middle"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {g.annee}
              </text>
            </g>
          ))}
          <polyline
            points={c.points.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--brand-strong)"
            strokeWidth="2"
          />
          {c.points.map(p => (
            <circle
              key={`${p.x} ${p.y}`}
              cx={p.x}
              cy={p.y}
              r="2.5"
              fill="var(--brand-strong)"
            />
          ))}
        </svg>
        {c.reperes.map(r => {
          const intervention = reperes[r.index];

          return (
            <button
              key={r.index}
              type="button"
              aria-pressed={choisi === r.index}
              aria-label={
                intervention === undefined
                  ? undefined
                  : `${enteteEntree(intervention)} : ${intervention.libelles.join(", ")}`
              }
              onClick={() => setChoisi(choisi === r.index ? null : r.index)}
              className="absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0"
              style={{
                left: `${(r.x / COURBE.largeur) * 100}%`,
                top: `${(r.y / COURBE.hauteur) * 100}%`,
              }}
            >
              <span
                className="m-auto block size-2.5 rotate-45 border-2"
                style={{
                  borderColor: "var(--brand-strong)",
                  background:
                    choisi === r.index
                      ? "var(--brand-strong)"
                      : "var(--surface)",
                }}
              />
            </button>
          );
        })}
      </div>

      {repere !== undefined && (
        <div className="flex flex-col gap-0.5 rounded-xl border border-border p-3">
          <span className="text-[12.5px] text-ink-secondary">
            {enteteEntree(repere)}
          </span>
          <span className="text-[15px] text-ink">
            {repere.libelles.join(", ")}
          </span>
          <a
            href={`#${ancreCarnet(repere.le)}`}
            className="text-[13.5px] text-ink underline"
          >
            Voir au carnet
          </a>
        </div>
      )}

      {annees.length > 0 && (
        <>
          <span className="pt-2 text-[12.5px] text-ink-secondary">
            Kilomètres par an
          </span>
          <svg
            viewBox={`0 0 ${BARRES.largeur} ${BARRES.hauteur}`}
            className="block h-auto w-full"
            role="img"
            aria-label={annees
              .map(
                a =>
                  `${a.annee} : ${NOMBRE.format(a.km)} km${a.enCours ? " (en cours)" : ""}`,
              )
              .join(", ")}
          >
            {annees.map((a, index) => {
              const max = Math.max(...annees.map(b => b.km), 1);
              const pas = BARRES.largeur / annees.length;
              const utile = BARRES.hauteur - BARRES.haut - BARRES.bas;
              const h = (a.km / max) * utile;
              const x = index * pas + pas * 0.2;
              const y = BARRES.haut + utile - h;

              return (
                <g key={a.annee}>
                  <rect
                    x={x}
                    y={y}
                    width={pas * 0.6}
                    height={h}
                    rx="3"
                    fill="var(--brand-strong)"
                    fillOpacity={a.enCours ? 0.35 : 1}
                    stroke="var(--brand-strong)"
                    strokeDasharray={a.enCours ? "3 2" : undefined}
                  />
                  <text
                    x={x + pas * 0.3}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--ink-secondary)"
                  >
                    {NOMBRE.format(a.km)}
                  </text>
                  <text
                    x={x + pas * 0.3}
                    y={BARRES.hauteur - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--ink-muted)"
                  >
                    {a.enCours ? `${a.annee} (en cours)` : a.annee}
                  </text>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </Panel>
  );
}
