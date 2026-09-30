/**
 * Les dates que les écrans écrivent en toutes lettres. À n'appeler que dans
 * le navigateur : c'est le calendrier de la personne qui lit (conventions
 * § 12).
 */

const WEEKDAY_AND_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const DAY_AND_MONTH = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});

/** « Dimanche 13 septembre » : le titre de l'accueil. */
export function homeTitle(today: Date): string {
  const text = WEEKDAY_AND_DAY.format(today);

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Le lundi de la semaine qui contient `day`, à midi. */
function mondayOf(day: Date): Date {
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const shift = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - shift);

  return monday;
}

/**
 * « Semaine du 14 au 20 septembre » : la semaine que couvre le récap, celle
 * qui contient demain. Le dimanche, c'est donc la semaine qui commence le
 * lendemain.
 */
export function recapWeek(today: Date): string {
  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
    12,
  );
  const monday = mondayOf(tomorrow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  if (monday.getMonth() === sunday.getMonth()) {
    return `Semaine du ${monday.getDate()} au ${DAY_AND_MONTH.format(sunday)}`;
  }

  return `Semaine du ${DAY_AND_MONTH.format(monday)} au ${DAY_AND_MONTH.format(sunday)}`;
}
