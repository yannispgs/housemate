/**
 * Vérifie qu'un webhook vient bien de Neon Auth : signature Ed25519 en JWS
 * détaché, horodatage lié à la signature (documentation Neon Auth,
 * « Webhooks › Signature verification »).
 *
 * ⚠️ Sans cette vérification, n'importe qui pourrait appeler la route : se
 * faire autoriser une adresse par `user.before_create`, ou faire envoyer des
 * e-mails au nom du foyer par `send.otp`.
 */
import { createPublicKey, type JsonWebKey, verify } from "node:crypto";

export interface SignedRequest {
  /** Le corps tel que reçu, AVANT tout `JSON.parse` : la signature porte sur ces octets. */
  readonly rawBody: string;
  readonly signature: string | null;
  readonly kid: string | null;
  /** Millisecondes Unix, en texte (en-tête `X-Neon-Timestamp`). */
  readonly timestamp: string | null;
}

/** Trouve la clé publique d'identifiant `kid`, ou `undefined`. */
export type KeyLookup = (kid: string) => Promise<JsonWebKey | undefined>;

/** Au-delà, une requête signée est un rejeu possible. */
const MAX_AGE_MS = 5 * 60 * 1000;
/** Tolérance d'horloge dans l'autre sens. */
const MAX_SKEW_MS = 60 * 1000;

export async function verifyNeonSignature(
  request: SignedRequest,
  lookup: KeyLookup,
  now: number,
): Promise<boolean> {
  const { rawBody, signature, kid, timestamp } = request;

  if (signature === null || kid === null || timestamp === null) {
    return false;
  }

  const sentAt = Number(timestamp);

  if (
    !/^\d+$/.test(timestamp) ||
    now - sentAt > MAX_AGE_MS ||
    sentAt - now > MAX_SKEW_MS
  ) {
    return false;
  }

  const parts = signature.split(".");

  if (parts.length !== 3 || parts[1] !== "") {
    return false;
  }

  const [header = "", , signed = ""] = parts;
  const jwk = await lookup(kid);

  if (jwk === undefined) {
    return false;
  }

  // JWS détaché, double encodage : l'horodatage est lié au corps dans la
  // charge utile signée.
  const payload = Buffer.from(
    `${timestamp}.${Buffer.from(rawBody, "utf8").toString("base64url")}`,
    "utf8",
  ).toString("base64url");

  try {
    return verify(
      null,
      Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(signed, "base64url"),
    );
  } catch {
    // Clé d'un type inattendu, signature mal formée : pas une preuve.
    return false;
  }
}

/** Délai minimal entre deux relectures du JWKS pour une clé inconnue. */
const REFRESH_INTERVAL_MS = 60 * 1000;

/**
 * Les clés publiées par Neon Auth (`<base>/.well-known/jwks.json`), gardées en
 * mémoire et relues quand une clé inconnue se présente (rotation), au plus une
 * fois par minute : un appelant qui invente des `kid` ne fait pas marteler
 * Neon Auth.
 */
export function jwksLookup(
  baseUrl: string,
  fetchJwks: (url: string) => Promise<Response> = fetch,
  clock: () => number = Date.now,
): KeyLookup {
  let keys: readonly JsonWebKey[] = [];
  let loadedAt = Number.NEGATIVE_INFINITY;
  const url = `${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`;

  const find = (kid: string) =>
    keys.find(key => (key as { kid?: string }).kid === kid);

  return async kid => {
    const known = find(kid);

    if (known !== undefined || clock() - loadedAt < REFRESH_INTERVAL_MS) {
      return known;
    }

    loadedAt = clock();
    const response = await fetchJwks(url);

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { keys?: JsonWebKey[] };
    keys = body.keys ?? [];

    return find(kid);
  };
}
