-- Les résumés par e-mail (SPEC § 6, décisions du foyer du 2026-10-18).
--
-- Jamais un e-mail par échéance : deux résumés, hebdomadaire et quotidien,
-- réglés par compte. L'envoi est fait par le serveur de l'app, appelé chaque
-- heure par le Worker du collecteur ; il lit ces réglages en propriétaire,
-- puis compose chaque résumé au nom de son destinataire, sous la RLS.

-- L'adresse d'un compte, notée par le portier au rattachement. Une table à
-- part, sans aucun droit pour `authenticated` : les membres d'un foyer se
-- lisent entre eux (`membres`), pas leurs adresses.
create table app.adresses (
  membre_id uuid primary key references app.membres,
  email text not null check (email = lower(trim(email)))
);

alter table app.adresses enable row level security;

grant select, insert on app.adresses to portier;
create policy portier on app.adresses for all to portier
  using (true) with check (true);

-- Les comptes déjà rattachés : leur adresse est celle de la liste blanche
-- de leur foyer, retrouvée par Neon Auth (absent de la base locale).
do $$
begin
  if to_regclass('neon_auth.user') is not null then
    insert into app.adresses (membre_id, email)
    select m.id, lower(trim(u.email))
    from app.membres m
    join neon_auth."user" u on u.id::text = m.auth_user_id
    on conflict do nothing;
  end if;
end
$$;

-- Les réglages d'un compte. Sans ligne, les valeurs par défaut valent :
-- le résumé hebdomadaire le lundi à 6 h, pas de quotidien, sept jours
-- devant, retards compris, ce qui me concerne, tout sauf « pour mémoire ».
create table app.reglages_resumes (
  membre_id uuid primary key default app.membre_courant()
    references app.membres,
  hebdo boolean not null default true,
  -- 1 = lundi … 7 = dimanche (ISO 8601).
  hebdo_jour smallint not null default 1 check (hebdo_jour between 1 and 7),
  hebdo_heure smallint not null default 6 check (hebdo_heure between 0 and 23),
  quotidien boolean not null default false,
  quotidien_heure smallint not null default 7
    check (quotidien_heure between 0 and 23),
  horizon_jours smallint not null default 7
    check (horizon_jours in (7, 14, 30)),
  retards boolean not null default true,
  perimetre text not null default 'moi' check (perimetre in ('moi', 'foyer')),
  -- La colonne « E-mail » du tableau des notifications.
  email_critique boolean not null default true,
  email_important boolean not null default true,
  email_normal boolean not null default true,
  email_memoire boolean not null default false
);

alter table app.reglages_resumes enable row level security;

grant select, insert, update on app.reglages_resumes to authenticated;
create policy les_miens on app.reglages_resumes for all to authenticated
  using (membre_id = app.membre_courant())
  with check (membre_id = app.membre_courant());

-- Le journal des envois : un résumé d'une sorte par compte et par jour, au
-- plus. Réservé avant l'envoi, retiré s'il échoue : deux appels simultanés
-- n'envoient jamais deux fois. Le propriétaire seul y écrit.
create table app.resumes_envoyes (
  membre_id uuid not null references app.membres,
  sorte text not null check (sorte in ('hebdo', 'quotidien')),
  -- Le jour à Paris.
  le date not null,
  envoye_le timestamptz not null default now(),
  primary key (membre_id, sorte, le)
);

alter table app.resumes_envoyes enable row level security;
