import { afterEach, describe, expect, it, vi } from "vitest";

// Le vrai kit importe `next/headers`, qui n'existe que dans Next.
vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: (config: unknown) => ({ config }),
}));

/**
 * L'assemblage des instances serveur, réglage par réglage. Chaque test
 * recharge le module : ses instances sont créées une fois par processus.
 */
async function load() {
  vi.resetModules();

  return import("@/lib/auth/server");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instances serveur de l'authentification", () => {
  it("crée Neon Auth une seule fois quand l'authentification est active", async () => {
    vi.stubEnv(
      "NEON_AUTH_BASE_URL",
      "https://ep-exemple.neonauth.example/auth",
    );
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "s".repeat(32));
    const server = await load();

    expect(server.authMode().kind).toBe("active");
    expect(server.neonAuth()).toBe(server.neonAuth());
  });

  it("refuse Neon Auth quand l'authentification est désactivée", async () => {
    vi.stubEnv("HOUSEMATE_AUTH", "desactivee");
    vi.stubEnv("VERCEL", undefined);
    const server = await load();

    expect(server.authMode().kind).toBe("desactivee");
    expect(() => server.neonAuth()).toThrow(/désactivée/);
  });

  it("exige l'adresse de la base du portier", async () => {
    vi.stubEnv("PORTIER_DATABASE_URL", "");
    const server = await load();

    expect(() => server.portierSql()).toThrow(/PORTIER_DATABASE_URL/);
  });

  it("ouvre la base du portier une seule fois, sans se connecter d'avance", async () => {
    vi.stubEnv("PORTIER_DATABASE_URL", "postgres://portier@127.0.0.1:1/base");
    const server = await load();

    expect(server.portierSql()).toBe(server.portierSql());
  });

  it("prépare l'envoi d'e-mails une seule fois, et l'exige configuré", async () => {
    vi.stubEnv("SMTP_LOGIN", "identifiant");
    vi.stubEnv("SMTP_KEY", "cle");
    const server = await load();

    expect(server.envoyerMail()).toBe(server.envoyerMail());

    vi.stubEnv("SMTP_KEY", "");
    await expect(load().then(s => s.envoyerMail())).rejects.toThrow(/SMTP/);
  });
});
