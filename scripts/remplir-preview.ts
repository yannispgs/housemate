/**
 * Remplit le foyer d'une base de preview avec le jeu de données fictif
 * (`src/lib/data/jeu-fictif.ts`), daté à partir d'aujourd'hui.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… NEON_BRANCH_ID=… DATABASE_NAME=… \
 *   DATABASE_ROLE=… node --import ./scripts/alias.mjs scripts/remplir-preview.ts
 *
 * Une seule fois par preview : ses lignes sont notées dans
 * `preview_meta.jeu_fictif`, pour que la fusion de la PR ne les recopie pas
 * dans `seed` (`scripts/enrichir-seed.ts`). Une preview où elles sont déjà
 * notées n'est plus touchée. Rejouable.
 *
 * Tout passe par la RLS, au nom d'un membre du foyer : le jeu est écrit
 * comme le formulaire d'ajout l'écrirait.
 *
 * ⚠️ Jamais sur la prod : le script refuse un projet qui n'est pas celui des
 * previews.
 */
import postgres from "postgres";
import { jeuFictif } from "../src/lib/data/jeu-fictif.ts";
import { foyerVide, remplirFoyer } from "../src/lib/data/remplissage.ts";
import { commeMembre, type Tx } from "../src/lib/data/store.ts";
import { aujourdhuiAParis } from "../src/lib/data/today.ts";
import { type IdsByTable, newIds } from "../src/lib/db/seed-merge.ts";

const {
  NEON_API_KEY: key,
  NEON_PROJECT_ID: project,
  NEON_BRANCH_ID: branch,
  DATABASE_NAME: database,
  DATABASE_ROLE: role,
} = process.env;

if (!key || !project || !branch || !database || !role) {
  console.error(
    "NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID, DATABASE_NAME et DATABASE_ROLE sont requis.",
  );
  process.exit(1);
}

if (database !== "housemate-previews") {
  console.error(
    `Base « ${database} » : ce script ne remplit que les previews.`,
  );
  process.exit(1);
}

const connection = await fetch(
  `https://console.neon.tech/api/v2/projects/${project}/connection_uri?branch_id=${branch}&database_name=${database}&role_name=${role}`,
  { headers: { Authorization: `Bearer ${key}` } },
);

if (!connection.ok) {
  throw new Error(`Neon connection_uri : HTTP ${connection.status}`);
}

const { uri } = (await connection.json()) as { uri: string };
const sql = postgres(uri, { max: 1, onnotice: () => {} });

/** Les identifiants de chaque table de l'app, lus en propriétaire. */
async function lireIdentifiants(db: postgres.Sql | Tx): Promise<IdsByTable> {
  const tables = await db<{ table: string }[]>`
    select table_name as table from information_schema.columns
    where table_schema = 'app' and column_name = 'id'
    order by table_name`;
  const lus = await Promise.all(
    tables.map(async ({ table }) => {
      const cible = db(`app.${table}`);
      const rows = await db<{ id: string }[]>`select id::text from ${cible}`;

      return [table, new Set(rows.map(r => r.id))] as const;
    }),
  );
  const ids = new Map(lus);

  return ids;
}

try {
  // Un seul foyer dans une preview : celui de démonstration, où sont
  // rattachés les comptes de la liste blanche.
  const membres = await sql<{ foyer: string; compte: string }[]>`
    select foyer_id::text as foyer, auth_user_id as compte
    from app.membres where auth_user_id is not null
    order by auth_user_id`;
  const foyers = new Set(membres.map(m => m.foyer));

  if (foyers.size !== 1) {
    throw new Error(
      `Un foyer avec des membres est attendu, ${foyers.size} trouvé(s).`,
    );
  }

  const compte = (membres[0] as { compte: string }).compte;
  const [{ table } = { table: false }] = await sql<{ table: boolean }[]>`
    select to_regclass('preview_meta.jeu_fictif') is not null as table`;
  // Deux requêtes : une table absente est refusée dès l'analyse, même
  // derrière un `and` qui ne l'atteindrait pas.
  const [{ pose } = { pose: false }] = table
    ? await sql<{ pose: boolean }[]>`
        select exists (select from preview_meta.jeu_fictif) as pose`
    : [];
  const marquage = { table, pose };
  const avant = await lireIdentifiants(sql);
  const bilan = marquage?.pose
    ? null
    : await commeMembre(sql, compte, async tx => {
        // Sans table de marquage, la preview est d'avant l'enrichissement de
        // `seed` : son foyer, s'il n'est pas vide, a déjà son jeu fictif.
        if (!marquage?.table && !(await foyerVide(tx))) {
          return null;
        }

        const rempli = await remplirFoyer(tx, jeuFictif(aujourdhuiAParis()));
        // Redevenu propriétaire, dans la même transaction : le jeu et sa
        // marque s'écrivent ensemble ou pas du tout.
        await tx`reset role`;
        await tx`create schema if not exists preview_meta`;
        await tx`
          create table if not exists preview_meta.jeu_fictif (
            table_name text not null,
            id text not null,
            primary key (table_name, id)
          )`;
        const lignes = [...newIds(avant, await lireIdentifiants(tx))].flatMap(
          ([table, ids]) => [...ids].map(id => ({ table_name: table, id })),
        );
        await tx`insert into preview_meta.jeu_fictif ${tx(lignes)}`;

        return rempli;
      });

  console.log(
    bilan === null
      ? "Jeu fictif déjà posé : rien à faire."
      : `Jeu fictif posé : ${bilan.fiches} fiches, ${bilan.echeances} échéances, ${bilan.consommables} consommables.`,
  );
} finally {
  await sql.end();
}
