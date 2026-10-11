/**
 * Les données de démonstration s'affichent partout SAUF en production :
 * previews Vercel, développement local, e2e. Lu côté serveur, où Vercel
 * renseigne `VERCEL_ENV` ; hors de Vercel, la variable est absente.
 */
export function demoEnabled(): boolean {
  return process.env.VERCEL_ENV !== "production";
}
