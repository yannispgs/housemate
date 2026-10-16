import { describe, expect, it, vi } from "vitest";
import {
  autoriserEnvoi,
  confirmerEnvoi,
  type DepotDeps,
  nomAffiche,
} from "@/lib/files/depot";
import { QUOTA_FOYER, TAILLE_MAX } from "@/lib/files/r2";

const FICHE = "6f1c2c9e-5a5b-4e3e-9d3c-2b1f0a9e8d7c";
const ID = "0b8f8c51-3d2e-4f8a-9a63-0d1c2b3a4f5e";
const ATTENTE = `attente/fiches/${FICHE}/${ID}.pdf`;
const DEFINITIVE = `fiches/${FICHE}/${ID}.pdf`;
const PDF = new TextEncoder().encode("%PDF-1.7 la suite");

function deps(
  options: {
    visible?: boolean;
    enregistre?: number;
    enAttente?: number;
    recu?: { taille: number; type: string } | null;
    debut?: Uint8Array;
  } = {},
) {
  const d = {
    ficheVisible: vi.fn(() => Promise.resolve(options.visible ?? true)),
    volumeFoyer: vi.fn(() => Promise.resolve(options.enregistre ?? 0)),
    enregistrer: vi.fn(() => Promise.resolve("piece-1")),
    stockage: {
      lienDEnvoi: vi.fn(() => Promise.resolve("https://r2/lien-signe")),
      decrire: vi.fn(() =>
        Promise.resolve(
          options.recu === undefined
            ? { taille: 2048, type: "application/pdf" }
            : options.recu,
        ),
      ),
      debut: vi.fn(() => Promise.resolve(options.debut ?? PDF)),
      copier: vi.fn(() => Promise.resolve()),
      supprimer: vi.fn(() => Promise.resolve()),
      volume: vi.fn(() => Promise.resolve(options.enAttente ?? 0)),
      lienDeLecture: vi.fn(),
    },
    identifiant: () => ID,
  } satisfies DepotDeps;

  return d;
}

const demande = (champs: Record<string, unknown> = {}) => ({
  ficheId: FICHE,
  type: "application/pdf",
  taille: 2048,
  ...champs,
});

describe("autoriserEnvoi", () => {
  it("donne un lien d'envoi vers la zone d'attente, pour ce type et cette taille", async () => {
    const d = deps();

    expect(await autoriserEnvoi(demande(), d)).toEqual({
      ok: true,
      cle: ATTENTE,
      url: "https://r2/lien-signe",
    });
    expect(d.stockage.lienDEnvoi).toHaveBeenCalledWith(
      ATTENTE,
      "application/pdf",
      2048,
    );
    expect(d.stockage.volume).toHaveBeenCalledWith("attente/");
  });

  it("⚠️ ne signe rien pour une fiche invisible, et ne dit pas pourquoi", async () => {
    const d = deps({ visible: false });

    expect(await autoriserEnvoi(demande(), d)).toEqual({
      ok: false,
      statut: 404,
      erreur: "Fiche introuvable.",
    });
    expect(d.stockage.lienDEnvoi).not.toHaveBeenCalled();
  });

  it.each([
    [{ type: "text/html" }],
    [{ type: 42 }],
    [{ taille: TAILLE_MAX + 1 }],
    [{ taille: "2048" }],
    [{ ficheId: "x" }],
  ])("refuse %o avant toute autre chose", async champs => {
    const d = deps();

    expect(await autoriserEnvoi(demande(champs), d)).toMatchObject({
      ok: false,
      statut: 400,
    });
    expect(d.ficheVisible).not.toHaveBeenCalled();
  });

  it("⚠️ refuse au-delà du quota du foyer, envois en attente compris", async () => {
    const d = deps({ enregistre: QUOTA_FOYER - 3000, enAttente: 1000 });

    expect(await autoriserEnvoi(demande(), d)).toMatchObject({
      ok: false,
      statut: 413,
    });
    expect(d.stockage.lienDEnvoi).not.toHaveBeenCalled();
    expect(await autoriserEnvoi(demande({ taille: 2000 }), d)).toMatchObject({
      ok: true,
    });
  });
});

