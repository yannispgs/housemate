import { afterEach, describe, expect, it, vi } from "vitest";

// Le vrai kit importe `next/headers`, qui n'existe que dans Next.
const getSession = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  neonAuth: () => ({ getSession }),
}));

const commeMembre = vi.fn((_sql: unknown, compte: string) =>
  Promise.resolve(`exécuté pour ${compte}`),
);
const lireFoyer = vi.fn();
vi.mock("@/lib/data/store", () => ({ commeMembre, lireFoyer }));

async function load() {
  vi.resetModules();

  return import("@/lib/data/server");
}

afterEach(() => {
  vi.unstubAllEnvs();
  getSession.mockReset();
});

describe("accès aux données côté serveur", () => {
  it("exige l'adresse de la base", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const server = await load();

    expect(() => server.baseApp()).toThrow(/DATABASE_URL/);
  });

  it("ouvre la base une seule fois", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://app@127.0.0.1:1/base");
    const server = await load();

    expect(server.baseApp()).toBe(server.baseApp());
  });

  it("agit au nom du compte de la session", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://app@127.0.0.1:1/base");
    getSession.mockResolvedValue({ data: { user: { id: "compte-1" } } });
    const server = await load();

    expect(await server.enMonNom(() => Promise.resolve(null))).toBe(
      "exécuté pour compte-1",
    );
  });

  it("⚠️ refuse d'agir sans session", async () => {
    getSession.mockResolvedValue({ data: null });
    const server = await load();

    await expect(server.compteConnecte()).rejects.toThrow(/Aucune session/);
  });
});

describe("foyerConnecte", () => {
  it("ne dit rien sans session (page de connexion)", async () => {
    getSession.mockResolvedValue({ data: null });
    commeMembre.mockClear();
    const server = await load();

    expect(await server.foyerConnecte()).toBe("");
    expect(commeMembre).not.toHaveBeenCalled();
  });

  it("lit le nom du foyer au nom du compte connecté", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://app@127.0.0.1:1/base");
    getSession.mockResolvedValue({ data: { user: { id: "compte-1" } } });
    commeMembre.mockResolvedValueOnce("Foyer Dulong");
    const server = await load();

    expect(await server.foyerConnecte()).toBe("Foyer · Dulong");
    expect(commeMembre).toHaveBeenLastCalledWith(
      expect.anything(),
      "compte-1",
      lireFoyer,
    );
  });

  it("⚠️ ne fait jamais tomber la page si la base ne répond pas", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://app@127.0.0.1:1/base");
    getSession.mockResolvedValue({ data: { user: { id: "compte-1" } } });
    commeMembre.mockRejectedValueOnce(new Error("base injoignable"));
    const signale = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await load();

    expect(await server.foyerConnecte()).toBe("");
    expect(signale).toHaveBeenCalled();
    signale.mockRestore();
  });
});
