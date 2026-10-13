import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleDe,
  creerStockage,
  LIEN_SECONDES,
  r2Config,
  TAILLE_MAX,
  verifierFichier,
} from "@/lib/files/r2";

const CONFIG = {
  endpoint: "https://compte.eu.r2.cloudflarestorage.com",
  bucket: "housemate-previews",
  accessKeyId: "cle",
  secretAccessKey: "secret",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("r2Config", () => {
  it("lit la configuration et retire la barre finale", () => {
    expect(
      r2Config({
        R2_ENDPOINT: `${CONFIG.endpoint}/`,
        R2_BUCKET: CONFIG.bucket,
        R2_ACCESS_KEY_ID: "cle",
        R2_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual(CONFIG);
  });

  it("exige une adresse HTTPS et un bucket", () => {
    expect(() => r2Config({ R2_ENDPOINT: "http://x", R2_BUCKET: "b" })).toThrow(
      /HTTPS/,
    );
    expect(() => r2Config({ R2_ENDPOINT: CONFIG.endpoint })).toThrow(
      /R2_BUCKET/,
    );
  });

  it("exige les clés, posées par le foyer", () => {
    expect(() =>
      r2Config({ R2_ENDPOINT: CONFIG.endpoint, R2_BUCKET: "b" }),
    ).toThrow(/R2_ACCESS_KEY_ID/);
  });
});

describe("verifierFichier", () => {
  it.each([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ])("accepte %s", type => {
    expect(verifierFichier({ type, size: 1000 })).toEqual({ ok: true, type });
  });

  it.each([
    [{ type: "text/html", size: 10 }, /photos .* et les PDF/],
    [{ type: "application/pdf", size: 0 }, /vide/],
    [{ type: "application/pdf", size: TAILLE_MAX + 1 }, /4 Mo/],
  ])("refuse %o", (fichier, message) => {
    expect(verifierFichier(fichier)).toEqual({
      ok: false,
      erreur: expect.stringMatching(message),
    });
  });

  it("accepte un fichier de 4 Mo tout juste", () => {
    expect(
      verifierFichier({ type: "application/pdf", size: TAILLE_MAX }).ok,
    ).toBe(true);
  });
});

describe("cleDe", () => {
  it("range sous la fiche, avec un identifiant et non le nom d'origine", () => {
    expect(cleDe("fiche-1", "image/jpeg", "abc")).toBe(
      "fiches/fiche-1/abc.jpg",
    );
    expect(cleDe("fiche-1", "application/pdf", "abc")).toBe(
      "fiches/fiche-1/abc.pdf",
    );
  });
});

describe("creerStockage", () => {
  it("dépose par un PUT signé, à l'adresse du bucket", async () => {
    const fetchMock = vi.fn((_req: Request) =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await creerStockage(CONFIG).deposer(
      "fiches/f/abc.pdf",
      new TextEncoder().encode("%PDF").buffer as ArrayBuffer,
      "application/pdf",
    );

    const requete = fetchMock.mock.calls[0]?.[0] as Request;
    expect(requete.method).toBe("PUT");
    expect(requete.url).toBe(
      "https://compte.eu.r2.cloudflarestorage.com/housemate-previews/fiches/f/abc.pdf",
    );
    expect(requete.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
    expect(requete.headers.get("content-type")).toBe("application/pdf");
  });

  it("signale un dépôt refusé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );

    await expect(
      creerStockage(CONFIG).deposer(
        "fiches/f/abc.pdf",
        new ArrayBuffer(1),
        "application/pdf",
      ),
    ).rejects.toThrow(/HTTP 403/);
  });

  it("⚠️ produit un lien de lecture signé, temporaire, sous un nom lisible", async () => {
    const lien = new URL(
      await creerStockage(CONFIG).lienDeLecture(
        "fiches/f/abc.pdf",
        "Facture balance.pdf",
      ),
    );

    expect(lien.pathname).toBe("/housemate-previews/fiches/f/abc.pdf");
    expect(lien.searchParams.get("X-Amz-Expires")).toBe(String(LIEN_SECONDES));
    expect(lien.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(lien.searchParams.get("response-content-disposition")).toBe(
      "inline; filename*=UTF-8''Facture%20balance.pdf",
    );
  });
});
