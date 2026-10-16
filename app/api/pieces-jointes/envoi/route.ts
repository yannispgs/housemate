import { enMonNom } from "@/lib/data/server";
import { autoriserEnvoi } from "@/lib/files/depot";
import { enTetesDEnvoi } from "@/lib/files/r2";
import { corps, depotDeps } from "../deps";

/**
 * Demander à envoyer un fichier (JSON : `ficheId`, `type`, `taille`). Rend un
 * lien d'envoi signé, valable 5 minutes, et les en-têtes à joindre. Session
 * exigée par le proxy ; droits vérifiés sous la RLS.
 */
export async function POST(request: Request): Promise<Response> {
  const demande = await corps(request);
  const resultat = await enMonNom(tx =>
    autoriserEnvoi(
      {
        ficheId: demande.ficheId,
        type: demande.type,
        taille: demande.taille,
      },
      depotDeps(tx),
    ),
  );

  return resultat.ok
    ? Response.json(
        {
          cle: resultat.cle,
          url: resultat.url,
          enTetes: enTetesDEnvoi(demande.type as string),
        },
        { status: 201, headers: { "cache-control": "no-store" } },
      )
    : Response.json({ erreur: resultat.erreur }, { status: resultat.statut });
}
