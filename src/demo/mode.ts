/**
 * Les données de démonstration ne s'affichent que SANS authentification
 * (`HOUSEMATE_AUTH=desactivee` : parcours e2e, développement local). Partout
 * ailleurs — previews comme prod — les écrans lisent la base, au nom de la
 * personne connectée. La désactivation étant refusée sur Vercel
 * (`src/lib/auth/mode.ts`), aucune preview ni la prod ne montre la démo.
 */
export function demoEnabled(): boolean {
  return process.env.HOUSEMATE_AUTH === "desactivee";
}
