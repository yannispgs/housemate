"use client";

/**
 * « Notifications sur cet appareil » (SPEC § 6) : abonne ce navigateur aux
 * notifications push, ou le désabonne. Le tableau dit quoi notifier ; ceci
 * dit où.
 *
 * Sur iPhone, une page web ne reçoit pas de push : il faut d'abord ajouter
 * HouseMate à l'écran d'accueil (manifeste PWA), puis l'ouvrir de là.
 *
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design (a-dessiner.md).
 */
import { useEffect, useState } from "react";
import { HEURE_PUSH } from "@/lib/data/push";

type Etat =
  | "verification"
  | "non-configure"
  | "indisponible"
  | "refuse"
  | "inactif"
  | "actif"
  | "erreur";

const MESSAGES: Readonly<Record<Etat, string>> = {
  verification: "",
  "non-configure": "Les notifications ne sont pas encore en service.",
  indisponible:
    "Ce navigateur ne reçoit pas de notifications. Sur iPhone : ajoute d'abord HouseMate à l'écran d'accueil, puis ouvre-la de là.",
  refuse:
    "Les notifications sont bloquées pour HouseMate : autorise-les dans les réglages du téléphone.",
  inactif: "Cet appareil ne reçoit pas de notifications.",
  actif: `Cet appareil reçoit les notifications, chaque matin à ${HEURE_PUSH} h.`,
  erreur: "Ça n'a pas marché : réessaie dans un instant.",
};

/** La clé publique VAPID, du Base64 URL vers les octets qu'attend le navigateur. */
function octets(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
  const brut = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));

  return Uint8Array.from(brut, c => c.codePointAt(0) ?? 0);
}

const pris = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function AppareilPush({
  clePublique,
  abonner,
  desabonner,
}: Readonly<{
  clePublique: string | null;
  /** Server actions ; `null` en démonstration (rien n'est enregistré). */
  abonner: ((abonnement: unknown) => Promise<void>) | null;
  desabonner: ((endpoint: string) => Promise<void>) | null;
}>) {
  const [etat, setEtat] = useState<Etat>("verification");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (clePublique === null) {
      setEtat("non-configure");

      return;
    }

    if (!pris()) {
      setEtat("indisponible");

      return;
    }

    if (Notification.permission === "denied") {
      setEtat("refuse");

      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then(enregistrement => enregistrement.pushManager.getSubscription())
      .then(abonnement => setEtat(abonnement ? "actif" : "inactif"))
      .catch(() => setEtat("erreur"));
  }, [clePublique]);

  const activer = async () => {
    if (clePublique === null || abonner === null) {
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setEtat("refuse");

      return;
    }

    const enregistrement = await navigator.serviceWorker.ready;
    const abonnement = await enregistrement.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: octets(clePublique),
    });
    await abonner(abonnement.toJSON());
    setEtat("actif");
  };

  const desactiver = async () => {
    if (desabonner === null) {
      return;
    }

    const enregistrement = await navigator.serviceWorker.ready;
    const abonnement = await enregistrement.pushManager.getSubscription();

    if (abonnement !== null) {
      await desabonner(abonnement.endpoint);
      await abonnement.unsubscribe();
    }

    setEtat("inactif");
  };

  const basculer = (action: () => Promise<void>) => {
    setEnCours(true);
    action()
      .catch(() => setEtat("erreur"))
      .finally(() => setEnCours(false));
  };

  const possible =
    abonner !== null && (etat === "inactif" || etat === "erreur");

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <span
        className="text-[12.5px] leading-normal text-pretty text-ink-secondary"
        aria-live="polite"
      >
        {MESSAGES[etat]}
      </span>
      {etat === "actif" ? (
        <button
          type="button"
          disabled={enCours || desabonner === null}
          onClick={() => basculer(desactiver)}
          className="h-[38px] flex-none cursor-pointer rounded-full border border-border bg-transparent px-4 text-[13.5px] font-semibold text-ink disabled:opacity-40"
        >
          Désactiver
        </button>
      ) : (
        <button
          type="button"
          disabled={enCours || !possible}
          onClick={() => basculer(activer)}
          className="h-[38px] flex-none cursor-pointer rounded-full border-0 bg-[var(--brand-strong)] px-4 text-[13.5px] font-semibold text-white disabled:cursor-default disabled:opacity-40"
        >
          Activer ici
        </button>
      )}
    </div>
  );
}
