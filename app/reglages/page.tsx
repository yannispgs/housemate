import type { Metadata } from "next";
import { connection } from "next/server";
import { AppareilPush } from "@/components/AppareilPush";
import { CrechePanel } from "@/components/CrechePanel";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { demoEnabled } from "@/demo/mode";
import {
  type ExceptionCreche,
  periodeDuCalendrier,
  REGLAGES_CRECHE_PAR_DEFAUT,
} from "@/lib/data/creche";
import {
  lireExceptionsCreche,
  lireReglagesCreche,
  recoisRappelCreche,
} from "@/lib/data/creche-store";
import { REGLAGES_PAR_DEFAUT } from "@/lib/data/resumes";
import { lireReglagesResumes } from "@/lib/data/resumes-store";
import { enMonNom } from "@/lib/data/server";
import { aujourdhuiAParis } from "@/lib/data/today";
import { clePubliqueVapid } from "@/lib/data/web-push";
import { toISO } from "@/lib/domain/plain-date";
import {
  abonnerAppareil,
  basculerJourCreche,
  desabonnerAppareil,
  enregistrerCreche,
  enregistrerResumes,
  recevoirCreche,
} from "../_actions/reglages";
import { deconnexion } from "../connexion/actions";

export const metadata: Metadata = { title: "Réglages" };

export default async function Page() {
  const demo = demoEnabled();

  if (!demo) {
    // Lu à chaque visite, au nom de la personne connectée.
    await connection();
  }

  const aujourdhui = aujourdhuiAParis();
  const { du, au } = periodeDuCalendrier(aujourdhui);
  const aucune: ExceptionCreche[] = [];
  const [reglages, creche, recoitCreche, exceptions] = demo
    ? [REGLAGES_PAR_DEFAUT, REGLAGES_CRECHE_PAR_DEFAUT, false, aucune]
    : await enMonNom(
        async tx =>
          [
            await lireReglagesResumes(tx),
            await lireReglagesCreche(tx),
            await recoisRappelCreche(tx),
            await lireExceptionsCreche(tx, du, au),
          ] as const,
      );

  return (
    <SettingsScreen
      signOut={deconnexion}
      notifications={
        <>
          <NotificationsPanel
            initial={reglages}
            enregistrer={demo ? null : enregistrerResumes}
            appareil={
              <AppareilPush
                clePublique={clePubliqueVapid()}
                abonner={demo ? null : abonnerAppareil}
                desabonner={demo ? null : desabonnerAppareil}
              />
            }
          />
          <CrechePanel
            initial={creche}
            recoit={recoitCreche}
            enregistrer={demo ? null : enregistrerCreche}
            recevoir={demo ? null : recevoirCreche}
            aujourdhui={toISO(aujourdhui)}
            exceptions={exceptions}
            basculer={demo ? null : basculerJourCreche}
          />
        </>
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
