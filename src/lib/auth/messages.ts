/**
 * Les deux e-mails de l'authentification, en texte simple : le code de
 * connexion, et l'avis de connexion depuis un nouvel appareil.
 */

export interface MailContent {
  readonly subject: string;
  readonly text: string;
}

const PARIS = "Europe/Paris";

function heure(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function jourEtHeure(date: Date): string {
  const jour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);

  return `${jour} à ${heure(date)}`;
}

export function messageCode(code: string, expiresAt: Date): MailContent {
  return {
    // Le code en tête du sujet : lisible depuis la notification, sans ouvrir
    // le message.
    subject: `${code} — votre code de connexion à HouseMate`,
    text: [
      `Votre code de connexion à HouseMate : ${code}`,
      "",
      `Il est valable jusqu'à ${heure(expiresAt)}.`,
      "",
      "Si vous n'avez pas demandé ce code, ignorez ce message : sans lui, personne ne peut se connecter.",
    ].join("\n"),
  };
}

export interface NouvelAppareil {
  readonly description: string;
  readonly quand: Date;
  /** L'adresse du site où la connexion a eu lieu (prod ou preview). */
  readonly site: string;
}

export function messageNouvelAppareil(appareil: NouvelAppareil): MailContent {
  return {
    subject: "Nouvelle connexion à HouseMate",
    text: [
      "Une connexion à votre compte HouseMate vient d'avoir lieu depuis un appareil que HouseMate ne connaissait pas :",
      "",
      `  ${appareil.description}`,
      `  ${jourEtHeure(appareil.quand)}`,
      `  ${appareil.site}`,
      "",
      "Si c'était vous, il n'y a rien à faire.",
      "",
      "Sinon, quelqu'un a pu lire vos e-mails : changez tout de suite le mot de passe de votre messagerie, vérifiez que la double authentification y est active, et prévenez le reste du foyer.",
    ].join("\n"),
  };
}
