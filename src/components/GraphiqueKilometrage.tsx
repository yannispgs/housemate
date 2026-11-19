"use client";

/**
 * La section « Kilométrage » d'une fiche (SPEC § 5.3, décisions du 23/10 et
 * du 06/11/2026) : sur 1, 2 ou 5 ans ou tout l'historique, la courbe de
 * chaque donnée du compteur (relevés et remplacements notés au compteur),
 * dessous un couloir par consommable avec un trait par changement (décision
 * du 19/11/2026 : la place distingue les consommables, quel que soit leur
 * nombre, là où des losanges d'une seule couleur s'entassaient sur la
 * courbe), et les kilomètres de chaque année. Le calcul est dans
 * `@/lib/domain/kilometrage`.
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useState } from "react";
import {
  ancreCarnet,
  couloirsDuCarnet,
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
  serieKilometrique,
} from "@/lib/domain/kilometrage";
import { fromISO } from "@/lib/domain/plain-date";
import { Panel, SectionLabel } from "./Screen";

const COURBE = { largeur: 340, hauteur: 190, gauche: 48, bas: 20, haut: 10 };
/** Hauteur du trait d'un changement, dans son couloir. */
const TRAIT = 14;
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
  const [choisi, setChoisi] = useState<string | null>(null);
  const couloirs = couloirsDuCarnet(reperes);
  const jour = fromISO(aujourdhui);
  const serie = serieKilometrique(
    releves,
    reperes.map(r => ({ le: fromISO(r.le), compteur: r.compteur })),
  );
  const c = courbe(
    serie,
    reperes.map(r => ({ le: fromISO(r.le), compteur: r.compteur })),
    periode,
    jour,
    COURBE,
  );
  const debut = debutDePeriode(periode, serie, jour);
  const annees = anneesDeLaPeriode(kmParAn(serie, jour), debut);
  const couloir = couloirs.find(k => k.consommable === choisi);
  const marques = c.reperes.filter(r => couloir?.indices.includes(r.index));
  const dernier = reperes.find(
    (r, index) =>
      couloir?.indices.includes(index) && r.compteur === couloir.dernier,
  );
  const compteur = serie.at(-1)?.valeur ?? 0;
  // Six années au plus sous l'axe : au-delà, les libellés se chevauchent.
  const pasAnnees = Math.ceil(c.graduationsX.length / 6);
  const graduationsX = c.graduationsX.filter(
    g => (jour.year - g.annee) % pasAnnees === 0,
  );

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

      {c.points.length === 0 && (
        <span className="text-[13.5px] text-ink-secondary">
          Aucun relevé sur cette période.
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
          {graduationsX.map(g => (
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
          {/* Une courbe par chaque donnée du compteur ; un point seul tant
              qu'il n'y en a qu'une (décision du 06/11/2026). */}
          {c.points.length > 1 && (
            <polyline
              points={c.points.map(p => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--brand-strong)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          )}
          {c.points.length === 1 &&
            c.points.map(p => (
              <circle
                key={`${p.x} ${p.y}`}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="var(--brand-strong)"
              />
            ))}
          {/* Les changements du couloir choisi, reportés sur la courbe. */}
          {marques.map(r => (
            <circle
              key={r.index}
              cx={r.x}
              cy={r.y}
              r="4.5"
              fill="var(--ink)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      {couloirs.length > 0 && (
        <>
          <span className="pt-2 text-[12.5px] text-ink-secondary">
            Changements, par consommable
          </span>
          <div className="flex flex-col">
            {couloirs.map(k => {
              const traits = c.reperes.filter(r => k.indices.includes(r.index));
              const actif = k.consommable === choisi;

              return (
                <button
                  key={k.consommable}
                  type="button"
                  aria-pressed={actif}
                  aria-label={`${k.consommable} : ${traits.length} changement${traits.length > 1 ? "s" : ""} sur la période`}
                  onClick={() => setChoisi(actif ? null : k.consommable)}
                  className="flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-md border-0 px-0 text-left"
                  style={{ background: actif ? "var(--page)" : "transparent" }}
                >
                  <span
                    className="flex gap-1.5 px-1 text-[12.5px] text-ink"
                    style={{ fontWeight: actif ? 700 : 400 }}
                  >
                    {k.consommable}
                    <span className="text-ink-muted">×{traits.length}</span>
                  </span>
                  <svg
                    viewBox={`0 0 ${COURBE.largeur} ${TRAIT}`}
                    className="block h-auto w-full"
                    aria-hidden="true"
                  >
                    <line
                      x1={COURBE.gauche}
                      x2={COURBE.largeur}
                      y1={TRAIT / 2}
                      y2={TRAIT / 2}
                      stroke="var(--grid)"
                    />
                    {traits.map(r => (
                      <rect
                        key={r.index}
                        x={r.x - 2}
                        y="0"
                        width="4"
                        height={TRAIT}
                        rx="2"
                        fill={actif ? "var(--ink)" : "var(--ink-secondary)"}
                      />
                    ))}
                  </svg>
                </button>
              );
            })}
          </div>
        </>
      )}

      {couloir !== undefined && (
        <div className="flex flex-col gap-0.5 rounded-xl border border-border p-3">
          <span className="text-[15px] text-ink">{couloir.consommable}</span>
          <span className="text-[13.5px] text-ink-secondary">
            {couloir.indices.length} changement
            {couloir.indices.length > 1 ? "s" : ""}
            {couloir.intervalleMoyen === null
              ? ""
              : `, tous les ${NOMBRE.format(couloir.intervalleMoyen)} km en moyenne`}
          </span>
          <span className="text-[13.5px] text-ink-secondary">
            Dernier à {NOMBRE.format(couloir.dernier)} km, il y a{" "}
            {NOMBRE.format(Math.max(compteur - couloir.dernier, 0))} km
          </span>
          {dernier !== undefined && (
            <a
              href={`#${ancreCarnet(dernier.le)}`}
              className="text-[13.5px] text-ink underline"
            >
              Voir au carnet
            </a>
          )}
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
