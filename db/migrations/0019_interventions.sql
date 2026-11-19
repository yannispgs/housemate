-- Les interventions du carnet d'entretien (SPEC § 5.3, décisions du
-- 23/10/2026) : ce qui a été fait le même jour, au même compteur — c'est
-- ainsi qu'on sort d'un garage.
--
-- Une intervention regroupe des remplacements de consommables, des
-- complétions d'échéances liées et des lignes libres (« plaquettes AR »),
-- avec un coût pour le tout. Les remplacements et complétions gardent leur
-- table : ils y gagnent seulement le lien vers leur intervention, et tout ce
-- qui les lit déjà (échéances, résumés, graphique) n'a rien à changer.
--
-- Numérotée 0019 : 0014 à 0018 sont prises par des PR ouvertes. Le runner
-- applique les fichiers non appliqués dans l'ordre, un trou ne gêne pas.

create table app.interventions (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  fiche_id uuid not null references app.fiches,
  fait_le date not null,
  -- Le compteur ce jour-là, si la fiche en a un et qu'il a été noté.
  compteur integer check (compteur >= 0),
  -- Le coût de l'intervention entière, en euros (pas de ventilation).
  cout numeric(10, 2) check (cout >= 0),
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now()
);

-- Ce qui est hors plan : une ligne de texte.
create table app.lignes_libres (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  intervention_id uuid not null references app.interventions,
  libelle text not null check (length(trim(libelle)) between 1 and 120),
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now()
);

alter table app.remplacements
  add column intervention_id uuid references app.interventions;
alter table app.completions
  add column intervention_id uuid references app.interventions;

create index on app.interventions (fiche_id, fait_le);
create index on app.lignes_libres (intervention_id);
create index on app.remplacements (intervention_id);
create index on app.completions (intervention_id);

-- Deux règles qu'une contrainte ne sait pas dire :
-- - une intervention ne se date pas du futur (le jour s'entend à Paris) ;
-- - ce qu'elle regroupe appartient à SA fiche : un consommable ou une
--   échéance d'une autre fiche n'y entre pas.
create function app.verifie_intervention() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if new.fait_le > (now() at time zone 'Europe/Paris')::date then
      raise exception 'Une intervention ne peut pas être datée du futur (%).', new.fait_le
        using errcode = 'check_violation';
    end if;
    return new;
  end
  $$;

create trigger interventions_verifiees before insert on app.interventions
  for each row execute function app.verifie_intervention();

create function app.verifie_lien_intervention() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    fiche uuid;
  begin
    if new.intervention_id is null then
      return new;
    end if;
    if tg_table_name = 'remplacements' then
      select fiche_id into fiche from app.consommables
      where id = new.consommable_id;
    else
      select fiche_id into fiche from app.echeances
      where id = new.echeance_id;
    end if;
    if not exists (
      select from app.interventions
      where id = new.intervention_id and fiche_id = fiche
    ) then
      raise exception 'Une intervention ne regroupe que ce qui concerne sa fiche.'
        using errcode = 'check_violation';
    end if;
    return new;
  end
  $$;

create trigger remplacements_dans_leur_intervention
  before insert on app.remplacements
  for each row execute function app.verifie_lien_intervention();
create trigger completions_dans_leur_intervention
  before insert on app.completions
  for each row execute function app.verifie_lien_intervention();

alter table app.interventions enable row level security;
alter table app.lignes_libres enable row level security;

-- Rien ne s'efface (§ 2, principe 4) ; la correction viendra en ajoutant une
-- version, comme pour les complétions.
grant select, insert on app.interventions, app.lignes_libres to authenticated;

-- Une intervention se voit si et seulement si sa fiche se voit.
create policy lisibles on app.interventions for select to authenticated
  using (fiche_id in (select id from app.fiches));
create policy ajoutables on app.interventions for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and fiche_id in (select id from app.fiches)
  );

create policy lisibles on app.lignes_libres for select to authenticated
  using (intervention_id in (select id from app.interventions));
create policy ajoutables on app.lignes_libres for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and intervention_id in (select id from app.interventions)
  );
