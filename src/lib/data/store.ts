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
import type { Carnet, EntreeCarnet } from "@/lib/data/carnet";
import { parseRecurrence } from "@/lib/data/recurrence-json";
import type {
  Attribut,
  NouvelleEcheance,
  NouvelleFiche,
} from "@/lib/data/saisie";
import type { CompletionRow, EcheanceRow, FicheRow } from "@/lib/data/views";
import {
  type Consommable,
  PART_DU_PREAVIS,
  type Releve,
  type TenueConsommable,
} from "@/lib/domain/entretien";
import { fromISO, type PlainDate, toISO } from "@/lib/domain/plain-date";
import type { Duration } from "@/lib/domain/recurrence";
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

/**
 * Les catégories déjà employées par le foyer : celles des fiches et des
 * échéances seules (une échéance liée tient la sienne de sa fiche, § 5.4).
 */
export async function listerCategories(tx: Tx): Promise<string[]> {
  const rows = await tx<{ categorie: string }[]>`
    select categorie from app.fiches where categorie is not null
    union
    select categorie from app.echeances
    where fiche_id is null and categorie is not null`;

  return rows.map(r => r.categorie);
}

/** Les marques déjà saisies par le foyer : l'attribut « Marque » de ses fiches. */
export async function listerMarques(tx: Tx): Promise<string[]> {
  const rows = await tx<{ marque: string }[]>`
    select distinct attribut->>'valeur' as marque
    from app.fiches, jsonb_array_elements(attributs) as attribut
    where attribut->>'libelle' = 'Marque' and attribut->>'type' = 'texte'`;

  return rows.map(r => r.marque);
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
      e.id::text, e.titre,
      -- Liée à une fiche, l'échéance en tient sa catégorie (§ 5.4).
      case when e.fiche_id is null then e.categorie else f.categorie end
        as categorie,
      e.recurrence, e.tolerance_jours,
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
    values (${echeance.titre},
      ${echeance.ficheId === null ? echeance.categorie : null},
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

/** Le volume des pièces jointes du foyer, en octets, fiches privées comprises. */
export async function volumePiecesJointes(tx: Tx): Promise<number> {
  const [row] = await tx`select app.volume_pieces_jointes()::text as volume`;

  return Number(row?.volume);
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

/* ------------------------------------------------------------------------ */
/* Plan d'entretien (§ 5.3)                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Le carnet d'entretien d'une fiche : ses remplacements de consommables et
 * les complétions en vigueur de ses échéances liées, archivées comprises
 * (l'historique survit à l'échéance), du plus récent au plus ancien.
 */
export async function lireCarnet(tx: Tx, ficheId: string): Promise<Carnet> {
  const [{ entretien }] = (await tx`
    select exists (select from app.consommables where fiche_id = ${ficheId})
      or exists (select from app.echeances where fiche_id = ${ficheId})
      as entretien`) as unknown as [{ entretien: boolean }];
  const entrees = await tx<EntreeCarnet[]>`
    select 'remplacement' as genre, c.intitule as libelle,
      r.fait_le::text as le, r.compteur
    from app.remplacements r
    join app.consommables c on c.id = r.consommable_id
    where c.fiche_id = ${ficheId}
    union all
    select 'echeance', e.titre, c.faite_le::text, null
    from app.completions c
    join app.echeances e on e.id = c.echeance_id
    where e.fiche_id = ${ficheId}
      and not c.annulee
      and not exists (select from app.completions v where v.corrige = c.id)
    order by le desc, compteur desc nulls last, libelle`;

  return { entretien, entrees: entrees.map(entree => ({ ...entree })) };
}

export interface DureeDeVie {
  /** Au compteur de la fiche ; `null` : purement calendaire. */
  readonly compteur: number | null;
  /** Au temps ; `null` : purement au compteur. */
  readonly temps: Duration | null;
}

export async function ajouterConsommable(
  tx: Tx,
  ficheId: string,
  intitule: string,
  duree: DureeDeVie,
  /** Sa tenue propre ; `null` : celle de l'objet. */
  tenue: TenueConsommable | null = null,
): Promise<string> {
  const [row] = await tx`
    insert into app.consommables
      (fiche_id, intitule, duree_compteur, duree_nombre, duree_unite, tenue)
    values (${ficheId}, ${intitule}, ${duree.compteur},
      ${duree.temps?.count ?? null}, ${duree.temps?.unit ?? null}, ${tenue})
    returning id::text`;

  return row?.id as string;
}

/**
 * Corrige la durée de vie : l'échéance, calculée, suit d'elle-même — elle
 * peut perdre de l'importance, ou quitter l'accueil (§ 5.3). Rend faux si le
 * consommable n'est pas visible.
 */
export async function modifierDureeDeVie(
  tx: Tx,
  consommableId: string,
  duree: DureeDeVie,
): Promise<boolean> {
  const rows = await tx`
    update app.consommables set
      duree_compteur = ${duree.compteur},
      duree_nombre = ${duree.temps?.count ?? null},
      duree_unite = ${duree.temps?.unit ?? null}
    where id = ${consommableId}
    returning id`;

  return rows.length === 1;
}

/**
 * Les réglages d'entretien d'un objet : la tenue de ses consommables et le
 * seuil d'alerte (part de la durée de vie, de 1 % à 50 %). Rend faux si la
 * fiche n'est pas visible.
 */
export async function reglerEntretien(
  tx: Tx,
  ficheId: string,
  reglages: { readonly tenue: TenueConsommable; readonly seuil: number },
): Promise<boolean> {
  const rows = await tx`
    update app.fiches set
      tenue_entretien = ${reglages.tenue},
      seuil_entretien = ${reglages.seuil}
    where id = ${ficheId}
    returning id`;

  return rows.length === 1;
}

/**
 * La tenue propre d'un consommable, ou `null` pour revenir à celle de son
 * objet. Rend faux si le consommable n'est pas visible.
 */
export async function modifierTenueConsommable(
  tx: Tx,
  consommableId: string,
  tenue: TenueConsommable | null,
): Promise<boolean> {
  const rows = await tx`
    update app.consommables set tenue = ${tenue}
    where id = ${consommableId}
    returning id`;

  return rows.length === 1;
}

/** Un remplacement, avec le compteur du jour s'il est connu. */
export async function noterRemplacement(
  tx: Tx,
  consommableId: string,
  le: PlainDate,
  compteur: number | null,
): Promise<void> {
  await tx`
    insert into app.remplacements (consommable_id, fait_le, compteur)
    values (${consommableId}, ${toISO(le)}, ${compteur})`;
}

/** Un relevé du compteur de la fiche. */
export async function noterReleve(
  tx: Tx,
  ficheId: string,
  le: PlainDate,
  valeur: number,
): Promise<void> {
  await tx`
    insert into app.releves (fiche_id, le, valeur)
    values (${ficheId}, ${toISO(le)}, ${valeur})`;
}

export interface PlanEntretien {
  /** La tenue de l'objet, héritée par ses consommables. */
  readonly tenue: TenueConsommable;
  /** Le seuil d'alerte de l'objet, en part de la durée de vie. */
  readonly seuil: number;
  readonly consommables: readonly (Consommable & {
    readonly id: string;
    readonly intitule: string;
    /** Sa tenue propre ; `null` : il hérite de l'objet. */
    readonly tenue: TenueConsommable | null;
  })[];
  readonly releves: readonly Releve[];
}

/** La durée au temps d'un consommable ; nombre et unité sont nuls ensemble. */
function dureeTemps(
  nombre: number | null,
  unite: Duration["unit"] | null,
): Duration | null {
  return unite === null ? null : { count: nombre as number, unit: unite };
}

/** Le plan d'entretien d'une fiche visible ; vide sinon. */
export async function lirePlanEntretien(
  tx: Tx,
  ficheId: string,
): Promise<PlanEntretien> {
  const consommables = await tx<
    {
      id: string;
      intitule: string;
      duree_compteur: number | null;
      duree_nombre: number | null;
      duree_unite: Duration["unit"] | null;
      tenue: TenueConsommable | null;
      remplacements: { le: string; compteur: number | null }[];
    }[]
  >`
    select c.id::text, c.intitule, c.duree_compteur, c.duree_nombre,
      c.duree_unite, c.tenue,
      coalesce((
        select json_agg(json_build_object('le', r.fait_le, 'compteur', r.compteur)
          order by r.fait_le)
        from app.remplacements r where r.consommable_id = c.id
      ), '[]') as remplacements
    from app.consommables c
    where c.fiche_id = ${ficheId}
    order by c.intitule`;
  const [fiche] = await tx<{ tenue: TenueConsommable; seuil: number }[]>`
    select tenue_entretien as tenue, seuil_entretien::float8 as seuil
    from app.fiches where id = ${ficheId}`;
  const releves = await tx<{ le: string; valeur: number }[]>`
    select to_char(le, 'YYYY-MM-DD') as le, valeur from app.releves
    where fiche_id = ${ficheId} and attribut = 'kilometrage'
    order by le`;

  return {
    // Une fiche invisible n'a pas de plan : les réglages par défaut.
    tenue: fiche?.tenue ?? "souple",
    seuil: fiche?.seuil ?? PART_DU_PREAVIS,
    consommables: consommables.map(c => ({
      id: c.id,
      intitule: c.intitule,
      tenue: c.tenue,
      dureeKm: c.duree_compteur,
      dureeTemps: dureeTemps(c.duree_nombre, c.duree_unite),
      remplacements: c.remplacements.map(r => ({
        le: fromISO(r.le),
        compteur: r.compteur,
      })),
    })),
    releves: releves.map(r => ({ le: fromISO(r.le), valeur: r.valeur })),
  };
}

/** Un consommable, avec ce que l'accueil et À venir en montrent. */
export interface ConsommableRow extends Consommable {
  readonly id: string;
  readonly intitule: string;
  readonly ficheTitre: string;
  readonly categorie: string | null;
  /** Sa tenue effective : la sienne, sinon celle de son objet. */
  readonly tenue: TenueConsommable;
  /** Le seuil d'alerte de son objet. */
  readonly seuil: number;
  /** Les relevés du compteur de sa fiche. */
  readonly releves: readonly Releve[];
}

/**
 * Tous les consommables visibles, des fiches non archivées (§ 4.5 : les
 * échéances d'une fiche archivée s'arrêtent).
 */
export async function listerConsommables(tx: Tx): Promise<ConsommableRow[]> {
  const rows = await tx<
    {
      id: string;
      intitule: string;
      fiche_titre: string;
      categorie: string | null;
      tenue: TenueConsommable;
      seuil: number;
      duree_compteur: number | null;
      duree_nombre: number | null;
      duree_unite: Duration["unit"] | null;
      remplacements: { le: string; compteur: number | null }[];
      releves: { le: string; valeur: number }[];
    }[]
  >`
    select c.id::text, c.intitule, f.titre as fiche_titre, f.categorie,
      coalesce(c.tenue, f.tenue_entretien) as tenue,
      f.seuil_entretien::float8 as seuil,
      c.duree_compteur, c.duree_nombre, c.duree_unite,
      coalesce((
        select json_agg(json_build_object('le', r.fait_le, 'compteur', r.compteur)
          order by r.fait_le)
        from app.remplacements r where r.consommable_id = c.id
      ), '[]') as remplacements,
      coalesce((
        select json_agg(json_build_object('le', v.le, 'valeur', v.valeur)
          order by v.le)
        from app.releves v
        where v.fiche_id = c.fiche_id and v.attribut = 'kilometrage'
      ), '[]') as releves
    from app.consommables c
    join app.fiches f on f.id = c.fiche_id
    where f.archivee_le is null
    order by f.titre, c.intitule`;

  return rows.map(c => ({
    id: c.id,
    intitule: c.intitule,
    ficheTitre: c.fiche_titre,
    categorie: c.categorie,
    tenue: c.tenue,
    seuil: c.seuil,
    dureeKm: c.duree_compteur,
    dureeTemps: dureeTemps(c.duree_nombre, c.duree_unite),
    remplacements: c.remplacements.map(r => ({
      le: fromISO(r.le),
      compteur: r.compteur,
    })),
    releves: c.releves.map(r => ({ le: fromISO(r.le), valeur: r.valeur })),
  }));
}
