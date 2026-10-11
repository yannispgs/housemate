/**
 * Ce que l'authentification lit et écrit en base, avec les seuls droits du
 * rôle `portier` (migration 0006) : liste blanche, rattachement d'un compte à
 * son foyer, registre des appareils.
 *
 * Écrit contre une signature minimale de requête « gabarit », celle de
 * `postgres` : les tests d'intégration rejouent le même SQL contre la base
 * locale, sous le rôle `portier`.
 */

export type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<readonly Record<string, unknown>[]>;

export async function estAutorisee(sql: Sql, email: string): Promise<boolean> {
  const rows = await sql`
    select 1 from app.liste_blanche where email = ${email}`;

  return rows.length > 0;
}

/**
 * Crée le membre du foyer auquel la liste blanche rattache cette adresse.
 * Rejouable : Neon Auth réessaie un webhook dont la réponse s'est perdue.
 */
export async function rattacher(
  sql: Sql,
  authUserId: string,
  email: string,
): Promise<void> {
  await sql`
    insert into app.membres (foyer_id, auth_user_id)
    select foyer_id, ${authUserId} from app.liste_blanche where email = ${email}
    on conflict (auth_user_id) do nothing`;
}

/**
 * Enregistre la connexion d'un appareil ; vrai s'il était inconnu de ce
 * compte, c'est-à-dire si un avis doit partir.
 */
export async function noterAppareil(
  sql: Sql,
  authUserId: string,
  empreinte: string,
  description: string,
): Promise<boolean> {
  const rows = await sql`
    insert into app.appareils (auth_user_id, empreinte, description)
    values (${authUserId}, ${empreinte}, ${description})
    on conflict (auth_user_id, empreinte)
      do update set derniere_connexion = now(), description = excluded.description
    returning (xmax = 0) as nouveau`;

  return rows[0]?.nouveau === true;
}
