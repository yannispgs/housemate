import type { Metadata } from "next";
import { connection } from "next/server";
import { Panel } from "@/components/Screen";
import { authMode } from "@/lib/auth/server";
import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = { title: "Connexion" };

/**
 * ⚠️ Écran provisoire : la connexion n'est pas encore dessinée dans Claude
 * Design (`a-dessiner.md`, § 2.5). Il reprend les éléments de la refonte
 * (marque, titre, panneau, intertitres, champs en pilule) et couvre la
 * coquille de l'app plutôt que de s'y insérer, en attendant sa maquette.
 */
export default async function Page() {
  // Rendue à la demande : le mode d'authentification est celui de
  // l'environnement qui sert la page, pas celui du build.
  await connection();
  const desactivee = authMode().kind === "desactivee";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-page">
      <main className="mx-auto flex min-h-full w-full max-w-[460px] flex-col gap-[26px] px-[18px] pt-[max(env(safe-area-inset-top),28px)] pb-10 md:justify-center">
        {/* La marque, comme dans la coquille de l'app. */}
        <span className="inline-flex flex-none flex-col gap-[5px] self-start px-1">
          <span className="font-display text-[13px] text-ink">HouseMate</span>
          <span className="h-0.5 rounded-sm bg-brand" />
        </span>

        <div className="flex flex-col gap-1.5 px-1">
          <h1 className="m-0 font-display text-[27px] leading-[1.12] font-normal text-ink md:text-[32px] md:leading-[1.1]">
            Connexion
          </h1>
          <p className="m-0 text-[14.5px] leading-[1.45] text-ink-secondary">
            Réservée au foyer.
          </p>
        </div>

        <Panel className="gap-3 p-[18px]">
          {desactivee ? (
            <p className="m-0 text-[14.5px] text-ink-secondary">
              Authentification désactivée dans cet environnement.{" "}
              <a href="/" className="text-ink underline">
                Aller à l'accueil
              </a>
            </p>
          ) : (
            <FormulaireConnexion />
          )}
        </Panel>
      </main>
    </div>
  );
}
