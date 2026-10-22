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
    // Tout, sauf : le relais et les webhooks de Neon Auth, l'envoi des
    // résumés et des rappels de crèche (ils ont leurs propres contrôles), les
    // fichiers de Next, et les fichiers statiques
    // (polices, manifeste), qui ne révèlent rien du foyer. Les icônes
    // générées (`/icon/<taille>`, `/apple-icon`) n'ont pas d'extension :
    // nommées ici, sans quoi l'onglet de la page de connexion et l'icône de
    // l'écran d'accueil de l'iPhone renverraient vers `/connexion`.
    "/((?!api/auth|api/neon-auth|api/resumes|api/creche|_next/static|_next/image|manifest[.]webmanifest|icon/|apple-icon|.*[.][a-z0-9]+$).*)",
  ],
};
