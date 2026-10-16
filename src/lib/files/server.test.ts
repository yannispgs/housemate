import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();

  return import("@/lib/files/server");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stockageDesPieces", () => {
  it("se crée une fois, depuis l'environnement", async () => {
    vi.stubEnv("R2_ENDPOINT", "https://compte.eu.r2.cloudflarestorage.com");
    vi.stubEnv("R2_BUCKET", "housemate-previews");
    vi.stubEnv("R2_ACCESS_KEY_ID", "cle");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    const server = await load();

    expect(server.stockageDesPieces()).toBe(server.stockageDesPieces());
  });

  it("refuse de démarrer sans configuration", async () => {
    vi.stubEnv("R2_ENDPOINT", "");
    const server = await load();

    expect(() => server.stockageDesPieces()).toThrow(/R2_ENDPOINT/);
  });
});
