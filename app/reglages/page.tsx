import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { DEMO_MARGIN } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { enMonNom } from "@/lib/data/server";
import { lireMargePrevision } from "@/lib/data/store";
import { marginView } from "@/lib/ui/frost";
import { appliquerMarge } from "../_actions/veille";
import { deconnexion } from "../connexion/actions";

export const metadata: Metadata = { title: "Réglages" };

export default async function Page() {
  const demo = demoEnabled();
  const rows = [
    { title: "Récap hebdomadaire", value: "Dimanche · 18:00" },
    { title: "Membres du foyer", value: demo ? "Moi, Parents" : "" },
    {
      title: "Catégories",
      value: demo ? "Jardin, Véhicule, Garanties et 3 autres" : "",
    },
  ];

  if (demo) {
    return (
      <SettingsScreen signOut={deconnexion} rows={rows} marge={DEMO_MARGIN} />
    );
  }

  // Lue à chaque visite : une proposition peut arriver chaque matin.
  await connection();
  const marge = await enMonNom(tx => lireMargePrevision(tx));

  return (
    <SettingsScreen
      signOut={deconnexion}
      rows={rows}
      marge={marge && marginView(marge)}
      appliquerMarge={appliquerMarge}
    />
  );
}
