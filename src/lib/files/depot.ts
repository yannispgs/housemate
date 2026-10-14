/**
 * Joindre un fichier à une fiche (la facture d'un objet), en deux temps :
 *
 * 1. `autoriserEnvoi` : le fichier annoncé est-il acceptable, la fiche
 *    visible de la personne connectée, le quota respecté ? Si oui, un lien
 *    d'envoi signé vers la zone d'attente du stockage, valable 5 minutes, pour
 *    ce type et cette taille seulement.
 * 2. `confirmerEnvoi` : une fois le fichier envoyé par le navigateur, le
 *    serveur relit ce que le stockage a VRAIMENT reçu (taille, type, premiers
 *    octets) sans croire le navigateur, le recopie dans la zone des fiches, et
 *    l'enregistre.
 *
 * Logique pure : la base, le stockage et l'identifiant aléatoire sont
 * injectés. Un échec laisse au pire un objet orphelin dans le stockage
 * (effacé au bout d'un jour en zone d'attente), jamais une ligne qui pointe
 * vers rien.
 */
import { z } from "zod";
import {
  cleEnAttente,
  lireCleEnAttente,
  OCTETS_SIGNATURE,
  QUOTA_FOYER,
  type Stockage,
  signatureConforme,
  TAILLE_MAX,
  verifierFichier,
  ZONE_ATTENTE,
} from "@/lib/files/r2";

export interface DepotDeps {
  ficheVisible(ficheId: string): Promise<boolean>;
  /** Le volume des pièces jointes déjà enregistrées par le foyer. */
  volumeFoyer(): Promise<number>;
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

export type Refus = {
  readonly ok: false;
  readonly statut: number;
  readonly erreur: string;
};

export type ResultatAutorisation =
  | { readonly ok: true; readonly cle: string; readonly url: string }
  | Refus;

export type ResultatConfirmation =
  | { readonly ok: true; readonly id: string }
  | Refus;

const ficheId = z.uuid();

const INTROUVABLE: Refus = {
  ok: false,
  statut: 404,
  erreur: "Fiche introuvable.",
};

const PLEIN: Refus = {
  ok: false,
  statut: 413,
  erreur: "L'espace des pièces jointes du foyer est plein (2 Go).",
};

/** Le nom affiché : celui donné, sinon celui du fichier, raccourci. */
export function nomAffiche(donne: string | null, fichier: string): string {
  const nom = (donne ?? "").trim() || fichier.trim() || "Pièce jointe";

  return nom.slice(0, 120);
}

/**
 * Le foyer peut-il recevoir `taille` octets de plus ? Les envois en attente
 * comptent aussi : demander des liens sans jamais confirmer ne contourne pas
 * le quota.
 */
async function place(taille: number, deps: DepotDeps): Promise<boolean> {
  const [enregistre, enAttente] = await Promise.all([
    deps.volumeFoyer(),
    deps.stockage.volume(ZONE_ATTENTE),
  ]);

  return enregistre + enAttente + taille <= QUOTA_FOYER;
}

export async function autoriserEnvoi(
  demande: {
    readonly ficheId: unknown;
    readonly type: unknown;
    readonly taille: unknown;
  },
  deps: DepotDeps,
): Promise<ResultatAutorisation> {
  const id = ficheId.safeParse(demande.ficheId);

  if (!id.success) {
    return { ok: false, statut: 400, erreur: "Fiche ou fichier manquant." };
  }

  const verification = verifierFichier({
    type: typeof demande.type === "string" ? demande.type : "",
    size: typeof demande.taille === "number" ? demande.taille : 0,
  });

  if (!verification.ok) {
    return { ok: false, statut: 400, erreur: verification.erreur };
  }

  // Une fiche privée d'un autre, ou d'un autre foyer, est invisible : même
  // réponse qu'une fiche qui n'existe pas.
  if (!(await deps.ficheVisible(id.data))) {
    return INTROUVABLE;
  }

  const taille = demande.taille as number;

  if (!(await place(taille, deps))) {
    return PLEIN;
  }

  const cle = cleEnAttente(id.data, verification.type, deps.identifiant());

  return {
    ok: true,
    cle,
    url: await deps.stockage.lienDEnvoi(cle, verification.type, taille),
  };
}

export async function confirmerEnvoi(
  demande: {
    readonly ficheId: unknown;
    readonly cle: unknown;
    readonly nom: string | null;
    readonly nomFichier: string;
  },
  deps: DepotDeps,
): Promise<ResultatConfirmation> {
  const id = ficheId.safeParse(demande.ficheId);
  const attente =
    id.success && typeof demande.cle === "string"
      ? lireCleEnAttente(demande.cle, id.data)
      : null;

  if (!id.success || attente === null) {
    return { ok: false, statut: 400, erreur: "Envoi inconnu." };
  }

  if (!(await deps.ficheVisible(id.data))) {
    return INTROUVABLE;
  }

  const source = demande.cle as string;
  const recu = await deps.stockage.decrire(source);

  if (recu === null) {
    return {
      ok: false,
      statut: 400,
      erreur: "Le fichier n'est pas arrivé. Réessaie.",
    };
  }

  // Le lien d'envoi fige déjà le type et la taille ; on relit malgré tout ce
  // qui a été reçu, puis le contenu lui-même.
  const conforme =
    recu.type === attente.type &&
    recu.taille > 0 &&
    recu.taille <= TAILLE_MAX &&
    signatureConforme(
      attente.type,
      await deps.stockage.debut(source, OCTETS_SIGNATURE),
    );

  if (!conforme) {
    await deps.stockage.supprimer(source);

    return {
      ok: false,
      statut: 400,
      erreur: "Ce fichier n'est pas une photo ou un PDF valide.",
    };
  }

  // L'envoi en attente est déjà compté dans le volume du stockage.
  if (!(await place(0, deps))) {
    await deps.stockage.supprimer(source);

    return PLEIN;
  }

  await deps.stockage.copier(source, attente.definitive);
  const piece = await deps.enregistrer({
    ficheId: id.data,
    nom: nomAffiche(demande.nom, demande.nomFichier),
    typeMime: attente.type,
    taille: recu.taille,
    cle: attente.definitive,
  });
  // Sans gravité si cela échoue : la zone d'attente se vide d'elle-même.
  await deps.stockage.supprimer(source).catch(() => undefined);

  return { ok: true, id: piece };
}
