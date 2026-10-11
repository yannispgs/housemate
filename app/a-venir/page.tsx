import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/screens/UpcomingScreen";
import { DEMO_UPCOMING } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";

export const metadata: Metadata = { title: "À venir" };

export default function Page() {
  return <UpcomingScreen items={demoEnabled() ? DEMO_UPCOMING : []} />;
}
