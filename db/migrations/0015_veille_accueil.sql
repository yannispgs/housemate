-- La veille gel sur l'accueil (SPEC § 12.8, décisions du 26/10/2026) : la
-- carte « Gel cette nuit », du soir de la décision au bilan du matin, et le
-- bouton « Chauffer » de la véranda.
--
-- L'app ne lit ni n'écrit le schéma `meteo` : elle passe par ces deux
-- fonctions, qui ne laissent voir que les plantes que la personne connectée
-- voit déjà (§ 7) — une plante privée ne figure que sur l'accueil de son
-- autrice.
--
-- `instant` vient du serveur de l'app (l'heure de la requête) : les tests le
-- fixent, ce qui rend « la nuit en cours » vérifiable à toute heure.

-- La nuit en cours à cet instant, à l'heure de Paris : de 20 h au bilan de
-- 9 h 30 le lendemain. Vide en journée.
create function app.nuit_en_cours(instant timestamptz) returns date
  language sql stable set search_path = ''
  as $$
    select case
      when (instant at time zone 'Europe/Paris')::time >= time '20:00'
        then (instant at time zone 'Europe/Paris')::date
      when (instant at time zone 'Europe/Paris')::time < time '09:30'
        then (instant at time zone 'Europe/Paris')::date - 1
    end
  $$;

-- Les plantes de la nuit en cours qui ont un niveau (alerte, vigilance,
-- indisponible), avec leur emplacement d'ALORS et celui d'à présent : s'ils
-- diffèrent, la plante a été déplacée depuis l'alerte. Le nom est celui de la
-- fiche aujourd'hui.
create function app.veille_gel_en_cours(instant timestamptz)
  returns table (
    nuit date,
    chauffee boolean,
    fiche_id uuid,
    titre text,
    emplacement_du_soir text,
    emplacement text,
    niveau text,
    estimation numeric,
    borne_basse numeric,
    seuil_degats numeric,
    seuil_mort numeric
  )
  language sql stable security definer set search_path = ''
  as $$
    select
      n.nuit, coalesce(n.chauffee, false), p.fiche_id, f.titre,
      p.emplacement, e.valeur, p.niveau, p.estimation, p.borne_basse,
      p.seuil_degats, p.seuil_mort
    from meteo.nuits_gel n
    join meteo.nuits_gel_plantes p on p.nuit = n.nuit
    join app.fiches f on f.id = p.fiche_id
    left join lateral (
      select a->>'valeur' as valeur
      from jsonb_array_elements(f.attributs) a
      where a->>'libelle' = 'Emplacement' and a->>'type' = 'texte'
      limit 1
    ) e on true
    where n.nuit = app.nuit_en_cours(instant)
      and p.niveau is not null
      and f.archivee_le is null
      -- SECURITY DEFINER contourne la RLS : la visibilité se vérifie ici,
      -- avec la même règle que les fiches.
      and app.visible(f.foyer_id, f.masque_pour, f.prive, f.cree_par)
  $$;

-- « Chauffer » (§ 12.8 c) : la nuit en cours est déclarée chauffée, ou ne
-- l'est plus (on peut se raviser jusqu'au matin). Rend `false` s'il n'y a pas
-- de nuit en cours, ou si la personne n'est membre d'aucun foyer.
-- ⚠️ Un seul foyer : la nuit est commune à toute la base.
create function app.declarer_nuit_chauffee(instant timestamptz, chauffee boolean)
  returns boolean
  language sql volatile security definer set search_path = ''
  as $$
    with faite as (
      update meteo.nuits_gel n set chauffee = declarer_nuit_chauffee.chauffee
      where n.nuit = app.nuit_en_cours(instant)
        and app.membre_courant() is not null
      returning 1
    )
    select exists (select from faite)
  $$;

revoke execute on function
  app.veille_gel_en_cours(timestamptz),
  app.declarer_nuit_chauffee(timestamptz, boolean)
  from public;
grant execute on function
  app.nuit_en_cours(timestamptz),
  app.veille_gel_en_cours(timestamptz),
  app.declarer_nuit_chauffee(timestamptz, boolean)
  to authenticated;
