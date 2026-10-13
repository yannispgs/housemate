-- Les pièces jointes d'une fiche (SPEC § 4.2) : d'abord la facture d'un
-- objet, pour la retrouver en cas de besoin (décision du foyer, 2026-10-13 :
-- sans lecture automatique).
--
-- Le fichier vit dans le stockage privé (Cloudflare R2, UE) ; la base n'en
-- garde que la clé et ce qu'il faut pour l'afficher. Il ne se lit que par un
-- lien temporaire, signé par le serveur après vérification des droits.
--
-- Une pièce jointe se voit si et seulement si sa fiche se voit : une facture
-- d'une fiche privée reste privée, une facture masquée pour quelqu'un l'est
-- aussi. Les règles de la fiche s'appliquent, rien n'est redit ici.
create table app.pieces_jointes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null default app.foyer_courant() references app.foyers,
  fiche_id uuid not null references app.fiches,
  -- Le nom donné par la personne, ou celui du fichier.
  nom text not null check (length(trim(nom)) > 0),
  type_mime text not null check (
    type_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  -- 4 Mo au plus : le fichier passe par une fonction Vercel (limite 4,5 Mo).
  taille integer not null check (taille > 0 and taille <= 4194304),
  -- La clé de l'objet dans le stockage : jamais une adresse publique.
  cle text not null unique,
  ajoutee_par uuid not null default app.membre_courant() references app.membres,
  ajoutee_le timestamptz not null default now()
);

alter table app.pieces_jointes enable row level security;

-- Rien ne s'efface (§ 2, principe 4) : ni mise à jour, ni suppression.
grant select, insert on app.pieces_jointes to authenticated;

create policy lisibles on app.pieces_jointes for select to authenticated
  using (fiche_id in (select id from app.fiches));

create policy ajoutables on app.pieces_jointes for insert to authenticated
  with check (
    foyer_id = app.foyer_courant()
    and ajoutee_par = app.membre_courant()
    and fiche_id in (select id from app.fiches)
  );
