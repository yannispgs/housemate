/**
 * L'accès aux données depuis les pages et les server actions : la base de
 * l'app, et la session de la personne connectée.
 *
 * Sans authentification (`HOUSEMATE_AUTH=desactivee` : e2e, développement
 * local), les écrans montrent les données de démonstration et ce module n'est
 * pas appelé.
 */
import postgres from "postgres";
import { neonAuth } from "@/lib/auth/server";
import { commeMembre, lireFoyer, type Tx } from "@/lib/data/store";
import { libelleFoyer } from "@/lib/data/views";

let sql: postgres.Sql | undefined;

export function baseApp(): postgres.Sql {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL manquante.");
  }

  // Une connexion par fonction ; `prepare: false` pour le pool de Neon
  // (PgBouncer en mode transaction).
  sql ??= postgres(url, { max: 1, prepare: false });

  return sql;
}

/** Le compte de la session ; une erreur sans session (le proxy l'exclut). */
export async function compteConnecte(): Promise<string> {
  const { data } = await neonAuth().getSession();
  const id = (data as { user?: { id?: string } } | null)?.user?.id;

  if (!id) {
    throw new Error(
      "Aucune session : la page aurait dû renvoyer vers /connexion.",
    );
  }

  return id;
}

/** Exécute `run` au nom de la personne connectée, sous la RLS. */
export async function enMonNom<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  return commeMembre(baseApp(), await compteConnecte(), run);
}

/**
 * « Foyer · … » pour l'en-tête, ou rien : sans session (page de connexion),
 * ou si la base ne répond pas — l'en-tête n'est qu'un repère, il ne doit
 * jamais faire tomber la page.
 */
export async function foyerConnecte(): Promise<string> {
  const { data } = await neonAuth().getSession();
  const id = (data as { user?: { id?: string } } | null)?.user?.id;

  if (!id) {
    return "";
  }

  try {
    return libelleFoyer(await commeMembre(baseApp(), id, lireFoyer));
  } catch (error_) {
    console.error("[en-tête] nom du foyer illisible", error_);

    return "";
  }
}
