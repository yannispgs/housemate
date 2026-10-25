/**
 * Un appel entre nos propres services (le Worker vers l'app) : un jeton
 * partagé, dans l'en-tête `Authorization: Bearer <jeton>`.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const empreinte = (valeur: string) =>
  createHash("sha256").update(valeur).digest();

/**
 * Vrai si l'en-tête porte exactement ce jeton. Comparé en temps constant, sur
 * les empreintes : la durée ne trahit ni le jeton ni sa longueur. Un jeton
 * attendu vide refuse tout (configuration oubliée).
 */
export function jetonValide(
  entete: string | null,
  attendu: string | undefined,
): boolean {
  if (!attendu || !entete?.startsWith("Bearer ")) {
    return false;
  }

  return timingSafeEqual(
    empreinte(entete.slice("Bearer ".length)),
    empreinte(attendu),
  );
}
