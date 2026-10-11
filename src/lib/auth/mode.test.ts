import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "@/lib/auth/mode";

const SECRET = "x".repeat(32);
const BASE = "https://ep-exemple.neonauth.example/base/auth";

describe("resolveAuthMode", () => {
  it("est active avec une adresse HTTPS et un secret assez long", () => {
    expect(
      resolveAuthMode({
        NEON_AUTH_BASE_URL: BASE,
        NEON_AUTH_COOKIE_SECRET: SECRET,
      }),
    ).toEqual({ kind: "active", baseUrl: BASE, cookieSecret: SECRET });
  });

  it("⚠️ refuse de démarrer sans réglage, plutôt que laisser passer", () => {
    expect(() => resolveAuthMode({})).toThrow(/NEON_AUTH_BASE_URL/);
  });

  it("refuse une adresse qui n'est pas en HTTPS", () => {
    expect(() =>
      resolveAuthMode({
        NEON_AUTH_BASE_URL: "http://ep-exemple.neonauth.example",
        NEON_AUTH_COOKIE_SECRET: SECRET,
      }),
    ).toThrow(/HTTPS/);
  });

  it("refuse un secret de cookie trop court", () => {
    expect(() =>
      resolveAuthMode({
        NEON_AUTH_BASE_URL: BASE,
        NEON_AUTH_COOKIE_SECRET: "court",
      }),
    ).toThrow(/32 caractères/);
  });

  it("se désactive explicitement hors de Vercel (e2e, développement)", () => {
    expect(resolveAuthMode({ HOUSEMATE_AUTH: "desactivee" })).toEqual({
      kind: "desactivee",
    });
  });

  it("⚠️ refuse la désactivation sur Vercel, prod comme preview", () => {
    expect(() =>
      resolveAuthMode({ HOUSEMATE_AUTH: "desactivee", VERCEL: "1" }),
    ).toThrow(/refusé sur Vercel/);
  });

  it("refuse une valeur inconnue au lieu de l'ignorer", () => {
    expect(() => resolveAuthMode({ HOUSEMATE_AUTH: "off" })).toThrow(
      /valeur inconnue/,
    );
  });
});
