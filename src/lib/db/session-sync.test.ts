import { describe, expect, it } from "vitest";
import {
  type AuthSession,
  type AuthUser,
  type BranchSnapshot,
  planSessionSync,
} from "@/lib/db/session-sync";

const NOW = new Date("2026-10-11T08:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const user = (id: string, email: string, createdAt = day(-10)): AuthUser => ({
  id,
  email,
  name: "",
  emailVerified: true,
  createdAt,
  updatedAt: createdAt,
});

const session = (
  token: string,
  userId: string,
  expiresAt = day(5),
): AuthSession => ({
  id: `id-${token}`,
  token,
  userId,
  expiresAt,
  createdAt: day(-2),
  updatedAt: day(-2),
  ipAddress: null,
  userAgent: null,
});

const branch = (
  name: string,
  users: AuthUser[] = [],
  sessions: AuthSession[] = [],
): BranchSnapshot => ({ branch: name, users, sessions });

const writesFor = (plan: ReturnType<typeof planSessionSync>, name: string) =>
  plan.find(w => w.branch === name);

describe("planSessionSync", () => {
  it("recopie une session et son compte partout où ils manquent", () => {
    const parent = user("u1", "parent@exemple.fr");
    const plan = planSessionSync(
      [
        branch("preview/pr-22", [parent], [session("t1", "u1")]),
        branch("seed"),
        branch("preview/pr-19"),
      ],
      NOW,
    );

    for (const name of ["seed", "preview/pr-19"]) {
      expect(writesFor(plan, name)).toEqual({
        branch: name,
        users: [parent],
        sessions: [session("t1", "u1")],
      });
    }
    expect(writesFor(plan, "preview/pr-22")).toEqual({
      branch: "preview/pr-22",
      users: [],
      sessions: [],
    });
  });

  it("⚠️ rattache la session au compte qui porte l'adresse dans la base d'arrivée", () => {
    const plan = planSessionSync(
      [
        branch(
          "preview/pr-22",
          [user("u-22", "parent@exemple.fr")],
          [session("t22", "u-22")],
        ),
        branch(
          "preview/pr-23",
          [user("u-23", "parent@exemple.fr")],
          [session("t23", "u-23")],
        ),
      ],
      NOW,
    );

    expect(writesFor(plan, "preview/pr-23")).toEqual({
      branch: "preview/pr-23",
      users: [],
      sessions: [{ ...session("t22", "u-22"), userId: "u-23" }],
    });
    expect(writesFor(plan, "preview/pr-22")?.sessions).toEqual([
      { ...session("t23", "u-23"), userId: "u-22" },
    ]);
  });

  it("crée partout le même compte de référence : le plus ancien", () => {
    const ancien = user("u-ancien", "parent@exemple.fr", day(-30));
    const recent = user("u-recent", "parent@exemple.fr", day(-1));
    const plan = planSessionSync(
      [
        branch("preview/pr-22", [recent], [session("t1", "u-recent")]),
        branch("preview/pr-19", [ancien]),
        branch("seed"),
      ],
      NOW,
    );

    expect(writesFor(plan, "seed")?.users).toEqual([ancien]);
    expect(writesFor(plan, "seed")?.sessions[0]?.userId).toBe("u-ancien");
  });

  it("ne recopie pas une session expirée", () => {
    const plan = planSessionSync(
      [
        branch(
          "preview/pr-22",
          [user("u1", "parent@exemple.fr")],
          [session("t1", "u1", day(-1))],
        ),
        branch("seed"),
      ],
      NOW,
    );

    expect(writesFor(plan, "seed")).toEqual({
      branch: "seed",
      users: [],
      sessions: [],
    });
  });

  it("repousse l'expiration là où une session a été moins prolongée", () => {
    const parent = user("u1", "parent@exemple.fr");
    const plan = planSessionSync(
      [
        branch("preview/pr-22", [parent], [session("t1", "u1", day(7))]),
        branch("seed", [parent], [session("t1", "u1", day(2))]),
      ],
      NOW,
    );

    expect(writesFor(plan, "seed")?.sessions).toEqual([
      session("t1", "u1", day(7)),
    ]);
    expect(writesFor(plan, "preview/pr-22")?.sessions).toEqual([]);
  });

  it("crée un compte une seule fois pour plusieurs de ses sessions", () => {
    const parent = user("u1", "parent@exemple.fr");
    const plan = planSessionSync(
      [
        branch(
          "preview/pr-22",
          [parent],
          [session("t1", "u1"), session("t2", "u1")],
        ),
        branch("seed"),
      ],
      NOW,
    );

    expect(writesFor(plan, "seed")?.users).toEqual([parent]);
    expect(writesFor(plan, "seed")?.sessions).toHaveLength(2);
  });

  it("ignore une session sans compte connu", () => {
    const plan = planSessionSync(
      [
        branch("preview/pr-22", [], [session("t1", "orphelin")]),
        branch("seed"),
      ],
      NOW,
    );

    expect(writesFor(plan, "seed")?.sessions).toEqual([]);
  });
});
