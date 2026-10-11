-- L'authentification (SPEC § 7.2) : ce que le serveur de l'app doit pouvoir
-- faire AVANT qu'une personne soit connectée, donc hors de la RLS des membres.
--
-- Le rôle `portier` en porte les droits, et rien d'autre :
--   - lire la liste blanche, pour le webhook `user.before_create` ;
--   - rattacher un nouveau compte à son foyer (`user.created`) ;
--   - tenir le registre des appareils connus (vérification d'appareil).
-- Il ne lit ni fiche, ni échéance, ni complétion. Rôle de groupe sans
-- connexion : chaque environnement crée son rôle de connexion qui en hérite,
-- en SQL et jamais par l'API Neon (qui en ferait un `neon_superuser`).
do $$
begin
  if not exists (select from pg_roles where rolname = 'portier') then
    create role portier nologin;
  end if;
end
$$;

-- Un appareil déjà vu pour un compte. L'identifiant vit dans un cookie du
-- navigateur ; seule son empreinte (SHA-256) est gardée ici, pour qu'une
-- lecture de la base ne suffise pas à se faire passer pour un appareil connu.
create table app.appareils (
  auth_user_id text not null,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  -- « Safari sur iPhone » : ce que l'avis de connexion montre à la personne.
  description text not null,
  premiere_connexion timestamptz not null default now(),
  derniere_connexion timestamptz not null default now(),
  primary key (auth_user_id, empreinte)
);

alter table app.appareils enable row level security;

grant usage on schema app to portier;
grant select on app.liste_blanche to portier;
grant select, insert on app.membres to portier;
grant select, insert, update on app.appareils to portier;

-- Le portier passe sous la RLS comme tout le monde : il n'y voit que ce dont
-- il a besoin, et le dire ici le rend explicite plutôt que tacite.
create policy portier on app.liste_blanche for select to portier using (true);
create policy portier on app.membres for all to portier
  using (true) with check (true);
create policy portier on app.appareils for all to portier
  using (true) with check (true);
