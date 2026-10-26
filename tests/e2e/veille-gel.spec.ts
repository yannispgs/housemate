import { expect, test } from "@playwright/test";

// La carte « Gel cette nuit » sur l'accueil de démonstration : le laurier rose
// en alerte dehors, le citronnier à surveiller dans la véranda (SPEC § 12.8).

test.describe("veille gel", () => {
  test("la carte groupe les plantes par emplacement, et déplie la frise", {
    tag: "@critical",
  }, async ({ page }) => {
    await page.goto("/");
    const carte = page.getByRole("article", { name: "Gel cette nuit" });
    const dehors = carte.getByRole("region", { name: "Extérieur" });

    await expect(dehors.getByText("Le laurier rose")).toBeVisible();
    await expect(
      carte.getByRole("region", { name: "Véranda" }).getByText("Le citronnier"),
    ).toBeVisible();

    await dehors.getByRole("button", { name: /Le laurier rose/ }).click();

    await expect(dehors.getByText("Décision sur la borne basse")).toBeVisible();
  });

  test("Déplacer propose la véranda pour une plante du dehors", {
    tag: "@critical",
  }, async ({ page }) => {
    await page.goto("/");
    const dehors = page
      .getByRole("article", { name: "Gel cette nuit" })
      .getByRole("region", { name: "Extérieur" });

    await dehors.getByRole("button", { name: "Déplacer" }).click();

    await expect(
      dehors.getByRole("combobox", { name: "Déplacer Le laurier rose vers" }),
    ).toHaveValue("Véranda");

    await dehors.getByRole("button", { name: "Déplacer" }).click();

    await expect(dehors.getByText("Déplacée : Véranda")).toBeVisible();
  });

  test("Chauffer vaut pour toute la véranda, et s'annule", async ({ page }) => {
    await page.goto("/");
    const veranda = page
      .getByRole("article", { name: "Gel cette nuit" })
      .getByRole("region", { name: "Véranda" });

    await veranda.getByRole("button", { name: "Chauffer" }).click();

    await expect(veranda.getByText("Chauffée")).toBeVisible();

    await veranda.getByRole("button", { name: "Annuler" }).click();

    await expect(
      veranda.getByRole("button", { name: "Chauffer" }),
    ).toBeVisible();
  });
});
