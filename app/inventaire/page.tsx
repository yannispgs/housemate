import type { Metadata } from "next";
import { InventoryScreen } from "@/components/screens/InventoryScreen";
import { DEMO_RECORDS } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";

export const metadata: Metadata = { title: "Inventaire" };

export default function Page() {
  return <InventoryScreen records={demoEnabled() ? DEMO_RECORDS : []} />;
}
