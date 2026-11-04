-- Le journal des exports (SPEC § 14.2, décisions du foyer du 2026-10-22).
--
-- Une ligne par passage de l'export quotidien : exporté, inchangé ou échec,
-- avec l'empreinte SHA-256 du contenu en clair. L'empreinte vit ici, pas
-- sur le Drive à côté du chiffré : c'est elle qui dit si les données ont
-- changé, et `age` rend deux chiffrés du même contenu différents.
--
-- C'est l'absence de ligne réussie depuis plus de 36 h qui signale une
-- panne, jamais l'absence de fichier : un foyer calme n'en produit pas.
-- Le propriétaire seul y lit et y écrit.
create table app.exports (
  id bigint generated always as identity primary key,
  le timestamptz not null default now(),
  issue text not null check (issue in ('exporte', 'inchange', 'echec')),
  empreinte text check (empreinte ~ '^[0-9a-f]{64}$'),
  -- Le fichier déposé, pour un passage « exporté » seulement.
  fichier text,
  -- La taille déposée, ou le message d'échec.
  detail text,
  check ((issue = 'exporte') = (fichier is not null)),
  check (issue = 'echec' or empreinte is not null)
);

create index on app.exports (le desc);

alter table app.exports enable row level security;
