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
