import { gunzipSync } from "node:zlib";
import {
  Decrypter,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";
import { parseTar } from "nanotar";
import { describe, expect, it } from "vitest";
import { archiver, chiffrer, estChiffreAge } from "./archive";

/** Ce que fera le foyer avec sa clé privée, hors de l'app. */
async function dechiffrer(
  contenu: Uint8Array,
  identite: string,
): Promise<Uint8Array> {
  const d = new Decrypter();
  d.addIdentity(identite);

  return d.decrypt(contenu);
}

function desarchiver(contenu: Uint8Array): Record<string, string> {
  return Object.fromEntries(
    parseTar(new Uint8Array(gunzipSync(contenu))).map(f => [f.name, f.text]),
  );
}

describe("archiver puis chiffrer", () => {
  it("se relit avec la clé privée, sans perte", async () => {
    const identite = await generateIdentity();
    const json = JSON.stringify({ a: "é".repeat(1000) });
    const archive = archiver(
      json,
      "# Export",
      new Date("2026-10-22T01:00:00Z"),
    );
    const chiffre = await chiffrer(
      archive,
      await identityToRecipient(identite),
    );

    expect(archive.length).toBeLessThan(json.length);
    expect(estChiffreAge(chiffre)).toBe(true);
    expect(desarchiver(await dechiffrer(chiffre, identite))).toEqual({
      "export.json": json,
      "export.md": "# Export",
    });
  });

  it("refuse une clé qui n'est pas une clé publique age", () => {
    expect(() => chiffrer(new Uint8Array([1]), "pas-une-cle")).toThrow();
  });
});

describe("estChiffreAge", () => {
  it("reconnaît l'en-tête, et rien d'autre", () => {
    const enc = new TextEncoder();

    expect(estChiffreAge(enc.encode("age-encryption.org/v1\n-> X25519"))).toBe(
      true,
    );
    expect(estChiffreAge(enc.encode("age-encryption.org/v1\n"))).toBe(false);
    expect(estChiffreAge(enc.encode("PK\u0003\u0004 zip"))).toBe(false);
  });
});
