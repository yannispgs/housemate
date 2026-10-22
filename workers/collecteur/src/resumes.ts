/**
 * Les résumés par e-mail (SPEC § 6) : le Worker ne fait que donner l'heure.
 * Chaque heure, il appelle l'app, qui envoie les résumés dont l'heure est
 * passée ; c'est elle qui tient les réglages et le journal des envois.
 */
export function demanderResumes(
  url: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  return appelerApp(url, secret, "Résumés", fetcher);
}

/**
 * Les rappels de crèche (SPEC § 12.9) : appelés juste après que la pluie de
 * 22 h est figée. L'app tient les réglages, les abonnés et le journal.
 */
export function demanderRappelsCreche(
  url: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  return appelerApp(url, secret, "Rappel de crèche", fetcher);
}

async function appelerApp(
  url: string,
  secret: string,
  quoi: string,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    // Une redirection perdrait le jeton ou la méthode : l'adresse est exacte.
    redirect: "manual",
  });

  if (!response.ok) {
    throw new Error(`${quoi} : HTTP ${response.status}.`);
  }
}
