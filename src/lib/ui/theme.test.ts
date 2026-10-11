import { describe, expect, it } from "vitest";
import { dataThemeFor, parseThemeMode, THEME_BOOT_SCRIPT } from "./theme";

describe("parseThemeMode", () => {
  it("relit un mode mémorisé, et se rabat sur auto sinon", () => {
    expect(parseThemeMode("sombre")).toBe("sombre");
    expect(parseThemeMode("clair")).toBe("clair");
    expect(parseThemeMode(null)).toBe("auto");
    expect(parseThemeMode("violet")).toBe("auto");
  });
});

describe("dataThemeFor", () => {
  it("force clair ou sombre, et laisse le système décider en auto", () => {
    expect(dataThemeFor("clair")).toBe("light");
    expect(dataThemeFor("sombre")).toBe("dark");
    expect(dataThemeFor("auto")).toBeNull();
  });
});

describe("THEME_BOOT_SCRIPT", () => {
  it("lit la même clé de stockage que l'app", () => {
    expect(THEME_BOOT_SCRIPT).toContain('"housemate:apparence"');
  });
});
