-- Le rappel de crèche (SPEC § 12.9, décision du foyer du 2026-10-22 : tout
-- se règle dans l'app, aucun prénom dans la configuration du serveur).
--
-- La veille d'un jour de crèche, à 22 h, un e-mail dit qui emmène l'enfant
-- selon la pluie prévue sur le trajet. L'envoi est fait par le serveur de
-- l'app, appelé par le Worker du collecteur juste après qu'il a figé la
-- pluie ; il lit ces tables en propriétaire.

-- Les réglages du foyer, partagés : les jours de crèche et qui est qui. Les
-- prénoms sont des données du foyer, jamais du code (le dépôt est public).
-- Sans ligne, les valeurs par défaut valent : lundi, mardi, jeudi, vendredi.
create table app.reglages_creche (
  foyer_id uuid primary key default app.foyer_courant() references app.foyers,
  -- 1 = lundi … 7 = dimanche (ISO 8601).
  jours smallint[] not null default '{1,2,4,5}'
    check (jours <@ '{1,2,3,4,5,6,7}'::smallint[]),
  enfant text check (length(trim(enfant)) between 1 and 40),
  -- Qui emmène l'enfant par temps sec, et sous la pluie.
  parent_sec text check (length(trim(parent_sec)) between 1 and 40),
  parent_pluie text check (length(trim(parent_pluie)) between 1 and 40)
);

alter table app.reglages_creche enable row level security;

grant select, insert, update on app.reglages_creche to authenticated;
create policy son_foyer on app.reglages_creche for all to authenticated
  using (foyer_id = app.foyer_courant())
  with check (foyer_id = app.foyer_courant());

-- Qui reçoit le rappel : un choix personnel, comme les résumés.
create table app.abonnes_creche (
  membre_id uuid primary key default app.membre_courant()
    references app.membres
);

alter table app.abonnes_creche enable row level security;

grant select, insert, delete on app.abonnes_creche to authenticated;
create policy les_miens on app.abonnes_creche for all to authenticated
  using (membre_id = app.membre_courant())
  with check (membre_id = app.membre_courant());

-- Le journal des rappels : un par compte et par jour de crèche, réservé
-- avant l'envoi et rendu s'il échoue. Le propriétaire seul y écrit.
create table app.creche_envoyes (
  membre_id uuid not null references app.membres,
  -- Le jour de crèche annoncé, pas le soir de l'envoi.
  pour_le date not null,
  envoye_le timestamptz not null default now(),
  primary key (membre_id, pour_le)
);

alter table app.creche_envoyes enable row level security;
