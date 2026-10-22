-- Le calendrier du rappel de crèche (SPEC § 12.9), dans Réglages.
--
-- Les jours qui s'écartent de la semaine habituelle, saisis dans le
-- calendrier de Réglages (décision du 2026-10-18) : `creche` vrai pour un
-- jour inhabituel avec crèche, faux pour un jour habituel sans. Un jour sans
-- ligne suit la semaine habituelle.
create table app.jours_creche (
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  jour date not null,
  creche boolean not null,
  primary key (foyer_id, jour)
);

alter table app.jours_creche enable row level security;

grant select, insert, update, delete on app.jours_creche to authenticated;
create policy son_foyer on app.jours_creche for all to authenticated
  using (foyer_id = app.foyer_courant())
  with check (foyer_id = app.foyer_courant());
