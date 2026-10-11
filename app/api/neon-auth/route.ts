import { messageCode } from "@/lib/auth/messages";
import { authMode, envoyerMail, portierSql } from "@/lib/auth/server";
import { estAutorisee, rattacher } from "@/lib/auth/store";
import { handleWebhookEvent } from "@/lib/auth/webhook";
import {
  jwksLookup,
  type KeyLookup,
  verifyNeonSignature,
} from "@/lib/auth/webhook-signature";

/**
 * Les webhooks de Neon Auth : liste blanche, envoi du code, rattachement d'un
 * nouveau compte (SPEC § 7.2, `src/lib/auth/webhook.ts`).
 *
 * Une erreur (base injoignable, relais SMTP en panne) répond 500 : Neon Auth
 * réessaie, puis refuse. Fermé en cas de doute.
 */
let lookup: KeyLookup | undefined;

export async function POST(request: Request): Promise<Response> {
  const mode = authMode();

  if (mode.kind !== "active") {
    return new Response(null, { status: 404 });
  }

  lookup ??= jwksLookup(mode.baseUrl);
  const rawBody = await request.text();
  const authentique = await verifyNeonSignature(
    {
      rawBody,
      signature: request.headers.get("x-neon-signature"),
      kid: request.headers.get("x-neon-signature-kid"),
      timestamp: request.headers.get("x-neon-timestamp"),
    },
    lookup,
    Date.now(),
  );

  if (!authentique) {
    return new Response(null, { status: 401 });
  }

  const sql = portierSql();
  const reply = await handleWebhookEvent(JSON.parse(rawBody), {
    estAutorisee: email => estAutorisee(sql, email),
    rattacher: (authUserId, email) => rattacher(sql, authUserId, email),
    envoyerCode: (email, code, expiresAt) =>
      envoyerMail()(email, messageCode(code, expiresAt)),
  });

  if (reply.status >= 400) {
    // La forme seule, jamais le contenu (adresses, codes).
    console.error("[neon-auth] événement refusé", reply.body);
  }

  return Response.json(reply.body, { status: reply.status });
}
