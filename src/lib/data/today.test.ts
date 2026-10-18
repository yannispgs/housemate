import { describe, expect, it } from "vitest";
import { aujourdhuiAParis, instantAParis } from "@/lib/data/today";
import { fromISO } from "@/lib/domain/plain-date";

describe("aujourdhuiAParis", () => {
  it("⚠️ est déjà demain à Paris quand il est 23 h UTC l'été", () => {
    expect(aujourdhuiAParis(new Date("2026-07-14T22:30:00Z"))).toEqual(
      fromISO("2026-07-15"),
    );
  });

  it("suit l'heure d'hiver (UTC+1)", () => {
    expect(aujourdhuiAParis(new Date("2026-12-24T22:59:00Z"))).toEqual(
      fromISO("2026-12-24"),
    );
    expect(aujourdhuiAParis(new Date("2026-12-24T23:00:00Z"))).toEqual(
      fromISO("2026-12-25"),
    );
  });

  it("prend l'instant présent par défaut", () => {
    expect(aujourdhuiAParis().year).toBeGreaterThanOrEqual(2026);
  });
});

describe("instantAParis", () => {
  it("donne le jour et l'heure de Paris, de 0 à 23", () => {
    expect(instantAParis(new Date("2026-07-14T22:30:00Z"))).toEqual({
      jour: fromISO("2026-07-15"),
      heure: 0,
    });
    expect(instantAParis(new Date("2026-12-24T05:00:00Z"))).toEqual({
      jour: fromISO("2026-12-24"),
      heure: 6,
    });
  });

  it("prend l'instant présent par défaut", () => {
    expect(instantAParis().heure).toBeLessThan(24);
  });
});
