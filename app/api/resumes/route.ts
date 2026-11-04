import { jetonValide } from "@/lib/auth/jeton";
import { envoyerMail } from "@/lib/auth/server";
import { envoyerPush } from "@/lib/data/envoi-push";
import { envoyerResumes } from "@/lib/data/envoi-resumes";
import {
  annoncesDe,
  libererPush,
  listerAbonnes,
  noterAnnonces,
  oublierAbonnement,
  reserverPush,
} from "@/lib/data/push-store";
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
import { envoyerWebPush } from "@/lib/data/web-push";

/**
 * L'envoi des résumés par e-mail et des notifications push (SPEC § 6), appelé
 * chaque heure par le Worker du collecteur avec le jeton `RESUMES_SECRET`.
 * Rejouable : un résumé ne part qu'une fois par jour, la notification du
 * matin aussi. Sans clés VAPID, pas de push.
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
  const instant = instantAParis();
  const contenu = (compte: string) =>
    commeMembre(sql, compte, async tx => ({
      echeances: await listerEcheances(tx),
      consommables: await listerConsommables(tx),
    }));
  const webPush = envoyerWebPush();
  const [bilan, push] = await Promise.all([
    envoyerResumes(
      {
        destinataires: () => listerDestinataires(sql),
        reserver: (membre, sorte, jour) =>
          reserverResume(sql, membre, sorte, jour),
        liberer: (membre, sorte, jour) =>
          libererResume(sql, membre, sorte, jour),
        contenu,
        envoyer: envoyerMail(),
      },
      instant,
      new URL("/reglages", request.url).toString(),
    ),
    webPush === null
      ? null
      : envoyerPush(
          {
            abonnes: () => listerAbonnes(sql),
            reserver: (membre, jour) => reserverPush(sql, membre, jour),
            liberer: (membre, jour) => libererPush(sql, membre, jour),
            annonces: membre => annoncesDe(sql, membre),
            noterAnnonces: (membre, elements) =>
              noterAnnonces(sql, membre, elements),
            contenu,
            envoyer: webPush,
            oublier: endpoint => oublierAbonnement(sql, endpoint),
          },
          instant,
        ),
  ]);
  const echec = bilan.echecs > 0 || (push?.echecs ?? 0) > 0;

  if (echec) {
    console.error("[résumés] envois échoués", { resumes: bilan, push });
  }

  return Response.json({ ...bilan, push }, { status: echec ? 502 : 200 });
}
