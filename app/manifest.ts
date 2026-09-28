import type { MetadataRoute } from "next";
import { BRAND } from "./_lib/Marque";

/**
 * Manifeste PWA. L'usage principal est une app installée sur l'écran d'accueil
 * d'un iPhone — c'est aussi la condition pour recevoir des notifications push
 * sur iOS (SPEC § 12.5, alertes `critique`).
 *
 * Les couleurs sont celles de `--page` en mode clair : le manifeste n'a pas de
 * variante sombre, que `themeColor` (layout) couvre en revanche.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HouseMate",
    short_name: "HouseMate",
    description:
      "Un registre de ce que le foyer possède, et de ce que chaque chose lui demandera.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.page,
    theme_color: BRAND.page,
    icons: [192, 512].flatMap(size =>
      (["any", "maskable"] as const).map(purpose => ({
        src: `/icon/${size}`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose,
      })),
    ),
  };
}
