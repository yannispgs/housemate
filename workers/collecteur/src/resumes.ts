/**
 * Les résumés par e-mail (SPEC § 6) : le Worker ne fait que donner l'heure.
 * Chaque heure, il appelle l'app, qui envoie les résumés dont l'heure est
 * passée ; c'est elle qui tient les réglages et le journal des envois.
 */
export async function demanderResumes(
  url: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    // Une redirection perdrait le jeton ou la méthode : l'adresse est exacte.
    redirect: "manual",
  });

  if (!response.ok) {
    throw new Error(`Résumés : HTTP ${response.status}.`);
  }
}
