import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TLSSocket } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { openSmtpNode } from "@/lib/mail/smtp-node";

/**
 * Le transport SMTP de Node contre de vrais sockets locaux : un faux relais
 * qui répond ligne à ligne, puis passe en TLS sur STARTTLS.
 */

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

/** Démarre un relais local ; `onLine` répond à chaque ligne reçue. */
function relais(
  onLine: (line: string, socket: Socket) => void,
  greeting = "220 relais prêt\r\n",
): Promise<number> {
  return new Promise(resolve => {
    server = createServer(socket => {
      socket.setEncoding("utf8");
      socket.write(greeting);
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let end = buffer.indexOf("\r\n");

        while (end !== -1) {
          onLine(buffer.slice(0, end), socket);
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\r\n");
        }
      });
      socket.on("error", () => {});
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

describe("openSmtpNode", () => {
  it("lit l'accueil, envoie une ligne et lit sa réponse multi-ligne", async () => {
    const port = await relais((line, socket) => {
      if (line === "EHLO test") {
        socket.write("250-relais\r\n250 STARTTLS\r\n");
      }
    });
    const smtp = openSmtpNode("127.0.0.1", port);

    expect(await smtp.reply()).toEqual({ code: 220, lines: ["relais prêt"] });
    await smtp.send("EHLO test");
    expect(await smtp.reply()).toEqual({
      code: 250,
      lines: ["relais", "STARTTLS"],
    });
    await smtp.close();
  });

  it("garde les réponses arrivées avant d'être lues", async () => {
    const port = await relais(() => {}, "220 un\r\n220 deux\r\n");
    const smtp = openSmtpNode("127.0.0.1", port);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect((await smtp.reply()).lines).toEqual(["un"]);
    expect((await smtp.reply()).lines).toEqual(["deux"]);
    await smtp.close();
  });

  it("échoue proprement si le relais est injoignable", async () => {
    const port = await relais(() => {});
    server?.close();
    const smtp = openSmtpNode("127.0.0.1", port);

    await expect(smtp.reply()).rejects.toThrow();
    // Une erreur déjà survenue est rendue à la lecture suivante.
    await expect(smtp.reply()).rejects.toThrow();
  });

  it("passe en TLS sur STARTTLS et continue le dialogue chiffré", async () => {
    let certificat: { key: Buffer; cert: Buffer };

    try {
      certificat = certificatJetable();
    } catch {
      // Sans openssl, pas de certificat : le reste du transport est couvert.
      return;
    }

    const port = await relais((line, socket) => {
      if (line === "STARTTLS") {
        socket.write("220 allons-y\r\n");
        socket.removeAllListeners("data");
        const secure = new TLSSocket(socket, {
          isServer: true,
          ...certificat,
        });
        secure.setEncoding("utf8");
        secure.on("data", (chunk: string) => {
          if (chunk.startsWith("EHLO")) {
            secure.write("250 chiffré\r\n");
          }
        });
        secure.on("error", () => {});
      }
    });
    // Le certificat jetable devient la seule autorité reconnue : la
    // vérification reste entière.
    const smtp = openSmtpNode("127.0.0.1", port, certificat.cert);

    await smtp.reply();
    await smtp.send("STARTTLS");
    expect((await smtp.reply()).code).toBe(220);
    await smtp.startTls();

    await smtp.send("EHLO test");
    expect(await smtp.reply()).toEqual({ code: 250, lines: ["chiffré"] });
    await smtp.close();
  });
});

/** Un certificat auto-signé, le temps d'un test. */
function certificatJetable(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), "smtp-test-"));

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-days",
        "1",
        "-keyout",
        join(dir, "key.pem"),
        "-out",
        join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );

    return {
      key: readFileSync(join(dir, "key.pem")),
      cert: readFileSync(join(dir, "cert.pem")),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
