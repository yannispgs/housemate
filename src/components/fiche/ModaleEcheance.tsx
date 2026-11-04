"use client";

/**
 * Le détail d'une échéance ou d'un consommable depuis sa fiche (décision du
 * foyer, 04/11/2026) : un tap sur sa ligne ouvre, dans une modale, la carte
 * d'échéance de l'accueil, dépliée, avec ses actions (« Fait », le
 * remplacement d'un consommable).
 *
 * ⚠️ Provisoire : pas encore dessinée dans Claude Design (a-dessiner.md).
 */
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DeadlineView } from "@/lib/ui/deadline";
import { DeadlineCard } from "../DeadlineCard";

/** Les actions de l'accueil, branchées sur la fiche. */
export interface ActionsFiche {
  /** Coche l'échéance ; rend l'id de la complétion, ou `null`. */
  readonly cocher: (echeanceId: string) => Promise<string | null>;
  readonly annuler: (completionIds: readonly string[]) => Promise<void>;
  /** Un consommable remplacé ; rend un message d'erreur, ou `null`. */
  readonly remplacer: (
    consommableId: string,
    le: string,
    compteur: string,
  ) => Promise<string | null>;
}

/** Les dates du jour, calculées à Paris par la page. */
export interface JourFiche {
  /** AAAA-MM-JJ : la date proposée pour un remplacement. */
  readonly iso: string;
  /** « 4 nov. » */
  readonly court: string;
}

function ModaleEcheance({
  deadline,
  jour,
  fermer,
  faire,
  remplacer,
}: Readonly<{
  deadline: DeadlineView;
  jour: JourFiche;
  fermer: () => void;
  faire: () => void;
  remplacer?: (le: string, compteur: string) => Promise<string | null>;
}>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogue = ref.current;
    dialogue?.showModal();

    return () => dialogue?.close();
  }, []);

  return (
    // Échap, « Fermer » ou l'en-tête de la carte la referment.
    <dialog
      ref={ref}
      aria-label={deadline.title}
      onClose={fermer}
      className="m-auto w-[min(100%-32px,460px)] border-0 bg-transparent p-0 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-2.5">
        <DeadlineCard
          deadline={deadline}
          open
          todayLabel={jour.court}
          onToggle={() => ref.current?.close()}
          onDone={faire}
          aujourdhui={jour.iso}
          onReplace={remplacer}
        />
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="min-h-11 cursor-pointer self-center rounded-full border border-border bg-surface px-5 font-display text-[14px] text-ink"
        >
          Fermer
        </button>
      </div>
    </dialog>
  );
}

/**
 * La modale d'une section de la fiche, et ce qu'elle laisse derrière elle :
 * « Fait. Annuler », ou l'erreur. `ouvrir` montre une carte.
 */
export function useModaleEcheance(actions: ActionsFiche, jour: JourFiche) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState<DeadlineView | null>(null);
  const [faite, setFaite] = useState<{
    titre: string;
    completion: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const faire = (deadline: DeadlineView) => {
    setOuverte(null);
    setMessage(null);
    actions
      .cocher(deadline.id)
      .then(completion => {
        if (completion === null) {
          setMessage(
            "Rien à cocher pour l'instant : la prochaine fois n'est pas encore ouverte.",
          );

          return;
        }

        setFaite({ titre: deadline.title, completion });
        router.refresh();
      })
      .catch(() => {
        setMessage("L'enregistrement a échoué. Réessaie dans un instant.");
      });
  };

  const annuler = (completion: string) => {
    setFaite(null);
    actions
      .annuler([completion])
      .then(() => router.refresh())
      .catch(() => {
        setMessage("L'annulation a échoué : recharge la page.");
      });
  };

  const remplacer = (deadline: DeadlineView) => {
    const r = deadline.remplacement;

    return (
      r &&
      ((le: string, compteur: string) =>
        actions.remplacer(r.consommableId, le, compteur).then(erreur => {
          if (erreur === null) {
            setOuverte(null);
            router.refresh();
          }

          return erreur;
        }))
    );
  };

  const rendu: ReactNode = (
    <>
      {ouverte && (
        <ModaleEcheance
          deadline={ouverte}
          jour={jour}
          fermer={() => setOuverte(null)}
          faire={() => faire(ouverte)}
          remplacer={remplacer(ouverte)}
        />
      )}
      {faite && (
        <output className="flex items-center gap-3 text-[13px] text-ink-secondary">
          « {faite.titre} » : fait.
          <button
            type="button"
            onClick={() => annuler(faite.completion)}
            className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-ink underline"
          >
            Annuler
          </button>
        </output>
      )}
      {message && (
        <p role="alert" className="m-0 text-[13px] text-ink-critical">
          {message}
        </p>
      )}
    </>
  );

  return { ouvrir: setOuverte, rendu };
}

/** Une ligne qui ouvre sa carte : toute la ligne est la cible du tap. */
export function LigneOuvrante({
  onClick,
  children,
}: Readonly<{ onClick: (() => void) | null; children: ReactNode }>) {
  const classe = "flex w-full flex-col gap-0.5 py-2 text-left";

  return onClick === null ? (
    <div className={classe}>{children}</div>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={`${classe} min-h-11 cursor-pointer border-0 bg-transparent px-0 text-ink hover:bg-grid`}
    >
      {children}
    </button>
  );
}
