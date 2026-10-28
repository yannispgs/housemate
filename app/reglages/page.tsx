import type { Metadata } from "next";
import { connection } from "next/server";
import { AppareilPush } from "@/components/AppareilPush";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { DEMO_MARGIN } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { REGLAGES_PAR_DEFAUT as ANNIVERSAIRES_PAR_DEFAUT } from "@/lib/data/anniversaires";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import { lireReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";
import {
  lireMargePrevision,
  lireReglagesAnniversaires,
} from "@/lib/data/store";
import { clePubliqueVapid } from "@/lib/data/web-push";
import { marginView } from "@/lib/ui/frost";
import { reglerRappels } from "../_actions/anniversaires";
import {
  abonnerAppareil,
  desabonnerAppareil,
  enregistrerResumes,
} from "../_actions/reglages";
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
        notifications={
          <NotificationsPanel
            initial={REGLAGES_PAR_DEFAUT}
            enregistrer={null}
            appareil={
              <AppareilPush
                clePublique={clePubliqueVapid()}
                abonner={null}
                desabonner={null}
              />
            }
          />
        }
        rows={rows}
        marge={DEMO_MARGIN}
        anniversaires={{
          reglages: ANNIVERSAIRES_PAR_DEFAUT,
          regler: reglerEnDemo,
        }}
      />
    );
  }

  // Lus à chaque visite, au nom de la personne connectée : une proposition
  // de marge peut arriver chaque matin.
  await connection();
  const [reglages, marge, anniversaires] = await enMonNom(tx =>
    Promise.all([
      lireReglagesResumes(tx),
      lireMargePrevision(tx),
      lireReglagesAnniversaires(tx),
    ]),
  );

  return (
    <SettingsScreen
      signOut={deconnexion}
      notifications={
        <NotificationsPanel
          initial={reglages}
          enregistrer={enregistrerResumes}
          appareil={
            <AppareilPush
              clePublique={clePubliqueVapid()}
              abonner={abonnerAppareil}
              desabonner={desabonnerAppareil}
            />
          }
        />
      }
      rows={rows}
      marge={marge && marginView(marge)}
      appliquerMarge={appliquerMarge}
      anniversaires={{ reglages: anniversaires, regler: reglerRappels }}
    />
  );
}
