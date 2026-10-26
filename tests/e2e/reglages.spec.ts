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
});

test.describe("réglages : veille gel", () => {
  test("applique la marge de prévision proposée", async ({ page }) => {
    await page.goto("/reglages");
    const proposee = page.getByRole("region", { name: "Marge proposée" });

    await expect(page.getByText("Réglage de départ")).toBeVisible();
    await expect(proposee).toContainText("Proposée : 1,2");

    await proposee.getByRole("button", { name: "Appliquer" }).click();

    await expect(proposee).toBeHidden();
    await expect(page.getByText("Appliquée aujourd'hui.")).toBeVisible();
  });
});
