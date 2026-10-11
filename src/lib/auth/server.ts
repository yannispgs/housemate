import { createNeonAuth } from "@neondatabase/auth/next/server";
import postgres from "postgres";
import { type AuthMode, resolveAuthMode } from "@/lib/auth/mode";
import type { Sql } from "@/lib/auth/store";
import { createEnvoyer, type Envoyer, mailConfig } from "@/lib/mail/envoyer";
import { openSmtpNode } from "@/lib/mail/smtp-node";

/**
 * Les instances partagées par les routes, le proxy et les server actions.
 * Créées à la première demande : une configuration invalide fait échouer la
 * requête (fermé en cas de doute), pas le build.
 */

let mode: AuthMode | undefined;

export function authMode(): AuthMode {
  mode ??= resolveAuthMode(process.env);

  return mode;
}

type NeonAuth = ReturnType<typeof createNeonAuth>;
let auth: NeonAuth | undefined;

/** Neon Auth, ou une erreur si l'authentification est désactivée. */
export function neonAuth(): NeonAuth {
  const current = authMode();

  if (current.kind !== "active") {
    throw new Error("Authentification désactivée : Neon Auth indisponible.");
  }

  auth ??= createNeonAuth({
    baseUrl: current.baseUrl,
    cookies: { secret: current.cookieSecret },
  });

  return auth;
}

let portier: Sql | undefined;

/** La base, avec les seuls droits du rôle `portier` (migration 0006). */
export function portierSql(): Sql {
  const url = process.env.PORTIER_DATABASE_URL;

  if (!url) {
    throw new Error("PORTIER_DATABASE_URL manquante.");
  }

  // Une connexion : chaque appel de fonction Vercel est court. `prepare: false`
  // pour le pool de Neon (PgBouncer en mode transaction).
  portier ??= postgres(url, { max: 1, prepare: false }) as unknown as Sql;

  return portier;
}

let envoyer: Envoyer | undefined;

export function envoyerMail(): Envoyer {
  envoyer ??= createEnvoyer(mailConfig(process.env), () =>
    openSmtpNode("smtp-relay.brevo.com"),
  );

  return envoyer;
}
