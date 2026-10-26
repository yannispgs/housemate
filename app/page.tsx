import type { Metadata } from "next";
import { connection } from "next/server";
import { HomeScreen } from "@/components/screens/HomeScreen";
import {
  DEMO_ASIDE,
  DEMO_DEADLINES,
  DEMO_FROST,
  DEMO_NEXT_UP,
  DEMO_TODAY,
} from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { emplacementsProposes } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  lireVeilleGel,
  listerConsommables,
  listerEcheances,
  listerEmplacements,
} from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { homeDeadlines, nextUpText } from "@/lib/data/views";
import { toISO } from "@/lib/domain/plain-date";
import { frostCard } from "@/lib/ui/frost";
import { annuler, cocher } from "./_actions/echeances";
import { remplacer } from "./_actions/entretien";
import { chauffer, deplacer } from "./_actions/veille";

export const metadata: Metadata = { title: "Accueil" };

export default async function Page() {
  if (demoEnabled()) {
    return (
      <HomeScreen
        deadlines={DEMO_DEADLINES}
        fixedToday={DEMO_TODAY}
        nextUp={DEMO_NEXT_UP}
        aside={DEMO_ASIDE}
        frost={DEMO_FROST}
      />
    );
  }

  // Lue à chaque visite, au nom de la personne connectée.
  await connection();
  const today = aujourdhuiAParis();
  const [rows, consommables, gel, emplacements] = await enMonNom(tx =>
    Promise.all([
      listerEcheances(tx),
      listerConsommables(tx),
      lireVeilleGel(tx, new Date()),
      listerEmplacements(tx),
    ]),
  );
  const card = frostCard(gel);

  return (
    <HomeScreen
      deadlines={homeDeadlines(rows, today, consommables)}
      fixedToday={toISO(today)}
      nextUp={nextUpText(rows, today)}
      aside={null}
      frost={card && { card, emplacements: emplacementsProposes(emplacements) }}
      actions={{ cocher, annuler, remplacer, veille: { deplacer, chauffer } }}
    />
  );
}
