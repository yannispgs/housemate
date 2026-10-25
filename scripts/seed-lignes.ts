/**
 * Ce que partagent `remplir-preview.ts` et `enrichir-seed.ts` : lire les
 * lignes et les colonnes datées des tables de l'app, en propriétaire, et la
 * table de marquage des previews (`preview_meta`).
 */
import type postgres from "postgres";
import { type ColonneDatee, genreDe } from "../src/lib/db/seed-dates.ts";
import type { Row } from "../src/lib/db/seed-merge.ts";

type Db = postgres.Sql | postgres.TransactionSql;

/**
 * Les dates « déjà arrivées » de chaque table : avancées, elles ne passent
 * jamais aujourd'hui (une complétion n'est pas faite demain).
 */
export const DATES_PASSEES: Readonly<Record<string, readonly string[]>> = {
  completions: ["faite_le"],
  remplacements: ["fait_le"],
  releves: ["le"],
};

/** Les colonnes qui portent des dates, table par table. */
export async function colonnesDatees(
  db: Db,
): Promise<Map<string, ColonneDatee[]>> {
  const colonnes = new Map<string, ColonneDatee[]>();

  for (const c of await db<{ table: string; name: string; type: string }[]>`
    select table_name as table, column_name as name, data_type as type
    from information_schema.columns
    where table_schema = 'app' and is_generated = 'NEVER'
    order by ordinal_position`) {
    const genre = genreDe(c.type);

    if (genre !== null) {
      colonnes.set(c.table, [
        ...(colonnes.get(c.table) ?? []),
        { name: c.name, genre },
      ]);
    }
  }

  return colonnes;
}

/** Toutes les lignes d'une table de l'app, telles que JSON les rend. */
export async function lireLignes(db: Db, table: string): Promise<Row[]> {
  const cible = db(`app.${table}`);
  const [lu] = await db<{ rows: Row[] }[]>`
    select coalesce(json_agg(t), '[]'::json) as rows from ${cible} t`;

  return lu?.rows ?? [];
}

/** Crée, s'il le faut, les tables de marquage des previews. */
export async function creerMarquage(db: Db): Promise<void> {
  await db`create schema if not exists preview_meta`;
  // Les lignes du jeu fictif d'une preview, que la fusion ne recopie pas.
  await db`
    create table if not exists preview_meta.jeu_fictif (
      table_name text not null,
      id text not null,
      primary key (table_name, id)
    )`;
  // Le jour de référence des dates de `seed` (une seule ligne).
  await db`
    create table if not exists preview_meta.reference (
      le date not null
    )`;
  // De combien de jours une preview a avancé ce qu'elle tient de `seed`.
  await db`
    create table if not exists preview_meta.decalage (
      jours integer not null
    )`;
}

/** Une table de `preview_meta`, si elle existe. */
export async function existe(db: Db, table: string): Promise<boolean> {
  const nom = `preview_meta.${table}`;
  const [lu] = await db<{ existe: boolean }[]>`
    select to_regclass(${nom}) is not null as existe`;

  return lu?.existe ?? false;
}
