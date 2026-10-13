import { enMonNom } from "@/lib/data/server";
import { ajouterPieceJointe, lireFiche } from "@/lib/data/store";
import { deposerPieceJointe, type FichierRecu } from "@/lib/files/depot";
import { stockageDesPieces } from "@/lib/files/server";

/**
 * Joindre un fichier à une fiche (formulaire multipart : `ficheId`, `nom`,
 * `fichier`). Session exigée par le proxy ; droits vérifiés sous la RLS.
 */
export async function POST(request: Request): Promise<Response> {
  const formulaire = await request.formData();
  const fichier = formulaire.get("fichier");
  const nom = formulaire.get("nom");

  const resultat = await enMonNom(tx =>
    deposerPieceJointe(
      {
        ficheId: formulaire.get("ficheId"),
        nom: typeof nom === "string" ? nom : null,
        fichier: fichier instanceof File ? (fichier as FichierRecu) : null,
      },
      {
        ficheVisible: async id => (await lireFiche(tx, id)) !== null,
        enregistrer: piece => ajouterPieceJointe(tx, piece),
        stockage: stockageDesPieces(),
        identifiant: () => crypto.randomUUID(),
      },
    ),
  );

  return resultat.ok
    ? Response.json({ id: resultat.id }, { status: 201 })
    : Response.json({ erreur: resultat.erreur }, { status: resultat.statut });
}
