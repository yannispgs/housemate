/**
 * L'export en base (migration 0013) : la lecture de toutes les tables
 * exportées et le journal des passages, en propriétaire — l'export voit tout
 * le foyer, sans RLS.
 */
import type postgres from "postgres";
import type { Issue, Passage } from "./exporter";
import { type Ligne, TABLES, type Table } from "./instantane";

/**
 * Chaque ligne passe par `to_jsonb` : dates, horodatages et `jsonb` arrivent
 * déjà sous leur forme JSON, la même d'un export à l'autre.
 */
export async function lireTables(
  sql: postgres.Sql,
): Promise<Record<Table, Ligne[]>> {
  const lues = await Promise.all(
    TABLES.map(async table => {
      const [row] = await sql<[{ lignes: Ligne[] }]>`
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as lignes
        from ${sql(`app.${table}`)} t`;

      return [table, row.lignes] as const;
    }),
  );

  return Object.fromEntries(lues) as Record<Table, Ligne[]>;
}

/** Le dernier passage, réussi ou non. */
export async function dernierPassage(
  sql: postgres.Sql,
): Promise<Passage | null> {
  const [row] = await sql<Passage[]>`
    select le, issue, empreinte from app.exports
    order by le desc, id desc limit 1`;

  return row ?? null;
}

/** Le dernier passage réussi — exporté ou inchangé — pour l'alerte de panne. */
export async function dernierReussi(sql: postgres.Sql): Promise<Date | null> {
  const [row] = await sql<{ le: Date }[]>`
    select le from app.exports where issue <> 'echec'
    order by le desc, id desc limit 1`;

  return row?.le ?? null;
}

export async function noterPassage(
  sql: postgres.Sql,
  issue: Issue,
  empreinte: string | null,
  fichier: string | null,
  detail: string | null,
): Promise<void> {
  await sql`
    insert into app.exports (issue, empreinte, fichier, detail)
    values (${issue}, ${empreinte}, ${fichier}, ${detail})`;
}
