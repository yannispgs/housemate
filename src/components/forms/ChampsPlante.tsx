"use client";

/**
 * En pot ou en terre, l'emplacement et les seuils de gel d'une plante (SPEC
 * § 12.2, § 12.4) : à la création comme sur la fiche. L'emplacement se
 * choisit dans la liste du foyer, ou se saisit (« Autre pièce… ») : la liste
 * s'enrichit à l'usage. Les seuils se saisissent à la main, sans suggestion
 * d'après l'espèce (décision du 25/10/2026).
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useState } from "react";
import { type Plantation, POT_OU_TERRE } from "@/lib/data/plantes";
import { CHAMP, Champ, LISTE } from "./Champ";

const AUTRE = "__autre__";

const VIERGE: Plantation = {
  pot: null,
  emplacement: null,
  seuilDegats: null,
  seuilMort: null,
};

/** Un seuil de gel en °C ; le clavier numérique du téléphone a le signe moins. */
function ChampSeuil({
  nom,
  libelle,
  aide,
  valeur,
  erreur,
}: Readonly<{
  nom: string;
  libelle: string;
  aide: string;
  valeur: number | null;
  erreur?: string;
}>) {
  return (
    <Champ libelle={libelle} aide={aide} erreur={erreur}>
      <input
        name={nom}
        type="number"
        step="0.1"
        min={-50}
        max={50}
        defaultValue={valeur ?? ""}
        placeholder="°C"
        className={CHAMP}
      />
    </Champ>
  );
}

export function ChampsPlante({
  emplacements,
  plantation = VIERGE,
  erreurs = {},
}: Readonly<{
  emplacements: readonly string[];
  plantation?: Plantation;
  erreurs?: Readonly<Record<string, string>>;
}>) {
  const [choix, setChoix] = useState(plantation.emplacement ?? "");
  const autre = choix === AUTRE;
  // Un emplacement d'une autre plante supprimée n'est plus proposé : il
  // reste choisi tant qu'on ne le change pas.
  const proposes =
    plantation.emplacement === null ||
    emplacements.includes(plantation.emplacement)
      ? emplacements
      : [...emplacements, plantation.emplacement];

  return (
    <>
      <Champ libelle="Pot ou terre" erreur={erreurs.potOuTerre}>
        <select
          name="potOuTerre"
          defaultValue={plantation.pot ?? ""}
          className={LISTE}
        >
          <option value="">Non renseigné</option>
          {POT_OU_TERRE.map(valeur => (
            <option key={valeur} value={valeur}>
              {valeur}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Emplacement" erreur={erreurs.emplacement}>
        <select
          // Le champ texte porte la valeur quand on saisit une autre pièce.
          name={autre ? undefined : "emplacement"}
          value={choix}
          onChange={event => setChoix(event.target.value)}
          className={LISTE}
        >
          <option value="">Non renseigné</option>
          {proposes.map(emplacement => (
            <option key={emplacement} value={emplacement}>
              {emplacement}
            </option>
          ))}
          <option value={AUTRE}>Autre pièce…</option>
        </select>
        {autre && (
          <input
            name="emplacement"
            className={CHAMP}
            maxLength={120}
            placeholder="Salon, chambre…"
            aria-label="Autre pièce"
            required
          />
        )}
      </Champ>
      <ChampSeuil
        nom="seuilDegats"
        libelle="Seuil de dégâts (°C)"
        aide="Sous cette température, la plante souffre : la veille gel prévient la veille au soir. Vide, elle ne la suit pas."
        valeur={plantation.seuilDegats}
        erreur={erreurs.seuilDegats}
      />
      <ChampSeuil
        nom="seuilMort"
        libelle="Seuil de mort (°C)"
        aide="Sous cette température, la plante risque d'y rester."
        valeur={plantation.seuilMort}
        erreur={erreurs.seuilMort}
      />
    </>
  );
}
