import type { Metadata } from "next";
import { connection } from "next/server";
import { authMode } from "@/lib/auth/server";
import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = { title: "Connexion" };

/**
 * ⚠️ Écran provisoire : la connexion n'est pas encore dessinée dans Claude
 * Design (`a-dessiner.md`). Il couvre la coquille de l'app plutôt que de
 * s'y insérer, en attendant sa maquette.
 */
export default async function Page() {
  // Rendue à la demande : le mode d'authentification est celui de
  // l'environnement qui sert la page, pas celui du build.
  await connection();
  const desactivee = authMode().kind === "desactivee";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-page px-4 py-8">
      <main className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="mb-1 text-xl font-semibold text-ink">
          House<span className="text-brand">Mate</span>
        </h1>
        <p className="mb-6 text-sm text-ink-secondary">
          Connexion réservée au foyer.
        </p>
        {desactivee ? (
          <p className="text-sm text-ink-secondary">
            Authentification désactivée dans cet environnement.{" "}
            <a href="/" className="underline">
              Aller à l'accueil
            </a>
          </p>
        ) : (
          <FormulaireConnexion />
        )}
      </main>
    </div>
  );
}
