-- Les rappels ajoutés à la main sur une échéance (SPEC § 6, décisions du
-- 2026-10-02 et du 2026-10-18).
--
-- Ceux que donne l'importance (une critique : le jour même) ne sont PAS
-- stockés : ils se calculent (`src/lib/domain/reminders.ts`), et suivent donc
-- d'eux-mêmes un changement d'importance. Un rappel « par e-mail » ne part
-- jamais seul : il fait figurer son échéance dans le résumé quotidien du jour.
--
-- Un rappel se voit si et seulement si son échéance se voit.

create table app.rappels (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  echeance_id uuid not null references app.echeances,
  -- Combien d'unités avant la date ; 0 = le jour même.
  nombre integer not null check (nombre between 0 and 1000),
  unite text not null check (unite in ('day', 'week', 'month')),
  email boolean not null default false,
  push boolean not null default false,
  ajoute_par uuid not null default app.membre_courant() references app.membres,
  ajoute_le timestamptz not null default now(),
  check (email or push),
  -- Une semaine et sept jours sont le même délai : l'app le vérifie aussi.
  unique (echeance_id, nombre, unite)
);

alter table app.rappels enable row level security;

grant select, insert, delete on app.rappels to authenticated;

create policy lisibles on app.rappels for select to authenticated
  using (echeance_id in (select id from app.echeances));
create policy ajoutables on app.rappels for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoute_par = app.membre_courant()
    and echeance_id in (select id from app.echeances)
  );
create policy retirables on app.rappels for delete to authenticated
  using (echeance_id in (select id from app.echeances));
