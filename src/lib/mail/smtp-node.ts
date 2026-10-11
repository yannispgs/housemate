/**
 * `SmtpConnection` sur les sockets de Node, pour les fonctions de Vercel.
 * Pendant de `workers/collecteur/src/smtp-socket.ts` (sockets de Cloudflare) :
 * le dialogue SMTP lui-même est écrit et testé une fois, dans
 * `workers/collecteur/src/smtp.ts`.
 *
 * Port 587 et STARTTLS, comme pour le collecteur : le relais Brevo n'y filtre
 * pas les IP, contrairement à son API (et une fonction Vercel change d'IP).
 */
import { connect, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import {
  ReplyReader,
  type SmtpConnection,
  type SmtpReply,
} from "../../../workers/collecteur/src/smtp";

/** Au-delà, l'envoi est abandonné : un webhook Neon attend 5 s au plus. */
const TIMEOUT_MS = 4000;

export function openSmtpNode(hostname: string, port = 587): SmtpConnection {
  let socket: Socket = connect({ host: hostname, port });
  const parser = new ReplyReader();
  const ready: SmtpReply[] = [];
  let waiting: ((reply: SmtpReply) => void) | undefined;
  let failure: Error | undefined;
  let failed: ((error: Error) => void) | undefined;

  function listen(stream: Socket): void {
    stream.setEncoding("utf8");
    stream.setTimeout(TIMEOUT_MS, () => {
      stream.destroy(new Error("SMTP : délai dépassé."));
    });
    stream.on("data", (chunk: string) => {
      ready.push(...parser.push(chunk));
      const next = waiting === undefined ? undefined : ready.shift();

      if (next !== undefined && waiting !== undefined) {
        const resolve = waiting;
        waiting = undefined;
        failed = undefined;
        resolve(next);
      }
    });
    stream.on("error", (error: Error) => {
      failure = error;
      failed?.(error);
    });
  }

  listen(socket);

  return {
    send(line) {
      return new Promise((resolve, reject) => {
        socket.write(`${line}\r\n`, error =>
          error ? reject(error) : resolve(),
        );
      });
    },

    reply() {
      const next = ready.shift();

      if (next !== undefined) {
        return Promise.resolve(next);
      }

      if (failure !== undefined) {
        return Promise.reject(failure);
      }

      return new Promise((resolve, reject) => {
        waiting = resolve;
        failed = reject;
      });
    },

    startTls() {
      return new Promise((resolve, reject) => {
        socket.removeAllListeners("data");
        const secure = connectTls({ socket, servername: hostname }, () =>
          resolve(),
        );
        secure.once("error", reject);
        socket = secure;
        listen(secure);
      });
    },

    close() {
      socket.end();

      return Promise.resolve();
    },
  };
}
