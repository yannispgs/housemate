/**
 * Recopie les sessions de connexion entre `seed` et toutes les bases de
 * preview du projet Neon des previews, pour qu'une seule connexion vaille sur
 * toutes les previews (src/lib/db/session-sync.ts).
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… node scripts/sync-sessions.ts
 *   … SYNC_BRANCHES=essai-a,essai-b node scripts/sync-sessions.ts
 *
 * ⚠️ Ne vise QUE le projet des previews : jamais la prod, qui est un autre
 * projet Neon et n'a rien à recevoir d'une preview.
 *
 * Rejouable : chaque écriture est un « insérer si absent » ou un report
 * d'expiration vers le plus tard.
 */
import postgres from "postgres";
import {
  type AuthSession,
  type AuthUser,
  type BranchSnapshot,
  type BranchWrites,
  planSessionSync,
} from "../src/lib/db/session-sync.ts";

const key = process.env.NEON_API_KEY;
const project = process.env.NEON_PROJECT_ID;
const DATABASE = "housemate-previews";
const ROLE = "housemate-previews_owner";

if (!key || !project) {
  console.error("NEON_API_KEY et NEON_PROJECT_ID sont requis.");
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

const { branches } = await neon<{
  branches: { id: string; name: string }[];
}>("/branches");
// SYNC_BRANCHES (noms séparés par des virgules) restreint la recopie à ces
// branches : pour l'essayer sur des branches jetables sans toucher aux autres.
const only = process.env.SYNC_BRANCHES?.split(",").filter(Boolean);
const targets = branches.filter(b =>
  only === undefined
    ? b.name === "seed" || b.name.startsWith("preview/")
    : only.includes(b.name),
);

const connections = new Map<string, postgres.Sql>();

/** Lit les comptes et sessions d'une branche, et garde sa connexion. */
async function snapshot(branch: {
  id: string;
  name: string;
}): Promise<BranchSnapshot> {
  const { uri } = await neon<{ uri: string }>(
    `/connection_uri?branch_id=${branch.id}&database_name=${DATABASE}&role_name=${ROLE}`,
  );
  const sql = postgres(uri, { max: 1, onnotice: () => {} });
  connections.set(branch.name, sql);
  const [users, sessions] = [
    await sql<AuthUser[]>`
      select id::text, email, name, "emailVerified", "createdAt", "updatedAt"
      from neon_auth."user"`,
    await sql<AuthSession[]>`
      select id::text, token, "userId"::text, "expiresAt", "createdAt",
             "updatedAt", "ipAddress", "userAgent"
      from neon_auth.session`,
  ];

  return { branch: branch.name, users, sessions };
}

/** Écrit dans une branche ce que le plan lui destine, en une transaction. */
async function apply(writes: BranchWrites): Promise<string> {
  const { users, sessions } = writes;

  if (users.length === 0 && sessions.length === 0) {
    return `${writes.branch} : à jour`;
  }

  const sql = connections.get(writes.branch) as postgres.Sql;

  await sql.begin(async tx => {
    if (users.length > 0) {
      await tx`
        insert into neon_auth."user"
          ${tx(
            users.map(u => ({ ...u })),
            "id",
            "email",
            "name",
            "emailVerified",
            "createdAt",
            "updatedAt",
          )}
        on conflict do nothing`;
      // Ces comptes n'ont pas été créés ici : `user.created` n'a pas eu lieu,
      // le rattachement au foyer non plus. Sans effet hors liste blanche.
      await tx`
        insert into app.membres (foyer_id, auth_user_id)
        select l.foyer_id, c.id
        from unnest(${users.map(u => u.id)}::text[], ${users.map(u => u.email)}::text[])
          as c (id, email)
        join app.liste_blanche l on l.email = c.email
        on conflict (auth_user_id) do nothing`;
    }

    if (sessions.length > 0) {
      await tx`
        insert into neon_auth.session
          ${tx(
            sessions.map(s => ({ ...s })),
            "id",
            "token",
            "userId",
            "expiresAt",
            "createdAt",
            "updatedAt",
            "ipAddress",
            "userAgent",
          )}
        on conflict (token) do update
          set "expiresAt" = greatest(neon_auth.session."expiresAt", excluded."expiresAt"),
              "updatedAt" = now()`;
    }
  });

  return `${writes.branch} : ${users.length} compte(s), ${sessions.length} session(s)`;
}

try {
  const snapshots = await Promise.all(targets.map(snapshot));
  const reports = await Promise.all(
    planSessionSync(snapshots, new Date()).map(apply),
  );

  for (const report of reports) {
    console.log(report);
  }
} finally {
  await Promise.all([...connections.values()].map(sql => sql.end()));
}
