import { expect, test } from "@playwright/test";

// Réglages, hors connexion (HOUSEMATE_AUTH=desactivee) : seul le parcours
// d'écran est testé ici, pas la fermeture de session, qui dépend de Neon Auth.

test.describe("réglages", () => {
  test("se déconnecter demande une confirmation, qu'on peut annuler", async ({
    page,
  }) => {
    await page.goto("/reglages");
    const panneau = page.getByRole("button", { name: "Se déconnecter" });

    await panneau.click();
    await expect(
      page.getByText("Se déconnecter de cet appareil ?"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(
      page.getByText("Se déconnecter de cet appareil ?"),
    ).toBeHidden();
    await expect(panneau).toBeVisible();
  });

  test("règle les résumés par e-mail, niveau par niveau", async ({ page }) => {
    await page.goto("/reglages");

    // Par défaut : tout sauf « pour mémoire », le lundi à 6 h.
    const memoire = page.getByRole("switch", { name: "E-mail · Pour mémoire" });
    await expect(memoire).toHaveAttribute("aria-checked", "false");
    await memoire.click();
    await expect(memoire).toHaveAttribute("aria-checked", "true");

    await expect(
      page.getByRole("combobox", { name: "Jour du résumé hebdomadaire" }),
    ).toHaveValue("1");
    await expect(
      page.getByRole("combobox", { name: "Heure du résumé hebdomadaire" }),
    ).toHaveValue("6");

    // Le quotidien n'a d'heure que s'il est voulu.
    const heureQuotidien = page.getByRole("combobox", {
      name: "Heure du résumé quotidien",
    });
    await expect(heureQuotidien).toBeHidden();
    await page.getByRole("switch", { name: "Résumé quotidien" }).click();
    await expect(heureQuotidien).toBeVisible();

    await page.getByRole("button", { name: "30 jours" }).click();
    await expect(
      page.getByRole("button", { name: "30 jours" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
