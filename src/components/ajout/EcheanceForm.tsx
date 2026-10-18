"use client";

/**
 * Ajouter une échéance, aux quatre récurrences courantes (décision du foyer,
 * 2026-10-13). ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useActionState, useState } from "react";
import { ETAT_AJOUT } from "@/lib/data/ajout-etat";
import { type Precision, SAISONS } from "@/lib/data/saisie";
import { type Month, monthName } from "@/lib/domain/month";
import {
  IMPORTANCE_LABELS,
  IMPORTANCES,
  type Importance,
  type Tenure,
} from "@/lib/ui/deadline";
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
import { ChoixCategorie } from "../forms/ChoixCategorie";

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

/**
 * L'importance choisie se voit sur la liste même : contour et texte de sa
 * couleur, et jamais la couleur seule (§ 5) — le libellé reste écrit, et
 * « pour mémoire » passe en italique.
 */
const STYLE_IMPORTANCE: Readonly<Record<Importance, React.CSSProperties>> = {
  critique: {
    border: "2px solid var(--ink-critical)",
    color: "var(--ink-critical)",
    fontWeight: 700,
  },
  important: {
    border: "2px solid var(--ink-serious)",
    // L'orange seul se lit mal sur le fond clair : foncé vers l'encre.
    color: "color-mix(in srgb, var(--ink-serious) 65%, var(--ink-primary))",
    fontWeight: 600,
  },
  normal: { border: "1.5px solid var(--baseline)" },
  memoire: {
    border: "1px solid var(--border)",
    color: "var(--ink-secondary)",
    fontStyle: "italic",
  },
};

/** Ferme : gras et contour épais. Souple : police normale, contour en pointillés. */
const STYLE_TENUE: Readonly<Record<Tenure, React.CSSProperties>> = {
  ferme: { border: "2.5px solid var(--ink-primary)", fontWeight: 700 },
  souple: { border: "1.5px dashed var(--baseline)", fontWeight: 400 },
};

const PRECISION_LIBELLE: Readonly<Record<Precision, string>> = {
  jour: "Un jour précis",
  mois: "Un mois",
  saison: "Une saison",
};

const MOIS = Array.from({ length: 12 }, (_, i) => i + 1);

