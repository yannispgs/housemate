/**
 * Ce que partagent `sync-sessions.ts` et `enrichir-seed.ts` : l'API Neon du
 * projet des previews, la liste de ses branches et une connexion à la base
 * d'une branche, en propriétaire.
 *
 * ⚠️ Ne vise QUE le projet des previews, jamais la prod.
 */
import postgres from "postgres";

const DATABASE = "housemate-previews";
const ROLE = "housemate-previews_owner";

export interface Branche {
  readonly id: string;
  readonly name: string;
}

export function projetPreviews(key: string, project: string) {
  const api = `https://console.neon.tech/api/v2/projects/${project}`;

  async function neon<T>(path: string): Promise<T> {
    const response = await fetch(`${api}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!response.ok) {
      throw new Error(`Neon ${path} : HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }

  return {
    async branches(): Promise<Branche[]> {
      return (await neon<{ branches: Branche[] }>("/branches")).branches;
    },

    async connect(branchId: string): Promise<postgres.Sql> {
      const { uri } = await neon<{ uri: string }>(
        `/connection_uri?branch_id=${branchId}&database_name=${DATABASE}&role_name=${ROLE}`,
      );

      return postgres(uri, { max: 1, onnotice: () => {} });
    },
  };
}
