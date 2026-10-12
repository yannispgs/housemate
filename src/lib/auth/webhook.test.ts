import { describe, expect, it, vi } from "vitest";
import {
  handleWebhookEvent,
  normalizeEmail,
  type PorteDeps,
} from "@/lib/auth/webhook";

const LISTE = new Set(["parent@exemple.fr"]);

function deps(): PorteDeps & {
  envoyerCode: ReturnType<typeof vi.fn>;
  rattacher: ReturnType<typeof vi.fn>;
} {
  return {
    estAutorisee: email => Promise.resolve(LISTE.has(email)),
    rattacher: vi.fn(() => Promise.resolve()),
    envoyerCode: vi.fn(() => Promise.resolve()),
  };
}

const beforeCreate = (email: string) => ({
  event_type: "user.before_create",
  user: { email },
  event_data: { auth_provider: "credential" },
});

const sendOtp = (email: string, otp_type = "sign-in") => ({
  event_type: "send.otp",
  user: { email },
  event_data: {
    otp_code: "123456",
    otp_type,
    expires_at: "2026-10-11T08:10:00.000Z",
  },
});

describe("user.before_create — la liste blanche", () => {
  it("autorise une adresse de la liste", async () => {
    expect(
      await handleWebhookEvent(beforeCreate("parent@exemple.fr"), deps()),
    ).toEqual({ status: 200, body: { allowed: true } });
  });

  it("compare sans tenir compte de la casse ni des espaces", async () => {
    expect(
      await handleWebhookEvent(beforeCreate("  Parent@Exemple.FR "), deps()),
    ).toEqual({ status: 200, body: { allowed: true } });
  });

  it("⚠️ refuse une adresse absente de la liste", async () => {
    const reply = await handleWebhookEvent(
      beforeCreate("intrus@exemple.fr"),
      deps(),
    );

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      allowed: false,
      error_code: "NOT_ALLOWLISTED",
    });
  });
});

describe("send.otp — l'envoi du code", () => {
  it("envoie le code de connexion à une adresse de la liste", async () => {
    const d = deps();

    expect(await handleWebhookEvent(sendOtp("parent@exemple.fr"), d)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(d.envoyerCode).toHaveBeenCalledWith(
      "parent@exemple.fr",
      "123456",
      new Date("2026-10-11T08:10:00.000Z"),
    );
  });

  it("envoie aussi le code de vérification d'adresse", async () => {
    const d = deps();

    await handleWebhookEvent(
      sendOtp("parent@exemple.fr", "email-verification"),
      d,
    );
    expect(d.envoyerCode).toHaveBeenCalledOnce();
  });

  it("⚠️ n'envoie rien hors liste, et répond pareil", async () => {
    const d = deps();

    expect(await handleWebhookEvent(sendOtp("intrus@exemple.fr"), d)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(d.envoyerCode).not.toHaveBeenCalled();
  });

  it("n'envoie pas de code de mot de passe oublié : il n'y a pas de mot de passe", async () => {
    const d = deps();

    await handleWebhookEvent(
      sendOtp("parent@exemple.fr", "forget-password"),
      d,
    );
    expect(d.envoyerCode).not.toHaveBeenCalled();
  });

  it("refuse un code qui n'a pas six chiffres", async () => {
    const event = sendOtp("parent@exemple.fr");
    event.event_data.otp_code = "12ab56";

    expect((await handleWebhookEvent(event, deps())).status).toBe(400);
  });
});

describe("adresse absente de `user` (compte pas encore créé)", () => {
  it("prend l'adresse portée par l'événement", async () => {
    const d = deps();

    await handleWebhookEvent(
      {
        event_type: "send.otp",
        event_data: {
          email: "parent@exemple.fr",
          otp_code: "123456",
          otp_type: "sign-in",
          expires_at: "2026-10-11T08:10:00.000Z",
        },
      },
      d,
    );
    expect(d.envoyerCode).toHaveBeenCalledOnce();
  });

  it("refuse sans adresse nulle part, et donne la forme sans les valeurs", async () => {
    const reply = await handleWebhookEvent(
      {
        event_type: "send.otp",
        user: {},
        event_data: { otp_code: "123456", otp_type: "sign-in" },
      },
      deps(),
    );

    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      forme: {
        event_type: "string",
        user: {},
        event_data: { otp_code: "string", otp_type: "string" },
      },
    });
    expect(JSON.stringify(reply.body)).not.toContain("123456");
  });
});

describe("user.created — le rattachement au foyer", () => {
  it("rattache le nouveau compte à son adresse normalisée", async () => {
    const d = deps();

    await handleWebhookEvent(
      {
        event_type: "user.created",
        user: { id: "compte-1", email: "Parent@exemple.fr" },
      },
      d,
    );
    expect(d.rattacher).toHaveBeenCalledWith("compte-1", "parent@exemple.fr");
  });

  it("refuse un compte sans identifiant", async () => {
    expect(
      (
        await handleWebhookEvent(
          { event_type: "user.created", user: { email: "parent@exemple.fr" } },
          deps(),
        )
      ).status,
    ).toBe(400);
  });
});

describe("événements et charges inattendus", () => {
  it("accepte sans rien faire un événement non suivi", async () => {
    const d = deps();

    expect(
      await handleWebhookEvent({ event_type: "send.magic_link" }, d),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(d.envoyerCode).not.toHaveBeenCalled();
  });

  it("refuse une charge sans type ou sans utilisateur", async () => {
    expect((await handleWebhookEvent(null, deps())).status).toBe(400);
    expect(
      (await handleWebhookEvent({ event_type: "user.before_create" }, deps()))
        .status,
    ).toBe(400);
  });
});

describe("normalizeEmail", () => {
  it("met en minuscules et retire les espaces", () => {
    expect(normalizeEmail("  A.B@Exemple.FR ")).toBe("a.b@exemple.fr");
  });
});
