/**
 * L'envoi réel d'une notification, par le protocole Web Push : chiffrée pour
 * l'appareil, signée par les clés VAPID de l'app (`VAPID_PUBLIC_KEY`,
 * `VAPID_PRIVATE_KEY`). Sans elles, rien ne part : `null`.
 */
import webpush from "web-push";
import { AbonnementPerime } from "./envoi-push";
import type { MessagePush } from "./push";
import type { Abonnement } from "./push-store";

/** Qui envoie, pour les services de push : l'adresse publique de l'app. */
const SUJET = "https://www.house-mate.app";

/** Une notification sans écran pendant 24 h n'a plus de sens : elle tombe. */
const DUREE_DE_VIE = 24 * 60 * 60;

export type EnvoyerPush = (
  abonnement: Abonnement,
  message: MessagePush,
) => Promise<void>;

export function clePubliqueVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function envoyerWebPush(): EnvoyerPush | null {
  const publique = clePubliqueVapid();
  const privee = process.env.VAPID_PRIVATE_KEY;

  if (publique === null || !privee) {
    return null;
  }

  return async (abonnement, message) => {
    try {
      await webpush.sendNotification(abonnement, JSON.stringify(message), {
        vapidDetails: {
          subject: SUJET,
          publicKey: publique,
          privateKey: privee,
        },
        TTL: DUREE_DE_VIE,
        urgency: "normal",
      });
    } catch (error_) {
      // 404 et 410 : l'appareil s'est désabonné, ou n'existe plus.
      const statut = (error_ as { statusCode?: number }).statusCode;

      if (statut === 404 || statut === 410) {
        throw new AbonnementPerime(`Web Push : HTTP ${statut}.`);
      }

      throw error_;
    }
  };
}
