/**
 * L'envoi des notifications push, appelé chaque heure avec les résumés
 * (SPEC § 6) : passé `HEURE_PUSH`, une notification par compte et par jour,
 * qui regroupe tout ce qui notifie ce matin, sur chacun de ses appareils.
 * Réservée dans le journal avant de partir, rendue si aucun appareil ne l'a
 * reçue. Un appareil que le service de push ne connaît plus est oublié.
 *
 * Écrit contre des dépendances : la route les branche sur la base et Web
 * Push, les tests sur des doublures.
 */
import { toISO } from "@/lib/domain/plain-date";
import type { Bilan } from "./envoi-resumes";
import {
  aNotifier,
  type ElementPush,
  HEURE_PUSH,
  type MessagePush,
  messagePush,
} from "./push";
import type { Abonne, Abonnement } from "./push-store";
import type { ContenuResume, InstantParis } from "./resumes";

/** Le service de push a oublié l'appareil (désinstallé, permission retirée). */
export class AbonnementPerime extends Error {}

export interface PushDeps {
  abonnes(): Promise<Abonne[]>;
  reserver(membre: string, jour: string): Promise<boolean>;
  liberer(membre: string, jour: string): Promise<void>;
  annonces(membre: string): Promise<ReadonlySet<string>>;
  noterAnnonces(
    membre: string,
    elements: readonly ElementPush[],
  ): Promise<void>;
  /** Ce que voit ce compte, sous sa RLS. */
  contenu(compte: string): Promise<ContenuResume>;
  /** Rejette `AbonnementPerime` si l'appareil n'existe plus. */
  envoyer(abonnement: Abonnement, message: MessagePush): Promise<void>;
  oublier(endpoint: string): Promise<void>;
}

type Issue = keyof Bilan;

type Reception = "recue" | "perime" | "echec";

async function versAppareil(
  deps: PushDeps,
  abonnement: Abonnement,
  message: MessagePush,
): Promise<Reception> {
  try {
    await deps.envoyer(abonnement, message);

    return "recue";
  } catch (error_) {
    if (error_ instanceof AbonnementPerime) {
      await deps.oublier(abonnement.endpoint);

      return "perime";
    }

    console.error("[push] envoi échoué", error_);

    return "echec";
  }
}

async function pourUn(
  deps: PushDeps,
  a: Abonne,
  instant: InstantParis,
): Promise<Issue | null> {
  const jour = toISO(instant.jour);

  if (!(await deps.reserver(a.membre, jour))) {
    return null;
  }

  const [contenu, annonces] = await Promise.all([
    deps.contenu(a.compte),
    deps.annonces(a.membre),
  ]);
  const elements = aNotifier(contenu, instant.jour, a.reglages.push, annonces);

  if (elements.length === 0) {
    // Rien ce matin ; une échéance ajoutée dans la journée partira à l'appel
    // suivant.
    await deps.liberer(a.membre, jour);

    return "vides";
  }

  const message = messagePush(elements, instant.jour);
  const receptions = await Promise.all(
    a.abonnements.map(abonnement => versAppareil(deps, abonnement, message)),
  );

  if (!receptions.includes("recue")) {
    // Personne ne l'a reçue : à retenter, sauf s'il ne reste aucun appareil.
    await deps.liberer(a.membre, jour);

    return receptions.includes("echec") ? "echecs" : "vides";
  }

  await deps.noterAnnonces(
    a.membre,
    elements.filter(e => e.motif === "arrivee"),
  );

  return "envoyes";
}

export async function envoyerPush(
  deps: PushDeps,
  instant: InstantParis,
): Promise<Bilan> {
  if (instant.heure < HEURE_PUSH) {
    return { envoyes: 0, vides: 0, echecs: 0 };
  }

  const abonnes = await deps.abonnes();
  const issues = await Promise.all(abonnes.map(a => pourUn(deps, a, instant)));

  return {
    envoyes: issues.filter(i => i === "envoyes").length,
    vides: issues.filter(i => i === "vides").length,
    echecs: issues.filter(i => i === "echecs").length,
  };
}
