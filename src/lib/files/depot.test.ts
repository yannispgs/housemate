import { describe, expect, it, vi } from "vitest";
import {
  type DepotDeps,
  deposerPieceJointe,
  nomAffiche,
} from "@/lib/files/depot";

const FICHE = "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c";

const fichier = (type = "application/pdf", size = 10, name = "scan.pdf") => ({
  name,
  type,
  size,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)),
});

function deps(visible = true) {
  const d = {
    ficheVisible: vi.fn(() => Promise.resolve(visible)),
    enregistrer: vi.fn(() => Promise.resolve("piece-1")),
    stockage: {
      deposer: vi.fn(() => Promise.resolve()),
      lienDeLecture: vi.fn(),
    },
    identifiant: () => "aleatoire",
  } satisfies DepotDeps;

  return d;
}

describe("deposerPieceJointe", () => {
  it("dépose puis enregistre la facture d'une fiche visible", async () => {
    const d = deps();

    expect(
      await deposerPieceJointe(
        { ficheId: FICHE, nom: "Facture", fichier: fichier() },
        d,
      ),
    ).toEqual({ ok: true, id: "piece-1" });
    expect(d.stockage.deposer).toHaveBeenCalledWith(
      `fiches/${FICHE}/aleatoire.pdf`,
      expect.any(ArrayBuffer),
      "application/pdf",
    );
    expect(d.enregistrer).toHaveBeenCalledWith({
      ficheId: FICHE,
      nom: "Facture",
      typeMime: "application/pdf",
      taille: 10,
      cle: `fiches/${FICHE}/aleatoire.pdf`,
    });
  });

  it("⚠️ ne dépose rien pour une fiche invisible, et ne dit pas pourquoi", async () => {
    const d = deps(false);

    expect(
      await deposerPieceJointe(
        { ficheId: FICHE, nom: null, fichier: fichier() },
        d,
      ),
    ).toEqual({ ok: false, statut: 404, erreur: "Fiche introuvable." });
    expect(d.stockage.deposer).not.toHaveBeenCalled();
  });

  it("refuse un fichier non prévu avant toute autre chose", async () => {
    const d = deps();

    expect(
      await deposerPieceJointe(
        { ficheId: FICHE, nom: null, fichier: fichier("text/html") },
        d,
      ),
    ).toMatchObject({ ok: false, statut: 400 });
    expect(d.ficheVisible).not.toHaveBeenCalled();
  });

  it("refuse une demande sans fiche valide ou sans fichier", async () => {
    expect(
      await deposerPieceJointe(
        { ficheId: "x", nom: null, fichier: fichier() },
        deps(),
      ),
    ).toMatchObject({ ok: false, statut: 400 });
    expect(
      await deposerPieceJointe(
        { ficheId: FICHE, nom: null, fichier: null },
        deps(),
      ),
    ).toMatchObject({ ok: false, statut: 400 });
  });

  it("n'enregistre pas un fichier que le stockage a refusé", async () => {
    const d = deps();
    d.stockage.deposer.mockRejectedValueOnce(new Error("HTTP 403"));

    await expect(
      deposerPieceJointe({ ficheId: FICHE, nom: null, fichier: fichier() }, d),
    ).rejects.toThrow(/403/);
    expect(d.enregistrer).not.toHaveBeenCalled();
  });
});

describe("nomAffiche", () => {
  it("préfère le nom donné, puis celui du fichier", () => {
    expect(nomAffiche(" Facture ", "scan.pdf")).toBe("Facture");
    expect(nomAffiche(null, "scan.pdf")).toBe("scan.pdf");
    expect(nomAffiche("", "  ")).toBe("Pièce jointe");
    expect(nomAffiche("x".repeat(200), "")).toHaveLength(120);
  });
});
