import { expect, test } from "@playwright/test";

// Inventaire en démonstration (HOUSEMATE_AUTH=desactivee) : le menu
// « Plantes » (SPEC § 12.4, décisions du 25/10/2026).

test.describe("inventaire", () => {
  test("le menu « Plantes » ne garde que les plantes d'un emplacement", async ({
    page,
  }) => {
    await page.goto("/inventaire");
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Plantes" }).click();
    await page.getByRole("menuitemradio", { name: "Véranda" }).click();

    await expect(page.getByText("Laurier rose", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rosier grimpant", { exact: true }),
    ).toBeHidden();
    await expect(page.getByText("Voiture", { exact: true })).toBeHidden();

    await page.getByRole("button", { name: "Véranda", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Toutes" }).click();
    await expect(page.getByText("Voiture", { exact: true })).toBeVisible();
  });
});
