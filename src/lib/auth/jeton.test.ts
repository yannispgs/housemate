import { describe, expect, it } from "vitest";
import { jetonValide } from "@/lib/auth/jeton";

describe("jetonValide", () => {
  it("accepte le jeton attendu, et lui seul", () => {
    expect(jetonValide("Bearer s3cret", "s3cret")).toBe(true);
    expect(jetonValide("Bearer autre", "s3cret")).toBe(false);
    expect(jetonValide("Bearer s3cret-et-plus", "s3cret")).toBe(false);
  });

  it("⚠️ refuse tout sans jeton configuré, ou sans en-tête conforme", () => {
    expect(jetonValide("Bearer ", "")).toBe(false);
    expect(jetonValide("Bearer x", undefined)).toBe(false);
    expect(jetonValide(null, "s3cret")).toBe(false);
    expect(jetonValide("s3cret", "s3cret")).toBe(false);
  });
});
