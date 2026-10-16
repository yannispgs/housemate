import type { Metadata } from "next";
import { connection } from "next/server";
import { InventoryScreen } from "@/components/screens/InventoryScreen";
import { DEMO_RECORDS } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";
import { enMonNom } from "@/lib/data/server";
import { listerFiches } from "@/lib/data/store";
import { recordViews } from "@/lib/data/views";

export const metadata: Metadata = { title: "Inventaire" };

export default async function Page() {
  if (demoEnabled()) {
    return <InventoryScreen records={DEMO_RECORDS} />;
  }

  await connection();

  return (
    <InventoryScreen records={recordViews(await enMonNom(listerFiches))} />
  );
}
