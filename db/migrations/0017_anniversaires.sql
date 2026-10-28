-- L'anniversaire d'une personne, par membre (SPEC § 4.1, décisions du 27 et
-- du 28/10/2026). Le lien n'est pas le même pour tous : chaque membre choisit,
-- sur la fiche, « cadeau », « sans cadeau » ou « pas de rappel », et reçoit
-- sa propre échéance, privée. Sans choix, rien.

-- Les réglages de chacun : le préavis et l'importance des deux choix. Sans
-- ligne, ceux de départ, dans le code (`REGLAGES_PAR_DEFAUT`).
create table app.reglages_anniversaires (
  membre_id uuid primary key default app.membre_courant()
    references app.membres on delete cascade,
  cadeau_preavis_jours integer not null
    check (cadeau_preavis_jours between 0 and 366),
  cadeau_importance text not null check (
    cadeau_importance in ('critique', 'important', 'normal', 'memoire')
  ),
  simple_preavis_jours integer not null
    check (simple_preavis_jours between 0 and 366),
  simple_importance text not null check (
    simple_importance in ('critique', 'important', 'normal', 'memoire')
  )
);

alter table app.reglages_anniversaires enable row level security;
grant select, insert on app.reglages_anniversaires to authenticated;
grant update (
  cadeau_preavis_jours, cadeau_importance, simple_preavis_jours,
  simple_importance
) on app.reglages_anniversaires to authenticated;

create policy siens on app.reglages_anniversaires for all to authenticated
  using (membre_id = app.membre_courant())
  with check (membre_id = app.membre_courant());

-- Le choix d'un membre pour une personne, et l'échéance qu'il lui a valu.
-- Chacun ne voit que les siens. « Pas de rappel » : pas de ligne.
create table app.anniversaires (
  fiche_id uuid not null references app.fiches on delete cascade,
  membre_id uuid not null default app.membre_courant()
    references app.membres on delete cascade,
  niveau text not null check (niveau in ('cadeau', 'simple')),
  echeance_id uuid not null references app.echeances on delete cascade,
  primary key (fiche_id, membre_id)
);

alter table app.anniversaires enable row level security;
grant select, insert, delete on app.anniversaires to authenticated;
grant update (niveau) on app.anniversaires to authenticated;

-- Les sous-requêtes passent par la RLS : la fiche et l'échéance doivent être
-- visibles de celui qui choisit.
create policy siens on app.anniversaires for all to authenticated
  using (membre_id = app.membre_courant())
  with check (
    membre_id = app.membre_courant()
    and fiche_id in (select id from app.fiches)
    and echeance_id in (select id from app.echeances)
  );

-- La date de naissance ou le nom ont changé : les rappels de **tous** les
-- membres suivent. Ceux des autres sont privés, invisibles de celui qui
-- modifie la fiche, d'où SECURITY DEFINER — la fonction vérifie elle-même
-- que la fiche lui est visible. `nouvelle` vide : la date a été retirée,
-- les rappels sont archivés et les choix oubliés.
create function app.suivre_anniversaires(
  fiche uuid, nouvelle jsonb, titre_cadeau text, titre_simple text
) returns void
  language sql volatile security definer set search_path = ''
  as $$
    update app.echeances e set
      recurrence = coalesce(nouvelle, e.recurrence),
      titre = case a.niveau when 'cadeau' then titre_cadeau else titre_simple end,
      archivee_le = case when nouvelle is null then now() end
    from app.anniversaires a, app.fiches f
    where a.echeance_id = e.id and a.fiche_id = fiche and f.id = fiche
      and app.visible(f.foyer_id, f.masque_pour, f.prive, f.cree_par)
      and e.archivee_le is null;

    delete from app.anniversaires a using app.fiches f
    where nouvelle is null and a.fiche_id = fiche and f.id = fiche
      and app.visible(f.foyer_id, f.masque_pour, f.prive, f.cree_par);
  $$;

revoke execute on function app.suivre_anniversaires(uuid, jsonb, text, text)
  from public;
grant execute on function app.suivre_anniversaires(uuid, jsonb, text, text)
  to authenticated;