describe("confirmerEnvoi", () => {
  const confirmation = (champs: Record<string, unknown> = {}) => ({
    ficheId: FICHE,
    cle: ATTENTE,
    nom: "Facture",
    nomFichier: "scan.pdf",
    ...champs,
  });

  it("vérifie ce qui a été reçu, le range dans la fiche et l'enregistre", async () => {
    const d = deps();

    expect(await confirmerEnvoi(confirmation(), d)).toEqual({
      ok: true,
      id: "piece-1",
    });
    expect(d.stockage.copier).toHaveBeenCalledWith(ATTENTE, DEFINITIVE);
    expect(d.enregistrer).toHaveBeenCalledWith({
      ficheId: FICHE,
      nom: "Facture",
      typeMime: "application/pdf",
      taille: 2048,
      cle: DEFINITIVE,
    });
    expect(d.stockage.supprimer).toHaveBeenCalledWith(ATTENTE);
  });

  it.each([
    [{ cle: 42 }],
    [{ cle: DEFINITIVE }],
    [{ cle: `attente/fiches/${ID}/${ID}.pdf` }],
    [{ ficheId: "x" }],
  ])("⚠️ refuse une clé qu'il n'a pas produite pour cette fiche : %o", async champs => {
    const d = deps();

    expect(await confirmerEnvoi(confirmation(champs), d)).toEqual({
      ok: false,
      statut: 400,
      erreur: "Envoi inconnu.",
    });
    expect(d.stockage.decrire).not.toHaveBeenCalled();
  });

  it("⚠️ ne confirme rien pour une fiche invisible", async () => {
    const d = deps({ visible: false });

    expect(await confirmerEnvoi(confirmation(), d)).toMatchObject({
      statut: 404,
    });
    expect(d.stockage.decrire).not.toHaveBeenCalled();
  });

  it("signale un fichier qui n'est pas arrivé", async () => {
    const d = deps({ recu: null });

    expect(await confirmerEnvoi(confirmation(), d)).toMatchObject({
      ok: false,
      statut: 400,
      erreur: expect.stringMatching(/pas arrivé/),
    });
    expect(d.enregistrer).not.toHaveBeenCalled();
  });

  it.each([
    [
      "un contenu qui ment sur son type",
      {
        debut: new TextEncoder().encode("<html><script>"),
      },
    ],
    [
      "un autre type que celui de la clé",
      {
        recu: { taille: 2048, type: "text/html" },
      },
    ],
    ["un fichier vide", { recu: { taille: 0, type: "application/pdf" } }],
    [
      "un fichier trop gros",
      {
        recu: { taille: TAILLE_MAX + 1, type: "application/pdf" },
      },
    ],
  ])("⚠️ refuse et efface %s", async (_cas, options) => {
    const d = deps(options);

    expect(await confirmerEnvoi(confirmation(), d)).toMatchObject({
      ok: false,
      statut: 400,
    });
    expect(d.stockage.supprimer).toHaveBeenCalledWith(ATTENTE);
    expect(d.stockage.copier).not.toHaveBeenCalled();
    expect(d.enregistrer).not.toHaveBeenCalled();
  });

  it("refuse et efface si le quota a été dépassé entre-temps", async () => {
    const d = deps({ enregistre: QUOTA_FOYER, enAttente: 2048 });

    expect(await confirmerEnvoi(confirmation(), d)).toMatchObject({
      statut: 413,
    });
    expect(d.stockage.supprimer).toHaveBeenCalledWith(ATTENTE);
    expect(d.enregistrer).not.toHaveBeenCalled();
  });

  it("n'enregistre pas un fichier que le stockage n'a pas pu ranger", async () => {
    const d = deps();
    d.stockage.copier.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(confirmerEnvoi(confirmation(), d)).rejects.toThrow(/500/);
    expect(d.enregistrer).not.toHaveBeenCalled();
  });

  it("reste confirmé si l'effacement de l'attente échoue", async () => {
    const d = deps();
    d.stockage.supprimer.mockRejectedValueOnce(new Error("HTTP 500"));

    expect(await confirmerEnvoi(confirmation(), d)).toEqual({
      ok: true,
      id: "piece-1",
    });
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
