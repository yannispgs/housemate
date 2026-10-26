-- Veille de gel par plante et par emplacement (SPEC § 12.8, décisions du
-- 25/10/2026) : chaque soir, une passe sur chaque plante suivie, avec le
-- modèle de température de son emplacement.
--
-- La nuit garde sa ligne dans `nuits_gel` : la prévision retenue, les relevés,
-- la prédiction de la véranda et son bilan du matin, qui calibrent les
-- modèles. Ce qui dépend de la plante — son seuil, son pire cas, son niveau —
-- passe dans `nuits_gel_plantes`.

-- Les plantes que la veille peut suivre : celles de l'extérieur et de la
-- véranda, non archivées. « Autre pièce » n'est pas suivie (décision du
-- 25/10/2026). Le rôle de la veille ne voit que ces cinq colonnes, rien
-- d'autre des fiches.
--
-- ⚠️ Un seul foyer : la vue les lit toutes, sans filtre de foyer. Un second
-- foyer demanderait d'en choisir un, et une adresse d'alerte par foyer.
--
-- Les libellés et les deux emplacements sont ceux de `src/lib/data/plantes.ts`
-- (§ 12.4) ; le test d'intégration de la veille passe par eux. Une fiche
-- privée (§ 7) n'est visible que de son auteur : elle n'est pas suivie, son
-- nom n'a pas à partir dans un mail.
create view meteo.plantes_suivies as
select
  f.id,
  f.titre,
  e.valeur as emplacement,
  s.degats as seuil_degats,
  s.mort as seuil_mort
from app.fiches f
cross join lateral (
  select a->>'valeur' as valeur
  from jsonb_array_elements(f.attributs) a
  where a->>'libelle' = 'Emplacement' and a->>'type' = 'texte'
  limit 1
) e
cross join lateral (
  select
    max((a->>'valeur')::numeric) filter (where a->>'libelle' = 'Seuil de dégâts')
      as degats,
    max((a->>'valeur')::numeric) filter (where a->>'libelle' = 'Seuil de mort')
      as mort
  from jsonb_array_elements(f.attributs) a
  where a->>'type' = 'temperature'
) s
where f.nature = 'plante'
  and f.archivee_le is null
  and not f.prive
  and e.valeur in ('Extérieur', 'Véranda');

-- Le seuil n'est plus celui de la nuit, mais de chaque plante : vide pour les
-- nuits à venir, gardé pour celles d'avant, qui n'avaient que le citronnier.
alter table meteo.nuits_gel alter column seuil_degats drop not null;

-- Chaque plante suivie, chaque soir : ce qu'elle risquait, et ce qu'on en a
-- dit. Une photo de la fiche ce soir-là — nom, emplacement, seuils — : la
-- fiche changera, le journal doit se relire tel qu'il a été décidé. Pas de
-- clé vers `app.fiches` : une fiche supprimée ne doit pas effacer l'histoire.
create table meteo.nuits_gel_plantes (
  nuit date not null references meteo.nuits_gel,
  fiche_id uuid not null,
  titre text not null,
  emplacement text not null check (emplacement in ('Extérieur', 'Véranda')),
  -- Vide : la plante n'est pas suivie faute de seuil, et le mail le dit.
  seuil_degats numeric(4, 1),
  seuil_mort numeric(4, 1),
  -- Le minimum attendu à son emplacement, et le pire cas retenu ; leur écart
  -- est la somme des marges appliquées ce soir-là. Vides si on n'a pas pu
  -- estimer (capteur de la véranda muet).
  estimation numeric(4, 1),
  borne_basse numeric(4, 1),
  -- `alerte` : le pire cas atteint le seuil de dégâts ; `vigilance` : il en
  -- approche à 2 °C, listé sans déclencher de mail ; `indisponible` : pas
  -- d'estimation une nuit qui pouvait l'atteindre.
  niveau text check (niveau in ('alerte', 'vigilance', 'indisponible')),
  primary key (nuit, fiche_id)
);

grant select on meteo.plantes_suivies to meteo_veille;
grant select, insert on meteo.nuits_gel_plantes to meteo_veille;
