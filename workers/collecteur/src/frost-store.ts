/**
 * Lectures et écritures de la veille de gel, avec le rôle `meteo_veille`.
 *
 * Même signature « gabarit » que `store.ts` : le pilote HTTP de Neon dans le
 * Worker, `postgres` dans les tests contre la base locale, le même SQL.
 *
 * Les bornes de la nuit se calculent EN BASE, à l'heure de Paris : « de 20 h à
 * 9 h » garde son sens les nuits de changement d'heure.
 */
import type {
  ModelMinimum,
  ModelScore,
  PlantNight,
  WatchedPlant,
  WeightedModel,
} from "./frost-watch";
import type { Sql } from "./store";

async function rows<T>(query: Promise<unknown>): Promise<T[]> {
  return (await query) as T[];
}

export interface EveningReadings {
  readonly exterieur: number | null;
  readonly veranda: number | null;
}

/** Le dernier relevé de chaque capteur, pourvu qu'il date de ce soir. */
export async function eveningReadings(
  sql: Sql,
  now: Date,
): Promise<EveningReadings> {
  const found = await rows<{ capteur: string; temperature: number }>(sql`
    select distinct on (capteur) capteur, temperature::float8 as temperature
    from meteo.releves
    where instant > ${now.toISOString()}::timestamptz - interval '45 minutes'
    order by capteur, instant desc
  `);
  const of = (sensor: string) =>
    found.find(row => row.capteur === sensor)?.temperature ?? null;

  return { exterieur: of("exterieur"), veranda: of("veranda") };
}

/**
 * Le minimum annoncé pour la nuit par chaque modèle, dans sa récupération la
 * plus récente — celle de ce soir, jamais une révision ultérieure.
 */
export async function forecastMinima(
  sql: Sql,
  night: string,
  now: Date,
): Promise<ModelMinimum[]> {
  return rows<ModelMinimum>(sql`
    with dernieres as (
      select source, modele, max(recuperee_le) as recuperee_le
      from meteo.previsions
      where recuperee_le > ${now.toISOString()}::timestamptz - interval '2 hours'
      group by source, modele
    )
    select p.source, p.modele as model, min(p.temperature)::float8 as minimum
    from meteo.previsions p
    join dernieres d using (source, modele, recuperee_le)
    where p.cible >= (${night}::date + time '20:00') at time zone 'Europe/Paris'
      and p.cible <= (${night}::date + 1 + time '09:00') at time zone 'Europe/Paris'
    group by p.source, p.modele
    order by minimum, p.source, p.modele
  `);
}

/** La note de chaque modèle sur les nuits passées. */
export async function modelScores(sql: Sql): Promise<ModelScore[]> {
  return rows<ModelScore>(sql`
    select source, modele as model, nuits as nights, rmse::float8 as rmse
    from meteo.fiabilite_modeles
  `);
}

/** Le minimum de chaque modèle ce soir, et son poids dans la moyenne. */
export async function recordModelMinima(
  sql: Sql,
  night: string,
  models: readonly WeightedModel[],
): Promise<void> {
  await sql`
    insert into meteo.minima_prevus (nuit, source, modele, minimum, poids)
    select ${night}::date, source, modele, minimum, poids
    from unnest(
      ${models.map(entry => entry.source)}::text[],
      ${models.map(entry => entry.model)}::text[],
      ${models.map(entry => entry.minimum)}::numeric[],
      ${models.map(entry => Math.round(entry.weight * 10_000) / 10_000)}::numeric[]
    ) as m(source, modele, minimum, poids)
    on conflict do nothing
  `;
}

export async function previousNightAlerted(
  sql: Sql,
  night: string,
): Promise<boolean> {
  const found = await rows<{ alerte: boolean }>(sql`
    select alerte from meteo.nuits_gel where nuit = ${night}::date - 1
  `);

  return found[0]?.alerte ?? false;
}

export interface EveningEntry {
  readonly night: string;
  readonly exteriorAt20h: number | null;
  readonly verandaAt20h: number | null;
  readonly forecastMinimum: number | null;
  readonly forecastMethod: string | null;
  readonly estimate: number | null;
  readonly modelMargin: number | null;
  readonly forecastMargin: number | null;
  readonly radiativeMargin: number | null;
  readonly lowerBound: number | null;
  readonly extrapolation: string | null;
  readonly alert: boolean;
  readonly message: string | null;
}

/**
 * La ligne du soir. Écrite une fois : un second déclenchement de 20 h la
 * trouve déjà là, n'y touche pas, et le dit (`false`).
 */
export async function recordEvening(
  sql: Sql,
  entry: EveningEntry,
): Promise<boolean> {
  const inserted = await rows<{ nuit: string }>(sql`
    insert into meteo.nuits_gel (
      nuit, exterieur_20h, veranda_20h, prevision_min, prevision_methode,
      estimation, marge_modele, marge_prevision, marge_radiative,
      borne_basse, extrapolation, alerte, message
    ) values (
      ${entry.night}::date, ${entry.exteriorAt20h}, ${entry.verandaAt20h},
      ${entry.forecastMinimum}, ${entry.forecastMethod}, ${entry.estimate},
      ${entry.modelMargin}, ${entry.forecastMargin}, ${entry.radiativeMargin},
      ${entry.lowerBound}, ${entry.extrapolation}, ${entry.alert},
      ${entry.message}
    )
    on conflict (nuit) do nothing
    returning nuit
  `);

  return inserted.length > 0;
}

