import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleDe,
  cleEnAttente,
  creerStockage,
  enTetesDEnvoi,
  LIEN_SECONDES,
  lireCleEnAttente,
  r2Config,
  signatureConforme,
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
    [{ type: "application/pdf", size: 1.5 }, /vide/],
    [{ type: "application/pdf", size: TAILLE_MAX + 1 }, /25 Mo/],
  ])("refuse %o", (fichier, message) => {
    expect(verifierFichier(fichier)).toEqual({
      ok: false,
      erreur: expect.stringMatching(message),
    });
  });

  it("accepte un fichier de 25 Mo tout juste", () => {
    expect(
      verifierFichier({ type: "application/pdf", size: TAILLE_MAX }).ok,
    ).toBe(true);
  });
});

describe("signatureConforme", () => {
  const octets = (...o: number[]) => new Uint8Array(o);
  const texte = (t: string) => new TextEncoder().encode(t);

  it.each([
    ["image/jpeg", octets(0xff, 0xd8, 0xff, 0xe0)],
    ["image/png", octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ["image/webp", texte("RIFF\u0001\u0002\u0003\u0004WEBP")],
    ["application/pdf", texte("%PDF-1.7")],
  ] as const)("reconnaît %s", (type, debut) => {
    expect(signatureConforme(type, debut)).toBe(true);
  });

  it("⚠️ refuse un contenu qui ment sur son type", () => {
    expect(signatureConforme("application/pdf", texte("<html><script>"))).toBe(
      false,
    );
    expect(signatureConforme("image/png", texte("%PDF-1.7 et la suite"))).toBe(
      false,
    );
    expect(signatureConforme("image/webp", texte("RIFF1234WAVE"))).toBe(false);
  });

  it("refuse un fichier plus court que la signature", () => {
    expect(signatureConforme("application/pdf", texte("%PD"))).toBe(false);
  });
});

describe("clés", () => {
  const FICHE = "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c";
  const ID = "0b8f8c51-3d2e-4f8a-9a63-0d1c2b3a4f5e";

  it("range sous la fiche, avec un identifiant et non le nom d'origine", () => {
    expect(cleDe("fiche-1", "image/jpeg", "abc")).toBe(
      "fiches/fiche-1/abc.jpg",
    );
    expect(cleDe("fiche-1", "application/pdf", "abc")).toBe(
      "fiches/fiche-1/abc.pdf",
    );
  });

  it("relit une clé en attente et donne sa place définitive", () => {
    const cle = cleEnAttente(FICHE, "image/webp", ID);

    expect(cle).toBe(`attente/fiches/${FICHE}/${ID}.webp`);
    expect(lireCleEnAttente(cle, FICHE)).toEqual({
      type: "image/webp",
      definitive: `fiches/${FICHE}/${ID}.webp`,
    });
  });

  it.each([
    [`attente/fiches/${FICHE}/${ID}.pdf`, "autre-fiche"],
    [`fiches/${FICHE}/${ID}.pdf`, FICHE],
    [`attente/fiches/${FICHE}/../${ID}.pdf`, FICHE],
    [`attente/fiches/${FICHE}/${ID}.html`, FICHE],
  ])("⚠️ refuse %s pour la fiche %s", (cle, fiche) => {
    expect(lireCleEnAttente(cle, fiche)).toBeNull();
  });
});

describe("creerStockage", () => {
  type Appel = (req: Request) => Response;

  function stub(repondre: Appel = () => new Response(null, { status: 200 })) {
    const fetchMock = vi.fn((req: Request) => Promise.resolve(repondre(req)));
    vi.stubGlobal("fetch", fetchMock);

    return () => fetchMock.mock.calls.map(([req]) => req);
  }

  const BASE = "https://compte.eu.r2.cloudflarestorage.com/housemate-previews";

  it("⚠️ signe un lien d'envoi qui fige type, taille et non-écrasement", async () => {
    const lien = new URL(
      await creerStockage(CONFIG).lienDEnvoi(
        "attente/fiches/f/abc.pdf",
        "application/pdf",
        1234,
      ),
    );

    expect(lien.pathname).toBe("/housemate-previews/attente/fiches/f/abc.pdf");
    expect(lien.searchParams.get("X-Amz-Expires")).toBe(String(LIEN_SECONDES));
    expect(lien.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match",
    );
    expect(enTetesDEnvoi("application/pdf")).toEqual({
      "content-type": "application/pdf",
      "if-none-match": "*",
    });
  });

  it("décrit un objet, ou rien s'il n'existe pas", async () => {
    stub(req =>
      req.url.endsWith("absent.pdf")
        ? new Response(null, { status: 404 })
        : new Response(null, {
            status: 200,
            headers: { "content-length": "42", "content-type": "image/png" },
          }),
    );
    const stockage = creerStockage(CONFIG);

    expect(await stockage.decrire("a/present.png")).toEqual({
      taille: 42,
      type: "image/png",
    });
    expect(await stockage.decrire("a/absent.pdf")).toBeNull();
  });

  it("décrit un objet sans type comme de type vide", async () => {
    stub(() => {
      const r = new Response(null, { status: 200 });
      r.headers.delete("content-type");

      return r;
    });

    expect(await creerStockage(CONFIG).decrire("a/b.pdf")).toMatchObject({
      type: "",
    });
  });

  // 403 plutôt que 5xx : aws4fetch relance d'office les erreurs du serveur.
  it("signale un refus du stockage", async () => {
    stub(() => new Response(null, { status: 403 }));

    await expect(creerStockage(CONFIG).decrire("a/b.pdf")).rejects.toThrow(
      /HTTP 403/,
    );
    await expect(creerStockage(CONFIG).supprimer("a/b.pdf")).rejects.toThrow(
      /Suppression .* HTTP 403/,
    );
  });

  it("lit les premiers octets par une requête partielle", async () => {
    const appels = stub(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 206 }),
    );

    expect(await creerStockage(CONFIG).debut("a/b.pdf", 12)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(appels()[0]?.headers.get("range")).toBe("bytes=0-11");
  });

  it("copie côté stockage, et supprime", async () => {
    const appels = stub();
    const stockage = creerStockage(CONFIG);

    await stockage.copier("attente/fiches/f/a b.pdf", "fiches/f/a b.pdf");
    await stockage.supprimer("attente/fiches/f/a b.pdf");

    const [copie, suppression] = appels();
    expect(copie?.method).toBe("PUT");
    expect(copie?.url).toBe(`${BASE}/fiches/f/a%20b.pdf`);
    expect(copie?.headers.get("x-amz-copy-source")).toBe(
      "/housemate-previews/attente/fiches/f/a%20b.pdf",
    );
    expect(copie?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
    expect(suppression?.method).toBe("DELETE");
  });

  it("additionne le volume d'un préfixe, page après page", async () => {
    const appels = stub(req =>
      new URL(req.url).searchParams.has("continuation-token")
        ? new Response("<Contents><Size>5</Size></Contents>")
        : new Response(
            "<Contents><Size>10</Size></Contents><Contents><Size>20</Size></Contents><NextContinuationToken>suite</NextContinuationToken>",
          ),
    );

    expect(await creerStockage(CONFIG).volume("attente/")).toBe(35);
    const [premiere, seconde] = appels().map(r => new URL(r.url));
    expect(premiere?.searchParams.get("prefix")).toBe("attente/");
    expect(premiere?.searchParams.get("list-type")).toBe("2");
    expect(seconde?.searchParams.get("continuation-token")).toBe("suite");
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
