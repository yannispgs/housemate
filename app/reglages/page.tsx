import type { Metadata } from "next";
import { connection } from "next/server";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { demoEnabled } from "@/demo/mode";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import { lireReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";
import { enregistrerResumes } from "../_actions/reglages";
import { deconnexion } from "../connexion/actions";

export const metadata: Metadata = { title: "Réglages" };

export default async function Page() {
  const demo = demoEnabled();

  if (!demo) {
    // Lu à chaque visite, au nom de la personne connectée.
    await connection();
  }

  const reglages = demo
    ? REGLAGES_PAR_DEFAUT
    : await enMonNom(lireReglagesResumes);

  return (
    <SettingsScreen
      signOut={deconnexion}
      notifications={
        <NotificationsPanel
          initial={reglages}
          enregistrer={demo ? null : enregistrerResumes}
        />
      }
      rows={[
        { title: "Membres du foyer", value: demo ? "Moi, Parents" : "" },
        {
          title: "Catégories",
          value: demo ? "Jardin, Véhicule, Garanties et 3 autres" : "",
        },
      ]}
    />
  );
}
