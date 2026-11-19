-- Deux marges mesurées, une par emplacement, réglées sur la cible du foyer
-- (SPEC § 12.8, décisions du 19/11/2026) : le minimum réel peut finir au plus
-- 0,5 °C sous le pire cas, quitte à finir jusqu'à 3 °C au-dessus.
--
-- La marge couvre donc le pire écart DANGEREUX mesuré, celui d'une nuit plus
-- froide qu'attendu, moins cette tolérance. Une prévision trop froide ne
-- l'élargit plus : l'erreur quadratique de 0016 comptait le 7/11, annoncé
-- 2,7 °C trop froid, comme un danger.
--
-- - Dehors : le minimum extérieur mesuré contre l'annoncé.
-- - Véranda : le minimum mesuré contre l'estimation de 20 h, toute la chaîne
--   d'un coup (prévision et modèle). Une nuit chauffée n'en dit rien.

drop view meteo.erreur_prevision_froid;

-- Les emplacements qui ont une marge mesurée, nommés une seule fois.
create table meteo.emplacements_marge (
  emplacement text primary key,
  -- Véranda : mesurée sur toute la chaîne ; sinon, sur la prévision seule.
  veranda boolean not null unique
);

insert into meteo.emplacements_marge (emplacement, veranda)
values ('Extérieur', false), ('Véranda', true);

grant select on meteo.emplacements_marge to meteo_veille;

-- Le pire écart dangereux sur les 60 dernières nuits froides (minimum
-- extérieur mesuré à 5 °C ou moins) de chaque emplacement ; 0 si le réel n'a
-- jamais fini sous l'attendu.
create view meteo.ecarts_froids as
with nuits as (
  select n.nuit, e.emplacement,
    case when e.veranda then n.min_veranda - n.estimation
      else n.erreur_prevision end as ecart
  from meteo.nuits_gel n
  cross join meteo.emplacements_marge e
  where n.min_exterieur <= 5 and (not e.veranda or n.chauffee is not true)
),
recentes as (
  select emplacement, ecart,
    row_number() over (partition by emplacement order by nuit desc) as rang
  from nuits
  where ecart is not null
)
select
  e.emplacement,
  count(r.ecart)::int as nuits,
  round(coalesce(max(greatest(-r.ecart, 0)), 0)::numeric, 2) as ecart
from meteo.emplacements_marge e
left join recentes r on r.emplacement = e.emplacement and r.rang <= 60
group by e.emplacement;

grant select on meteo.ecarts_froids to meteo_veille;

-- Une marge par emplacement, une proposition en attente par emplacement.
-- Les marges d'avant étaient celles du dehors. `erreur` devient `ecart` : ce
-- n'est plus une erreur quadratique.
alter table meteo.marges_prevision
  add column emplacement text references meteo.emplacements_marge;
update meteo.marges_prevision
  set emplacement = (select emplacement from meteo.emplacements_marge
    where not veranda);
alter table meteo.marges_prevision alter column emplacement set not null;
alter table meteo.marges_prevision rename column erreur to ecart;

drop index meteo.marges_prevision_une_en_attente;
create unique index marges_prevision_une_en_attente
  on meteo.marges_prevision (emplacement) where appliquee_le is null;

-- Une ligne par emplacement : la marge en vigueur et la proposition en
-- attente. Vide si la personne n'est membre d'aucun foyer.
drop function app.marge_prevision();

create function app.marge_prevision()
  returns table (
    emplacement text,
    actuelle numeric,
    appliquee_le timestamptz,
    proposition bigint,
    proposee numeric,
    nuits int,
    ecart numeric,
    proposee_le timestamptz
  )
  language sql stable security definer set search_path = ''
  as $$
    select e.emplacement, a.valeur, a.appliquee_le, p.id, p.valeur, p.nuits,
      p.ecart, p.proposee_le
    from meteo.emplacements_marge e
    left join lateral (
      select valeur, appliquee_le from meteo.marges_prevision m
      where m.emplacement = e.emplacement and m.appliquee_le is not null
      order by m.appliquee_le desc, m.id desc
      limit 1
    ) a on true
    left join lateral (
      select id, valeur, nuits, ecart, proposee_le
      from meteo.marges_prevision m
      where m.emplacement = e.emplacement and m.appliquee_le is null
    ) p on true
    where app.membre_courant() is not null
    order by e.emplacement
  $$;

revoke execute on function app.marge_prevision() from public;
grant execute on function app.marge_prevision() to authenticated;
