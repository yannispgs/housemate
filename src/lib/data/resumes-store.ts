/**
 * Les résumés en base (migration 0010) : les réglages d'un compte, lus et
 * écrits à son nom, sous la RLS ; et, pour l'envoi, la liste des
 * destinataires et le journal des envois, lus en propriétaire.
 */
import type postgres from "postgres";
import type { Tx } from "@/lib/data/store";
import type { Importance } from "@/lib/ui/deadline";
import {
  type Horizon,
  type Perimetre,
  REGLAGES_PAR_DEFAUT,
  type ReglagesResumes,
  type SorteResume,
} from "./resumes";

interface ReglagesSql {
  hebdo: boolean;
  hebdo_jour: number;
  hebdo_heure: number;
  quotidien: boolean;
  quotidien_heure: number;
  horizon_jours: Horizon;
  retards: boolean;
  perimetre: Perimetre;
  email_critique: boolean;
  email_important: boolean;
  email_normal: boolean;
  email_memoire: boolean;
}

function reglagesDe(row: ReglagesSql | undefined): ReglagesResumes {
  if (row === undefined) {
    return REGLAGES_PAR_DEFAUT;
  }

  const email: Record<Importance, boolean> = {
    critique: row.email_critique,
    important: row.email_important,
    normal: row.email_normal,
    memoire: row.email_memoire,
  };

  return {
    hebdo: row.hebdo,
    hebdoJour: row.hebdo_jour,
    hebdoHeure: row.hebdo_heure,
    quotidien: row.quotidien,
    quotidienHeure: row.quotidien_heure,
    horizonJours: row.horizon_jours,
    retards: row.retards,
    perimetre: row.perimetre,
    email,
  };
}

const COLONNES = `
  r.hebdo, r.hebdo_jour, r.hebdo_heure, r.quotidien, r.quotidien_heure,
  r.horizon_jours, r.retards, r.perimetre, r.email_critique,
  r.email_important, r.email_normal, r.email_memoire`;

/** Mes réglages, ou ceux par défaut si je n'ai rien changé. */
export async function lireReglagesResumes(tx: Tx): Promise<ReglagesResumes> {
  const [row] = (await tx`
    select ${tx.unsafe(COLONNES)} from app.reglages_resumes r
  `) as unknown as ReglagesSql[];

  return reglagesDe(row);
}

/** Enregistre mes réglages, en entier. */
export async function enregistrerReglagesResumes(
  tx: Tx,
  r: ReglagesResumes,
): Promise<void> {
  const valeurs = {
    hebdo: r.hebdo,
    hebdo_jour: r.hebdoJour,
    hebdo_heure: r.hebdoHeure,
    quotidien: r.quotidien,
    quotidien_heure: r.quotidienHeure,
    horizon_jours: r.horizonJours,
    retards: r.retards,
    perimetre: r.perimetre,
    email_critique: r.email.critique,
    email_important: r.email.important,
    email_normal: r.email.normal,
    email_memoire: r.email.memoire,
  };
  await tx`
    insert into app.reglages_resumes ${tx(valeurs)}
    on conflict (membre_id) do update
    set ${tx(valeurs)}`;
}

export interface Destinataire {
  readonly membre: string;
  readonly compte: string;
  readonly email: string;
  readonly reglages: ReglagesResumes;
}

/** Tous les comptes qui ont une adresse, avec leurs réglages. */
export async function listerDestinataires(
  sql: postgres.Sql,
): Promise<Destinataire[]> {
  const rows = (await sql`
    select m.id::text as membre, m.auth_user_id as compte, a.email,
      r.membre_id is not null as regle, ${sql.unsafe(COLONNES)}
    from app.membres m
    join app.adresses a on a.membre_id = m.id
    left join app.reglages_resumes r on r.membre_id = m.id
    where m.auth_user_id is not null
    order by m.id
  `) as unknown as (ReglagesSql & {
    membre: string;
    compte: string;
    email: string;
    regle: boolean;
  })[];

  return rows.map(row => ({
    membre: row.membre,
    compte: row.compte,
    email: row.email,
    reglages: reglagesDe(row.regle ? row : undefined),
  }));
}

/**
 * Réserve l'envoi d'un résumé : vrai si personne ne l'a fait avant, ce
 * jour-là. Deux appels simultanés n'en envoient donc jamais deux.
 */
export async function reserverResume(
  sql: postgres.Sql,
  membre: string,
  sorte: SorteResume,
  jour: string,
): Promise<boolean> {
  const rows = await sql`
    insert into app.resumes_envoyes (membre_id, sorte, le)
    values (${membre}, ${sorte}, ${jour})
    on conflict do nothing
    returning 1`;

  return rows.length > 0;
}

/** Rend un envoi échoué : l'appel suivant le retentera. */
export async function libererResume(
  sql: postgres.Sql,
  membre: string,
  sorte: SorteResume,
  jour: string,
): Promise<void> {
  await sql`
    delete from app.resumes_envoyes
    where membre_id = ${membre} and sorte = ${sorte} and le = ${jour}`;
}
