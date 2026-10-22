import { jetonValide } from "@/lib/auth/jeton";
import { envoyerMail } from "@/lib/auth/server";
import {
  libererRappelCreche,
  listerAbonnesCreche,
  pluiePrevue,
  reserverRappelCreche,
} from "@/lib/data/creche-store";
import { envoyerRappelsCreche } from "@/lib/data/envoi-creche";
import { baseApp } from "@/lib/data/server";
import { instantAParis } from "@/lib/data/today";

/**
 * Les rappels de crèche (SPEC § 12.9), appelés par le Worker du collecteur
 * juste après qu'il a figé la pluie de 22 h, avec le même jeton que les
 * résumés (`RESUMES_SECRET`). Rejouable : un rappel ne part qu'une fois par
 * jour de crèche. Avant 22 h, rien ne part.
 */
export async function POST(request: Request): Promise<Response> {
  if (
    !jetonValide(
      request.headers.get("authorization"),
      process.env.RESUMES_SECRET,
    )
  ) {
    return new Response(null, { status: 401 });
  }

  const sql = baseApp();
  const maintenant = new Date();
  const bilan = await envoyerRappelsCreche(
    {
      abonnes: () => listerAbonnesCreche(sql),
      pluie: () => pluiePrevue(sql, maintenant),
      reserver: (membre, pourLe) => reserverRappelCreche(sql, membre, pourLe),
      liberer: (membre, pourLe) => libererRappelCreche(sql, membre, pourLe),
      envoyer: envoyerMail(),
    },
    instantAParis(maintenant),
  );

  if (bilan.echecs > 0) {
    console.error("[crèche] envois échoués", bilan);
  }

  return Response.json(bilan, { status: bilan.echecs > 0 ? 502 : 200 });
}
