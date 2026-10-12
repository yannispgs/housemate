/**
 * Une seule connexion pour toutes les previews (décision du foyer, 2026-09-27).
 *
 * Le cookie de session est partagé sur `.preview.house-mate.app`, mais chaque
 * preview a sa propre base, donc sa propre table des sessions : un cookie
 * qu'une base ne connaît pas y est refusé. Les sessions sont donc recopiées
 * entre `seed` et toutes les bases de preview ; une preview nouvelle, copiée de
 * `seed`, naît en les connaissant.
 *
 * ⚠️ Les comptes se rapprochent par ADRESSE, pas par identifiant : une même
 * personne connectée sur deux previews avant toute recopie y a deux comptes
 * d'identifiants différents (l'adresse est unique dans chaque base, pas
 * l'identifiant d'une base à l'autre). Une session recopiée est rattachée au
 * compte qui porte son adresse dans la base d'arrivée.
 *
 * Calculé sans base : `scripts/sync-sessions.ts` lit les bases et applique.
 */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthSession {
  readonly id: string;
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface BranchSnapshot {
  readonly branch: string;
  readonly users: readonly AuthUser[];
  readonly sessions: readonly AuthSession[];
}

export interface BranchWrites {
  readonly branch: string;
  /** Comptes absents de cette base, à créer avant leurs sessions. */
  readonly users: readonly AuthUser[];
  /** Sessions à créer, ou dont l'expiration est à repousser. */
  readonly sessions: readonly AuthSession[];
}

export function planSessionSync(
  snapshots: readonly BranchSnapshot[],
  now: Date,
): BranchWrites[] {
  // Le compte de référence d'une adresse : le plus ancien, partout le même.
  const canonical = new Map<string, AuthUser>();
  // L'adresse de chaque session valide, et sa version la plus durable.
  const sessions = new Map<string, { session: AuthSession; email: string }>();

  for (const snapshot of snapshots) {
    const emails = new Map(snapshot.users.map(u => [u.id, u.email]));

    for (const user of snapshot.users) {
      const known = canonical.get(user.email);

      if (known === undefined || user.createdAt < known.createdAt) {
        canonical.set(user.email, user);
      }
    }

    for (const session of snapshot.sessions) {
      const email = emails.get(session.userId);
      const known = sessions.get(session.token);

      if (
        email === undefined ||
        session.expiresAt <= now ||
        (known !== undefined && known.session.expiresAt >= session.expiresAt)
      ) {
        continue;
      }

      sessions.set(session.token, { session, email });
    }
  }

  return snapshots.map(snapshot => {
    const idByEmail = new Map(snapshot.users.map(u => [u.email, u.id]));
    const existing = new Map(snapshot.sessions.map(s => [s.token, s]));
    const users: AuthUser[] = [];
    const writes: AuthSession[] = [];

    for (const { session, email } of sessions.values()) {
      const here = existing.get(session.token);

      if (here !== undefined && here.expiresAt >= session.expiresAt) {
        continue;
      }

      let userId = idByEmail.get(email);

      if (userId === undefined) {
        const user = canonical.get(email) as AuthUser;
        users.push(user);
        idByEmail.set(email, user.id);
        userId = user.id;
      }

      writes.push({ ...session, userId });
    }

    return { branch: snapshot.branch, users, sessions: writes };
  });
}
