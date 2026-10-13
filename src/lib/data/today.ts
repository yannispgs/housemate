/**
 * « Aujourd'hui » pour le foyer : le jour à Paris, pas le jour UTC du serveur
 * (une fonction Vercel tourne en UTC ; entre minuit et 2 h l'été, les deux
 * diffèrent). Conventions § 12.
 */
import { fromISO, type PlainDate } from "@/lib/domain/plain-date";

const PARIS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function aujourdhuiAParis(maintenant: Date = new Date()): PlainDate {
  return fromISO(PARIS.format(maintenant));
}
