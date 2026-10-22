/**
 * L'envoi des rappels de crèche (SPEC § 12.9), appelé par le Worker du
 * collecteur juste après qu'il a figé la pluie de 22 h. Rejouable : chaque
 * rappel est réservé dans le journal avant de partir, et rendu s'il échoue.
 *
 * Écrit contre des dépendances : la route les branche sur la base et le relais
 * SMTP, les tests sur des doublures.
 */
import type { MailContent } from "@/lib/auth/messages";
import { toISO } from "@/lib/domain/plain-date";
import type { RainHour } from "@/lib/domain/school-run";
import { composerRappelCreche, crecheAnnoncee } from "./creche";
import type { AbonneCreche } from "./creche-store";
import type { InstantParis } from "./resumes";

export interface EnvoiCrecheDeps {
  abonnes(): Promise<AbonneCreche[]>;
  pluie(): Promise<RainHour[]>;
  reserver(membre: string, pourLe: string): Promise<boolean>;
  liberer(membre: string, pourLe: string): Promise<void>;
  envoyer(to: string, content: MailContent): Promise<void>;
}

export interface BilanCreche {
  envoyes: number;
  echecs: number;
}

export async function envoyerRappelsCreche(
  deps: EnvoiCrecheDeps,
  instant: InstantParis,
): Promise<BilanCreche> {
  const dus = (await deps.abonnes()).flatMap(abonne => {
    const jour = crecheAnnoncee(instant, abonne.reglages, abonne.exceptions);

    return jour === null ? [] : [{ abonne, jour }];
  });

  if (dus.length === 0) {
    return { envoyes: 0, echecs: 0 };
  }

  const pluie = await deps.pluie();
  const issues = await Promise.all(
    dus.map(async ({ abonne, jour }) => {
      const pourLe = toISO(jour);

      if (!(await deps.reserver(abonne.membre, pourLe))) {
        return null;
      }

      try {
        await deps.envoyer(
          abonne.email,
          composerRappelCreche(jour, pluie, abonne.reglages),
        );

        return "envoye" as const;
      } catch (error_) {
        console.error("[crèche] envoi échoué", error_);
        await deps.liberer(abonne.membre, pourLe);

        return "echec" as const;
      }
    }),
  );

  return {
    envoyes: issues.filter(i => i === "envoye").length,
    echecs: issues.filter(i => i === "echec").length,
  };
}
