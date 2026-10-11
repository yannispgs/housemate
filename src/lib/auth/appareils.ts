/**
 * La vérification d'appareil (SPEC § 7.2) : une connexion depuis un appareil
 * inconnu envoie un avis à la personne. C'est une alarme, pas une serrure : une
 * boîte compromise l'est en silence, et cet avis est souvent le seul signal.
 *
 * Un appareil est un identifiant aléatoire gardé dans un cookie du navigateur
 * (« l'appareil » est en fait ce navigateur sur cet appareil). La base n'en
 * garde que l'empreinte.
 */
import { createHash, randomBytes } from "node:crypto";

export const APPAREIL_COOKIE = "housemate_appareil";

/** Le plafond des navigateurs pour un cookie : 400 jours. */
export const APPAREIL_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function nouvelIdentifiant(): string {
  return randomBytes(32).toString("base64url");
}

/** Identifiant valide : 32 octets en base64url, rien d'autre. */
export function identifiantValide(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function empreinte(identifiant: string): string {
  return createHash("sha256").update(identifiant).digest("hex");
}

const NAVIGATEURS: readonly (readonly [RegExp, string])[] = [
  [/Edg\//, "Edge"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMES: readonly (readonly [RegExp, string])[] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/**
 * « Safari sur iPhone » : assez pour qu'une personne reconnaisse (ou non) son
 * appareil, sans prétendre à une précision que l'en-tête ne donne pas.
 */
export function decrireAppareil(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const navigateur = NAVIGATEURS.find(([motif]) => motif.test(ua))?.[1];
  const systeme = SYSTEMES.find(([motif]) => motif.test(ua))?.[1];

  if (navigateur !== undefined && systeme !== undefined) {
    return `${navigateur} sur ${systeme}`;
  }

  return navigateur ?? systeme ?? "Appareil non reconnu";
}
