/**
 * L'authentification est-elle active, et avec quels réglages ?
 *
 * ⚠️ Fermée en cas de doute : un réglage manquant ou invalide est une erreur,
 * jamais un passage libre. La seule façon de la couper est explicite
 * (`HOUSEMATE_AUTH=desactivee`), et elle est refusée sur Vercel : ni la prod ni
 * une preview ne peuvent tourner sans authentification, même par erreur de
 * configuration. Elle sert aux parcours e2e et au développement local.
 */

export type AuthMode =
  | {
      readonly kind: "active";
      /** Adresse de Neon Auth pour la branche de base de cet environnement. */
      readonly baseUrl: string;
      readonly cookieSecret: string;
    }
  | { readonly kind: "desactivee" };

/** Better Auth exige au moins 32 caractères pour signer ses cookies. */
const MIN_SECRET_LENGTH = 32;

export function resolveAuthMode(
  env: Readonly<Record<string, string | undefined>>,
): AuthMode {
  if (env.HOUSEMATE_AUTH === "desactivee") {
    if (env.VERCEL !== undefined) {
      throw new Error(
        "HOUSEMATE_AUTH=desactivee est refusé sur Vercel : la prod et les previews exigent l'authentification.",
      );
    }

    return { kind: "desactivee" };
  }

  if (env.HOUSEMATE_AUTH !== undefined) {
    throw new Error(
      `HOUSEMATE_AUTH : valeur inconnue « ${env.HOUSEMATE_AUTH} ». Seule « desactivee » est reconnue.`,
    );
  }

  const baseUrl = env.NEON_AUTH_BASE_URL;
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET;

  if (baseUrl === undefined || !baseUrl.startsWith("https://")) {
    throw new Error(
      "NEON_AUTH_BASE_URL manquante ou non HTTPS : l'authentification ne peut pas démarrer.",
    );
  }

  if (cookieSecret === undefined || cookieSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `NEON_AUTH_COOKIE_SECRET manquant ou trop court (${MIN_SECRET_LENGTH} caractères au moins).`,
    );
  }

  return { kind: "active", baseUrl, cookieSecret };
}
