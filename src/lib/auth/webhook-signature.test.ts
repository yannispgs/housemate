import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  jwksLookup,
  type KeyLookup,
  type SignedRequest,
  verifyNeonSignature,
} from "@/lib/auth/webhook-signature";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const KID = "cle-1";
const JWK = { ...publicKey.export({ format: "jwk" }), kid: KID };
const lookup: KeyLookup = kid => Promise.resolve(kid === KID ? JWK : undefined);

const NOW = 1_790_000_000_000;
const BODY = '{"event_type":"user.before_create","user":{"email":"a@b.fr"}}';

/** Signe comme Neon Auth : JWS détaché, horodatage lié au corps. */
function signed(
  rawBody: string,
  timestamp: number,
  key = privateKey,
): SignedRequest {
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "JWS", kid: KID }),
  ).toString("base64url");
  const payload = Buffer.from(
    `${timestamp}.${Buffer.from(rawBody).toString("base64url")}`,
  ).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${payload}`), key);

  return {
    rawBody,
    signature: `${header}..${signature.toString("base64url")}`,
    kid: KID,
    timestamp: String(timestamp),
  };
}

describe("verifyNeonSignature", () => {
  it("accepte une requête signée par Neon Auth", async () => {
    expect(await verifyNeonSignature(signed(BODY, NOW), lookup, NOW)).toBe(
      true,
    );
  });

  it("⚠️ refuse un corps modifié après signature", async () => {
    const request = signed(BODY, NOW);

    expect(
      await verifyNeonSignature(
        { ...request, rawBody: BODY.replace("a@b.fr", "intrus@x.fr") },
        lookup,
        NOW,
      ),
    ).toBe(false);
  });

  it("⚠️ refuse un horodatage changé : il fait partie de la signature", async () => {
    const request = signed(BODY, NOW);

    expect(
      await verifyNeonSignature(
        { ...request, timestamp: String(NOW + 1000) },
        lookup,
        NOW,
      ),
    ).toBe(false);
  });

  it("refuse une signature d'une autre clé", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;

    expect(
      await verifyNeonSignature(signed(BODY, NOW, other), lookup, NOW),
    ).toBe(false);
  });

  it("refuse une requête de plus de cinq minutes (rejeu)", async () => {
    const sentAt = NOW - 5 * 60 * 1000 - 1;

    expect(await verifyNeonSignature(signed(BODY, sentAt), lookup, NOW)).toBe(
      false,
    );
  });

  it("refuse une requête datée du futur au-delà d'une minute", async () => {
    const sentAt = NOW + 61 * 1000;

    expect(await verifyNeonSignature(signed(BODY, sentAt), lookup, NOW)).toBe(
      false,
    );
  });

  it("refuse une requête sans en-têtes de signature", async () => {
    const request = signed(BODY, NOW);

    for (const missing of ["signature", "kid", "timestamp"] as const) {
      expect(
        await verifyNeonSignature({ ...request, [missing]: null }, lookup, NOW),
      ).toBe(false);
    }
  });

  it("refuse une clé inconnue", async () => {
    expect(
      await verifyNeonSignature(
        { ...signed(BODY, NOW), kid: "inconnue" },
        lookup,
        NOW,
      ),
    ).toBe(false);
  });

  it("refuse une signature qui n'est pas un JWS détaché", async () => {
    const request = signed(BODY, NOW);
    const [header, , sig] = (request.signature ?? "").split(".");

    expect(
      await verifyNeonSignature(
        { ...request, signature: `${header}.charge.${sig}` },
        lookup,
        NOW,
      ),
    ).toBe(false);
    expect(
      await verifyNeonSignature(
        { ...request, signature: "pas-un-jws" },
        lookup,
        NOW,
      ),
    ).toBe(false);
  });

  it("refuse un horodatage qui n'est pas un nombre", async () => {
    expect(
      await verifyNeonSignature(
        { ...signed(BODY, NOW), timestamp: "demain" },
        lookup,
        NOW,
      ),
    ).toBe(false);
  });

  it("refuse une clé publiée d'un type inattendu", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    const wrongType: KeyLookup = () =>
      Promise.resolve({ ...rsa.export({ format: "jwk" }), kid: KID });

    expect(await verifyNeonSignature(signed(BODY, NOW), wrongType, NOW)).toBe(
      false,
    );
  });
});

describe("jwksLookup", () => {
  const BASE = "https://ep-exemple.neonauth.example/base/auth/";
  const jwks = (keys: object[]) =>
    Promise.resolve(new Response(JSON.stringify({ keys })));

  it("lit les clés publiées et les garde en mémoire", async () => {
    const fetchJwks = vi.fn(() => jwks([JWK]));
    const find = jwksLookup(BASE, fetchJwks, () => NOW);

    expect(await find(KID)).toEqual(JWK);
    expect(await find(KID)).toEqual(JWK);
    expect(fetchJwks).toHaveBeenCalledTimes(1);
    expect(fetchJwks).toHaveBeenCalledWith(
      "https://ep-exemple.neonauth.example/base/auth/.well-known/jwks.json",
    );
  });

  it("relit les clés pour un kid inconnu, au plus une fois par minute", async () => {
    let now = NOW;
    const fetchJwks = vi.fn(() => jwks([JWK]));
    const find = jwksLookup(BASE, fetchJwks, () => now);

    expect(await find("nouvelle")).toBeUndefined();
    expect(await find("nouvelle")).toBeUndefined();
    expect(fetchJwks).toHaveBeenCalledTimes(1);

    now += 60 * 1000;
    expect(await find("nouvelle")).toBeUndefined();
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });

  it("ne trouve rien si le JWKS ne répond pas", async () => {
    const find = jwksLookup(
      BASE,
      () => Promise.resolve(new Response("", { status: 503 })),
      () => NOW,
    );

    expect(await find(KID)).toBeUndefined();
  });

  it("tolère un JWKS sans liste de clés", async () => {
    const find = jwksLookup(
      BASE,
      () => Promise.resolve(new Response("{}")),
      () => NOW,
    );

    expect(await find(KID)).toBeUndefined();
  });
});
