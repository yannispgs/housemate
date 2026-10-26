/**
 * La frise de température d'une alerte de gel (handoff de design) : le pire
 * cas, l'estimation, et les seuils de dégâts et de mort de la plante. Partagée
 * par la carte d'échéance et par la carte « Gel cette nuit ».
 */
import {
  type FrostRange,
  formatTemperature,
  frostGradient,
  frostScale,
} from "@/lib/ui/deadline";
import { AlertIcon } from "./icons";

/** La frise de température d'une alerte de gel. */
export function FrostRangePanel({ range }: Readonly<{ range: FrostRange }>) {
  const scale = frostScale(range);
  const label = (position: number, text: string) => (
    <span
      className="absolute top-0 -translate-x-1/2 text-[10.5px] leading-none font-semibold whitespace-nowrap text-ink"
      style={{ left: `${position}%` }}
    >
      {text}
    </span>
  );
  const tick = (position: number, text: string, className: string) => (
    <span
      className={`absolute top-0 -translate-x-1/2 text-[10.5px] leading-none tabular-nums ${className}`}
      style={{ left: `${position}%` }}
    >
      {text}
    </span>
  );

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-page px-3.5 pt-3.5 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[11.5px] leading-none uppercase tracking-[.04em] text-ink-muted">
            Décision sur la borne basse
          </span>
          <span className="flex items-baseline gap-[7px]">
            <span className="text-[27px] leading-none font-semibold tracking-[-.02em] tabular-nums text-ink-critical">
              {formatTemperature(range.lowerBound)} °C
            </span>
            <span className="text-[13px] leading-none text-ink-secondary">
              au pire
            </span>
          </span>
        </div>
        <span className="text-right text-[12.5px] leading-[1.4] tabular-nums text-ink-secondary">
          estimé {formatTemperature(range.estimate)} °C
          <br />± {formatTemperature(range.margin)} °C
        </span>
      </div>

      <div className="flex flex-col gap-[5px]">
        <div className="relative h-3.5">
          {label(
            scale.death,
            `mort ${formatTemperature(range.deathThreshold)} °C`,
          )}
          {label(
            scale.damage,
            `dégâts ${formatTemperature(range.damageThreshold)} °C`,
          )}
        </div>
        <div className="relative h-[22px]">
          {/* Le fond dit la zone (demande du foyer, 2026-10-12), atténué
              pour que les traits des seuils ressortent ; les seuils restent
              aussi nommés au-dessus : jamais la couleur seule. */}
          <div
            className="absolute inset-x-0 top-[7px] h-2 rounded opacity-40"
            style={{ background: frostGradient(scale) }}
          />
          {/* Trait plein pour les seuils de la plante (connus), pointillés
              pour la prévision (estimée) : demande du foyer, 2026-10-12. */}
          <div
            className="absolute top-px h-5 rounded-[5px]"
            style={{
              left: `${scale.lowerBound}%`,
              width: `${scale.upperBound - scale.lowerBound}%`,
              background:
                "color-mix(in srgb, var(--color-text) 12%, transparent)",
            }}
          />
          {/* La borne basse, plus épaisse que l'estimation : c'est elle qui
              décide. */}
          <div
            className="absolute top-0 h-[22px] w-0 -translate-x-px border-l-[3px] border-dashed border-ink"
            style={{ left: `${scale.lowerBound}%` }}
          />
          <div
            className="absolute top-0 h-[22px] w-0 border-l-2 border-dashed border-ink"
            style={{ left: `${scale.estimate}%` }}
          />
          <div
            className="absolute top-0 h-[22px] w-0.5 rounded-sm bg-ink-critical"
            style={{ left: `${scale.death}%` }}
          />
          <div
            className="absolute top-0 h-[22px] w-0.5 rounded-sm bg-ink-serious"
            style={{ left: `${scale.damage}%` }}
          />
        </div>
        <div className="relative h-[13px]">
          {tick(
            scale.death,
            formatTemperature(range.deathThreshold),
            "text-ink-muted",
          )}
          {tick(
            scale.lowerBound,
            formatTemperature(range.lowerBound),
            "font-semibold text-ink",
          )}
          {tick(
            scale.estimate,
            formatTemperature(range.estimate),
            "text-ink-secondary",
          )}
          {tick(
            scale.damage,
            formatTemperature(range.damageThreshold),
            "text-ink-muted",
          )}
        </div>
      </div>

      <div className="flex items-start gap-[7px] border-t border-border pt-2.5">
        <AlertIcon
          size={15}
          color="var(--ink-serious)"
          style={{ flex: "none", marginTop: 2 }}
        />
        <span className="text-[12.5px] leading-[1.45] text-ink-secondary">
          {range.explanation}
        </span>
      </div>
    </div>
  );
}
