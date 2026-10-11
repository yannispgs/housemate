import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours de bout en bout (conventions § 11), dans un vrai navigateur, contre
 * l'app construite et servie en local.
 *
 * ⚠️ WebKit est le moteur de RÉFÉRENCE, pas le moteur d'appoint : l'usage
 * principal est la webapp installée sur un iPhone, dont le moteur est WebKit.
 * Un échec sous WebKit est un échec en production.
 *
 * Deux niveaux : les parcours `@critical` bloquent chaque PR, sur les deux
 * moteurs ; tous les parcours tournent après chaque fusion (e2e-full.yml).
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  // Un seul worker (conventions § 11) : les parcours de connexion et de saisie
  // partageront la base locale, et deux parcours simultanés s'y marcheraient
  // dessus. Les deux moteurs, eux, tournent en parallèle dans des jobs séparés.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      // iPhone 16e : 390 × 844 points, écran 3×, tactile.
      name: "webkit",
      use: {
        ...devices["iPhone 15"],
        viewport: { width: 390, height: 844 },
        browserName: "webkit",
      },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `yarn build && yarn start --port ${PORT}`,
    // Les parcours testent les écrans, pas la connexion : celle-ci dépend de
    // Neon Auth, absent ici. Désactivation refusée sur Vercel (src/lib/auth/mode.ts).
    env: { HOUSEMATE_AUTH: "desactivee" },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
