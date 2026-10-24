/**
 * À la fusion d'une PR, recopie dans `seed` ce qu'on a saisi sur sa preview
 * (src/lib/db/seed-merge.ts) : ajouts seulement, jeu fictif écarté.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… PREVIEW_BRANCH=preview/pr-42 \
 *   node --import ./scripts/alias.mjs scripts/enrichir-seed.ts
 *
 * À lancer APRÈS les migrations de `seed` : les lignes de la preview ont le
 * schéma de la PR, que `seed` doit déjà avoir.
 *
 * ⚠️ Ne vise QUE le projet des previews, jamais la prod. Les comptes et les
 * sessions suivent leur propre chemin (scripts/sync-sessions.ts). Les
 * fichiers des pièces jointes n'ont rien à suivre : toutes les previews
 * partagent le même bucket, que la fermeture d'une PR ne vide pas.
 *
 * Les dates de la saisie reculent du décalage de la preview, pour rejoindre
 * le repère de `seed` (src/lib/db/seed-dates.ts).
 *
 * Rejouable : chaque insertion ignore une ligne déjà présente.
 */
import type postgres from "postgres";
import { aujourdhuiAParis } from "../src/lib/data/today.ts";
import { decaler } from "../src/lib/db/seed-dates.ts";
import {
  type IdsByTable,
  planSeedMerge,
  type Reference,
  type TableSnapshot,
} from "../src/lib/db/seed-merge.ts";
import { daysBetween, fromISO, toISO } from "../src/lib/domain/plain-date.ts";
import { projetPreviews } from "./neon-previews.ts";
import {
  colonnesDatees,
  creerMarquage,
  existe,
  lireLignes,
} from "./seed-lignes.ts";

const key = process.env.NEON_API_KEY;
const project = process.env.NEON_PROJECT_ID;
const previewName = process.env.PREVIEW_BRANCH;
// SEED_BRANCH remplace `seed` : pour essayer sur des branches jetables.
const seedName = process.env.SEED_BRANCH ?? "seed";

if (!key || !project || !previewName) {
  console.error("NEON_API_KEY, NEON_PROJECT_ID et PREVIEW_BRANCH sont requis.");
  process.exit(1);
}

const { branches: lireBranches, connect } = projetPreviews(key, project);
const branches = await lireBranches();
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
  // Une preview d'avant le marquage : impossible d'y distinguer le jeu fictif
  // de la saisie, donc rien n'est recopié plutôt que d'encombrer `seed`.
  if (!(await existe(source, "jeu_fictif"))) {
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
        rows: await lireLignes(source, name),
      };
    }),
  );
  const [decalage] = (await existe(source, "decalage"))
    ? await source<{ jours: number }[]>`
        select jours from preview_meta.decalage limit 1`
    : [];
  const datees = await colonnesDatees(source);

  const plan = planSeedMerge(snapshots, fictifs as IdsByTable);
  const bilan = await seed.begin(async tx => {
    // `seed` porte les tables de marquage, vides : les previews qui en
    // naissent savent ainsi qu'elles ont à poser, et à noter, leur jeu fictif.
    await creerMarquage(tx);
    const aujourdhui = aujourdhuiAParis();
    const [reference] = await tx<{ le: string }[]>`
      select le::text from preview_meta.reference limit 1`;

    if (reference === undefined) {
      // La première recopie fixe le jour de référence : aujourd'hui, la
      // saisie étant restée à l'heure réelle.
      await tx`insert into preview_meta.reference ${tx({ le: toISO(aujourdhui) })}`;
    }

    // Ce que la preview a avancé, recule d'autant pour rejoindre le repère de
    // `seed`. Sans décalage noté, la preview est restée à l'heure réelle.
    const jours =
      decalage?.jours ??
      (reference === undefined
        ? 0
        : daysBetween(fromISO(reference.le), aujourdhui));

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
        const lignes = tx.json(
          table.rows.map(ligne =>
            decaler(ligne, datees.get(table.name) ?? [], -jours),
          ) as postgres.JSONValue,
        );
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
