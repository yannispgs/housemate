import { jetonValide } from "@/lib/auth/jeton";
import { envoyerMail } from "@/lib/auth/server";
import { envoyerResumes } from "@/lib/data/envoi-resumes";
import {
  libererResume,
  listerDestinataires,
  reserverResume,
} from "@/lib/data/resumes-store";
import { baseApp } from "@/lib/data/server";
import {
  commeMembre,
  listerConsommables,
  listerEcheances,
} from "@/lib/data/store";
import { instantAParis } from "@/lib/data/today";

/**
 * L'envoi des résumés par e-mail (SPEC § 6), appelé chaque heure par le
 * Worker du collecteur avec le jeton `RESUMES_SECRET`. Rejouable : un résumé
 * ne part qu'une fois par jour.
 *
 * Les destinataires et le journal se lisent en propriétaire ; chaque résumé
 * se compose au nom de son destinataire, sous la RLS : il n'y voit que ce
 * que l'app lui montrerait.
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
  const bilan = await envoyerResumes(
    {
      destinataires: () => listerDestinataires(sql),
      reserver: (membre, sorte, jour) =>
        reserverResume(sql, membre, sorte, jour),
      liberer: (membre, sorte, jour) => libererResume(sql, membre, sorte, jour),
      contenu: compte =>
        commeMembre(sql, compte, async tx => ({
          echeances: await listerEcheances(tx),
          consommables: await listerConsommables(tx),
        })),
      envoyer: envoyerMail(),
    },
    instantAParis(),
    new URL("/reglages", request.url).toString(),
  );

  if (bilan.echecs > 0) {
    console.error("[résumés] envois échoués", bilan);
  }

  return Response.json(bilan, { status: bilan.echecs > 0 ? 502 : 200 });
}
