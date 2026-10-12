/**
 * Ce que l'app répond aux webhooks de Neon Auth (SPEC § 7.2), une fois leur
 * signature vérifiée (`webhook-signature.ts`).
 *
 * - `user.before_create` : **la liste blanche**. Une adresse absente ne crée
 *   pas de compte. Bloquant et fermé en cas d'échec côté Neon : une route
 *   injoignable ne laisse rien passer (mesuré le 2026-09-27).
 * - `send.otp` : **l'envoi du code**, par l'app et depuis le domaine du foyer.
 *   Une adresse hors liste ne reçoit rien, et l'appelant n'en sait rien.
 * - `user.created` : rattache le nouveau compte à son foyer.
 *
 * Les accès à la base et l'envoi d'e-mails sont injectés : cette logique se
 * teste sans réseau.
 */
import { z } from "zod";

export interface PorteDeps {
  estAutorisee(email: string): Promise<boolean>;
  /** Crée le membre du foyer de cette adresse ; sans effet s'il existe déjà. */
  rattacher(authUserId: string, email: string): Promise<void>;
  envoyerCode(email: string, code: string, expiresAt: Date): Promise<void>;
}

export interface WebhookReply {
  readonly status: number;
  readonly body: unknown;
}

const user = z.object({
  id: z.string().optional(),
  email: z.string().min(1),
});

/**
 * Au premier code demandé, le compte n'existe pas encore : l'adresse peut
 * alors manquer dans `user`, et venir avec l'événement. La documentation de
 * Neon Auth ne le précise pas ; les deux sont acceptés.
 */
function withEmail(payload: unknown): unknown {
  const p = payload as {
    user?: { email?: unknown };
    event_data?: { email?: unknown };
  } | null;

  if (
    p?.user?.email === undefined &&
    typeof p?.event_data?.email === "string"
  ) {
    return { ...p, user: { ...p.user, email: p.event_data.email } };
  }

  return payload;
}

/** La forme d'une charge refusée, sans ses valeurs : de quoi diagnostiquer. */
export function shape(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    return typeof payload;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, shape(value)]),
  );
}

const event = z.discriminatedUnion("event_type", [
  z.object({ event_type: z.literal("user.before_create"), user }),
  z.object({
    event_type: z.literal("user.created"),
    user: user.extend({ id: z.string().min(1) }),
  }),
  z.object({
    event_type: z.literal("send.otp"),
    user,
    event_data: z.object({
      otp_code: z.string().regex(/^\d{6}$/),
      otp_type: z.string(),
      expires_at: z.iso.datetime(),
    }),
  }),
]);

/** Les codes qu'on envoie : connexion, et vérification de l'adresse. */
const CODE_TYPES = new Set(["sign-in", "email-verification"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const OK: WebhookReply = { status: 200, body: { ok: true } };

export async function handleWebhookEvent(
  received: unknown,
  deps: PorteDeps,
): Promise<WebhookReply> {
  const payload = withEmail(received);
  const eventType = (payload as { event_type?: unknown } | null)?.event_type;

  // Un événement auquel la route ne s'est pas abonnée : rien à faire, mais un
  // refus ferait réessayer Neon pour rien.
  if (
    typeof eventType === "string" &&
    !["user.before_create", "user.created", "send.otp"].includes(eventType)
  ) {
    return OK;
  }

  const parsed = event.safeParse(payload);

  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "Événement mal formé.", forme: shape(received) },
    };
  }

  const data = parsed.data;
  const email = normalizeEmail(data.user.email);

  switch (data.event_type) {
    case "user.before_create": {
      if (await deps.estAutorisee(email)) {
        return { status: 200, body: { allowed: true } };
      }

      return {
        status: 200,
        body: {
          allowed: false,
          error_message: "Cette adresse n'a pas accès à HouseMate.",
          error_code: "NOT_ALLOWLISTED",
        },
      };
    }

    case "user.created":
      await deps.rattacher(data.user.id, email);

      return OK;

    case "send.otp":
      // Réponse identique dans tous les cas : la route ne dit pas quelles
      // adresses sont sur la liste.
      if (
        CODE_TYPES.has(data.event_data.otp_type) &&
        (await deps.estAutorisee(email))
      ) {
        await deps.envoyerCode(
          email,
          data.event_data.otp_code,
          new Date(data.event_data.expires_at),
        );
      }

      return OK;
  }
}
