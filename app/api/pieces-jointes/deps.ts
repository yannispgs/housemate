import type { Tx } from "@/lib/data/store";
import {
  ajouterPieceJointe,
  lireFiche,
  volumePiecesJointes,
} from "@/lib/data/store";
import type { DepotDeps } from "@/lib/files/depot";
import { stockageDesPieces } from "@/lib/files/server";

/** Ce dont le dépôt a besoin, au nom de la personne connectée (RLS). */
export function depotDeps(tx: Tx): DepotDeps {
  return {
    ficheVisible: async id => (await lireFiche(tx, id)) !== null,
    volumeFoyer: () => volumePiecesJointes(tx),
    enregistrer: piece => ajouterPieceJointe(tx, piece),
    stockage: stockageDesPieces(),
    identifiant: () => crypto.randomUUID(),
  };
}

/** Le corps JSON d'une demande, ou un objet vide s'il est illisible. */
export async function corps(
  request: Request,
): Promise<Record<string, unknown>> {
  const valeur: unknown = await request.json().catch(() => null);

  return typeof valeur === "object" && valeur !== null
    ? (valeur as Record<string, unknown>)
    : {};
}
