import type { Metadata } from "next";
import { connection } from "next/server";
import { UpcomingScreen } from "@/components/screens/UpcomingScreen";
import { DEMO_UPCOMING } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { enMonNom } from "@/lib/data/server";
import { listerEcheances } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { upcomingItems } from "@/lib/data/views";

export const metadata: Metadata = { title: "À venir" };

export default async function Page() {
  if (demoEnabled()) {
    return <UpcomingScreen items={DEMO_UPCOMING} />;
  }

  await connection();
  const rows = await enMonNom(listerEcheances);

  return <UpcomingScreen items={upcomingItems(rows, aujourdhuiAParis())} />;
}
