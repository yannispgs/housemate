/**
 * Crée le compte Neon Auth de chaque adresse de la liste blanche qui n'en a
 * pas encore, et le rattache au foyer de cette adresse.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… NEON_BRANCH_ID=… DATABASE_NAME=… \
 *   DATABASE_ROLE=… node scripts/provision-accounts.ts
 *
 * Pourquoi : Neon Auth n'envoie un code de connexion qu'à une adresse qui a
 * déjà un compte (mesuré le 2026-10-11 : pour une adresse sans compte, il
 * répond « succès » sans rien envoyer, inscriptions ouvertes ou non). La
 * première connexion ne peut donc pas créer le compte ; c'est conforme à la
 * SPEC § 7.2 (« aucune création de compte depuis l'app ») : les comptes du
 * foyer sont créés ici, depuis la liste blanche, et nulle part ailleurs.
 *
 * ⚠️ Un compte créé par l'API ne déclenche AUCUN webhook (ni
 * `user.before_create`, ni `user.created`) : le rattachement au foyer est
 * donc fait ici.
 *
 * Rejouable : une adresse qui a déjà son compte et son membre est laissée
 * telle quelle.
 */
import postgres from "postgres";

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

const api = `https://console.neon.tech/api/v2/projects/${project}/branches/${branch}`;
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const connection = await fetch(
  `https://console.neon.tech/api/v2/projects/${project}/connection_uri?branch_id=${branch}&database_name=${database}&role_name=${role}`,
  { headers },
);

if (!connection.ok) {
  throw new Error(`Neon connection_uri : HTTP ${connection.status}`);
}

const { uri } = (await connection.json()) as { uri: string };
const sql = postgres(uri, { max: 1, onnotice: () => {} });

try {
  const missing = await sql<{ email: string }[]>`
    select l.email from app.liste_blanche l
    where not exists (select from neon_auth."user" u where u.email = l.email)
    order by l.email`;

  // Quelques adresses au plus : le foyer.
  await Promise.all(
    missing.map(async ({ email }) => {
      const response = await fetch(`${api}/auth/users`, {
        method: "POST",
        headers,
        // Le nom est exigé en pratique (400 sans lui) ; l'app ne l'affiche
        // pas : les libellés sont des surnoms relatifs (SPEC § 7.3).
        body: JSON.stringify({ email, name: email.split("@")[0] }),
      });

      if (!response.ok) {
        const { message } = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          `Création d'un compte : HTTP ${response.status} ${message ?? ""}`,
        );
      }
    }),
  );

  const linked = await sql`
    insert into app.membres (foyer_id, auth_user_id)
    select l.foyer_id, u.id::text
    from app.liste_blanche l
    join neon_auth."user" u on u.email = l.email
    on conflict (auth_user_id) do nothing
    returning id`;

  console.log(
    `${missing.length} compte(s) créé(s), ${linked.length} membre(s) rattaché(s).`,
  );
} finally {
  await sql.end();
}
