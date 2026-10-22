import { describe, expect, it } from "vitest";
import { instantane, type Ligne, TABLES, type Table } from "./instantane";
import { enMarkdown } from "./markdown";

function tables(partiel: Partial<Record<Table, Ligne[]>>) {
  return instantane({
    ...(Object.fromEntries(TABLES.map(t => [t, []])) as unknown as Record<
      Table,
      Ligne[]
    >),
    ...partiel,
  });
}

describe("enMarkdown", () => {
  it("range tout sous sa fiche", () => {
    const md = enMarkdown(
      tables({
        fiches: [
          {
            id: "f1",
            titre: "Voiture",
            nature: "objet",
            categorie: "vehicule",
            attributs: [
              { libelle: "Marque", type: "texte", valeur: "Renault" },
              {
                libelle: "Mise en circulation",
                type: "date",
                valeur: "2019-04-02",
              },
              {
                libelle: "Garantie",
                type: "duree",
                valeur: { count: 2, unit: "year" },
              },
              { libelle: "Options", type: "texte", valeur: ["gps"] },
            ],
            archivee_le: null,
          },
        ],
        pieces_jointes: [{ id: "p1", fiche_id: "f1", nom: "carte-grise.pdf" }],
        echeances: [
          {
            id: "e1",
            fiche_id: "f1",
            titre: "Contrôle technique",
            importance: "critique",
            tenue: "ferme",
            recurrence: { every: 2, unit: "year" },
            archivee_le: null,
          },
        ],
        completions: [
          {
            id: "c2",
            echeance_id: "e1",
            faite_le: "2026-03-02",
            occurrence: "2026-03-01",
            annulee: true,
            note: null,
          },
          {
            id: "c1",
            echeance_id: "e1",
            faite_le: "2024-02-27",
            occurrence: "2024-03-01",
            annulee: false,
            note: "OK sans contre-visite",
          },
        ],
        consommables: [
          {
            id: "k1",
            fiche_id: "f1",
            intitule: "Vidange",
            duree_compteur: 15000,
            duree_nombre: 1,
            duree_unite: "year",
          },
          {
            id: "k2",
            fiche_id: "f1",
            intitule: "Essuie-glaces",
            duree_compteur: null,
            duree_nombre: 6,
            duree_unite: "month",
          },
        ],
        remplacements: [
          {
            id: "r2",
            consommable_id: "k1",
            fait_le: "2026-01-10",
            compteur: 61000,
          },
          {
            id: "r1",
            consommable_id: "k1",
            fait_le: "2025-01-12",
            compteur: null,
          },
        ],
        releves: [
          {
            id: "v2",
            fiche_id: "f1",
            le: "2026-09-01",
            valeur: 64000,
            attribut: "kilometrage",
          },
          {
            id: "v1",
            fiche_id: "f1",
            le: "2026-01-10",
            valeur: 61000,
            attribut: "kilometrage",
          },
        ],
      }),
      "2026-10-22",
    );

    expect(md).toBe(
      [
        "# Export HouseMate du 2026-10-22",
        "",
        "Format housemate-export 1. La référence est `export.json` ; ce fichier n'en est qu'une lecture.",
        "",
        "## Voiture",
        "",
        "objet, vehicule",
        "",
        "### Attributs",
        "",
        "- Marque : Renault",
        "- Mise en circulation : 2019-04-02",
        "- Garantie : 2 year",
        '- Options : ["gps"]',
        "",
        "### Pièces jointes",
        "",
        "- carte-grise.pdf → `pieces/p1.pdf.age`",
        "",
        "### Échéances",
        "",
        "- **Contrôle technique** — critique, ferme",
        '  - récurrence : `{"every":2,"unit":"year"}`',
        "  - fait le 2024-02-27 (échéance du 2024-03-01) — OK sans contre-visite",
        "  - fait le 2026-03-02 (échéance du 2026-03-01), annulé",
        "",
        "### Consommables",
        "",
        "- **Vidange** — tous les 15000 au compteur ou 1 year",
        "  - remplacé le 2025-01-12",
        "  - remplacé le 2026-01-10 à 61000",
        "- **Essuie-glaces** — tous les 6 month",
        "",
        "### Relevés",
        "",
        "- 2026-01-10 : 61000 (kilometrage)",
        "- 2026-09-01 : 64000 (kilometrage)",
        "",
      ].join("\n"),
    );
  });

  it("signale les archives, et garde les échéances sans fiche", () => {
    const md = enMarkdown(
      tables({
        fiches: [
          {
            id: "f1",
            titre: "Vieux frigo",
            nature: "objet",
            categorie: null,
            attributs: null,
            archivee_le: "2026-05-01",
          },
        ],
        consommables: [
          {
            id: "k1",
            fiche_id: "f1",
            intitule: "Filtre",
            duree_compteur: 500,
            duree_nombre: null,
            duree_unite: null,
          },
        ],
        echeances: [
          {
            id: "e1",
            fiche_id: null,
            titre: "Payer la cantine",
            importance: "important",
            tenue: "souple",
            recurrence: null,
            archivee_le: "2026-07-01",
          },
        ],
      }),
      "2026-10-22",
    );

    expect(md).toContain("objet, — — archivée le 2026-05-01");
    expect(md).not.toContain("### Attributs");
    expect(md).toContain("- **Filtre** — tous les 500 au compteur\n");
    expect(md).toContain(
      [
        "## Échéances sans fiche",
        "",
        "- **Payer la cantine** — important, souple, archivée le 2026-07-01",
        "  - récurrence : `—`",
      ].join("\n"),
    );
  });
});
