import { gunzipSync } from "node:zlib";
import {
  Decrypter,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";
import { parseTar } from "nanotar";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { plainDate } from "@/lib/domain/plain-date";
import {
  aElaguer,
  type Destination,
  type ExportDeps,
  exportDu,
  exportEnPanne,
  exporter,
  type Issue,
  nomDArchive,
  type Passage,
} from "./exporter";
import { type Ligne, TABLES, type Table } from "./instantane";

const JOUR = plainDate(2026, 10, 22);
const MATIN = { jour: JOUR, heure: 3 };
const MAINTENANT = new Date("2026-10-22T01:05:00Z");
const jourDe = (le: Date) => le.toISOString().slice(0, 10);

let identite: string;
let clePublique: string;

beforeAll(async () => {
  identite = await generateIdentity();
  clePublique = await identityToRecipient(identite);
});

class Memoire implements Destination {
  readonly fichiers = new Map<string, Uint8Array>();
  lister = vi.fn(async () => [...this.fichiers.keys()]);
  deposer = vi.fn(async (chemin: string, contenu: Uint8Array) => {
    this.fichiers.set(chemin, contenu);
  });
  supprimer = vi.fn(async (chemin: string) => {
    this.fichiers.delete(chemin);
  });
}

function donnees(partiel: Partial<Record<Table, Ligne[]>> = {}) {
  return {
    ...(Object.fromEntries(TABLES.map(t => [t, []])) as unknown as Record<
      Table,
      Ligne[]
    >),
    ...partiel,
  };
}

interface Note {
  issue: Issue;
  empreinte: string | null;
  fichier: string | null;
  detail: string | null;
}

function deps(
  dernier: Passage | null,
  tables = donnees(),
  destination = new Memoire(),
) {
  const notes: Note[] = [];
  const d: ExportDeps = {
    dernier: async () => dernier,
    tables: async () => tables,
    piece: async p => new TextEncoder().encode(`contenu de ${String(p.id)}`),
    destination,
    noter: async (issue, empreinte, fichier, detail) => {
      notes.push({ issue, empreinte, fichier, detail });
    },
    clePublique,
  };

  return { d, notes, destination };
}

async function lire(contenu: Uint8Array): Promise<Uint8Array> {
  const dec = new Decrypter();
  dec.addIdentity(identite);

  return dec.decrypt(contenu);
}

describe("exportDu", () => {
  const passage = (issue: Issue, le: string): Passage => ({
    le: new Date(le),
    issue,
    empreinte: "e",
  });

  it("attend l'heure de l'export", () => {
    expect(exportDu({ jour: JOUR, heure: 2 }, null, jourDe)).toBe(
      "pas-l-heure",
    );
  });

  it("passe une fois par jour, et repasse après un échec", () => {
    expect(exportDu(MATIN, null, jourDe)).toBe("du");
    expect(
      exportDu(MATIN, passage("inchange", "2026-10-22T01:00:00Z"), jourDe),
    ).toBe("deja-fait");
    expect(
      exportDu(MATIN, passage("exporte", "2026-10-21T01:00:00Z"), jourDe),
    ).toBe("du");
    expect(
      exportDu(MATIN, passage("echec", "2026-10-22T01:00:00Z"), jourDe),
    ).toBe("du");
  });
});

describe("exportEnPanne", () => {
  const depuis = new Date("2026-10-01T00:00:00Z");

  it("alerte après 36 h sans passage réussi", () => {
    const hier = new Date("2026-10-21T01:00:00Z");

    expect(exportEnPanne(hier, new Date("2026-10-22T13:00:00Z"), depuis)).toBe(
      false,
    );
    expect(exportEnPanne(hier, new Date("2026-10-22T13:00:01Z"), depuis)).toBe(
      true,
    );
  });

  it("compte depuis la mise en service tant que rien n'a tourné", () => {
    expect(exportEnPanne(null, new Date("2026-10-01T12:00:00Z"), depuis)).toBe(
      false,
    );
    expect(exportEnPanne(null, new Date("2026-10-03T00:00:00Z"), depuis)).toBe(
      true,
    );
  });
});

describe("aElaguer", () => {
  it("garde les plus récentes archives, ne touche pas aux pièces", () => {
    const archives = ["2026-10-20", "2026-10-22", "2026-10-21"].map(
      nomDArchive,
    );

    expect(aElaguer([...archives, "pieces/p.pdf.age", "autre.txt"], 2)).toEqual(
      [nomDArchive("2026-10-20")],
    );
    expect(aElaguer(archives, 10)).toEqual([]);
  });
});

describe("exporter", () => {
  it("ne fait rien avant l'heure ni deux fois le même jour", async () => {
    const avant = deps(null);
    expect(
      await exporter(avant.d, { jour: JOUR, heure: 1 }, MAINTENANT, jourDe),
    ).toEqual({
      issue: "pas-l-heure",
    });

    const fait = deps({ le: MAINTENANT, issue: "exporte", empreinte: "e" });
    expect(await exporter(fait.d, MATIN, MAINTENANT, jourDe)).toEqual({
      issue: "deja-fait",
    });
    expect([...avant.notes, ...fait.notes]).toEqual([]);
  });

  it("dépose l'archive chiffrée et les pièces, puis le note", async () => {
    const tables = donnees({
      fiches: [
        { id: "f1", titre: "Chaudière", nature: "objet", categorie: "maison" },
      ],
      pieces_jointes: [{ id: "p1", fiche_id: "f1", nom: "facture.pdf" }],
    });
    const { d, notes, destination } = deps(null, tables);

    const bilan = await exporter(d, MATIN, MAINTENANT, jourDe);

    expect(bilan).toEqual({
      issue: "exporte",
      fichier: "housemate-2026-10-22.tar.gz.age",
      pieces: 1,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      issue: "exporte",
      fichier: "housemate-2026-10-22.tar.gz.age",
    });
    expect(notes[0]?.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(notes[0]?.detail).toMatch(/^\d+ octets$/);

    const archive = destination.fichiers.get("housemate-2026-10-22.tar.gz.age");
    const contenu = Object.fromEntries(
      parseTar(
        new Uint8Array(gunzipSync(await lire(archive as Uint8Array))),
      ).map(f => [f.name, f.text]),
    );
    expect(JSON.parse(contenu["export.json"] as string).tables.fiches).toEqual(
      tables.fiches,
    );
    expect(contenu["export.md"]).toContain("## Chaudière");

    const piece = destination.fichiers.get("pieces/p1.pdf.age");
    expect(new TextDecoder().decode(await lire(piece as Uint8Array))).toBe(
      "contenu de p1",
    );
  });

  it("note « inchangé » sans rien déposer quand rien n'a bougé", async () => {
    const premier = deps(null);
    await exporter(premier.d, MATIN, MAINTENANT, jourDe);
    const e = premier.notes[0]?.empreinte as string;

    const lendemain = { jour: plainDate(2026, 10, 23), heure: 3 };
    const second = deps({ le: MAINTENANT, issue: "exporte", empreinte: e });

    expect(await exporter(second.d, lendemain, MAINTENANT, jourDe)).toEqual({
      issue: "inchange",
    });
    expect(second.notes).toEqual([
      { issue: "inchange", empreinte: e, fichier: null, detail: null },
    ]);
    expect(second.destination.deposer).not.toHaveBeenCalled();
  });

  it("réexporte après un échec, même contenu", async () => {
    const premier = deps(null);
    await exporter(premier.d, MATIN, MAINTENANT, jourDe);
    const e = premier.notes[0]?.empreinte as string;

    const apres = deps({ le: MAINTENANT, issue: "echec", empreinte: e });

    expect((await exporter(apres.d, MATIN, MAINTENANT, jourDe)).issue).toBe(
      "exporte",
    );
  });

  it("ne redépose pas une pièce déjà là, et garde dix archives", async () => {
    const destination = new Memoire();
    const deja = new Uint8Array([1]);
    destination.fichiers.set("pieces/p1.pdf.age", deja);

    for (let j = 1; j <= 10; j++) {
      destination.fichiers.set(
        nomDArchive(`2026-10-${String(j).padStart(2, "0")}`),
        deja,
      );
    }

    const { d } = deps(
      null,
      donnees({ pieces_jointes: [{ id: "p1", fiche_id: "f1", nom: "f.pdf" }] }),
      destination,
    );

    expect(await exporter(d, MATIN, MAINTENANT, jourDe)).toMatchObject({
      issue: "exporte",
      pieces: 0,
    });
    expect(destination.fichiers.get("pieces/p1.pdf.age")).toBe(deja);
    expect(destination.supprimer).toHaveBeenCalledExactlyOnceWith(
      nomDArchive("2026-10-01"),
    );
    expect(
      [...destination.fichiers.keys()].filter(c => c.startsWith("housemate-")),
    ).toHaveLength(10);
  });

  it("note l'échec, avec son message, sans rien supprimer", async () => {
    const destination = new Memoire();
    destination.deposer.mockRejectedValueOnce(new Error("quota Drive dépassé"));
    const { d, notes } = deps(null, donnees(), destination);

    expect(await exporter(d, MATIN, MAINTENANT, jourDe)).toEqual({
      issue: "echec",
      detail: "quota Drive dépassé",
    });
    expect(notes[0]).toMatchObject({
      issue: "echec",
      detail: "quota Drive dépassé",
    });
    expect(notes[0]?.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(destination.supprimer).not.toHaveBeenCalled();
  });

  it("note l'échec avant même l'empreinte, et pour une erreur qui n'en est pas une", async () => {
    const { d, notes } = deps(null);
    d.tables = () => Promise.reject("base injoignable");

    expect(await exporter(d, MATIN, MAINTENANT, jourDe)).toEqual({
      issue: "echec",
      detail: "base injoignable",
    });
    expect(notes).toEqual([
      {
        issue: "echec",
        empreinte: null,
        fichier: null,
        detail: "base injoignable",
      },
    ]);
  });

  it("refuse de déposer une archive qui ne serait pas chiffrée", async () => {
    vi.resetModules();
    vi.doMock("./archive", async importOriginal => ({
      ...(await importOriginal<typeof import("./archive")>()),
      estChiffreAge: () => false,
    }));
    const { exporter: exporterSansAge } = await import("./exporter");
    const { d, notes, destination } = deps(null);

    expect(await exporterSansAge(d, MATIN, MAINTENANT, jourDe)).toEqual({
      issue: "echec",
      detail: "l'archive chiffrée n'a pas l'en-tête age",
    });
    expect(notes[0]?.issue).toBe("echec");
    expect(destination.deposer).not.toHaveBeenCalled();
    vi.doUnmock("./archive");
  });
});
