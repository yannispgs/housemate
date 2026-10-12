import { describe, expect, it } from "vitest";
import {
  decrireAppareil,
  empreinte,
  identifiantValide,
  nouvelIdentifiant,
} from "@/lib/auth/appareils";
import { messageCode, messageNouvelAppareil } from "@/lib/auth/messages";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const ANDROID_FIREFOX =
  "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0";

describe("identifiant d'appareil", () => {
  it("est aléatoire, et valide au format attendu", () => {
    const a = nouvelIdentifiant();
    const b = nouvelIdentifiant();

    expect(a).not.toBe(b);
    expect(identifiantValide(a)).toBe(true);
  });

  it("refuse une valeur absente ou fabriquée", () => {
    expect(identifiantValide(undefined)).toBe(false);
    expect(identifiantValide("court")).toBe(false);
    expect(identifiantValide(`${"a".repeat(42)}!`)).toBe(false);
  });

  it("n'est gardé en base que par son empreinte SHA-256", () => {
    const id = nouvelIdentifiant();

    expect(empreinte(id)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte(id)).toBe(empreinte(id));
    expect(empreinte(id)).not.toContain(id);
  });
});

describe("decrireAppareil", () => {
  it.each([
    [IPHONE_SAFARI, "Safari sur iPhone"],
    [MAC_CHROME, "Chrome sur Mac"],
    [WINDOWS_EDGE, "Edge sur Windows"],
    [ANDROID_FIREFOX, "Firefox sur Android"],
  ])("décrit %s", (ua, attendu) => {
    expect(decrireAppareil(ua)).toBe(attendu);
  });

  it("se contente de ce qu'il reconnaît", () => {
    expect(decrireAppareil("curl/8.5.0")).toBe("Appareil non reconnu");
    expect(decrireAppareil("")).toBe("Appareil non reconnu");
    expect(decrireAppareil("Linux x86_64")).toBe("Linux");
  });
});

describe("messages", () => {
  it("met le code dans le sujet, lisible depuis la notification", () => {
    const { subject, text } = messageCode(
      "481516",
      new Date("2026-10-11T08:10:00Z"),
    );

    expect(subject.startsWith("481516")).toBe(true);
    expect(text).toContain("481516");
    // 08:10 UTC = 10:10 à Paris en heure d'été.
    expect(text).toContain("10:10");
  });

  it("décrit l'appareil, l'heure de Paris et le site dans l'avis", () => {
    const { subject, text } = messageNouvelAppareil({
      description: "Safari sur iPhone",
      quand: new Date("2026-12-24T19:05:00Z"),
      site: "https://www.house-mate.app",
    });

    expect(subject).toBe("Nouvelle connexion à HouseMate");
    expect(text).toContain("Safari sur iPhone");
    // 19:05 UTC = 20:05 à Paris en heure d'hiver.
    expect(text).toContain("jeudi 24 décembre à 20:05");
    expect(text).toContain("https://www.house-mate.app");
  });
});
