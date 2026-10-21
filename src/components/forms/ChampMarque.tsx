"use client";

/**
 * La marque, avec les marques déjà saisies par le foyer proposées à mesure
 * qu'on l'écrit (décision du foyer, 2026-10-21) : une touche, et elle est
 * choisie. Une marque nouvelle s'écrit simplement. ⚠️ Provisoire : pas encore
 * dessiné dans Claude Design.
 */
import { type KeyboardEvent, useId, useState } from "react";
import { marquesSuggerees } from "@/lib/data/saisie";
import { CHAMP, Champ } from "./Champ";

export function ChampMarque({
  marques,
  erreur,
}: Readonly<{ marques: readonly string[]; erreur?: string }>) {
  const [valeur, setValeur] = useState("");
  const [ouverte, setOuverte] = useState(false);
  const [active, setActive] = useState(-1);
  const liste = useId();
  // Une marque déjà écrite telle quelle n'a plus besoin d'être proposée.
  const suggestions = ouverte
    ? marquesSuggerees(valeur, marques).filter(m => m !== valeur.trim())
    : [];

  const choisir = (marque: string) => {
    setValeur(marque);
    setOuverte(false);
    setActive(-1);
  };

  const touche = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOuverte(true);
      const pas = event.key === "ArrowDown" ? 1 : -1;
      setActive(i =>
        suggestions.length === 0
          ? -1
          : (i + pas + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && suggestions[active] !== undefined) {
      event.preventDefault();
      choisir(suggestions[active]);
    } else if (event.key === "Escape") {
      setOuverte(false);
      setActive(-1);
    }
  };

  return (
    <Champ libelle="Marque" erreur={erreur}>
      <span className="relative block">
        <input
          name="marque"
          className={CHAMP}
          maxLength={120}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={liste}
          aria-activedescendant={
            suggestions[active] === undefined ? undefined : `${liste}-${active}`
          }
          value={valeur}
          onChange={event => {
            setValeur(event.target.value);
            setOuverte(true);
            setActive(-1);
          }}
          onFocus={() => setOuverte(true)}
          onBlur={() => setOuverte(false)}
          onKeyDown={touche}
        />
        {suggestions.length > 0 && (
          <span
            id={liste}
            role="listbox"
            className="absolute inset-x-0 top-full z-10 mt-1.5 flex min-w-40 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface py-1 shadow-lg"
          >
            {suggestions.map((marque, i) => (
              <button
                key={marque}
                id={`${liste}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                // Garder le focus dans le champ : sans cela, la liste se
                // ferme avant que le choix ne soit pris en compte.
                onPointerDown={event => event.preventDefault()}
                onClick={() => choisir(marque)}
                className={`cursor-pointer truncate px-4 py-2.5 text-left text-base text-ink hover:bg-grid ${i === active ? "bg-grid" : ""}`}
              >
                {marque}
              </button>
            ))}
          </span>
        )}
      </span>
    </Champ>
  );
}
