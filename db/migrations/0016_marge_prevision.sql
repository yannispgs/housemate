-- La marge de prévision de la veille gel, mesurée puis validée (SPEC § 12.8,
-- décisions du 26/10/2026).
--
-- Le relevé extérieur mesure chaque matin l'erreur de la prévision
-- (`nuits_gel.erreur_prevision`). Après assez de nuits froides, la veille
-- PROPOSE une marge tirée de cette erreur ; rien ne change sans qu'un membre
-- l'applique, depuis les réglages. Le froid du sol et le radiatif, que le
-- capteur ne mesure pas, restent des réglages fixes.

-- L'erreur de la prévision sur les 60 dernières nuits froides (minimum
-- extérieur mesuré à 5 °C ou moins) : son erreur quadratique moyenne, qui
-- compte aussi un biais — une prévision toujours trop douce d'un degré doit
-- élargir la marge, pas la laisser intacte.
create view meteo.erreur_prevision_froid as
with froides as (
  select erreur_prevision
  from meteo.nuits_gel
  where erreur_prevision is not null and min_exterieur <= 5
  order by nuit desc
  limit 60
)
select
  count(*)::int as nuits,
  round(coalesce(sqrt(avg(erreur_prevision ^ 2)), 0)::numeric, 2) as erreur
from froides;

-- Les marges proposées, et celles appliquées. La marge en vigueur est la
-- dernière appliquée ; sans elle, le réglage de départ (2 °C, dans le code).
-- Une seule proposition en attente à la fois : la suivante la met à jour.
create table meteo.marges_prevision (
  id bigint generated always as identity primary key,
  valeur numeric(3, 1) not null check (valeur > 0),
  -- Sur quoi elle repose, pour qu'on sache ce qu'on valide.
  nuits int not null check (nuits > 0),
  erreur numeric(4, 2) not null,
  proposee_le timestamptz not null default now(),
  -- Vide : en attente. Écrit depuis l'app seulement.
  appliquee_le timestamptz
);

create unique index marges_prevision_une_en_attente
  on meteo.marges_prevision ((true)) where appliquee_le is null;

-- La veille propose, et ne valide jamais : pas d'`appliquee_le` pour elle.
grant select on meteo.erreur_prevision_froid to meteo_veille;
grant select, insert on meteo.marges_prevision to meteo_veille;
grant update (valeur, nuits, erreur, proposee_le)
  on meteo.marges_prevision to meteo_veille;

-- Pour l'app : la marge en vigueur et la proposition en attente. Vide si la
-- personne n'est membre d'aucun foyer.
create function app.marge_prevision()
  returns table (
    actuelle numeric,
    appliquee_le timestamptz,
    proposition bigint,
    proposee numeric,
    nuits int,
    erreur numeric,
    proposee_le timestamptz
  )
  language sql stable security definer set search_path = ''
  as $$
    select a.valeur, a.appliquee_le, p.id, p.valeur, p.nuits, p.erreur,
      p.proposee_le
    from (select) x
    left join lateral (
      select valeur, appliquee_le from meteo.marges_prevision
      where appliquee_le is not null
      order by appliquee_le desc, id desc
      limit 1
    ) a on true
    left join lateral (
      select id, valeur, nuits, erreur, proposee_le
      from meteo.marges_prevision
      where appliquee_le is null
    ) p on true
    where app.membre_courant() is not null
  $$;

-- « Appliquer » : la proposition en attente devient la marge en vigueur.
-- ⚠️ Un seul foyer : la marge vaut pour toute la base.
create function app.appliquer_marge_prevision(proposition bigint)
  returns boolean
  language sql volatile security definer set search_path = ''
  as $$
    with faite as (
      update meteo.marges_prevision m set appliquee_le = now()
      where m.id = proposition
        and m.appliquee_le is null
        and app.membre_courant() is not null
      returning 1
    )
    select exists (select from faite)
  $$;

revoke execute on function
  app.marge_prevision(),
  app.appliquer_marge_prevision(bigint)
  from public;
grant execute on function
  app.marge_prevision(),
  app.appliquer_marge_prevision(bigint)
  to authenticated;
