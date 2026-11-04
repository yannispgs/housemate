import { expect, test } from "@playwright/test";

// Inventaire en démonstration (HOUSEMATE_AUTH=desactivee) : le menu « Type »,
// et le menu « Plantes » (SPEC § 12.4), seulement sur le type « Plante »
// (décisions du 25/10/2026 et du 04/11/2026).

test.describe("inventaire", () => {
  test("le type « Plante », puis un emplacement", async ({ page }) => {
    await page.goto("/inventaire");
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();
    // Sans type choisi, pas de menu « Plantes ».
    await expect(page.getByRole("button", { name: "Plantes" })).toHaveCount(0);

    await page.getByRole("button", { name: "Type", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Plante" }).click();
    await expect(page.getByText("Voiture", { exact: true })).toBeHidden();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Plantes" }).click();
    await page.getByRole("menuitemradio", { name: "Véranda" }).click();
    await expect(page.getByText("Laurier rose", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeHidden();

    // Revenir à tous les types efface le critère et retire le menu.
    await page.getByRole("button", { name: "Plante", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Tous les types" }).click();
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Plantes" })).toHaveCount(0);
  });
});
