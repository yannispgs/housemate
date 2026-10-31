"use client";

/**
 * Envoyer un formulaire à son action sans qu'il se vide. Avec `action={agir}`,
 * React remet les champs à leur valeur de départ dès que l'action répond, même
 * pour dire qu'une saisie est refusée : on perdait tout ce qu'on avait écrit.
 */
import { type FormEvent, useTransition } from "react";

export function useEnvoi(agir: (donnees: FormData) => void) {
  const [, demarrer] = useTransition();

  return (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    demarrer(() => agir(donnees));
  };
}
