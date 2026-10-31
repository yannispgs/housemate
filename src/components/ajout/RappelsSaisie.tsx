"use client";

/**
 * Les rappels d'une échéance, ajoutés à la main (§ 6) : un mois avant pour ne
 * pas l'oublier, puis la veille… Chacun tient sur une ligne : son délai, son
 * unité, ses canaux en icônes (enveloppe, téléphone) et la croix pour le
 * retirer. Les champs sont numérotés dans l'ordre affiché (`rappel0Nombre`…) :
 * le formulaire arrive à plat, deux champs du même nom n'en feraient qu'un.
 * ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { type ComponentType, useRef, useState } from "react";
import { RAPPELS_MAX } from "@/lib/data/saisie";
import { BOUTON_SECONDAIRE, LIBELLE, LISTE, NOMBRE } from "../forms/Champ";
import { CloseIcon, MailIcon, PhoneIcon } from "../icons";

/**
 * Un canal, en pastille à cocher : pleine quand il est choisi. La case reste
 * dans la pastille, invisible, pour le clavier et les lecteurs d'écran.
 */
function Canal({
  name,
  libelle,
  Icone,
  coche = false,
}: Readonly<{
  name: string;
  libelle: string;
  Icone: ComponentType<{ readonly size?: number }>;
  coche?: boolean;
}>) {
  return (
    <label
      title={libelle}
      className="relative flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border border-border text-ink-secondary has-[:checked]:border-transparent has-[:checked]:bg-brand-strong has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-strong"
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={coche}
        aria-label={libelle}
        className="sr-only"
      />
      <Icone size={18} />
    </label>
  );
}

export function RappelsSaisie({
  erreurs,
}: Readonly<{ erreurs: Readonly<Record<string, string>> }>) {
  // Une clé stable par rappel : en retirer un ne vide pas les suivants.
  const suivant = useRef(0);
  const [cles, setCles] = useState<readonly number[]>([]);

  const ajouter = () => {
    setCles(actuelles => [...actuelles, suivant.current]);
    suivant.current += 1;
  };

  return (
    <fieldset className="flex flex-col gap-2.5 border-0 p-0">
      <legend className={`${LIBELLE} mb-2.5 p-0`}>Rappels (facultatif)</legend>
      <span className="text-[12.5px] leading-normal text-ink-secondary">
        Combien de temps avant la date, et par où :{" "}
        <MailIcon size={13} className="inline align-[-2px]" /> e-mail (dans le
        résumé du jour), <PhoneIcon size={13} className="inline align-[-2px]" />{" "}
        notification.
      </span>
      {cles.map((cle, rang) => (
        <div key={cle} className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <input
              name={`rappel${rang}Nombre`}
              type="number"
              inputMode="numeric"
              min={0}
              required
              className={NOMBRE}
              // Quatre chiffres au plus : la ligne garde la place des canaux.
              style={{ width: "3.75rem", paddingInline: "0.5rem" }}
              aria-label={`Délai du rappel ${rang + 1}`}
            />
            <select
              name={`rappel${rang}Unite`}
              defaultValue="day"
              className={`${LISTE} flex-1`}
              // Sans flèche dessinée : la marge réservée à droite est inutile.
              style={{ paddingInline: "0.75rem" }}
              aria-label={`Unité du rappel ${rang + 1}, avant la date`}
            >
              <option value="day">jours</option>
              <option value="week">semaines</option>
              <option value="month">mois</option>
            </select>
            <Canal
              name={`rappel${rang}Email`}
              libelle={`Rappel ${rang + 1} par e-mail`}
              Icone={MailIcon}
              coche
            />
            <Canal
              name={`rappel${rang}Push`}
              libelle={`Rappel ${rang + 1} par notification`}
              Icone={PhoneIcon}
            />
            <button
              type="button"
              onClick={() =>
                setCles(actuelles => actuelles.filter(c => c !== cle))
              }
              className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-secondary hover:bg-grid"
              aria-label={`Retirer le rappel ${rang + 1}`}
            >
              <CloseIcon size={18} />
            </button>
          </span>
          {erreurs[`rappels.${rang}`] && (
            <span role="alert" className="text-[13px] text-ink-critical">
              {erreurs[`rappels.${rang}`]}
            </span>
          )}
        </div>
      ))}
      {erreurs.rappels && (
        <span role="alert" className="text-[13px] text-ink-critical">
          {erreurs.rappels}
        </span>
      )}
      {cles.length < RAPPELS_MAX && (
        <button type="button" onClick={ajouter} className={BOUTON_SECONDAIRE}>
          {cles.length === 0 ? "Ajouter un rappel" : "Ajouter un autre rappel"}
        </button>
      )}
    </fieldset>
  );
}
