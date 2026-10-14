import { enMonNom } from "@/lib/data/server";
import { confirmerEnvoi } from "@/lib/files/depot";
import { corps, depotDeps } from "./deps";

/**
 * Confirmer un envoi (JSON : `ficheId`, `cle`, `nom`, `nomFichier`) : le
 * serveur vérifie ce que le stockage a reçu, puis joint le fichier à la
 * fiche. Session exigée par le proxy ; droits vérifiés sous la RLS.
 */
export async function POST(request: Request): Promise<Response> {
  const demande = await corps(request);
  const texte = (valeur: unknown) => (typeof valeur === "string" ? valeur : "");

  const resultat = await enMonNom(tx =>
    confirmerEnvoi(
      {
        ficheId: demande.ficheId,
        cle: demande.cle,
        nom: texte(demande.nom),
        nomFichier: texte(demande.nomFichier),
      },
      depotDeps(tx),
    ),
  );

  return resultat.ok
    ? Response.json({ id: resultat.id }, { status: 201 })
    : Response.json({ erreur: resultat.erreur }, { status: resultat.statut });
}