export function EcheanceForm({
  fiches,
  aujourdhui,
  categories,
}: Readonly<{
  fiches: readonly { readonly id: string; readonly titre: string }[];
  aujourdhui: string;
  categories: readonly string[];
}>) {
  const [etat, agir, enCours] = useActionState(ajouterEcheance, ETAT_AJOUT);
  const [motif, setMotif] = useState<Motif>("once");
  // Liée à une fiche, l'échéance en hérite la catégorie (§ 5.4).
  const [ficheId, setFicheId] = useState("");
  const [importance, setImportance] = useState<Importance>("normal");
  const [tenue, setTenue] = useState<Tenure>("souple");
  const [precision, setPrecision] = useState<Precision>("jour");
  const erreurs = etat.etape === "saisie" ? (etat.erreurs ?? {}) : {};
  const repetee = motif === "interval" || motif === "sinceCompletion";
  // Une seule fois ou chaque année : un jour, un mois ou une saison.
  const periodique = motif === "once" || motif === "annual";
  const parPeriode = periodique && precision !== "jour";
  const anneeCourante = Number(aujourdhui.slice(0, 4));

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
      {periodique && (
        <Champ libelle="Précision" erreur={erreurs.precision}>
          <select
            name="precision"
            value={precision}
            onChange={event => setPrecision(event.target.value as Precision)}
            className={LISTE}
          >
            {(["jour", "mois", "saison"] as const).map(valeur => (
              <option key={valeur} value={valeur}>
                {PRECISION_LIBELLE[valeur]}
              </option>
            ))}
          </select>
        </Champ>
      )}
      {!parPeriode && (
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
      )}
      {parPeriode && (
        <Champ
          libelle={precision === "mois" ? "Mois" : "Saison"}
          aide="On a toute la période pour le faire : en retard après sa fin."
          erreur={erreurs.mois ?? erreurs.saison ?? erreurs.annee}
        >
          <span className="flex gap-2.5">
            {precision === "mois" ? (
              <select
                key="mois"
                name="mois"
                defaultValue={Number(aujourdhui.slice(5, 7))}
                className={LISTE}
                aria-label="Mois"
              >
                {MOIS.map(m => (
                  <option key={m} value={m}>
                    {monthName(m as Month)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                key="saison"
                name="saison"
                defaultValue="printemps"
                className={LISTE}
                aria-label="Saison"
              >
                {Object.entries(SAISONS).map(([valeur, { libelle }]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </select>
            )}
            {motif === "once" && (
              <input
                name="annee"
                type="number"
                inputMode="numeric"
                min={anneeCourante}
                defaultValue={anneeCourante}
                className={CHAMP}
                style={{ width: "6.5rem", flex: "none" }}
                aria-label="Année"
                required
              />
            )}
          </span>
        </Champ>
      )}
      <Ligne>
        <Champ libelle="Importance" erreur={erreurs.importance}>
          <select
            name="importance"
            value={importance}
            onChange={event => setImportance(event.target.value as Importance)}
            className={LISTE}
            style={STYLE_IMPORTANCE[importance]}
          >
            {IMPORTANCES.map(niveau => (
              <option key={niveau} value={niveau}>
                {IMPORTANCE_LABELS[niveau]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Tenue" erreur={erreurs.tenue}>
          <select
            name="tenue"
            value={tenue}
            onChange={event => setTenue(event.target.value as Tenure)}
            className={LISTE}
            style={STYLE_TENUE[tenue]}
          >
            <option value="souple">Souple</option>
            <option value="ferme">Ferme</option>
          </select>
        </Champ>
      </Ligne>
      <p className="-mt-1.5 m-0 text-[12.5px] leading-normal text-ink-secondary">
        Ferme : à ne pas rater, en retard dès le lendemain. Souple : on vise la
        suivante.
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
        {/* Ferme : pas de tolérance. Un mois ou une saison : toute la période. */}
        {tenue === "souple" && !parPeriode && (
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
        )}
      </Ligne>
      <Champ
        libelle="Rappel (facultatif)"
        aide="Combien de temps avant la date. Par e-mail, il figure dans le résumé du jour."
        erreur={erreurs.rappelNombre}
      >
        <span className="flex gap-2.5">
          <input
            name="rappelNombre"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="—"
            className={CHAMP}
            style={{ width: "6rem", flex: "none" }}
            aria-label="Délai du rappel"
          />
          <select
            name="rappelUnite"
            defaultValue="day"
            className={LISTE}
            aria-label="Unité du rappel"
          >
            <option value="day">jours avant</option>
            <option value="week">semaines avant</option>
            <option value="month">mois avant</option>
          </select>
        </span>
      </Champ>
      <fieldset className="-mt-2 flex gap-5 border-0 p-0 text-[15px] text-ink">
        <legend className="sr-only">Canaux du rappel</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="rappelEmail"
            defaultChecked
            className="size-5 accent-[var(--brand-strong)]"
          />
          <span>Par e-mail</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="rappelPush"
            className="size-5 accent-[var(--brand-strong)]"
          />
          <span>Par notification</span>
        </label>
      </fieldset>
      <Champ
        libelle="Notifications push"
        aide="Pour toi seulement : selon le tableau de Réglages, ou une exception pour cette échéance."
        erreur={erreurs.notifier}
      >
        <select name="notifier" defaultValue="" className={LISTE}>
          <option value="">Selon mes réglages</option>
          <option value="oui">Toujours me notifier</option>
          <option value="non">Ne jamais me notifier</option>
        </select>
      </Champ>
      {fiches.length > 0 && (
        <Champ
          libelle="Fiche liée (facultatif)"
          aide={ficheId ? "Elle prend la catégorie de la fiche." : undefined}
          erreur={erreurs.ficheId}
        >
          <select
            name="ficheId"
            value={ficheId}
            onChange={event => setFicheId(event.target.value)}
            className={LISTE}
          >
            <option value="">Aucune</option>
            {fiches.map(fiche => (
              <option key={fiche.id} value={fiche.id}>
                {fiche.titre}
              </option>
            ))}
          </select>
        </Champ>
      )}
      {ficheId === "" && (
        <ChoixCategorie categories={categories} erreur={erreurs.categorie} />
      )}
      <button type="submit" className={BOUTON} disabled={enCours}>
        Créer l'échéance
      </button>
    </form>
  );
}
