/** L'affichage d'un attribut de fiche : « 13 octobre 2026 », « 2 ans ». */
import type { Attribut } from "@/lib/data/saisie";
import type { PlainDate } from "@/lib/domain/plain-date";

const LONG = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DEGRES = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « −5 °C », avec un vrai signe moins, et sans passage à la ligne avant « °C ». */
export function celsius(valeur: number): string {
  return `${DEGRES.format(valeur).replace("-", "−")}\u00a0°C`;
}

const JOUR_MOIS = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** L'âge atteint au jour donné, d'après une naissance complète. */
export function age(
  naissance: { jour: number; mois: number; annee: number },
  aujourdhui: PlainDate,
): number {
  const passe =
    aujourdhui.month > naissance.mois ||
    (aujourdhui.month === naissance.mois && aujourdhui.day >= naissance.jour);

  return aujourdhui.year - naissance.annee - (passe ? 0 : 1);
}

const EUROS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const UNITES = {
  month: ["mois", "mois"],
  year: ["an", "ans"],
} as const;

export function valeurAffichee(
  attribut: Attribut,
  aujourdhui?: PlainDate,
): string {
  switch (attribut.type) {
    case "texte":
      return attribut.valeur;
    case "temperature":
      return celsius(attribut.valeur);
    case "date":
      return LONG.format(new Date(`${attribut.valeur}T00:00:00Z`));
    case "jour": {
      const { jour, mois, annee } = attribut.valeur;
      // Une année bissextile : le 29 février s'écrit même sans année.
      const date = new Date(Date.UTC(annee ?? 2000, mois - 1, jour));

      if (annee === null) {
        return JOUR_MOIS.format(date);
      }

      const ans =
        aujourdhui === undefined
          ? null
          : age({ jour, mois, annee }, aujourdhui);

      return ans === null
        ? LONG.format(date)
        : `${LONG.format(date)} · ${ans} an${ans > 1 ? "s" : ""}`;
    }
    case "montant":
      return EUROS.format(attribut.valeur);
    case "duree": {
      const [un, plusieurs] = UNITES[attribut.valeur.unit];

      return `${attribut.valeur.count} ${attribut.valeur.count > 1 ? plusieurs : un}`;
    }
  }
}
