/**
 * Collecteur météo — Cloudflare Worker déclenché chaque heure (SPEC § 12.7).
 *
 * Toute la configuration est secrète (`wrangler secret put`) : les coordonnées
 * du foyer et les identifiants matériels des capteurs ne doivent pas figurer
 * dans un dépôt public.
 */
import { neon } from "@neondatabase/serverless";
import {
  type Coordinates,
  type ForecastPoint,
  MET_NORWAY_USER_AGENT,
  metNorwayUrl,
  openMeteoUrl,
  parseMetNorway,
  parseOpenMeteo,
} from "./forecasts";
import { evaluateEvening, reviewNight, sendPending } from "./frost-run";
import type { Mail } from "./frost-watch";
import { demanderResumes } from "./resumes";
import {
  parisDate,
  parisHour,
  shouldEvaluateFrost,
  shouldFetchTemperatureForecasts,
  shouldReadSensors,
  shouldReviewNight,
  shouldSendFrostMessage,
} from "./schedule";
import { buildMessage, deliver } from "./smtp";
import { openSmtp } from "./smtp-socket";
import {
  insertForecasts,
  insertReadings,
  type Reading,
  type Sql,
} from "./store";
import { readMeter } from "./switchbot";

interface Env {
  /** Rôle `collecteur` (membre de `meteo_ecriture`), connexion avec pool. */
  DATABASE_URL: string;
  SWITCHBOT_TOKEN: string;
  SWITCHBOT_SECRET: string;
  SENSOR_EXTERIOR_ID: string;
  SENSOR_VERANDA_ID: string;
  LATITUDE: string;
  LONGITUDE: string;
  /** Rôle `veille` (membre de `meteo_veille`) : lit, et tient le journal. */
  VEILLE_DATABASE_URL: string;
  /** Identifiant SMTP du compte Brevo, et clé SMTP propre à HouseMate. */
  SMTP_LOGIN: string;
  SMTP_KEY: string;
  /** Destinataire des alertes : un seul, pour l'instant. */
  ALERT_TO: string;
  /** L'envoi des résumés de l'app (variable de `wrangler.jsonc`). */
  RESUMES_URL: string;
  /** Le jeton partagé avec l'app (`RESUMES_SECRET` côté Vercel). */
  RESUMES_SECRET?: string;
}

const MAIL_FROM = "noreply@house-mate.app";

async function sendMail(env: Env, mail: Mail): Promise<void> {
  await deliver(
    openSmtp("smtp-relay.brevo.com"),
    { login: env.SMTP_LOGIN, key: env.SMTP_KEY },
    { from: MAIL_FROM, to: env.ALERT_TO },
    buildMessage({
      from: `HouseMate <${MAIL_FROM}>`,
      to: env.ALERT_TO,
      subject: mail.subject,
      text: mail.text,
      date: new Date(),
      messageId: `${crypto.randomUUID()}@house-mate.app`,
    }),
  );
}

/**
 * La veille de gel, APRÈS la collecte de la même heure : elle décide sur le
 * relevé et les prévisions qui viennent d'être écrits. Son échec ne touche
 * pas la collecte, déjà faite.
 */
async function watchFrost(env: Env, now: Date, hour: number): Promise<void> {
  const sql = neon(env.VEILLE_DATABASE_URL) as unknown as Sql;

  if (shouldEvaluateFrost(hour)) {
    await evaluateEvening(sql, parisDate(now), now);
  }

  if (shouldSendFrostMessage(hour)) {
    await sendPending(sql, parisDate(now), mail => sendMail(env, mail));
  }

  if (shouldReviewNight(hour)) {
    await reviewNight(sql, parisDate(now, -1));
  }
}

async function collectReadings(env: Env, sql: Sql): Promise<void> {
  const credentials = {
    token: env.SWITCHBOT_TOKEN,
    secret: env.SWITCHBOT_SECRET,
  };
  const sensors = [
    ["exterieur", env.SENSOR_EXTERIOR_ID],
    ["veranda", env.SENSOR_VERANDA_ID],
  ] as const;
  const readings: Reading[] = [];
  const failures: string[] = [];

  // Un capteur hors ligne ne doit pas faire perdre la mesure de l'autre.
  for (const [sensor, deviceId] of sensors) {
    try {
      const { temperature, humidity } = await readMeter(credentials, deviceId);
      readings.push({ sensor, at: new Date(), temperature, humidity });
    } catch (error) {
      failures.push(`${sensor} : ${String(error)}`);
    }
  }

  await insertReadings(sql, readings);

  if (failures.length > 0) {
    throw new Error(`Relevés manquants — ${failures.join(" ; ")}`);
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${new URL(url).host} : HTTP ${response.status}.`);
  }

  return response.json();
}

/**
 * Chaque source échoue seule : on enregistre ce qui est arrivé, PUIS on fait
 * échouer l'exécution, pour qu'une source muette se voie dans les journaux du
 * Worker au lieu de passer inaperçue.
 */
async function storeThenReport<T>(
  sources: Promise<T[]>[],
  store: (points: T[]) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(sources);

  await store(
    results.flatMap(result =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );

  const failures = results.filter(result => result.status === "rejected");

  if (failures.length > 0) {
    throw new Error(
      `Prévisions manquantes — ${failures.map(failure => String(failure.reason)).join(" ; ")}`,
    );
  }
}

function coordinates(env: Env): Coordinates {
  return { latitude: Number(env.LATITUDE), longitude: Number(env.LONGITUDE) };
}

const MET_NORWAY_HEADERS = { headers: { "User-Agent": MET_NORWAY_USER_AGENT } };

async function collectTemperatureForecasts(env: Env, sql: Sql): Promise<void> {
  const where = coordinates(env);
  const retrievedAt = new Date();
  await storeThenReport<ForecastPoint>(
    [
      fetchJson(openMeteoUrl(where, "temperature_2m")).then(parseOpenMeteo),
      fetchJson(metNorwayUrl(where), MET_NORWAY_HEADERS).then(payload =>
        parseMetNorway(payload, retrievedAt),
      ),
    ],
    points => insertForecasts(sql, retrievedAt, points),
  );
}

export default {
  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    const hour = parisHour(now);
    const sql = neon(env.DATABASE_URL) as unknown as Sql;
    const tasks: Promise<void>[] = [];

    if (shouldReadSensors(hour)) {
      tasks.push(collectReadings(env, sql));
    }

    if (shouldFetchTemperatureForecasts(hour)) {
      tasks.push(collectTemperatureForecasts(env, sql));
    }

    // Les résumés par e-mail : chaque heure, l'app décide qui en reçoit un.
    if (env.RESUMES_SECRET) {
      tasks.push(demanderResumes(env.RESUMES_URL, env.RESUMES_SECRET));
    } else {
      console.warn("RESUMES_SECRET absent : résumés non demandés.");
    }

    // Les tâches vont au bout même si l'une échoue ; l'échec est ensuite
    // relancé pour apparaître dans les journaux du Worker.
    const results = await Promise.allSettled(tasks);
    results.push(...(await Promise.allSettled([watchFrost(env, now, hour)])));
    const failure = results.find(result => result.status === "rejected");

    if (failure) {
      throw failure.reason;
    }
  },
} satisfies ExportedHandler<Env>;
