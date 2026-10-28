/**
 * Quand collecter, en heure de Paris.
 *
 * Le déclencheur Cloudflare tourne à chaque heure pleine, en UTC. C'est ici, et
 * pas dans le cron, que se décide ce qu'on fait : un cron écrit en UTC se
 * décalerait d'une heure à chaque changement d'heure, et « 20 h » deviendrait
 * 19 h ou 21 h deux fois par an.
 */

const PARIS_HOUR = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * L'heure qu'il est à Paris à cet instant, de 0 à 23.
 *
 * Par la partie `hour` et non par la chaîne formatée : en français, `Intl`
 * écrit « 20 h », et `Number("20 h")` vaut `NaN`.
 */
export function parisHour(instant: Date): number {
  const hour = PARIS_HOUR.formatToParts(instant).find(
    part => part.type === "hour",
  );

  return Number(hour?.value);
}

/**
 * Relever les capteurs de 20 h à 9 h (SPEC § 12.7) : le relevé du soir qui
 * décide de l'alerte, puis les minima de la nuit. Le jour, rien à apprendre
 * pour le gel — et chaque relevé réveille la base.
 */
export function shouldReadSensors(hour: number): boolean {
  return hour >= 20 || hour <= 9;
}

/** Les températures prévues se figent à 20 h, avec le relevé du gel. */
export function shouldFetchTemperatureForecasts(hour: number): boolean {
  return hour === 20;
}
const PARIS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * La date de Paris à cet instant, en `AAAA-MM-JJ` (le format `en-CA`), décalée
 * de `days` jours. Le décalage se fait à midi UTC : aucun changement d'heure ne
 * peut alors faire sauter ou doubler un jour.
 */
export function parisDate(instant: Date, days = 0): string {
  const today = PARIS_DATE.format(instant);
  const noon = new Date(`${today}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);

  return noon.toISOString().slice(0, 10);
}

/**
 * La veille de gel se décide à 20 h (SPEC § 12.8), sur le relevé et les
 * prévisions de la même heure.
 */
export function shouldEvaluateFrost(hour: number): boolean {
  return hour === 20;
}

/**
 * Le message de la nuit part à 20 h ; s'il a échoué, il est retenté chaque
 * heure jusqu'à 23 h. Au-delà, chauffer n'aurait plus le temps de servir.
 */
export function shouldSendFrostMessage(hour: number): boolean {
  return hour >= 20 && hour <= 23;
}

/** Le bilan de la nuit se fait sur le dernier relevé, celui de 9 h. */
export function shouldReviewNight(hour: number): boolean {
  return hour === 9;
}
