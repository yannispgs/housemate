import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { deconnexion } from "../connexion/actions";

export const metadata: Metadata = { title: "Déconnexion" };

/** ⚠️ Provisoire : la déconnexion rejoindra Réglages avec sa maquette. */
export default function Page() {
  return (
    <>
      <PageHeader
        title="Déconnexion"
        purpose="Quitter HouseMate sur cet appareil."
      />
      <form action={deconnexion}>
        <button
          type="submit"
          className="min-h-11 rounded-md border border-border px-4 text-sm font-medium text-ink"
        >
          Se déconnecter
        </button>
      </form>
    </>
  );
}
