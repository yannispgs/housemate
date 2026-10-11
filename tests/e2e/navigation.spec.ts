import { expect, type Page, test } from "@playwright/test";
import { DEADLINE_TABS } from "../../src/lib/navigation";

// Ces parcours s'appuient sur la STRUCTURE — rôles, liens, `aria-current` —
// plus que sur les libellés. Hors production, les écrans montrent les données
// de démonstration de la maquette (`src/demo`), ce qui leur donne un contenu.
//
// L'étiquette `@critical` (option `tag`) désigne ceux qui bloquent chaque PR ;
// les autres ne tournent qu'après la fusion (e2e-full.yml).

/** La navigation visible : barre d'onglets sur mobile, en-tête sur bureau. */
function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Navigation principale" });
}

test.describe("navigation", () => {
  test("l'accueil s'affiche et se signale comme page courante", {
    tag: "@critical",
  }, async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(mainNav(page).locator('a[href="/"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("chaque onglet des échéances s'ouvre et devient courant", {
    tag: "@critical",
  }, async ({ page }) => {
    await page.goto("/");

    for (const tab of DEADLINE_TABS) {
      await mainNav(page).locator(`a[href="${tab.href}"]`).click();
      await expect(page).toHaveURL(tab.href);
      await expect(
        mainNav(page).locator(`a[href="${tab.href}"]`),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  test("le toggle mène aux fiches, qui masquent les onglets des échéances", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Fiches" }).click();

    await expect(page).toHaveURL("/inventaire");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Inventaire",
    );
    await expect(page.locator('a[href="/recap"]:visible')).toHaveCount(0);
  });

  for (const path of ["/recap", "/a-venir", "/inventaire", "/reglages"]) {
    test(`la vue ${path} répond et porte un titre`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});

test.describe("échéances", () => {
  test("faire une échéance la retire de l'accueil, et Annuler la rend", {
    tag: "@critical",
  }, async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: /Engrais du citronnier/ });

    await card.click();
    await page.getByRole("button", { name: "Fait", exact: true }).click();

    await expect(card).toHaveCount(0);
    await expect(page.getByText("1 chose faite aujourd'hui")).toBeVisible();

    await page.getByRole("button", { name: "Annuler" }).click();

    await expect(card).toBeVisible();
  });

  test("une étiquette d'À venir ajoute son filtre, qu'Effacer retire", async ({
    page,
  }) => {
    await page.goto("/a-venir");
    const rows = page.getByText("souple", { exact: true });
    const before = await rows.count();

    await page
      .getByRole("button", { name: "ferme", exact: true })
      .first()
      .click();

    await expect(rows).toHaveCount(0);

    await page.getByRole("button", { name: "Effacer" }).first().click();

    await expect(rows).toHaveCount(before);
  });
});

test.describe("réglages", () => {
  test("le mode sombre choisi s'applique et survit au rechargement", async ({
    page,
  }) => {
    await page.goto("/reglages");
    await page.getByRole("button", { name: "Sombre" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Sombre" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("tenue technique", () => {
  test("l'accueil ne produit aucune erreur dans la console", {
    tag: "@critical",
  }, async ({ page }) => {
    const errors: string[] = [];

    page.on("console", message => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", error => errors.push(error.message));

    await page.goto("/", { waitUntil: "load" });
    // Hydratée : la navigation est un composant client.
    await expect(mainNav(page)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("le manifeste de la webapp est servi", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      name: "HouseMate",
      display: "standalone",
      lang: "fr",
    });
  });

  test("les polices viennent de l'app, jamais d'un tiers", async ({ page }) => {
    const external: string[] = [];

    page.on("request", request => {
      const url = new URL(request.url());

      if (url.hostname !== "127.0.0.1") {
        external.push(url.hostname);
      }
    });

    await page.goto("/", { waitUntil: "load" });
    // Attendre que les polices soient réellement chargées : ce sont elles
    // qu'un CDN aurait servies.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    expect(external).toEqual([]);
  });
});
