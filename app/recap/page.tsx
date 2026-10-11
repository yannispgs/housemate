import type { Metadata } from "next";
import { RecapScreen } from "@/components/screens/RecapScreen";
import { DEMO_ASIDE, DEMO_RECAP, DEMO_TODAY } from "@/demo/data";
import { demoEnabled } from "@/demo/mode";

export const metadata: Metadata = { title: "Récap" };

export default function Page() {
  if (!demoEnabled()) {
    return (
      <RecapScreen
        coming={[]}
        comingNote=""
        done={[]}
        fixedToday={null}
        aside={null}
      />
    );
  }

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
