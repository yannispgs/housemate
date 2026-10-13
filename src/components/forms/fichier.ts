/**
 * Préparer et envoyer une pièce jointe, dans le navigateur.
 *
 * ⚠️ Une photo prise à la maison porte les coordonnées GPS du domicile dans
 * ses métadonnées (SPEC § 7.1). Redessinée sur un canevas puis réencodée en
 * JPEG, elle n'en garde aucune, et pèse quelques centaines de Ko au lieu de
 * plusieurs Mo. Un PDF part tel quel.
 */

/** Côté le plus long d'une photo envoyée : lisible, sans excès. */
const COTE_MAX = 2400;

export async function preparerFichier(fichier: File): Promise<File> {
  if (!fichier.type.startsWith("image/")) {
    return fichier;
  }

  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const canevas = document.createElement("canvas");
  canevas.width = Math.round(image.width * echelle);
  canevas.height = Math.round(image.height * echelle);
  canevas
    .getContext("2d")
    ?.drawImage(image, 0, 0, canevas.width, canevas.height);
  image.close();

  const jpeg = await new Promise<Blob | null>(resolve =>
    canevas.toBlob(resolve, "image/jpeg", 0.82),
  );

  if (jpeg === null) {
    throw new Error("La photo n'a pas pu être préparée.");
  }

  const nom = fichier.name.replace(/\.[^.]+$/, "") || "photo";

  return new File([jpeg], `${nom}.jpg`, { type: "image/jpeg" });
}

/** Envoie la pièce jointe ; rend `null` si tout va bien, sinon l'erreur. */
export async function envoyerPieceJointe(
  ficheId: string,
  fichier: File,
  nom: string,
): Promise<string | null> {
  const formulaire = new FormData();
  formulaire.set("ficheId", ficheId);
  formulaire.set("nom", nom);
  formulaire.set("fichier", await preparerFichier(fichier));

  const reponse = await fetch("/api/pieces-jointes", {
    method: "POST",
    body: formulaire,
  });

  if (reponse.ok) {
    return null;
  }

  const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };

  return corps.erreur ?? "L'envoi de la pièce jointe a échoué.";
}
