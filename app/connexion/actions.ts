"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APPAREIL_COOKIE, APPAREIL_COOKIE_MAX_AGE } from "@/lib/auth/appareils";
import {
  demanderCode,
  type EtatConnexion,
  type ResultatCode,
  verifierCode,
} from "@/lib/auth/connexion";
import { envoyerMail, neonAuth, portierSql } from "@/lib/auth/server";
import { noterAppareil } from "@/lib/auth/store";

interface NeonError {
  readonly status?: number;
  readonly code?: string;
}

/** Traduit un refus de Neon Auth en raison lisible par le parcours. */
function raison(
  error: NeonError,
): Exclude<ResultatCode, { ok: true }>["raison"] {
  if (error.status === 429 || error.code === "TOO_MANY_ATTEMPTS") {
    return "tentatives";
  }

  return (error.status ?? 500) >= 500 ? "service" : "code";
}

/**
 * Une seule action pour les deux étapes : l'étape en cours voyage dans le
 * formulaire, l'adresse aussi une fois le code demandé.
 */
export async function connexion(
  _precedent: EtatConnexion,
  formulaire: FormData,
): Promise<EtatConnexion> {
  const auth = neonAuth();
  const email = String(formulaire.get("email") ?? "");

  if (formulaire.get("etape") !== "code") {
    return demanderCode(email, {
      demanderCode: async adresse => {
        const { error } = await auth.emailOtp.sendVerificationOtp({
          email: adresse,
          type: "sign-in",
        });

        return { ok: error === null || error === undefined };
      },
    });
  }

  const enTetes = await headers();
  const jar = await cookies();
  const etat = await verifierCode(email, String(formulaire.get("code") ?? ""), {
    verifierCode: async (adresse, otp) => {
      const { data, error } = await auth.signIn.emailOtp({
        email: adresse,
        otp,
      });
      const userId = (data as { user?: { id?: string } } | null)?.user?.id;

      return error || userId === undefined
        ? { ok: false, raison: raison((error ?? {}) as NeonError) }
        : { ok: true, userId };
    },
    lireAppareil: () => jar.get(APPAREIL_COOKIE)?.value,
    poserAppareil: identifiant => {
      jar.set(APPAREIL_COOKIE, identifiant, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: APPAREIL_COOKIE_MAX_AGE,
      });
    },
    noterAppareil: (userId, empreinte, description) =>
      noterAppareil(portierSql(), userId, empreinte, description),
    avertir: (adresse, message) => envoyerMail()(adresse, message),
    signaler: erreur => {
      console.error("[connexion] vérification d'appareil en échec", erreur);
    },
    userAgent: enTetes.get("user-agent"),
    site: `https://${enTetes.get("host") ?? "house-mate.app"}`,
    maintenant: new Date(),
  });

  if (etat.etape === "connecte") {
    redirect("/");
  }

  return etat;
}

export async function deconnexion(): Promise<void> {
  await neonAuth().signOut();
  redirect("/connexion");
}
