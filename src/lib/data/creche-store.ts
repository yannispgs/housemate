/**
 * Le rappel de crèche en base (migration 0013) : les réglages du foyer et
 * l'abonnement de chacun, lus et écrits à son nom, sous la RLS ; et, pour
 * l'envoi, les abonnés, la pluie prévue et le journal, en propriétaire.
 */
import type postgres from "postgres";
import type { Tx } from "@/lib/data/store";
import type { RainHour, Weekday } from "@/lib/domain/school-run";
import { REGLAGES_CRECHE_PAR_DEFAUT, type ReglagesCreche } from "./creche";

interface ReglagesSql {
  jours: number[];
  enfant: string | null;
  parent_sec: string | null;
  parent_pluie: string | null;
}

function reglagesDe(row: ReglagesSql | undefined): ReglagesCreche {
  if (row === undefined) {
    return REGLAGES_CRECHE_PAR_DEFAUT;
  }

  return {
    jours: row.jours as Weekday[],
    enfant: row.enfant,
    parentSec: row.parent_sec,
    parentPluie: row.parent_pluie,
  };
}

/** Les réglages de mon foyer, ou ceux par défaut. */
export async function lireReglagesCreche(tx: Tx): Promise<ReglagesCreche> {
  const [row] = (await tx`
    select jours::int[] as jours, enfant, parent_sec, parent_pluie
    from app.reglages_creche
  `) as unknown as ReglagesSql[];

  return reglagesDe(row);
}

/** Enregistre les réglages de mon foyer, en entier. */
export async function enregistrerReglagesCreche(
  tx: Tx,
  r: ReglagesCreche,
): Promise<void> {
  await tx`
    insert into app.reglages_creche (jours, enfant, parent_sec, parent_pluie)
    values (${r.jours as number[]}::smallint[], ${r.enfant}, ${r.parentSec}, ${r.parentPluie})
    on conflict (foyer_id) do update set
      jours = excluded.jours,
      enfant = excluded.enfant,
      parent_sec = excluded.parent_sec,
      parent_pluie = excluded.parent_pluie`;
}

/** Est-ce que je reçois le rappel ? */
export async function recoisRappelCreche(tx: Tx): Promise<boolean> {
  const rows = await tx`select 1 from app.abonnes_creche`;

  return rows.length > 0;
}

/** Je reçois le rappel (rejouable). */
export async function abonnerRappelCreche(tx: Tx): Promise<void> {
  await tx`insert into app.abonnes_creche default values on conflict do nothing`;
}

/** Je ne reçois plus le rappel. */
export async function desabonnerRappelCreche(tx: Tx): Promise<void> {
  await tx`delete from app.abonnes_creche`;
}

export interface AbonneCreche {
  readonly membre: string;
  readonly email: string;
  readonly reglages: ReglagesCreche;
}

/** Les comptes abonnés qui ont une adresse, avec les réglages de leur foyer. */
export async function listerAbonnesCreche(
  sql: postgres.Sql,
): Promise<AbonneCreche[]> {
  const rows = (await sql`
    select m.id::text as membre, a.email, r.foyer_id is not null as regle,
      r.jours::int[] as jours, r.enfant, r.parent_sec, r.parent_pluie
    from app.abonnes_creche ab
    join app.membres m on m.id = ab.membre_id
    join app.adresses a on a.membre_id = m.id
    left join app.reglages_creche r on r.foyer_id = m.foyer_id
    where m.auth_user_id is not null
    order by m.id
  `) as unknown as (ReglagesSql & {
    membre: string;
    email: string;
    regle: boolean;
  })[];

  return rows.map(row => ({
    membre: row.membre,
    email: row.email,
    reglages: reglagesDe(row.regle ? row : undefined),
  }));
}

/**
 * La pluie prévue, dans la dernière récupération de chaque modèle — celle
 * que le collecteur vient de figer. Un modèle se nomme par sa source et son
 * nom. Les récupérations de plus de `fraicheurHeures` sont écartées : une
 * prévision de la veille ne doit pas décider à la place d'une source muette.
 */
export async function pluiePrevue(
  sql: postgres.Sql,
  maintenant: Date,
  fraicheurHeures = 3,
): Promise<RainHour[]> {
  const depuis = new Date(maintenant.getTime() - fraicheurHeures * 3_600_000);
  const rows = await sql<{ model: string; start: Date; millimetres: number }[]>`
    select p.source || '/' || p.modele as model, p.debut as start,
      p.precipitation_mm::float8 as millimetres
    from meteo.previsions_pluie p
    where p.debut >= ${maintenant}
      and p.recuperee_le = (
        select max(q.recuperee_le) from meteo.previsions_pluie q
        where q.source = p.source and q.modele = p.modele
          and q.recuperee_le between ${depuis} and ${maintenant}
      )
    order by model, start`;

  return rows.map(row => ({ ...row }));
}

/** Réserve un rappel : vrai si personne ne l'a envoyé avant. */
export async function reserverRappelCreche(
  sql: postgres.Sql,
  membre: string,
  pourLe: string,
): Promise<boolean> {
  const rows = await sql`
    insert into app.creche_envoyes (membre_id, pour_le)
    values (${membre}, ${pourLe})
    on conflict do nothing
    returning 1`;

  return rows.length > 0;
}

/** Rend un rappel échoué : l'appel suivant le retentera. */
export async function libererRappelCreche(
  sql: postgres.Sql,
  membre: string,
  pourLe: string,
): Promise<void> {
  await sql`
    delete from app.creche_envoyes
    where membre_id = ${membre} and pour_le = ${pourLe}`;
}
