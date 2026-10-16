/**
 * Remplir le foyer d'une preview avec le jeu fictif (`jeu-fictif.ts`), par
 * les mêmes fonctions que le formulaire d'ajout : sous la RLS, au nom d'un
 * membre du foyer (`commeMembre`).
 */
import type {
  FicheFictive,
  GarantieFictive,
  JeuFictif,
} from "@/lib/data/jeu-fictif";
import {
  ajouterPieceJointe,
  creerEcheance,
  creerFiche,
  creerGarantie,
  type Tx,
} from "@/lib/data/store";

/** Vrai si le foyer n'a encore aucune fiche ni aucune échéance. */
export async function foyerVide(tx: Tx): Promise<boolean> {
  const [row] = await tx`
    select not exists (select from app.fiches)
      and not exists (select from app.echeances) as vide`;

  return row?.vide === true;
}

async function creerFicheFictive(tx: Tx, f: FicheFictive): Promise<number> {
  const ficheId = await creerFiche(tx, f.fiche);
  await Promise.all(f.echeances.map(e => creerEcheance(tx, { ...e, ficheId })));

  return f.echeances.length;
}

async function creerGarantieFictive(tx: Tx, g: GarantieFictive): Promise<void> {
  const ficheId = await creerGarantie(tx, g.garantie);
  await Promise.all(
    g.pieces.map(p => ajouterPieceJointe(tx, { ...p, ficheId })),
  );
}

export async function remplirFoyer(
  tx: Tx,
  jeu: JeuFictif,
): Promise<{ fiches: number; echeances: number }> {
  const [rattachees] = await Promise.all([
    Promise.all(jeu.fiches.map(f => creerFicheFictive(tx, f))),
    Promise.all(jeu.garanties.map(g => creerGarantieFictive(tx, g))),
    Promise.all(jeu.echeances.map(e => creerEcheance(tx, e))),
  ]);

  return {
    fiches: jeu.fiches.length + jeu.garanties.length,
    echeances:
      rattachees.reduce((total, n) => total + n, 0) +
      jeu.garanties.length +
      jeu.echeances.length,
  };
}
