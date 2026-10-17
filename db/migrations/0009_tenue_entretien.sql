-- Ferme ou souple, et le seuil d'alerte d'un plan d'entretien (SPEC § 5.3,
-- décisions du foyer du 2026-10-17).
--
-- La tenue se règle sur l'objet pour tous ses consommables, et chacun peut
-- la remplacer. Un consommable qui hérite ne stocke rien (`tenue` nulle) :
-- il suit l'objet, et un changement sur l'objet se propage.

alter table app.fiches
  -- Souple par défaut : un consommable n'est pressant que si on le dit.
  add column tenue_entretien text not null default 'souple'
    check (tenue_entretien in ('souple', 'ferme')),
  -- La part de la durée de vie où l'échéance s'ouvre : 7,5 % par défaut.
  add column seuil_entretien numeric(4, 3) not null default 0.075
    check (seuil_entretien between 0.01 and 0.5);

alter table app.consommables
  -- `null` : la tenue de l'objet.
  add column tenue text check (tenue in ('souple', 'ferme'));

grant update (tenue_entretien, seuil_entretien) on app.fiches
  to authenticated;
grant update (tenue) on app.consommables to authenticated;
