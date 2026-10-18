/**
 * À la fusion d'une PR, recopie dans `seed` ce qu'on a saisi sur sa preview
 * (src/lib/db/seed-merge.ts) : ajouts seulement, jeu fictif écarté.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… PREVIEW_BRANCH=preview/pr-42 \
 *   node scripts/enrichir-seed.ts
 *
 * À lancer APRÈS les migrations de `seed` : les lignes de la preview ont le
 * schéma de la PR, que `seed` doit déjà avoir.
 *
 * ⚠️ Ne vise QUE le projet des previews, jamais la prod. Les comptes et les
 * sessions suivent leur propre chemin (scripts/sync-sessions.ts). Les
 * fichiers des pièces jointes n'ont rien à suivre : toutes les previews
 * partagent le même bucket, que la fermeture d'une PR ne vide pas.
 *
 * Rejouable : chaque insertion ignore une ligne déjà présente.
 */
import postgres from "postgres";
import {
  type IdsByTable,
  planSeedMerge,
  type Reference,
  type Row,
  type TableSnapshot,
} from "../src/lib/db/seed-merge.ts";

const key = process.env.NEON_API_KEY;
const project = process.env.NEON_PROJECT_ID;
const previewName = process.env.PREVIEW_BRANCH;
// SEED_BRANCH remplace `seed` : pour essayer sur des branches jetables.
const seedName = process.env.SEED_BRANCH ?? "seed";
const DATABASE = "housemate-previews";
const ROLE = "housemate-previews_owner";

if (!key || !project || !previewName) {
  console.error("NEON_API_KEY, NEON_PROJECT_ID et PREVIEW_BRANCH sont requis.");
  process.exit(1);
}

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

async function connect(branchId: string): Promise<postgres.Sql> {
  const { uri } = await neon<{ uri: string }>(
    `/connection_uri?branch_id=${branchId}&database_name=${DATABASE}&role_name=${ROLE}`,
  );

  return postgres(uri, { max: 1, onnotice: () => {} });
}

const { branches } = await neon<{
  branches: { id: string; name: string }[];
}>("/branches");
const preview = branches.find(b => b.name === previewName);
const seedBranch = branches.find(b => b.name === seedName);

if (preview === undefined || seedBranch === undefined) {
  console.log(
    `« ${previewName} » ou « ${seedName} » introuvable : rien à recopier.`,
  );
  process.exit(0);
}

const source = await connect(preview.id);
const seed = await connect(seedBranch.id);

try {
  const [marquage] = await source<{ table: boolean }[]>`
    select to_regclass('preview_meta.jeu_fictif') is not null as table`;

  // Une preview d'avant le marquage : impossible d'y distinguer le jeu fictif
  // de la saisie, donc rien n'est recopié plutôt que d'encombrer `seed`.
  if (!marquage?.table) {
    console.log(
      `::warning::${previewName} n'a pas de jeu fictif marqué : rien n'est recopié dans seed.`,
    );
    process.exit(0);
  }

  const fictifs = new Map<string, Set<string>>();

  for (const { table_name, id } of await source<
    { table_name: string; id: string }[]
  >`select table_name, id from preview_meta.jeu_fictif`) {
    fictifs.set(table_name, (fictifs.get(table_name) ?? new Set()).add(id));
  }

  // Les références d'une colonne vers l'`id` d'une autre table de l'app.
  const references = await source<
    { table: string; column: string; target: string }[]
  >`
    select c.conrelid::regclass::text as table, a.attname as column,
      c.confrelid::regclass::text as target
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'app'::regnamespace
      and cardinality(c.conkey) = 1`;
  const tables = await source<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'app'
    order by tablename`;
  const snapshots = await Promise.all(
    tables.map(async ({ name }): Promise<TableSnapshot> => {
      const cible = source(`app.${name}`);
      const [lu] = await source<{ rows: Row[] }[]>`
        select coalesce(json_agg(t), '[]'::json) as rows from ${cible} t`;
      const qualifie = `app.${name}`;

      return {
        name,
        references: references
          .filter(r => r.table === qualifie)
          .map(
            (r): Reference => ({
              column: r.column,
              table: r.target.replace(/^app\./, ""),
            }),
          ),
        rows: lu?.rows ?? [],
      };
    }),
  );

  const plan = planSeedMerge(snapshots, fictifs as IdsByTable);
  const bilan = await seed.begin(async tx => {
    // `seed` porte la table de marquage, vide : les previews qui en naissent
    // savent ainsi qu'elles ont à poser, et à noter, leur jeu fictif.
    await tx`create schema if not exists preview_meta`;
    await tx`
      create table if not exists preview_meta.jeu_fictif (
        table_name text not null,
        id text not null,
        primary key (table_name, id)
      )`;
    const colonnes = new Map<string, string[]>();

    for (const c of await tx<{ table: string; name: string }[]>`
      select table_name as table, column_name as name
      from information_schema.columns
      where table_schema = 'app' and is_generated = 'NEVER'
      order by ordinal_position`) {
      colonnes.set(c.table, [...(colonnes.get(c.table) ?? []), c.name]);
    }

    // Une table après l'autre, dans l'ordre du plan : une ligne ne s'insère
    // qu'une fois là celle qu'elle vise.
    const ajouts = await plan
      .filter(table => table.rows.length > 0)
      .reduce(async (precedents, table) => {
        const liste = await precedents;
        const noms = colonnes.get(table.name) ?? [];
        const cible = tx(`app.${table.name}`);
        const lignes = tx.json(table.rows as postgres.JSONValue);
        const inserees = await tx`
          insert into ${cible} (${tx(noms)})
          select ${tx(noms)}
          from json_populate_recordset(null::${cible}, ${lignes}::json)
          on conflict do nothing`;

        return inserees.count > 0
          ? [...liste, `${table.name} ${inserees.count}`]
          : liste;
      }, Promise.resolve<string[]>([]));

    return ajouts;
  });

  console.log(
    bilan.length === 0
      ? `${previewName} : rien de nouveau pour seed.`
      : `${previewName} → seed : ${bilan.join(", ")}.`,
  );
} finally {
  await Promise.all([source.end(), seed.end()]);
}
