/**
 * L'envoi des résumés, appelé chaque heure (SPEC § 6) : pour chaque compte,
 * les résumés dont l'heure est passée et qui ne sont pas encore partis
 * aujourd'hui. Chaque envoi est réservé dans le journal avant de partir, et
 * rendu s'il échoue.
 *
 * Écrit contre des dépendances : la route les branche sur la base et le relais
 * SMTP, les tests sur des doublures.
 */
import type { MailContent } from "@/lib/auth/messages";
import { toISO } from "@/lib/domain/plain-date";
import {
  type ContenuResume,
  composerResume,
  type InstantParis,
  resumesDus,
  type SorteResume,
} from "./resumes";
import type { Destinataire } from "./resumes-store";

export interface EnvoiDeps {
  destinataires(): Promise<Destinataire[]>;
  reserver(membre: string, sorte: SorteResume, jour: string): Promise<boolean>;
  liberer(membre: string, sorte: SorteResume, jour: string): Promise<void>;
  /** Les échéances et consommables vus par ce compte, sous sa RLS. */
  contenu(compte: string): Promise<ContenuResume>;
  envoyer(to: string, content: MailContent): Promise<void>;
}

export interface Bilan {
  envoyes: number;
  /** Rien à dire : réservés, mais aucun message n'est parti. */
  vides: number;
  echecs: number;
}

type Issue = keyof Bilan;

async function pourUn(
  deps: EnvoiDeps,
  d: Destinataire,
  instant: InstantParis,
  lien: string,
): Promise<Issue[]> {
  const jour = toISO(instant.jour);
  const dus = resumesDus(d.reglages, instant);
  const reserves = (
    await Promise.all(
      dus.map(async sorte =>
        (await deps.reserver(d.membre, sorte, jour)) ? sorte : null,
      ),
    )
  ).filter((sorte): sorte is SorteResume => sorte !== null);

  if (reserves.length === 0) {
    return [];
  }

  const contenu = await deps.contenu(d.compte);

  return Promise.all(
    reserves.map(async (sorte): Promise<Issue> => {
      const content = composerResume(
        contenu,
        instant.jour,
        sorte,
        d.reglages,
        lien,
      );

      if (content === null) {
        return "vides";
      }

      try {
        await deps.envoyer(d.email, content);

        return "envoyes";
      } catch (error_) {
        console.error(`[résumés] envoi ${sorte} échoué`, error_);
        await deps.liberer(d.membre, sorte, jour);

        return "echecs";
      }
    }),
  );
}

export async function envoyerResumes(
  deps: EnvoiDeps,
  instant: InstantParis,
  lien: string,
): Promise<Bilan> {
  const destinataires = await deps.destinataires();
  const issues = (
    await Promise.all(destinataires.map(d => pourUn(deps, d, instant, lien)))
  ).flat();

  return {
    envoyes: issues.filter(i => i === "envoyes").length,
    vides: issues.filter(i => i === "vides").length,
    echecs: issues.filter(i => i === "echecs").length,
  };
}
