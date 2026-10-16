import { z } from "zod";
import { enMonNom } from "@/lib/data/server";
import { lirePieceJointe } from "@/lib/data/store";
import { stockageDesPieces } from "@/lib/files/server";

/**
 * Ouvrir une pièce jointe : si la personne connectée la voit (RLS), renvoi
 * vers un lien de lecture signé de 5 minutes. Jamais d'adresse publique.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = z.uuid().safeParse((await params).id);
  const piece = id.success
    ? await enMonNom(tx => lirePieceJointe(tx, id.data))
    : null;

  if (piece === null) {
    return new Response("Pièce jointe introuvable.", { status: 404 });
  }

  const lien = await stockageDesPieces().lienDeLecture(piece.cle, piece.nom);

  return new Response(null, {
    status: 302,
    headers: { location: lien, "cache-control": "no-store" },
  });
}
