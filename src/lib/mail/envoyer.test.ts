import { describe, expect, it } from "vitest";
import { createEnvoyer, MAIL_FROM, mailConfig } from "@/lib/mail/envoyer";
import type { SmtpConnection } from "../../../workers/collecteur/src/smtp";

/** Un relais qui accepte tout et garde ce qu'on lui envoie. */
function relais() {
  const sent: string[] = [];
  const codes = [220, 250, 220, 250, 235, 250, 250, 354, 250];
  const connection: SmtpConnection = {
    send: line => {
      sent.push(line);

      return Promise.resolve();
    },
    reply: () => Promise.resolve({ code: codes.shift() ?? 0, lines: ["ok"] }),
    startTls: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };

  return { connection, sent };
}

describe("createEnvoyer", () => {
  it("envoie depuis l'adresse du foyer vers le destinataire", async () => {
    const { connection, sent } = relais();
    const envoyer = createEnvoyer(
      { login: "identifiant", key: "cle" },
      () => connection,
      () => new Date("2026-10-11T08:00:00Z"),
    );

    await envoyer("parent@exemple.fr", { subject: "Sujet", text: "Corps" });

    expect(sent).toContain(`MAIL FROM:<${MAIL_FROM}>`);
    expect(sent).toContain("RCPT TO:<parent@exemple.fr>");
    const data = sent.find(line => line.startsWith("From:")) ?? "";
    expect(data).toContain("Subject: Sujet");
    expect(data).toContain("Date: Sun, 11 Oct 2026 08:00:00 GMT");
    expect(data).toMatch(/Message-ID: <[0-9a-f-]{36}@house-mate\.app>/);
  });
});

describe("mailConfig", () => {
  it("lit les identifiants du relais", () => {
    expect(mailConfig({ SMTP_LOGIN: "l", SMTP_KEY: "k" })).toEqual({
      login: "l",
      key: "k",
    });
  });

  it("refuse de démarrer sans identifiants", () => {
    expect(() => mailConfig({ SMTP_LOGIN: "l" })).toThrow(/SMTP_KEY/);
    expect(() => mailConfig({})).toThrow(/SMTP_LOGIN/);
  });
});
