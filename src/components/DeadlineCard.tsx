"use client";

/**
 * Une carte d'échéance de l'accueil (`CarteEcheance` de la maquette). Fermée,
 * elle tient en une ligne ; un clic la déplie sur le détail, l'historique et
 * les actions.
 *
 * Client component : l'avancement d'une échéance regroupée (une plante cochée,
 * un guide de coupe ajouté) vit dans la carte tant qu'aucune donnée n'est
 * branchée.
 */
import { useState } from "react";
import {
  type CategoryIcon,
  cardFrame,
  type DeadlineView,
  type FrostRange,
  formatTemperature,
  frostScale,
  type GroupedPlant,
  plantsProgress,
  TONE_INK,
} from "@/lib/ui/deadline";
import {
  AlertIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DropIcon,
  ExternalIcon,
  FrostIcon,
  PlusIcon,
  PruningIcon,
  VehicleIcon,
  WarrantyIcon,
} from "./icons";
import { TenureTag } from "./Tags";

const CATEGORY_ICON: Readonly<
  Record<CategoryIcon, (props: { size?: number }) => React.ReactNode>
> = {
  frost: FrostIcon,
  warranty: WarrantyIcon,
  vehicle: VehicleIcon,
  fertiliser: DropIcon,
  pruning: PruningIcon,
};

function ImportanceMark({ deadline }: Readonly<{ deadline: DeadlineView }>) {
  if (deadline.importance === "critique") {
    return (
      <span className="ml-0.5 inline-flex items-center gap-[5px] rounded-full bg-critical-tint py-[3px] pr-2 pl-1.5">
        <AlertIcon size={12} color="var(--ink-primary)" strokeWidth={2.9} />
        <span className="text-[10.5px] leading-none font-bold uppercase tracking-[.06em] text-ink">
          critique
        </span>
      </span>
    );
  }

  if (deadline.importance === "important") {
    return (
      <span
        className="ml-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-[1.4] font-semibold uppercase tracking-[.06em] text-ink"
        style={{
          border: "1.5px solid var(--ink-serious)",
          background:
            "color-mix(in srgb, var(--ink-serious) 20%, var(--surface))",
        }}
      >
        {deadline.raised && (
          <ArrowUpIcon
            size={10}
            color="var(--ink-primary)"
            strokeWidth={3.25}
          />
        )}
        important
      </span>
    );
  }

  if (deadline.importance === "memoire") {
    return (
      <span className="ml-0.5 text-[10.5px] leading-none text-ink-muted">
        pour mémoire
      </span>
    );
  }

  return null;
}

/** La frise de température d'une alerte de gel. */
function FrostRangePanel({ range }: Readonly<{ range: FrostRange }>) {
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
          {/* Le bleu dit « froid », convention physique ; le danger passe
              par le statut, jamais par la teinte. */}
          <div
            className="absolute inset-x-0 top-[7px] h-2 rounded opacity-85"
            style={{
              background:
                "linear-gradient(90deg,#2a78d6 0%,#7fa3c9 55%,#a19786 100%)",
            }}
          />
          <div
            className="absolute top-px h-5 rounded-[5px] border-l-[3px] border-ink"
            style={{
              left: `${scale.lowerBound}%`,
              width: `${scale.upperBound - scale.lowerBound}%`,
              background:
                "color-mix(in srgb, var(--color-text) 12%, transparent)",
            }}
          />
          <div
            className="absolute top-0 h-[22px] w-0.5 rounded-sm bg-ink"
            style={{ left: `${scale.estimate}%` }}
          />
          <div
            className="absolute top-0 h-[22px] w-0.5 rounded-sm bg-ink-critical"
            style={{ left: `${scale.death}%` }}
          />
          <div
            className="absolute top-0 h-[22px] w-0 border-l-2 border-dashed border-ink-serious"
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

interface PlantState {
  readonly doneOn: Readonly<Record<string, string | null>>;
  readonly guides: Readonly<Record<string, string>>;
}

/**
 * Le guide de coupe d'une plante : le champ pendant la saisie, le lien quand
 * il existe, sinon l'invitation à en ajouter un.
 */
function GuideActions({
  plantName,
  guide,
  editing,
  draft,
  onDraft,
  onEdit,
  onSave,
}: Readonly<{
  plantName: string;
  guide: string;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
}>) {
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={draft}
          onChange={event => onDraft(event.target.value)}
          placeholder="https://…"
          aria-label={`Lien du guide de coupe : ${plantName}`}
          className="h-[38px] min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 text-[13.5px] leading-none text-ink outline-none"
        />
        <button
          type="button"
          onClick={onSave}
          className="h-[38px] flex-none cursor-pointer rounded-full bg-brand-strong px-3.5 font-display text-[13px] text-white hover:brightness-[1.08]"
        >
          Enregistrer
        </button>
      </div>
    );
  }

  if (guide) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          href={guide}
          target="_blank"
          rel="noopener"
          className="touch-target inline-flex min-h-9 items-center gap-[7px] rounded-full border border-border bg-surface px-3.5 font-display text-[13px] text-ink no-underline hover:border-baseline"
        >
          Guide de coupe
          <ExternalIcon size={13} />
        </a>
        <button
          type="button"
          onClick={onEdit}
          className="touch-target cursor-pointer bg-transparent p-0 text-[12px] leading-none text-ink-muted underline underline-offset-[3px] hover:text-ink"
        >
          Changer le lien
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="touch-target inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start rounded-full border border-dashed border-baseline bg-transparent px-3.5 text-[13px] leading-none text-ink-secondary hover:text-ink"
    >
      <PlusIcon size={13} />
      Ajouter un guide de coupe
    </button>
  );
}

