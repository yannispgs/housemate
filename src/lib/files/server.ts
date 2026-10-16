/** Le stockage des pièces jointes de cet environnement, créé à la demande. */
import { creerStockage, r2Config, type Stockage } from "@/lib/files/r2";

let stockage: Stockage | undefined;

export function stockageDesPieces(): Stockage {
  stockage ??= creerStockage(r2Config(process.env));

  return stockage;
}
