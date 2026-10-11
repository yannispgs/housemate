/**
 * Envoie un e-mail de l'app par le relais SMTP de Brevo, depuis le domaine du
 * foyer. Mêmes identifiants et même expéditeur que la veille de gel.
 */
import { randomUUID } from "node:crypto";
import type { MailContent } from "@/lib/auth/messages";
import {
  buildMessage,
  deliver,
  type SmtpConnection,
} from "../../../workers/collecteur/src/smtp";

export const MAIL_FROM = "noreply@house-mate.app";

export interface MailConfig {
  readonly login: string;
  readonly key: string;
}

export function mailConfig(
  env: Readonly<Record<string, string | undefined>>,
): MailConfig {
  const login = env.SMTP_LOGIN;
  const key = env.SMTP_KEY;

  if (!login || !key) {
    throw new Error(
      "SMTP_LOGIN et SMTP_KEY sont requis pour envoyer un e-mail.",
    );
  }

  return { login, key };
}

export type Envoyer = (to: string, content: MailContent) => Promise<void>;

export function createEnvoyer(
  config: MailConfig,
  open: () => SmtpConnection,
  now: () => Date = () => new Date(),
): Envoyer {
  return async (to, content) => {
    await deliver(
      open(),
      { login: config.login, key: config.key },
      { from: MAIL_FROM, to },
      buildMessage({
        from: `HouseMate <${MAIL_FROM}>`,
        to,
        subject: content.subject,
        text: content.text,
        date: now(),
        messageId: `${randomUUID()}@house-mate.app`,
      }),
    );
  };
}