/** Une plante d'une échéance regroupée : à cocher, à déplier. */
function PlantLine({
  plant,
  first,
  doneOn,
  guide,
  expanded,
  onToggleDone,
  onToggleExpanded,
  onSaveGuide,
}: Readonly<{
  plant: GroupedPlant;
  first: boolean;
  doneOn: string | null;
  guide: string;
  expanded: boolean;
  onToggleDone: () => void;
  onToggleExpanded: () => void;
  onSaveGuide: (url: string) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guide);
  const done = doneOn !== null;

  return (
    <div
      className="flex flex-col border-t"
      style={{ borderColor: first ? "transparent" : "var(--border)" }}
    >
      <div className="flex items-center gap-1.5 py-1 pr-1.5 pl-1">
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={done ? "Marquer comme à faire" : "Marquer comme faite"}
          aria-pressed={done}
          className="flex size-11 flex-none cursor-pointer items-center justify-center bg-transparent p-0"
        >
          <span
            className="flex size-6 items-center justify-center rounded-full border-2"
            style={{
              borderColor: done ? "var(--ink-primary)" : "var(--baseline)",
              background: done ? "var(--ink-primary)" : "var(--surface)",
            }}
          >
            {done && (
              <CheckIcon size={13} color="var(--surface)" strokeWidth={3.25} />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            onToggleExpanded();
          }}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent p-0 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span
              className="font-display text-[14.5px] leading-[1.3]"
              style={{
                color: done ? "var(--ink-secondary)" : "var(--ink-primary)",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {plant.name}
            </span>
            <span className="text-[12px] leading-[1.3] text-ink-secondary">
              {done ? `faite le ${doneOn}` : "à faire"}
            </span>
          </span>
          <ChevronDownIcon
            size={16}
            color="var(--ink-muted)"
            style={{
              flex: "none",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2.5 pt-0.5 pr-3.5 pb-3.5 pl-[54px]">
          <span className="text-[12.5px] leading-normal text-pretty text-ink-secondary">
            {plant.instruction}
          </span>
          <GuideActions
            plantName={plant.name}
            guide={guide}
            editing={editing}
            draft={draft}
            onDraft={setDraft}
            onEdit={() => {
              setDraft(guide);
              setEditing(true);
            }}
            onSave={() => {
              onSaveGuide(draft.trim());
              setEditing(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PlantChecklist({
  plants,
  state,
  todayLabel,
  onChange,
}: Readonly<{
  plants: readonly GroupedPlant[];
  state: PlantState;
  todayLabel: string;
  onChange: (state: PlantState) => void;
}>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const current = plants.map(plant => ({
    ...plant,
    doneOn: state.doneOn[plant.id] ?? null,
  }));

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2">
        <span className="text-[10.5px] leading-none font-semibold uppercase tracking-[.12em] text-ink-muted">
          Plantes
        </span>
        <span className="text-[11.5px] leading-none text-ink-muted">
          {plantsProgress(current)}
        </span>
      </span>
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-page">
        {current.map((plant, index) => (
          <PlantLine
            key={plant.id}
            plant={plant}
            first={index === 0}
            doneOn={plant.doneOn}
            guide={state.guides[plant.id] ?? plant.guideUrl}
            expanded={expanded === plant.id}
            onToggleExpanded={() =>
              setExpanded(value => (value === plant.id ? null : plant.id))
            }
            onToggleDone={() =>
              onChange({
                ...state,
                doneOn: {
                  ...state.doneOn,
                  [plant.id]: plant.doneOn === null ? todayLabel : null,
                },
              })
            }
            onSaveGuide={url =>
              onChange({
                ...state,
                guides: { ...state.guides, [plant.id]: url },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

export function DeadlineCard({
  deadline,
  open,
  todayLabel,
  onToggle,
  onDone,
}: Readonly<{
  deadline: DeadlineView;
  open: boolean;
  /** « 13 sept. » : la date qu'une plante cochée enregistre. */
  todayLabel: string;
  onToggle: () => void;
  onDone: () => void;
}>) {
  const [plants, setPlants] = useState<PlantState>(() => ({
    doneOn: Object.fromEntries(
      (deadline.plants ?? []).map(plant => [plant.id, plant.doneOn]),
    ),
    guides: {},
  }));
  const frame = cardFrame(deadline.importance);
  const Icon = CATEGORY_ICON[deadline.icon];
  const tone = TONE_INK[deadline.tone];
  const done = Object.values(plants.doneOn).filter(Boolean).length;
  const when = deadline.plants
    ? `${done} sur ${deadline.plants.length} · ${deadline.when}`
    : deadline.when;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface"
      style={{ border: `${frame.width} solid ${frame.color}` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-[11px] bg-transparent px-[13px] py-3 text-left hover:bg-page"
      >
        <span className="flex flex-none items-center text-ink-muted">
          <Icon size={deadline.icon === "frost" ? 20 : 19} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={`leading-none uppercase tracking-[.09em] text-ink-secondary ${frame.emphasised ? "text-[12px] font-bold" : "text-[11px] font-semibold"}`}
            >
              {deadline.state}
            </span>
            <span
              className="size-[3px] flex-none rounded-full"
              style={{ background: tone }}
            />
            <span
              className={`text-[12.5px] leading-none text-ink-secondary ${frame.emphasised ? "font-semibold" : ""}`}
            >
              {when}
            </span>
            <ImportanceMark deadline={deadline} />
          </span>
          <span className="line-clamp-2 font-display text-[16.5px] leading-[1.3] text-pretty text-ink">
            {deadline.title}
          </span>
        </span>

        <span className="flex flex-none items-center gap-[9px]">
          <TenureTag tenure={deadline.tenure} variant="card" />
          <span className="flex items-center text-ink-muted">
            {open ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </span>
        </span>
      </button>

      {deadline.window && (
        <div className="flex items-center gap-2.5 pr-3.5 pb-[11px] pl-11">
          <span className="relative h-1.5 min-w-[50px] flex-1">
            <span className="absolute inset-x-0 top-0.5 h-0.5 rounded bg-baseline" />
            <span
              className="absolute top-0.5 left-0 h-0.5 rounded"
              style={{ background: tone, width: `${deadline.window.percent}%` }}
            />
            <span
              className="absolute top-0 h-1.5 w-0.5 rounded-sm"
              style={{ background: tone, left: `${deadline.window.percent}%` }}
            />
          </span>
          <span className="text-[10.5px] leading-none whitespace-nowrap tabular-nums text-ink-muted">
            {deadline.window.text}
          </span>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-border px-3.5 pt-[15px] pb-4">
          {deadline.detail && (
            <div className="text-[14px] leading-[1.55] text-pretty text-ink-secondary">
              {deadline.detail}
            </div>
          )}

          {deadline.frostRange && (
            <FrostRangePanel range={deadline.frostRange} />
          )}

          {deadline.plants && (
            <PlantChecklist
              plants={deadline.plants}
              state={plants}
              todayLabel={todayLabel}
              onChange={setPlants}
            />
          )}

          {!deadline.plants && deadline.history.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10.5px] leading-none font-semibold uppercase tracking-[.12em] text-ink-muted">
                Déjà fait
              </span>
              <div className="flex flex-col">
                {deadline.history.map(entry => (
                  <div
                    key={`${entry.date}-${entry.text}`}
                    className="flex items-baseline gap-3 border-t border-grid py-[7px]"
                  >
                    <span className="w-[74px] flex-none text-[12px] leading-[1.3] tabular-nums text-ink-muted">
                      {entry.date}
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-ink-secondary">
                      {entry.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-[7px]">
            <span className="inline-flex items-center gap-[5px] rounded-full border border-border py-1 pr-2.5 pl-2 text-[11.5px] leading-none text-ink-secondary">
              <span className="size-[5px] rounded-full bg-ink-muted" />
              {deadline.category}
            </span>
            <span className="inline-flex items-center rounded-full bg-grid px-2.5 py-1 text-[11.5px] leading-none text-ink-secondary">
              {deadline.recipient}
            </span>
            <span className="inline-flex items-center text-[11.5px] leading-none text-ink-muted">
              {deadline.note}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-[9px]">
            <button
              type="button"
              onClick={onDone}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand-strong px-5 font-text text-[15px] leading-none font-semibold text-white hover:brightness-[1.08] active:brightness-[.92]"
            >
              <CheckIcon size={17} />
              {deadline.verb}
            </button>
            {deadline.canPostpone && !deadline.plants && (
              <button
                type="button"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-transparent px-4 font-display text-[14px] text-ink-secondary hover:bg-grid hover:text-ink"
              >
                Reporter
              </button>
            )}
            <button
              type="button"
              className="inline-flex min-h-11 cursor-pointer items-center bg-transparent px-2 text-[13.5px] leading-none text-ink-muted underline hover:text-ink"
            >
              Voir la fiche
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
