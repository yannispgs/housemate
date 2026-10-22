/**
 * Les pièces jointes dans l'export (SPEC § 14.1) : chacune déposée une seule
 * fois, à part de l'archive des données, sous un nom tiré de son
 * identifiant. Une pièce ne se modifie ni ne se supprime (migration 0004) :
 * déjà déposée, elle est à jour.
 */
import type { Ligne } from "./instantane";

/** L'extension du nom d'origine, réduite à ce qui est sûr dans un nom de fichier. */
function extension(nom: unknown): string {
  if (typeof nom !== "string") {
    return "";
  }

  const point = nom.lastIndexOf(".");
  const ext = point < 0 ? "" : nom.slice(point + 1).toLowerCase();

  return /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
}

/** Le chemin d'une pièce dans la destination, chiffrée. */
export function cheminDePiece(piece: Ligne): string {
  return `pieces/${String(piece.id)}${extension(piece.nom)}.age`;
}

/** Les pièces à déposer : celles dont le fichier manque à la destination. */
export function piecesADeposer(
  pieces: readonly Ligne[],
  deposes: ReadonlySet<string>,
): Ligne[] {
  return pieces.filter(p => !deposes.has(cheminDePiece(p)));
}
