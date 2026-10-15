/**
 * Ce que l'app lit et écrit en base AU NOM de la personne connectée.
 *
 * ⚠️ Une seule porte : `commeMembre`. Elle pose l'identité pour la seule
 * transaction (jamais pour la session, qui fuirait derrière le pooler), la lit
 * une première fois en propriétaire, PUIS prend le rôle `authenticated` : la
 * RLS s'applique à tout ce qui suit (ordre imposé par pg_session_jwt, voir la
 * migration 0003). Aucune requête de ce module ne s'exécute hors de cette
 * porte.
 */
import type postgres from "postgres";
import { parseRecurrence } from "@/lib/data/recurrence-json";
import type { CompletionRow, EcheanceRow, FicheRow } from "@/lib/data/views";
import { fromISO, type PlainDate, toISO } from "@/lib/domain/plain-date";
import type { Importance, Tenure } from "@/lib/ui/deadline";

export type Tx = postgres.TransactionSql;

export async function commeMembre<T>(
  sql: postgres.Sql,
  authUserId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async tx => {
    await tx`
      select set_config('request.jwt.claims', ${JSON.stringify({ sub: authUserId })}, true),
        auth.user_id()`;
    await tx`set local role authenticated`;

    return run(tx);
  })) as T;
}

/** Le nom du foyer de la personne connectée, ou `null` sans foyer. */
export async function lireFoyer(tx: Tx): Promise<string | null> {
  const [row] = await tx`select nom from app.foyers`;

  return (row?.nom as string | undefined) ?? null;
}

export async function listerFiches(tx: Tx): Promise<FicheRow[]> {
  return (await tx`
    select id::text, nature, titre, categorie
    from app.fiches
    where archivee_le is null
    order by titre`) as unknown as FicheRow[];
}

interface EcheanceSql {
  id: string;
  titre: string;
  categorie: string | null;
  recurrence: unknown;
  tolerance_jours: number;
  preavis_jours: number | null;
  tenue: Tenure;
  importance: Importance;
  fiche_titre: string | null;
  destinataire: string;
  cree_le: string;
  completions: { occurrence: string; faite_le: string }[];
}

export async function listerEcheances(tx: Tx): Promise<EcheanceRow[]> {
  // Une complétion annulée, ou corrigée par une version plus récente, ne
  // compte pas : seule la dernière version de chaque geste vaut (§ 3.3).
  const rows = (await tx`
    select
      e.id::text, e.titre, e.categorie, e.recurrence, e.tolerance_jours,
      e.preavis_jours, e.tenue, e.importance, f.titre as fiche_titre,
      case
        when e.destinataire_membre is null and e.destinataire_groupe is null
          then 'Foyer'
        when e.destinataire_membre = app.membre_courant() then 'Moi'
        else coalesce(
          (select s.surnom from app.surnoms s
            where s.observateur = app.membre_courant()
              and (s.observe_membre = e.destinataire_membre
                or s.observe_groupe = e.destinataire_groupe)),
          case when e.destinataire_groupe is null then 'Un membre'
            else 'Un groupe' end)
      end as destinataire,
      to_char(e.cree_le at time zone 'Europe/Paris', 'YYYY-MM-DD') as cree_le,
      coalesce((
        select json_agg(json_build_object(
          'occurrence', to_char(c.occurrence, 'YYYY-MM-DD'),
          'faite_le', to_char(c.faite_le, 'YYYY-MM-DD')))
        from app.completions c
        where c.echeance_id = e.id
          and not c.annulee
          and not exists (
            select from app.completions v where v.corrige = c.id)
      ), '[]') as completions
    from app.echeances e
    left join app.fiches f on f.id = e.fiche_id
    where e.archivee_le is null`) as unknown as EcheanceSql[];

  return rows.map(row => ({
    id: row.id,
    titre: row.titre,
    categorie: row.categorie,
    recurrence: parseRecurrence(row.recurrence),
    toleranceJours: row.tolerance_jours,
    preavisJours: row.preavis_jours,
    tenue: row.tenue,
    importance: row.importance,
    ficheTitre: row.fiche_titre,
    destinataire: row.destinataire,
    creeLe: fromISO(row.cree_le),
    completions: row.completions.map(
      (c): CompletionRow => ({
        occurrence: fromISO(c.occurrence),
        faiteLe: fromISO(c.faite_le),
      }),
    ),
  }));
}

/** Coche une occurrence : « fait », le jour réel du geste. Rend son id. */
export async function completer(
  tx: Tx,
  echeanceId: string,
  occurrence: PlainDate,
  faiteLe: PlainDate,
): Promise<string> {
  const [row] = await tx`
    insert into app.completions (echeance_id, occurrence, faite_le)
    values (${echeanceId}, ${toISO(occurrence)}, ${toISO(faiteLe)})
    returning id::text`;

  return row?.id as string;
}

/**
 * Annule une complétion. Le journal ne s'efface jamais (§ 3.3) : l'annulation
 * est une nouvelle ligne, qui corrige la précédente en la déclarant annulée.
 */
export async function annulerCompletions(
  tx: Tx,
  completionIds: readonly string[],
): Promise<void> {
  await tx`
    insert into app.completions
      (echeance_id, occurrence, faite_le, corrige, annulee)
    select echeance_id, occurrence, faite_le, id, true
    from app.completions where id = any(${completionIds as string[]}::uuid[])`;
}
