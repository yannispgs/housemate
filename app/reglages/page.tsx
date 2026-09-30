import type { Metadata } from "next";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { demoEnabled } from "@/demo/mode";

export const metadata: Metadata = { title: "Réglages" };

export default function Page() {
  const demo = demoEnabled();

  return (
    <SettingsScreen
      rows={[
        { title: "Récap hebdomadaire", value: "Dimanche · 18:00" },
        { title: "Membres du foyer", value: demo ? "Moi, Parents" : "" },
        {
          title: "Catégories",
          value: demo ? "Jardin, Véhicule, Garanties et 3 autres" : "",
        },
      ]}
    />
  );
}
