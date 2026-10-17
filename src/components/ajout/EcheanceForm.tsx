"use client";

/**
 * Ajouter une échéance, aux quatre récurrences courantes (décision du foyer,
 * 2026-10-13). ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useActionState, useState } from "react";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";
import { IMPORTANCE_LABELS, IMPORTANCES } from "@/lib/ui/deadline";
import { ajouterEcheance } from "../../../app/_actions/ajout";
import {
  BOUTON,
  CHAMP,
  Champ,
  DATE,
  LISTE,
  Ligne,
  NOMBRE,
} from "../forms/Champ";

type Motif = "once" | "interval" | "annual" | "sinceCompletion";

const MOTIFS: readonly (readonly [Motif, string])[] = [
  ["once", "Une seule fois"],
  ["interval", "Régulièrement"],
  ["annual", "Chaque année"],
  ["sinceCompletion", "Un certain temps après la dernière fois"],
];

const DATE_LIBELLE: Readonly<Record<Motif, string>> = {
  once: "Date",
  interval: "Première fois",
  annual: "Date (jour et mois)",
  sinceCompletion: "Dernière fois (facultatif)",
};

export function EcheanceForm({
  fiches,
  aujourdhui,
}: Readonly<{
  fiches: readonly { readonly id: string; readonly titre: string }[];
  aujourdhui: string;
}>) {
  const [etat, agir, enCours] = useActionState(ajouterEcheance, ETAT_AJOUT);
  const [motif, setMotif] = useState<Motif>("once");
  const erreurs = etat.etape === "saisie" ? (etat.erreurs ?? {}) : {};
  const repetee = motif === "interval" || motif === "sinceCompletion";

  return (
    <form action={agir} className="flex flex-col gap-4">
      <Champ libelle="Quoi" erreur={erreurs.titre}>
        <input name="titre" className={CHAMP} required maxLength={120} />
      </Champ>
      <Champ libelle="Quand" erreur={erreurs.motif}>
        <select
          name="motif"
          value={motif}
          onChange={event => setMotif(event.target.value as Motif)}
          className={LISTE}
        >
          {MOTIFS.map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      {repetee && (
        <Champ
          libelle={motif === "interval" ? "Tous les" : "Après"}
          erreur={erreurs.nombre ?? erreurs.unite}
        >
          <span className="flex gap-2.5">
            <input
              name="nombre"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={1}
              className={NOMBRE}
              aria-label="Nombre"
            />
            <select
              name="unite"
              defaultValue="month"
              className={`${LISTE} flex-1`}
              aria-label="Unité"
            >
              <option value="day">jours</option>
              <option value="week">semaines</option>
              <option value="month">mois</option>
              <option value="year">ans</option>
            </select>
          </span>
        </Champ>
      )}
      <Champ libelle={DATE_LIBELLE[motif]} erreur={erreurs.date}>
        <input
          name="date"
          type="date"
          className={DATE}
          defaultValue={motif === "sinceCompletion" ? "" : aujourdhui}
          max={motif === "sinceCompletion" ? aujourdhui : undefined}
          required={motif !== "sinceCompletion"}
        />
      </Champ>
      <Ligne>
        <Champ libelle="Importance" erreur={erreurs.importance}>
          <select name="importance" defaultValue="normal" className={LISTE}>
            {IMPORTANCES.map(niveau => (
              <option key={niveau} value={niveau}>
                {IMPORTANCE_LABELS[niveau]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Tenue" erreur={erreurs.tenue}>
          <select name="tenue" defaultValue="souple" className={LISTE}>
            <option value="souple">Souple</option>
            <option value="ferme">Ferme</option>
          </select>
        </Champ>
      </Ligne>
      <p className="-mt-1.5 m-0 text-[12.5px] leading-normal text-ink-secondary">
        Ferme : à ne pas rater, reste en retard. Souple : on vise la suivante.
      </p>
      <Ligne>
        <Champ
          libelle="Préavis"
          aide="Jours avant : quand elle paraît à l'accueil."
          erreur={erreurs.preavisJours}
        >
          <input
            name="preavisJours"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={7}
            className={CHAMP}
          />
        </Champ>
        <Champ
          libelle="Tolérance"
          aide="Jours après : avant d'être en retard."
          erreur={erreurs.toleranceJours}
        >
          <input
            name="toleranceJours"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={3}
            className={CHAMP}
          />
        </Champ>
      </Ligne>
      <Champ libelle="Catégorie" erreur={erreurs.categorie}>
        <input name="categorie" className={CHAMP} maxLength={120} />
      </Champ>
      {fiches.length > 0 && (
        <Champ libelle="Fiche liée (facultatif)" erreur={erreurs.ficheId}>
          <select name="ficheId" defaultValue="" className={LISTE}>
            <option value="">Aucune</option>
            {fiches.map(fiche => (
              <option key={fiche.id} value={fiche.id}>
                {fiche.titre}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <button type="submit" className={BOUTON} disabled={enCours}>
        Créer l'échéance
      </button>
    </form>
  );
}
