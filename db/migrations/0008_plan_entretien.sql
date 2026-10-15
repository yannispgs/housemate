-- Le plan d'entretien (SPEC § 5.3, décisions du foyer du 2026-10-15).
--
-- Une fiche porte des consommables (courroie, bougies, filtre d'aspirateur),
-- chacun avec une durée de vie au compteur et/ou au temps. L'échéance de
-- chacun n'est PAS stockée : elle se calcule (`src/lib/domain/entretien.ts`)
-- depuis le dernier remplacement et la série des relevés du compteur, et
-- suit donc d'elle-même toute correction de la durée de vie.
--
-- Comme les pièces jointes, tout ceci se voit si et seulement si sa fiche
-- se voit : les règles de la fiche s'appliquent, rien n'est redit ici.

create table app.consommables (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  fiche_id uuid not null references app.fiches,
  intitule text not null check (length(trim(intitule)) between 1 and 120),
  -- Au compteur de la fiche (kilomètres pour une voiture).
  duree_compteur integer check (duree_compteur > 0),
  -- Au temps : un nombre et une unité, comme une récurrence.
  duree_nombre integer check (duree_nombre > 0),
  duree_unite text check (duree_unite in ('day', 'week', 'month', 'year')),
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now(),
  check ((duree_nombre is null) = (duree_unite is null)),
  check (duree_compteur is not null or duree_nombre is not null)
);

-- Un remplacement : sa date réelle, et le compteur ce jour-là s'il est connu.
-- Sans le compteur, la fiche signale une donnée manquante (§ 5.3).
create table app.remplacements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  consommable_id uuid not null references app.consommables,
  fait_le date not null,
  compteur integer check (compteur >= 0),
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now()
);

-- Un attribut qui évolue est une série, pas une valeur (§ 5.3) :
-- `attribut` · `instant` · `valeur` · `origine`.
create table app.releves (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  fiche_id uuid not null references app.fiches,
  attribut text not null default 'kilometrage'
    check (attribut in ('kilometrage')),
  le date not null,
  valeur integer not null check (valeur >= 0),
  origine text not null default 'saisie' check (origine in ('saisie', 'import')),
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now()
);

create index on app.consommables (fiche_id);
create index on app.remplacements (consommable_id);
create index on app.releves (fiche_id, attribut, le);

alter table app.consommables enable row level security;
alter table app.remplacements enable row level security;
alter table app.releves enable row level security;

-- Rien ne s'efface (§ 2, principe 4). Seule la durée de vie d'un consommable
-- se corrige : c'est elle qui rend les limites dynamiques.
grant select, insert on app.consommables, app.remplacements, app.releves
  to authenticated;
grant update (intitule, duree_compteur, duree_nombre, duree_unite)
  on app.consommables to authenticated;

create policy lisibles on app.consommables for select to authenticated
  using (fiche_id in (select id from app.fiches));
create policy ajoutables on app.consommables for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and fiche_id in (select id from app.fiches)
  );
create policy modifiables on app.consommables for update to authenticated
  using (fiche_id in (select id from app.fiches))
  with check (fiche_id in (select id from app.fiches));

create policy lisibles on app.remplacements for select to authenticated
  using (consommable_id in (select id from app.consommables));
create policy ajoutables on app.remplacements for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and consommable_id in (select id from app.consommables)
  );

create policy lisibles on app.releves for select to authenticated
  using (fiche_id in (select id from app.fiches));
create policy ajoutables on app.releves for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and fiche_id in (select id from app.fiches)
  );
