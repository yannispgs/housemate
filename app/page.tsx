import type { Metadata } from "next";
import { HomeScreen } from "@/components/screens/HomeScreen";
import {
  DEMO_ASIDE,
  DEMO_DEADLINES,
  DEMO_NEXT_UP,
  DEMO_TODAY,
} from "@/demo/data";
import { demoEnabled } from "@/demo/mode";

export const metadata: Metadata = { title: "Accueil" };

export default function Page() {
  // Aucune donnée n'est encore branchée : démonstration hors production,
  // état vide en production.
  if (!demoEnabled()) {
    return (
      <HomeScreen deadlines={[]} fixedToday={null} nextUp={null} aside={null} />
    );
  }

  return (
    <HomeScreen
      deadlines={DEMO_DEADLINES}
      fixedToday={DEMO_TODAY}
      nextUp={DEMO_NEXT_UP}
      aside={DEMO_ASIDE}
    />
  );
}
