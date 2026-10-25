"use client";

/**
 * En pot ou en terre, et l'emplacement d'une plante (SPEC § 12.4) : à la
 * création comme sur la fiche. L'emplacement se choisit dans la liste du
 * foyer, ou se saisit (« Autre pièce… ») : la liste s'enrichit à l'usage.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useState } from "react";
import { POT_OU_TERRE, type SituationPlante } from "@/lib/data/plantes";
import { CHAMP, Champ, LISTE } from "./Champ";

const AUTRE = "__autre__";

export function ChampsPlante({
  emplacements,
  situation = { pot: null, emplacement: null },
  erreurs = {},
}: Readonly<{
  emplacements: readonly string[];
  situation?: SituationPlante;
  erreurs?: Readonly<Record<string, string>>;
}>) {
  const [choix, setChoix] = useState(situation.emplacement ?? "");
  const autre = choix === AUTRE;
  // Un emplacement d'une autre plante supprimée n'est plus proposé : il
  // reste choisi tant qu'on ne le change pas.
  const proposes =
    situation.emplacement === null ||
    emplacements.includes(situation.emplacement)
      ? emplacements
      : [...emplacements, situation.emplacement];

  return (
    <>
      <Champ libelle="Pot ou terre" erreur={erreurs.potOuTerre}>
        <select
          name="potOuTerre"
          defaultValue={situation.pot ?? ""}
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
    </>
  );
}
