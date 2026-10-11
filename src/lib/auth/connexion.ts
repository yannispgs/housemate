/**
 * Le parcours de connexion (SPEC § 7.2) : une adresse, puis le code à six
 * chiffres reçu à cette adresse. Aucune création de compte depuis l'app : une
 * adresse hors liste blanche ne reçoit rien (webhook `send.otp`) et ne peut
 * pas créer de compte (webhook `user.before_create`).
 *
 * ⚠️ Le parcours ne dit jamais si une adresse est sur la liste : la réponse à
 * la demande de code est la même dans tous les cas.
 *
 * Les appels à Neon Auth, à la base et à l'envoi d'e-mails sont injectés : le
 * parcours se teste sans réseau.
 */
import { z } from "zod";
import {
  decrireAppareil,
  empreinte,
  identifiantValide,
  nouvelIdentifiant,
} from "@/lib/auth/appareils";
import { type MailContent, messageNouvelAppareil } from "@/lib/auth/messages";
import { normalizeEmail } from "@/lib/auth/webhook";

export type EtatConnexion =
  | { readonly etape: "adresse"; readonly erreur?: string }
  | {
      readonly etape: "code";
      readonly email: string;
      readonly erreur?: string;
    }
  | { readonly etape: "connecte" };

export const ETAT_INITIAL: EtatConnexion = { etape: "adresse" };

export type ResultatCode =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly raison: "code" | "tentatives" | "service" };

export interface ConnexionDeps {
  demanderCode(email: string): Promise<{ readonly ok: boolean }>;
  verifierCode(email: string, code: string): Promise<ResultatCode>;
  /** L'identifiant d'appareil du cookie, s'il y en a un. */
  lireAppareil(): string | undefined;
  poserAppareil(identifiant: string): void;
  /** Vrai si cet appareil était inconnu de ce compte. */
  noterAppareil(
    userId: string,
    empreinte: string,
    description: string,
  ): Promise<boolean>;
  avertir(email: string, message: MailContent): Promise<void>;
  signaler(erreur: unknown): void;
  readonly userAgent: string | null;
  readonly site: string;
  readonly maintenant: Date;
}

const adresse = z.email();
const code = z.string().regex(/^\d{6}$/);

export async function demanderCode(
  saisie: string,
  deps: Pick<ConnexionDeps, "demanderCode">,
): Promise<EtatConnexion> {
  const email = normalizeEmail(saisie);

  if (!adresse.safeParse(email).success) {
    return { etape: "adresse", erreur: "Cette adresse n'est pas valide." };
  }

  const { ok } = await deps.demanderCode(email);

  if (!ok) {
    return {
      etape: "adresse",
      erreur:
        "Le service de connexion ne répond pas. Réessayez dans un instant.",
    };
  }

  return { etape: "code", email };
}

const MESSAGES = {
  code: "Code incorrect ou expiré.",
  tentatives: "Trop d'essais. Demandez un nouveau code.",
  service: "Le service de connexion ne répond pas. Réessayez dans un instant.",
} as const;

export async function verifierCode(
  email: string,
  saisie: string,
  deps: Omit<ConnexionDeps, "demanderCode">,
): Promise<EtatConnexion> {
  const otp = saisie.replace(/\s/g, "");

  if (!code.safeParse(otp).success) {
    return { etape: "code", email, erreur: "Le code a six chiffres." };
  }

  const resultat = await deps.verifierCode(email, otp);

  if (!resultat.ok) {
    return { etape: "code", email, erreur: MESSAGES[resultat.raison] };
  }

  // La vérification d'appareil est une alarme : si elle échoue, la connexion
  // reste valable, et l'échec est signalé plutôt que tu.
  try {
    await verifierAppareil(resultat.userId, email, deps);
  } catch (erreur) {
    deps.signaler(erreur);
  }

  return { etape: "connecte" };
}

async function verifierAppareil(
  userId: string,
  email: string,
  deps: Omit<ConnexionDeps, "demanderCode">,
): Promise<void> {
  let identifiant = deps.lireAppareil();

  if (!identifiantValide(identifiant)) {
    identifiant = nouvelIdentifiant();
    deps.poserAppareil(identifiant);
  }

  const description = decrireAppareil(deps.userAgent);
  const nouveau = await deps.noterAppareil(
    userId,
    empreinte(identifiant),
    description,
  );

  if (nouveau) {
    await deps.avertir(
      email,
      messageNouvelAppareil({
        description,
        quand: deps.maintenant,
        site: deps.site,
      }),
    );
  }
}
