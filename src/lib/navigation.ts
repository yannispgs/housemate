/**
 * Carte de navigation — donnée pure, sans dépendance à Next ni à React.
 *
 * Handoff de design : deux destinations de même rang, choisies par un toggle
 * d'en-tête. **Échéances** (Accueil, Récap, À venir) et **Fiches**
 * (Inventaire). Réglages s'y ajoute, hors des deux.
 */

export type Destination = {
  readonly href: string;
  readonly label: string;
};

export type Domain = "echeances" | "fiches";

/** Les deux moitiés du produit, dans le toggle d'en-tête. */
export const DOMAINS: readonly (Destination & { readonly domain: Domain })[] = [
  { href: "/", label: "Échéances", domain: "echeances" },
  { href: "/inventaire", label: "Fiches", domain: "fiches" },
];

/** Les onglets des échéances, masqués quand on est sur les fiches. */
export const DEADLINE_TABS: readonly Destination[] = [
  { href: "/", label: "Accueil" },
  { href: "/recap", label: "Récap" },
  { href: "/a-venir", label: "À venir" },
];

export const SETTINGS: Destination = { href: "/reglages", label: "Réglages" };

/**
 * Le domaine actif. Réglages n'appartient à aucun : le toggle y reste sur
 * Échéances, comme dans la maquette.
 */
export function domainOf(pathname: string): Domain {
  return isActive("/inventaire", pathname) ? "fiches" : "echeances";
}

/**
 * Une destination est active si le chemin courant lui correspond. La racine est
 * un cas particulier : sans cette exception, l'accueil resterait actif partout
 * puisque tous les chemins commencent par « / ».
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
