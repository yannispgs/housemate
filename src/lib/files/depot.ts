/**
 * Joindre un fichier à une fiche (la facture d'un objet) : vérifier le
 * fichier, vérifier que la fiche est visible de la personne connectée, le
 * déposer dans le stockage privé, puis l'enregistrer. Logique pure : la base,
 * le stockage et l'identifiant aléatoire sont injectés.
 *
 * L'ordre compte : le fichier n'est déposé que pour une fiche visible, et
 * n'est enregistré en base qu'une fois déposé. Un échec d'enregistrement
 * laisse au pire un objet orphelin dans le stockage, jamais une ligne qui
 * pointe vers rien.
 */
import { z } from "zod";
import { cleDe, type Stockage, verifierFichier } from "@/lib/files/r2";

export interface FichierRecu {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DepotDeps {
  ficheVisible(ficheId: string): Promise<boolean>;
  enregistrer(piece: {
    ficheId: string;
    nom: string;
    typeMime: string;
    taille: number;
    cle: string;
  }): Promise<string>;
  readonly stockage: Stockage;
  identifiant(): string;
}

export type ResultatDepot =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly statut: number; readonly erreur: string };

const ficheId = z.uuid();

/** Le nom affiché : celui donné, sinon celui du fichier, raccourci. */
export function nomAffiche(donne: string | null, fichier: string): string {
  const nom = (donne ?? "").trim() || fichier.trim() || "Pièce jointe";

  return nom.slice(0, 120);
}

export async function deposerPieceJointe(
  demande: {
    readonly ficheId: unknown;
    readonly nom: string | null;
    readonly fichier: FichierRecu | null;
  },
  deps: DepotDeps,
): Promise<ResultatDepot> {
  const id = ficheId.safeParse(demande.ficheId);

  if (!id.success || demande.fichier === null) {
    return { ok: false, statut: 400, erreur: "Fiche ou fichier manquant." };
  }

  const verification = verifierFichier(demande.fichier);

  if (!verification.ok) {
    return { ok: false, statut: 400, erreur: verification.erreur };
  }

  // Une fiche privée d'un autre, ou d'un autre foyer, est invisible : même
  // réponse qu'une fiche qui n'existe pas.
  if (!(await deps.ficheVisible(id.data))) {
    return { ok: false, statut: 404, erreur: "Fiche introuvable." };
  }

  const cle = cleDe(id.data, verification.type, deps.identifiant());
  await deps.stockage.deposer(
    cle,
    await demande.fichier.arrayBuffer(),
    verification.type,
  );
  const piece = await deps.enregistrer({
    ficheId: id.data,
    nom: nomAffiche(demande.nom, demande.fichier.name),
    typeMime: verification.type,
    taille: demande.fichier.size,
    cle,
  });

  return { ok: true, id: piece };
}
