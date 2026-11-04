/**
 * Les notifications push en base (migration 0012) : mes appareils, gérés à
 * mon nom sous la RLS ; et, pour l'envoi, les abonnés et le journal, lus en
 * propriétaire.
 */
import type postgres from "postgres";
import type { Tx } from "@/lib/data/store";
import { toISO } from "@/lib/domain/plain-date";
import type { ElementPush } from "./push";
import type { ReglagesResumes } from "./resumes";
import { COLONNES, type ReglagesSql, reglagesDe } from "./resumes-store";

/** Un abonnement Web Push, tel que le navigateur le donne. */
export interface Abonnement {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

/** Note cet appareil comme le mien. Rejouable. */
export async function enregistrerAbonnement(
  tx: Tx,
  { endpoint, keys }: Abonnement,
): Promise<void> {
  await tx`
    insert into app.abonnements_push (endpoint, p256dh, auth)
    values (${endpoint}, ${keys.p256dh}, ${keys.auth})
    on conflict (endpoint)
      do update set p256dh = excluded.p256dh, auth = excluded.auth`;
}

/** Ne plus notifier cet appareil. */
export async function retirerAbonnement(
  tx: Tx,
  endpoint: string,
): Promise<void> {
  await tx`delete from app.abonnements_push where endpoint = ${endpoint}`;
}

export interface Abonne {
  readonly membre: string;
  readonly compte: string;
  readonly reglages: ReglagesResumes;
  readonly abonnements: readonly Abonnement[];
}

/** Les comptes qui ont au moins un appareil, avec leurs réglages. */
export async function listerAbonnes(sql: postgres.Sql): Promise<Abonne[]> {
  const rows = (await sql`
    select m.id::text as membre, m.auth_user_id as compte,
      r.membre_id is not null as regle, ${sql.unsafe(COLONNES)},
      json_agg(json_build_object(
        'endpoint', p.endpoint,
        'keys', json_build_object('p256dh', p.p256dh, 'auth', p.auth))
        order by p.endpoint) as abonnements
    from app.membres m
    join app.abonnements_push p on p.membre_id = m.id
    left join app.reglages_resumes r on r.membre_id = m.id
    where m.auth_user_id is not null
    group by m.id, r.membre_id
    order by m.id
  `) as unknown as (ReglagesSql & {
    membre: string;
    compte: string;
    regle: boolean;
    abonnements: Abonnement[];
  })[];

  return rows.map(row => ({
    membre: row.membre,
    compte: row.compte,
    reglages: reglagesDe(row.regle ? row : undefined),
    abonnements: row.abonnements,
  }));
}

/** Un appareil que le service de push ne connaît plus. */
export async function oublierAbonnement(
  sql: postgres.Sql,
  endpoint: string,
): Promise<void> {
  await sql`delete from app.abonnements_push where endpoint = ${endpoint}`;
}

/**
 * Réserve la notification du matin : vrai si personne ne l'a envoyée avant,
 * ce jour-là.
 */
export async function reserverPush(
  sql: postgres.Sql,
  membre: string,
  jour: string,
): Promise<boolean> {
  const rows = await sql`
    insert into app.push_envoyes (membre_id, cle, le)
    values (${membre}, 'jour', ${jour})
    on conflict do nothing
    returning 1`;

  return rows.length > 0;
}

/** Rend la notification du matin : l'appel suivant la retentera. */
export async function libererPush(
  sql: postgres.Sql,
  membre: string,
  jour: string,
): Promise<void> {
  await sql`
    delete from app.push_envoyes
    where membre_id = ${membre} and cle = 'jour' and le = ${jour}`;
}

/** Les arrivées déjà annoncées à ce compte, au format de `cleAnnonce`. */
export async function annoncesDe(
  sql: postgres.Sql,
  membre: string,
): Promise<Set<string>> {
  const rows = await sql`
    select cle || '@' || to_char(le, 'YYYY-MM-DD') as annonce
    from app.push_envoyes
    where membre_id = ${membre} and cle <> 'jour'`;

  return new Set(rows.map(r => r.annonce as string));
}

/** Note les arrivées annoncées : elles ne le seront plus. */
export async function noterAnnonces(
  sql: postgres.Sql,
  membre: string,
  elements: readonly Pick<ElementPush, "cle" | "due">[],
): Promise<void> {
  if (elements.length === 0) {
    return;
  }

  await sql`
    insert into app.push_envoyes ${sql(
      elements.map(e => ({ membre_id: membre, cle: e.cle, le: toISO(e.due) })),
    )}
    on conflict do nothing`;
}
