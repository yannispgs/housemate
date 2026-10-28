"use client";

/**
 * Les infos de base d'une fiche (SPEC § 4.1, décisions du 27/10/2026) : lues
 * d'un coup d'œil, modifiables avec le même crayon que la plantation. Les
 * attributs hors de la nature (anciens, ou venus d'ailleurs) restent affichés,
 * en lecture seule. ⚠️ Provisoire : pas encore dessiné dans Claude Design.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { valeurAffichee } from "@/lib/data/fiche-vue";
import type { Attribut } from "@/lib/data/saisie";
import type { Nature } from "@/lib/data/views";
import type { PlainDate } from "@/lib/domain/plain-date";
import { renseigner } from "../../../app/_actions/fiche";
import { BOUTON, BOUTON_SECONDAIRE } from "../forms/Champ";
import { ChampsInfos } from "../forms/ChampsInfos";
import { PencilIcon } from "../icons";
import { Panel, SectionLabel } from "../Screen";

function Liste({
  attributs,
  aujourdhui,
}: Readonly<{ attributs: readonly Attribut[]; aujourdhui?: PlainDate }>) {
  return (
    <dl className="m-0 flex flex-col gap-2.5">
      {attributs.map(attribut => (
        <div key={attribut.libelle} className="flex flex-col gap-0.5">
          <dt className="text-[12.5px] text-ink-secondary">
            {attribut.libelle}
          </dt>
          <dd className="m-0 text-[15px] text-ink">
            {valeurAffichee(attribut, aujourdhui)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InfosFiche({
  ficheId,
  nature,
  infos,
  valeurs,
  autres,
  marques,
  aujourdhui,
}: Readonly<{
  ficheId: string;
  nature: Nature;
  /** Les infos de la nature, remplies. */
  infos: readonly Attribut[];
  /** Les mêmes, pour pré-remplir le formulaire. */
  valeurs: Readonly<Record<string, string>>;
  /** Les autres attributs, en lecture seule. */
  autres: readonly Attribut[];
  marques: readonly string[];
  /** Pour l'âge d'une personne née une année connue. */
  aujourdhui?: PlainDate;
}>) {
  const [edition, setEdition] = useState(false);
  const [erreurs, setErreurs] = useState<Readonly<Record<string, string>>>({});
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const lecture =
    infos.length > 0 ? (
      <Liste attributs={infos} aujourdhui={aujourdhui} />
    ) : (
      <span className="text-[15px] text-ink-muted">Non renseignées</span>
    );

  const fermer = () => {
    setEdition(false);
    setErreurs({});
  };

  return (
    <Panel className="gap-3 p-[18px]">
      <span className="flex items-center justify-between">
        <SectionLabel>Informations</SectionLabel>
        {!edition && (
          <button
            type="button"
            aria-label="Modifier les informations"
            onClick={() => setEdition(true)}
            className="-my-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted hover:bg-grid hover:text-ink"
          >
            <PencilIcon size={17} />
          </button>
        )}
      </span>

      {edition ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            const champs = Object.fromEntries(
              [...new FormData(event.currentTarget).entries()].filter(
                (e): e is [string, string] => typeof e[1] === "string",
              ),
            );
            demarrer(async () => {
              const probleme = await renseigner(ficheId, champs);

              if (probleme === null) {
                fermer();
                router.refresh();
              } else {
                setErreurs(probleme);
              }
            });
          }}
        >
          <ChampsInfos
            nature={nature}
            valeurs={valeurs}
            erreurs={erreurs}
            marques={marques}
          />
          {erreurs.formulaire && (
            <span role="alert" className="text-[13px] text-ink-critical">
              {erreurs.formulaire}
            </span>
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className={BOUTON_SECONDAIRE}
              onClick={fermer}
            >
              Annuler
            </button>
            <button type="submit" className={BOUTON} disabled={enCours}>
              Enregistrer
            </button>
          </span>
        </form>
      ) : (
        lecture
      )}

      {autres.length > 0 && <Liste attributs={autres} />}
    </Panel>
  );
}
