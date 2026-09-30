import { describe, expect, it } from "vitest";
import {
  DEADLINE_TABS,
  DOMAINS,
  domainOf,
  isActive,
  SETTINGS,
} from "@/lib/navigation";

describe("isActive", () => {
  it("marque la destination correspondant exactement au chemin", () => {
    expect(isActive("/inventaire", "/inventaire")).toBe(true);
  });

  it("marque une destination dont le chemin est un sous-chemin", () => {
    expect(isActive("/inventaire", "/inventaire/citronnier")).toBe(true);
  });

  it("ne confond pas deux chemins partageant un préfixe textuel", () => {
    expect(isActive("/recap", "/recapitulatif")).toBe(false);
  });

  it("ne marque la racine que sur la racine", () => {
    // Sans ce cas particulier, l'accueil resterait actif partout, puisque
    // tous les chemins commencent par « / ».
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/inventaire")).toBe(false);
  });
});

describe("domainOf", () => {
  it("rattache l'inventaire aux fiches, le reste aux échéances", () => {
    expect(domainOf("/inventaire")).toBe("fiches");
    expect(domainOf("/")).toBe("echeances");
    expect(domainOf("/a-venir")).toBe("echeances");
    // Réglages n'est d'aucun domaine : le toggle reste sur Échéances.
    expect(domainOf(SETTINGS.href)).toBe("echeances");
  });
});

describe("carte de navigation", () => {
  it("garde deux domaines de même rang, et trois onglets d'échéances", () => {
    expect(DOMAINS.map(entry => entry.label)).toEqual(["Échéances", "Fiches"]);
    expect(DEADLINE_TABS.map(entry => entry.href)).toEqual([
      "/",
      "/recap",
      "/a-venir",
    ]);
  });
});
