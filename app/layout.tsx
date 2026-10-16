import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DEMO_HOUSEHOLD } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { foyerConnecte } from "@/lib/data/server";
import { THEME_BOOT_SCRIPT } from "@/lib/ui/theme";
import "./globals.css";

/*
 * Polices servies par l'app elle-même, depuis app/fonts/.
 *
 * ⚠️ Deux raisons, et la première est une exigence du produit :
 * 1. Le § 13 promet que consultation et complétion marchent hors-ligne. Une
 *    police chargée depuis un CDN au runtime tomberait en repli dans la cave
 *    ou le garage, et toute la mise en page bougerait.
 * 2. Un CDN recevrait l'IP de chaque membre du foyer à chaque chargement, ce
 *    que le § 7 cherche précisément à éviter.
 *
 * Fichiers dans le dépôt plutôt que `next/font/google` : celui-ci télécharge
 * les polices chez Google à chaque BUILD, et un téléchargement raté faisait
 * échouer la CI au hasard. Sous-ensemble latin (français compris : é, ç, œ,
 * «», €), tel que Google le sert.
 *
 * Young Serif remplace Caprasimo pour les titres en mode sombre (handoff de
 * design) : chargée elle aussi, pour que la bascule ne fasse rien clignoter.
 *
 * Caprasimo, Figtree et Young Serif sont sous SIL Open Font License : redistribution
 * permise, licences à côté des fichiers (app/fonts/OFL-*.txt).
 */
const caprasimo = localFont({
  src: "./fonts/caprasimo-latin.woff2",
  weight: "400",
  variable: "--font-heading-loaded",
  display: "swap",
});

// Police variable : un seul fichier couvre les graisses 400 à 700.
const figtree = localFont({
  src: "./fonts/figtree-latin.woff2",
  weight: "400 700",
  variable: "--font-body-loaded",
  display: "swap",
});

const youngSerif = localFont({
  src: "./fonts/young-serif-latin.woff2",
  weight: "400",
  variable: "--font-heading-dark-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HouseMate",
    template: "%s · HouseMate",
  },
  description:
    "Un registre de ce que le foyer possède, et de ce que chaque chose lui demandera.",
  applicationName: "HouseMate",
  appleWebApp: {
    capable: true,
    title: "HouseMate",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // `viewportFit: cover` est nécessaire pour que `env(safe-area-inset-*)`
  // renvoie autre chose que zéro sur iPhone.
  viewportFit: "cover",
  // Valeurs de `--page` dans les deux modes (design system Organic).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#d5d6d8" },
    { media: "(prefers-color-scheme: dark)", color: "#2a2b2e" },
  ],
};

/** Le foyer dans l'en-tête : celui de la session, ou celui de la démo. */
async function household(): Promise<string> {
  if (demoEnabled()) {
    return DEMO_HOUSEHOLD;
  }

  // Lu à chaque requête : la session n'existe pas au build, et une page
  // pré-calculée (`/_not-found`) ferait sinon démarrer l'authentification
  // sans sa configuration.
  await connection();

  return foyerConnecte();
}

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${caprasimo.variable} ${figtree.variable} ${youngSerif.variable}`}
      // Le script ci-dessous pose `data-theme` avant l'hydratation.
      suppressHydrationWarning
    >
      <head>
        {/* Avant le premier rendu : sans lui, un mode sombre CHOISI
            s'afficherait d'abord en clair. Voir `THEME_BOOT_SCRIPT`. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constant, écrit dans le dépôt, sans aucune donnée extérieure. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppShell household={await household()}>{children}</AppShell>
      </body>
    </html>
  );
}
