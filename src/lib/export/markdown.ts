/**
 * La forme humaine de l'export (SPEC § 14.1) : un Markdown lisible sans
 * HouseMate, une fois l'archive déchiffrée. Rangé par fiche — ce qu'on
 * cherche en cas de pépin (« quand a-t-on changé le filtre ? ») — puis ce qui
 * n'est rattaché à aucune fiche. La forme machine (le JSON) reste la
 * référence : celle-ci n'en est qu'une lecture.
 */
import type { Instantane, Json, Ligne } from "./instantane";
import { cheminDePiece } from "./pieces";

function texte(valeur: Json | undefined): string {
  if (valeur === undefined || valeur === null) {
    return "—";
  }

  return typeof valeur === "string" ? valeur : JSON.stringify(valeur);
}

/** Les lignes d'une table rattachées à `id` par la colonne `colonne`. */
function de(lignes: readonly Ligne[], colonne: string, id: Json | undefined) {
  return lignes.filter(l => l[colonne] === id);
}

/** Les attributs d'une fiche, dans l'ordre saisi : `[{ libelle, type, valeur }]`. */
function attributs(valeur: Json | undefined): string[] {
  if (!Array.isArray(valeur)) {
    return [];
  }

  return (valeur as readonly Ligne[]).map(a => {
    const v = a.valeur;
    const duree =
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? `${texte((v as Ligne).count)} ${texte((v as Ligne).unit)}`
        : texte(v);

    return `- ${texte(a.libelle)} : ${duree}`;
  });
}

function echeance(e: Ligne, completions: readonly Ligne[]): string[] {
  const faites = de(completions, "echeance_id", e.id)
    .slice()
    .sort((a, b) => texte(a.faite_le).localeCompare(texte(b.faite_le)))
    .map(
      c =>
        `  - fait le ${texte(c.faite_le)} (échéance du ${texte(c.occurrence)})${
          c.annulee === true ? ", annulé" : ""
        }${typeof c.note === "string" ? ` — ${c.note}` : ""}`,
    );

  return [
    `- **${texte(e.titre)}** — ${texte(e.importance)}, ${texte(e.tenue)}${
      e.archivee_le === null || e.archivee_le === undefined
        ? ""
        : `, archivée le ${texte(e.archivee_le)}`
    }`,
    `  - récurrence : \`${texte(e.recurrence)}\``,
    ...faites,
  ];
}

function consommable(c: Ligne, remplacements: readonly Ligne[]): string[] {
  const duree = [
    c.duree_compteur === null || c.duree_compteur === undefined
      ? null
      : `${texte(c.duree_compteur)} au compteur`,
    c.duree_nombre === null || c.duree_nombre === undefined
      ? null
      : `${texte(c.duree_nombre)} ${texte(c.duree_unite)}`,
  ].filter(d => d !== null);

  return [
    `- **${texte(c.intitule)}** — tous les ${duree.join(" ou ")}`,
    ...de(remplacements, "consommable_id", c.id)
      .slice()
      .sort((a, b) => texte(a.fait_le).localeCompare(texte(b.fait_le)))
      .map(
        r =>
          `  - remplacé le ${texte(r.fait_le)}${
            r.compteur === null || r.compteur === undefined
              ? ""
              : ` à ${texte(r.compteur)}`
          }`,
      ),
  ];
}

function section(titre: string, lignes: readonly string[]): string[] {
  return lignes.length === 0 ? [] : ["", titre, "", ...lignes];
}

function fiche(f: Ligne, t: Instantane["tables"]): string[] {
  return [
    "",
    `## ${texte(f.titre)}`,
    "",
    `${texte(f.nature)}, ${texte(f.categorie)}${
      f.archivee_le === null || f.archivee_le === undefined
        ? ""
        : ` — archivée le ${texte(f.archivee_le)}`
    }`,
    ...section("### Attributs", attributs(f.attributs)),
    ...section(
      "### Pièces jointes",
      de(t.pieces_jointes, "fiche_id", f.id).map(
        p => `- ${texte(p.nom)} → \`${cheminDePiece(p)}\``,
      ),
    ),
    ...section(
      "### Échéances",
      de(t.echeances, "fiche_id", f.id).flatMap(e =>
        echeance(e, t.completions),
      ),
    ),
    ...section(
      "### Consommables",
      de(t.consommables, "fiche_id", f.id).flatMap(c =>
        consommable(c, t.remplacements),
      ),
    ),
    ...section(
      "### Relevés",
      de(t.releves, "fiche_id", f.id)
        .slice()
        .sort((a, b) => texte(a.le).localeCompare(texte(b.le)))
        .map(
          r => `- ${texte(r.le)} : ${texte(r.valeur)} (${texte(r.attribut)})`,
        ),
    ),
  ];
}

export function enMarkdown(i: Instantane, genereLe: string): string {
  const t = i.tables;
  const sansFiche = t.echeances.filter(
    e => e.fiche_id === null || e.fiche_id === undefined,
  );

  return [
    `# Export HouseMate du ${genereLe}`,
    "",
    `Format ${i.format.nom} ${i.format.version}. La référence est \`export.json\` ; ce fichier n'en est qu'une lecture.`,
    ...t.fiches.flatMap(f => fiche(f, t)),
    ...section(
      "## Échéances sans fiche",
      sansFiche.flatMap(e => echeance(e, t.completions)),
    ),
    "",
  ].join("\n");
}
