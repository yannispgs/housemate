import { describe, expect, it, vi } from "vitest";
import {
  type ConnexionDeps,
  demanderCode,
  type ResultatCode,
  type ResultatDemande,
  renvoyerCode,
  verifierCode,
} from "@/lib/auth/connexion";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const APPAREIL_CONNU = "A".repeat(43);

function deps(
  resultat: ResultatCode = { ok: true, userId: "compte-1" },
  options: { appareil?: string; nouveau?: boolean } = {},
) {
  const poses: string[] = [];
  const d = {
    demanderCode: vi.fn(
      (): Promise<ResultatDemande> => Promise.resolve({ ok: true }),
    ),
    verifierCode: vi.fn(() => Promise.resolve(resultat)),
    lireAppareil: () => options.appareil,
    poserAppareil: (id: string) => {
      poses.push(id);
    },
    noterAppareil: vi.fn(() => Promise.resolve(options.nouveau ?? false)),
    avertir: vi.fn(() => Promise.resolve()),
    signaler: vi.fn(),
    userAgent: IPHONE,
    site: "https://www.house-mate.app",
    maintenant: new Date("2026-10-11T08:00:00Z"),
  } satisfies ConnexionDeps;

  return { d, poses };
}

describe("demanderCode", () => {
  it("passe à la saisie du code avec l'adresse normalisée", async () => {
    const { d } = deps();

    expect(await demanderCode("  Parent@Exemple.fr ", d)).toEqual({
      etape: "code",
      email: "parent@exemple.fr",
      codeEnvoye: true,
    });
    expect(d.demanderCode).toHaveBeenCalledWith("parent@exemple.fr");
  });

  it("refuse une adresse mal formée sans appeler Neon Auth", async () => {
    const { d } = deps();

    expect(await demanderCode("pas-une-adresse", d)).toMatchObject({
      etape: "adresse",
      erreur: expect.stringMatching(/pas valide/),
    });
    expect(d.demanderCode).not.toHaveBeenCalled();
  });

  it("le dit quand le service ne répond pas", async () => {
    const { d } = deps();
    d.demanderCode.mockResolvedValueOnce({ ok: false, raison: "service" });

    expect(await demanderCode("parent@exemple.fr", d)).toMatchObject({
      etape: "adresse",
      erreur: expect.stringMatching(/ne répond pas/),
    });
  });
});

describe("demanderCode — trop de demandes", () => {
  it("demande de patienter", async () => {
    const { d } = deps();
    d.demanderCode.mockResolvedValueOnce({ ok: false, raison: "tentatives" });

    expect(await demanderCode("parent@exemple.fr", d)).toMatchObject({
      etape: "adresse",
      erreur: expect.stringMatching(/Patientez/),
    });
  });
});

describe("renvoyerCode", () => {
  it("renvoie un code et dit que seul le dernier vaut", async () => {
    const { d } = deps();

    expect(await renvoyerCode("parent@exemple.fr", d)).toEqual({
      etape: "code",
      email: "parent@exemple.fr",
      info: expect.stringMatching(/Seul ce dernier est valable/),
      codeEnvoye: true,
    });
    expect(d.demanderCode).toHaveBeenCalledWith("parent@exemple.fr");
  });

  it("reste à l'étape du code, avec une erreur, si l'envoi est refusé", async () => {
    const { d } = deps();
    d.demanderCode.mockResolvedValueOnce({ ok: false, raison: "tentatives" });

    expect(await renvoyerCode("parent@exemple.fr", d)).toEqual({
      etape: "code",
      email: "parent@exemple.fr",
      erreur: expect.stringMatching(/Patientez/),
    });
  });
});

describe("verifierCode", () => {
  it("connecte avec un bon code, sans avis pour un appareil connu", async () => {
    const { d, poses } = deps(undefined, { appareil: APPAREIL_CONNU });

    expect(await verifierCode("parent@exemple.fr", "481 516", d)).toEqual({
      etape: "connecte",
    });
    expect(d.verifierCode).toHaveBeenCalledWith("parent@exemple.fr", "481516");
    expect(poses).toEqual([]);
    expect(d.noterAppareil).toHaveBeenCalledWith(
      "compte-1",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      "Safari sur iPhone",
    );
    expect(d.avertir).not.toHaveBeenCalled();
  });

  it("⚠️ avertit par e-mail d'une connexion depuis un appareil inconnu", async () => {
    const { d, poses } = deps(undefined, { nouveau: true });

    await verifierCode("parent@exemple.fr", "481516", d);

    expect(poses).toHaveLength(1);
    expect(d.avertir).toHaveBeenCalledWith(
      "parent@exemple.fr",
      expect.objectContaining({ subject: "Nouvelle connexion à HouseMate" }),
    );
  });

  it("remplace un identifiant d'appareil fabriqué", async () => {
    const { d, poses } = deps(undefined, { appareil: "fabrique" });

    await verifierCode("parent@exemple.fr", "481516", d);

    expect(poses).toHaveLength(1);
    expect(poses[0]).not.toBe("fabrique");
  });

  it("garde la connexion si l'avis échoue, et signale l'échec", async () => {
    const { d } = deps(undefined, { nouveau: true });
    const panne = new Error("relais SMTP injoignable");
    d.avertir.mockRejectedValueOnce(panne);

    expect(await verifierCode("parent@exemple.fr", "481516", d)).toEqual({
      etape: "connecte",
    });
    expect(d.signaler).toHaveBeenCalledWith(panne);
  });

  it("refuse un code qui n'a pas six chiffres sans appeler Neon Auth", async () => {
    const { d } = deps();

    expect(await verifierCode("parent@exemple.fr", "12345", d)).toEqual({
      etape: "code",
      email: "parent@exemple.fr",
      erreur: "Le code a six chiffres.",
    });
    expect(d.verifierCode).not.toHaveBeenCalled();
  });

  it.each([
    ["code", /incorrect ou expiré/],
    ["tentatives", /Trop d'essais/],
    ["service", /ne répond pas/],
  ] as const)("explique un refus « %s »", async (raison, message) => {
    const { d } = deps({ ok: false, raison });

    expect(await verifierCode("parent@exemple.fr", "481516", d)).toMatchObject({
      etape: "code",
      erreur: expect.stringMatching(message),
    });
    expect(d.noterAppareil).not.toHaveBeenCalled();
  });
});
