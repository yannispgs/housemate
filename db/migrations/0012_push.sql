-- Les notifications push (SPEC § 6, décisions du foyer du 2026-10-18).
--
-- La colonne « Push » du tableau des notifications dit quels niveaux
-- notifient ; la fréquence est une règle générale, pas un réglage : une
-- critique chaque matin tant qu'elle le reste, les autres une fois, le matin
-- où elles arrivent. Plusieurs échéances le même matin : une seule
-- notification. L'envoi est fait par la même route que les résumés, appelée
-- chaque heure par le Worker du collecteur.

-- La colonne Push, à côté de la colonne E-mail.
alter table app.reglages_resumes
  add column push_critique boolean not null default true,
  add column push_important boolean not null default true,
  add column push_normal boolean not null default false,
  add column push_memoire boolean not null default false;

-- Les appareils où notifier : un abonnement Web Push par navigateur. Chacun
-- ne voit et ne gère que les siens ; l'envoi les lit en propriétaire.
create table app.abonnements_push (
  endpoint text primary key check (endpoint like 'https://%'),
  membre_id uuid not null default app.membre_courant() references app.membres,
  p256dh text not null,
  auth text not null,
  cree_le timestamptz not null default now()
);

alter table app.abonnements_push enable row level security;

grant select, insert, update, delete on app.abonnements_push to authenticated;
create policy les_miens on app.abonnements_push for all to authenticated
  using (membre_id = app.membre_courant())
  with check (membre_id = app.membre_courant());

-- L'exception par échéance : la faire notifier quel que soit le tableau, ou
-- la faire taire. Personnelle, comme le tableau : taire une échéance pour
-- soi ne la tait pas pour les autres.
create table app.exceptions_push (
  membre_id uuid not null default app.membre_courant() references app.membres,
  echeance_id uuid not null references app.echeances,
  notifier boolean not null,
  primary key (membre_id, echeance_id)
);

alter table app.exceptions_push enable row level security;

grant select, insert, update, delete on app.exceptions_push to authenticated;
create policy les_miennes on app.exceptions_push for all to authenticated
  using (membre_id = app.membre_courant())
  with check (
    membre_id = app.membre_courant()
    and echeance_id in (select id from app.echeances)
  );

-- Le journal des notifications : la notification du matin, une par compte
-- et par jour (`cle` = 'jour'), réservée avant l'envoi et rendue s'il
-- échoue ; et les arrivées déjà annoncées (`cle` = l'élément et la date de
-- son occurrence), pour ne les annoncer qu'une fois. Le propriétaire seul y
-- écrit.
create table app.push_envoyes (
  membre_id uuid not null references app.membres,
  cle text not null,
  le date not null,
  envoye_le timestamptz not null default now(),
  primary key (membre_id, cle, le)
);

alter table app.push_envoyes enable row level security;
