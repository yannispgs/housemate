import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { DEMO_MARGIN } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/anniversaires";
import { enMonNom } from "@/lib/data/server";
import {
  lireMargePrevision,
  lireReglagesAnniversaires,
} from "@/lib/data/store";
import { marginView } from "@/lib/ui/frost";
import { reglerRappels } from "../_actions/anniversaires";
import { appliquerMarge } from "../_actions/veille";
import { deconnexion } from "../connexion/actions";

export const metadata: Metadata = { title: "Réglages" };

/** En démonstration, rien n'est enregistré. */
async function reglerEnDemo(): Promise<null> {
  "use server";

  return null;
}

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
      <SettingsScreen
        signOut={deconnexion}
        rows={rows}
        marge={DEMO_MARGIN}
        anniversaires={{ reglages: REGLAGES_PAR_DEFAUT, regler: reglerEnDemo }}
      />
    );
  }

  // Lue à chaque visite : une proposition peut arriver chaque matin.
  await connection();
  const [marge, reglages] = await enMonNom(tx =>
    Promise.all([lireMargePrevision(tx), lireReglagesAnniversaires(tx)]),
  );

  return (
    <SettingsScreen
      signOut={deconnexion}
      rows={rows}
      marge={marge && marginView(marge)}
      appliquerMarge={appliquerMarge}
      anniversaires={{ reglages, regler: reglerRappels }}
    />
  );
}
