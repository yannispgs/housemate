"use client";

/**
 * Les infos de base d'une nature (SPEC § 4.1, décisions du 27/10/2026), toutes
 * facultatives : à la création d'une fiche comme sur la fiche. ⚠️ Provisoire :
 * pas encore dessiné dans Claude Design.
 */
import { type ChampInfo, INFOS } from "@/lib/data/infos";
import type { Nature } from "@/lib/data/views";
import { CHAMP, Champ, DATE, LISTE, NOMBRE } from "./Champ";
import { ChampMarque } from "./ChampMarque";

function Saisie({
  champ,
  valeurs,
  erreurs,
  marques,
}: Readonly<{
  champ: ChampInfo;
  valeurs: Readonly<Record<string, string>>;
  erreurs: Readonly<Record<string, string>>;
  marques: readonly string[];
}>) {
  const { cle, libelle, type } = champ;

  if (cle === "marque") {
    return (
      <ChampMarque
        marques={marques}
        erreur={erreurs.marque}
        initiale={valeurs.marque}
      />
    );
  }

  if (type === "duree") {
    return (
      <Champ
        libelle={libelle}
        erreur={erreurs[`${cle}Nombre`] ?? erreurs[`${cle}Unite`]}
      >
        <span className="flex gap-2.5">
          <input
            name={`${cle}Nombre`}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            defaultValue={valeurs[`${cle}Nombre`]}
            className={NOMBRE}
            aria-label={libelle}
          />
          <select
            name={`${cle}Unite`}
            defaultValue={valeurs[`${cle}Unite`] ?? "year"}
            className={`${LISTE} flex-1`}
            aria-label={`${libelle} : unité`}
          >
            <option value="year">ans</option>
            <option value="month">mois</option>
          </select>
        </span>
      </Champ>
    );
  }

  return (
    <Champ libelle={libelle} erreur={erreurs[cle]}>
      {type === "montant" ? (
        <span className="flex items-center gap-2.5">
          <input
            name={cle}
            inputMode="decimal"
            defaultValue={valeurs[cle]}
            placeholder="0,00"
            className={CHAMP}
          />
          <span className="flex-none text-[15px] text-ink-secondary">€</span>
        </span>
      ) : (
        <input
          name={cle}
          type={type === "date" ? "date" : "text"}
          maxLength={type === "texte" ? 120 : undefined}
          defaultValue={valeurs[cle]}
          className={type === "date" ? DATE : CHAMP}
        />
      )}
    </Champ>
  );
}

export function ChampsInfos({
  nature,
  valeurs = {},
  erreurs = {},
  marques = [],
}: Readonly<{
  nature: Nature;
  valeurs?: Readonly<Record<string, string>>;
  erreurs?: Readonly<Record<string, string>>;
  marques?: readonly string[];
}>) {
  return INFOS[nature].map(champ => (
    <Saisie
      key={`${nature}-${champ.cle}`}
      champ={champ}
      valeurs={valeurs}
      erreurs={erreurs}
      marques={marques}
    />
  ));
}
