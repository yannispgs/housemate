import type { Metadata } from "next";
import { connection } from "next/server";
import { HomeScreen } from "@/components/screens/HomeScreen";
import {
  DEMO_ASIDE,
  DEMO_DEADLINES,
  DEMO_NEXT_UP,
  DEMO_TODAY,
} from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { enMonNom } from "@/lib/data/server";
import { listerConsommables, listerEcheances } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { homeDeadlines, nextUpText } from "@/lib/data/views";
import { toISO } from "@/lib/domain/plain-date";
import { annuler, cocher } from "./_actions/echeances";
import { remplacer } from "./_actions/entretien";

export const metadata: Metadata = { title: "Accueil" };

export default async function Page() {
  if (demoEnabled()) {
    return (
      <HomeScreen
        deadlines={DEMO_DEADLINES}
        fixedToday={DEMO_TODAY}
        nextUp={DEMO_NEXT_UP}
        aside={DEMO_ASIDE}
      />
    );
  }

  // Lue à chaque visite, au nom de la personne connectée.
  await connection();
  const today = aujourdhuiAParis();
  const [rows, consommables] = await enMonNom(tx =>
    Promise.all([listerEcheances(tx), listerConsommables(tx)]),
  );

  return (
    <HomeScreen
      deadlines={homeDeadlines(rows, today, consommables)}
      fixedToday={toISO(today)}
      nextUp={nextUpText(rows, today)}
      aside={null}
      actions={{ cocher, annuler, remplacer }}
    />
  );
}