/** Les plantes de l'extérieur et de la véranda, telles que leurs fiches les décrivent. */
export async function watchedPlants(sql: Sql): Promise<WatchedPlant[]> {
  return rows<WatchedPlant>(sql`
    select
      id::text as id, titre as title, emplacement as location,
      seuil_degats::float8 as "damageThreshold",
      seuil_mort::float8 as "deathThreshold"
    from meteo.plantes_suivies
    order by emplacement desc, titre, id
  `);
}

/** Chaque plante ce soir : sa photo, son pire cas, son niveau. */
export async function recordPlants(
  sql: Sql,
  night: string,
  plants: readonly PlantNight[],
): Promise<void> {
  await sql`
    insert into meteo.nuits_gel_plantes (
      nuit, fiche_id, titre, emplacement, seuil_degats, seuil_mort,
      estimation, borne_basse, niveau
    )
    select ${night}::date, p.*
    from unnest(
      ${plants.map(plant => plant.id)}::uuid[],
      ${plants.map(plant => plant.title)}::text[],
      ${plants.map(plant => plant.location)}::text[],
      ${plants.map(plant => plant.damageThreshold)}::numeric[],
      ${plants.map(plant => plant.deathThreshold)}::numeric[],
      ${plants.map(plant => plant.estimate)}::numeric[],
      ${plants.map(plant => plant.lowerBound)}::numeric[],
      ${plants.map(plant => plant.level)}::text[]
    ) as p
    on conflict do nothing
  `;
}

/** Les plantes de la nuit, telles qu'inscrites au journal à 20 h. */
export async function plantsOfNight(
  sql: Sql,
  night: string,
): Promise<PlantNight[]> {
  return rows<PlantNight>(sql`
    select
      fiche_id::text as id, titre as title, emplacement as location,
      seuil_degats::float8 as "damageThreshold",
      seuil_mort::float8 as "deathThreshold",
      estimation::float8 as estimate,
      borne_basse::float8 as "lowerBound",
      niveau as level
    from meteo.nuits_gel_plantes
    where nuit = ${night}::date
    order by emplacement desc, titre, fiche_id
  `);
}

export interface PendingMessage {
  readonly night: string;
  readonly message: "alerte" | "rappel" | "indisponible";
  readonly exteriorAt20h: number | null;
  readonly verandaAt20h: number | null;
  readonly forecastMinimum: number;
  readonly forecastMethod: string;
  readonly estimate: number | null;
  readonly modelMargin: number | null;
  readonly lowerBound: number | null;
  readonly extrapolation: "none" | "low" | "high" | null;
}

/**
 * Réserve le message de la nuit s'il reste à envoyer : la ligne est marquée
 * AVANT l'envoi, pour que deux exécutions simultanées n'envoient pas deux fois.
 * En cas d'échec, `releaseMessage` la rend à la tentative suivante.
 */
export async function claimMessage(
  sql: Sql,
  night: string,
): Promise<PendingMessage | null> {
  const found = await rows<PendingMessage>(sql`
    update meteo.nuits_gel set envoyee_le = now()
    where nuit = ${night}::date and message is not null and envoyee_le is null
    returning
      to_char(nuit, 'YYYY-MM-DD') as night, message,
      exterieur_20h::float8 as "exteriorAt20h",
      veranda_20h::float8 as "verandaAt20h",
      prevision_min::float8 as "forecastMinimum",
      prevision_methode as "forecastMethod",
      estimation::float8 as estimate,
      marge_modele::float8 as "modelMargin",
      borne_basse::float8 as "lowerBound",
      extrapolation
  `);

  return found[0] ?? null;
}

export async function releaseMessage(sql: Sql, night: string): Promise<void> {
  await sql`
    update meteo.nuits_gel set envoyee_le = null where nuit = ${night}::date
  `;
}

export interface NightToReview {
  readonly exteriorAt20h: number;
  readonly verandaAt20h: number;
  readonly forecastMinimum: number;
  readonly minExterior: number | null;
  readonly minVeranda: number | null;
}

/**
 * La nuit à faire le bilan, avec ses minima mesurés. Rien si le soir n'avait
 * pas de quoi prédire, ou si le bilan est déjà fait.
 */
export async function nightToReview(
  sql: Sql,
  night: string,
): Promise<NightToReview | null> {
  const found = await rows<NightToReview>(sql`
    select
      n.exterieur_20h::float8 as "exteriorAt20h",
      n.veranda_20h::float8 as "verandaAt20h",
      n.prevision_min::float8 as "forecastMinimum",
      (select min(temperature)::float8 from meteo.releves r
        where r.capteur = 'exterieur' and r.instant >= b.debut and r.instant <= b.fin)
        as "minExterior",
      (select min(temperature)::float8 from meteo.releves r
        where r.capteur = 'veranda' and r.instant >= b.debut and r.instant <= b.fin)
        as "minVeranda"
    from meteo.nuits_gel n
    cross join lateral (
      select
        (n.nuit + time '20:00') at time zone 'Europe/Paris' as debut,
        (n.nuit + 1 + time '09:30') at time zone 'Europe/Paris' as fin
    ) b
    where n.nuit = ${night}::date
      and n.bilan_le is null
      and n.exterieur_20h is not null
      and n.veranda_20h is not null
      and n.prevision_min is not null
  `);

  return found[0] ?? null;
}

export interface NightReview {
  readonly minExterior: number;
  readonly minVeranda: number;
  readonly forecastError: number;
  readonly modelError: number;
}

export async function recordReview(
  sql: Sql,
  night: string,
  review: NightReview,
): Promise<void> {
  await sql`
    update meteo.nuits_gel set
      min_exterieur = ${review.minExterior},
      min_veranda = ${review.minVeranda},
      erreur_prevision = ${review.forecastError},
      erreur_modele = ${review.modelError},
      bilan_le = now()
    where nuit = ${night}::date and bilan_le is null
  `;
}
