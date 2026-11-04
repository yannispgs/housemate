import { expect, test } from "@playwright/test";

// Inventaire en démonstration (HOUSEMATE_AUTH=desactivee) : le menu
// « Plantes » (SPEC § 12.4, décisions du 25/10/2026), seulement sur une
// catégorie choisie qui a des plantes.

test.describe("inventaire", () => {
  test("le menu « Plantes » ne garde que les plantes d'un emplacement", async ({
    page,
  }) => {
    await page.goto("/inventaire");
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();
    // Sur « Tout », pas de menu « Plantes ».
    await expect(page.getByRole("button", { name: "Plantes" })).toHaveCount(0);

    await page.getByRole("button", { name: "Tout", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Jardin" }).click();
    await page.getByRole("button", { name: "Plantes" }).click();
    await page.getByRole("menuitemradio", { name: "Véranda" }).click();

    await expect(page.getByText("Laurier rose", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeHidden();

    // Revenir à « Tout » efface le critère et retire le menu.
    await page.getByRole("button", { name: "Jardin", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Tout" }).click();
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Plantes" })).toHaveCount(0);
  });
});
