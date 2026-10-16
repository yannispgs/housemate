import type { Metadata } from "next";
import { connection } from "next/server";
import { RecapScreen } from "@/components/screens/RecapScreen";
import { DEMO_ASIDE, DEMO_RECAP, DEMO_TODAY } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { enMonNom } from "@/lib/data/server";
import { listerEcheances } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { recap } from "@/lib/data/views";
import { toISO } from "@/lib/domain/plain-date";

export const metadata: Metadata = { title: "Récap" };

export default async function Page() {
  if (demoEnabled()) {
    return (
      <RecapScreen
        coming={DEMO_RECAP.coming}
        comingNote={DEMO_RECAP.comingNote}
        done={DEMO_RECAP.done}
        fixedToday={DEMO_TODAY}
        aside={DEMO_ASIDE}
      />
    );
  }

  // Lu à chaque visite, au nom de la personne connectée.
  await connection();
  const today = aujourdhuiAParis();
  const { coming, comingNote, done } = recap(
    await enMonNom(listerEcheances),
    today,
  );

  return (
    <RecapScreen
      coming={coming}
      comingNote={comingNote}
      done={done}
      fixedToday={toISO(today)}
      aside={null}
    />
  );
}
