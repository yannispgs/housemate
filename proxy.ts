import { type NextRequest, NextResponse } from "next/server";
import { authMode, neonAuth } from "@/lib/auth/server";

/**
 * Toute page exige une session (SPEC § 7.2). Sans session, retour à
 * `/connexion`. Une configuration invalide fait échouer la requête : jamais
 * de passage libre par défaut (`src/lib/auth/mode.ts`).
 */
export default function proxy(request: NextRequest) {
  if (authMode().kind === "desactivee") {
    return NextResponse.next();
  }

  return neonAuth().middleware({ loginUrl: "/connexion" })(request);
}

export const config = {
  // Valeur littérale, lue telle quelle par Next au build : `[.]` plutôt que
  // `\.` pour le point.
  matcher: [
    // Tout, sauf : le relais et les webhooks de Neon Auth (ils ont leurs
    // propres contrôles), les fichiers de Next, et les fichiers statiques
    // (polices, icônes, manifeste), qui ne révèlent rien du foyer.
    "/((?!api/auth|api/neon-auth|_next/static|_next/image|manifest[.]webmanifest|.*[.][a-z0-9]+$).*)",
  ],
};
