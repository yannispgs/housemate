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
import type {
  Attribut,
  NouvelleEcheance,
  NouvelleFiche,
} from "@/lib/data/saisie";
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

/* ------------------------------------------------------------------------ */
/* Ajouts                                                                   */
/* ------------------------------------------------------------------------ */

export async function creerFiche(
  tx: Tx,
  fiche: NouvelleFiche,
): Promise<string> {
  const [row] = await tx`
    insert into app.fiches (nature, titre, categorie, attributs)
    values (${fiche.nature}, ${fiche.titre}, ${fiche.categorie},
      ${tx.json(fiche.attributs as unknown as postgres.JSONValue)})
    returning id::text`;

  return row?.id as string;
}

export async function creerEcheance(
  tx: Tx,
  echeance: NouvelleEcheance,
): Promise<string> {
  const [row] = await tx`
    insert into app.echeances (
      titre, categorie, recurrence, tolerance_jours, preavis_jours, tenue,
      importance, fiche_id)
    values (${echeance.titre}, ${echeance.categorie},
      ${tx.json(echeance.recurrence as postgres.JSONValue)},
      ${echeance.toleranceJours}, ${echeance.preavisJours}, ${echeance.tenue},
      ${echeance.importance}, ${echeance.ficheId})
    returning id::text`;
  const id = row?.id as string;

  // « N après la dernière fois » : la dernière fois connue est un geste fait.
  if (echeance.derniereFois !== null) {
    const jour = fromISO(echeance.derniereFois);
    await completer(tx, id, jour, jour);
  }

  return id;
}

/** La fiche de l'objet et sa fin de garantie, ensemble ou pas du tout. */
export async function creerGarantie(
  tx: Tx,
  garantie: {
    readonly fiche: NouvelleFiche;
    readonly echeance: Omit<NouvelleEcheance, "ficheId" | "derniereFois">;
  },
): Promise<string> {
  const ficheId = await creerFiche(tx, garantie.fiche);
  await creerEcheance(tx, {
    ...garantie.echeance,
    ficheId,
    derniereFois: null,
  });

  return ficheId;
}

export interface NouvellePieceJointe {
  readonly ficheId: string;
  readonly nom: string;
  readonly typeMime: string;
  readonly taille: number;
  readonly cle: string;
}

export async function ajouterPieceJointe(
  tx: Tx,
  piece: NouvellePieceJointe,
): Promise<string> {
  const [row] = await tx`
    insert into app.pieces_jointes (fiche_id, nom, type_mime, taille, cle)
    values (${piece.ficheId}, ${piece.nom}, ${piece.typeMime}, ${piece.taille},
      ${piece.cle})
    returning id::text`;

  return row?.id as string;
}

/* ------------------------------------------------------------------------ */
/* Une fiche, en détail                                                     */
/* ------------------------------------------------------------------------ */

export interface FicheDetail {
  readonly id: string;
  readonly nature: FicheRow["nature"];
  readonly titre: string;
  readonly categorie: string | null;
  readonly attributs: readonly Attribut[];
  readonly echeances: readonly {
    readonly id: string;
    readonly titre: string;
  }[];
  readonly pieces: readonly {
    readonly id: string;
    readonly nom: string;
    readonly typeMime: string;
    readonly taille: number;
    readonly ajouteeLe: string;
  }[];
}

/** Une fiche visible de la personne connectée, ou `null`. */
export async function lireFiche(
  tx: Tx,
  id: string,
): Promise<FicheDetail | null> {
  const [fiche] = await tx`
    select id::text, nature, titre, categorie, attributs
    from app.fiches where id = ${id}`;

  if (fiche === undefined) {
    return null;
  }

  const echeances = await tx`
    select id::text, titre from app.echeances
    where fiche_id = ${id} and archivee_le is null
    order by titre`;
  const pieces = await tx`
    select id::text, nom, type_mime, taille,
      to_char(ajoutee_le at time zone 'Europe/Paris', 'YYYY-MM-DD') as ajoutee_le
    from app.pieces_jointes where fiche_id = ${id}
    order by ajoutee_le desc`;

  return {
    id: fiche.id,
    nature: fiche.nature,
    titre: fiche.titre,
    categorie: fiche.categorie,
    attributs: fiche.attributs,
    echeances: echeances.map(e => ({ id: e.id, titre: e.titre })),
    pieces: pieces.map(p => ({
      id: p.id,
      nom: p.nom,
      typeMime: p.type_mime,
      taille: p.taille,
      ajouteeLe: p.ajoutee_le,
    })),
  };
}

/** La clé de stockage d'une pièce jointe visible, ou `null`. */
export async function lirePieceJointe(
  tx: Tx,
  id: string,
): Promise<{ cle: string; typeMime: string; nom: string } | null> {
  const [row] = await tx`
    select cle, type_mime, nom from app.pieces_jointes where id = ${id}`;

  return row === undefined
    ? null
    : { cle: row.cle, typeMime: row.type_mime, nom: row.nom };
}
