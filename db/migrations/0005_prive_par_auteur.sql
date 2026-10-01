-- Seul l'auteur d'une fiche ou d'une échéance la rend privée, ou publique
-- (décision du foyer, 2026-10-01).
--
-- Sans cette règle, un membre pouvait passer en privé l'élément d'un autre :
-- le privé le réservant à son AUTEUR, l'élément disparaissait pour tout le
-- foyer, celui qui l'avait rendu privé compris.
--
-- Le masquage ciblé (`masque_pour`, pour les surprises) reste ouvert à tout
-- membre qui voit l'élément : c'est précisément quelqu'un d'autre que la
-- personne visée qui prépare la surprise.
--
-- Un déclencheur et non une règle d'accès : une règle RLS ne voit que la
-- nouvelle ligne, pas l'ancienne, et ne peut donc pas dire si `prive` change.
-- Il ne s'applique qu'aux requêtes de l'app (`authenticated`) : le
-- propriétaire de la base, qui administre, n'y est pas soumis.

create function app.prive_par_l_auteur() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if current_user = 'authenticated'
      and new.prive is distinct from old.prive
      and old.cree_par is distinct from app.membre_courant()
    then
      raise exception 'Seul l''auteur peut rendre cet élément privé ou public.'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end
  $$;

create trigger fiches_prive_par_l_auteur before update on app.fiches
  for each row execute function app.prive_par_l_auteur();

create trigger echeances_prive_par_l_auteur before update on app.echeances
  for each row execute function app.prive_par_l_auteur();
