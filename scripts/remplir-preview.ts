/**
 * Remplit le foyer d'une base de preview avec le jeu de données fictif
 * (`src/lib/data/jeu-fictif.ts`), daté à partir d'aujourd'hui.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… NEON_BRANCH_ID=… DATABASE_NAME=… \
 *   DATABASE_ROLE=… node --import ./scripts/alias.mjs scripts/remplir-preview.ts
 *
 * Seulement si le foyer est encore vide : une preview déjà remplie, ou dont
 * on a saisi des données à la main, n'est jamais touchée. Rejouable.
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
import { commeMembre } from "../src/lib/data/store.ts";
import { aujourdhuiAParis } from "../src/lib/data/today.ts";

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
  const bilan = await commeMembre(sql, compte, async tx =>
    (await foyerVide(tx))
      ? remplirFoyer(tx, jeuFictif(aujourdhuiAParis()))
      : null,
  );

  console.log(
    bilan === null
      ? "Foyer déjà rempli : rien à faire."
      : `Foyer rempli : ${bilan.fiches} fiches, ${bilan.echeances} échéances, ${bilan.consommables} consommables.`,
  );
} finally {
  await sql.end();
}
