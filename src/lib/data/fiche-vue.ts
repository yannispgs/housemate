/** L'affichage d'un attribut de fiche : « 13 octobre 2026 », « 2 ans ». */
import type { Attribut } from "@/lib/data/saisie";

const LONG = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DEGRES = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « −5 °C », avec un vrai signe moins. */
export function celsius(valeur: number): string {
  return `${DEGRES.format(valeur).replace("-", "−")} °C`;
}

const UNITES = {
  month: ["mois", "mois"],
  year: ["an", "ans"],
} as const;

export function valeurAffichee(attribut: Attribut): string {
  switch (attribut.type) {
    case "texte":
      return attribut.valeur;
    case "temperature":
      return celsius(attribut.valeur);
    case "date":
      return LONG.format(new Date(`${attribut.valeur}T00:00:00Z`));
    case "duree": {
      const [un, plusieurs] = UNITES[attribut.valeur.unit];

      return `${attribut.valeur.count} ${attribut.valeur.count > 1 ? plusieurs : un}`;
    }
  }
}
