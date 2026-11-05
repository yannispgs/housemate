import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AjouterPiece } from "@/components/ajout/AjouterPiece";
import { CarnetEntretien } from "@/components/CarnetEntretien";
import { EcheancesFiche } from "@/components/fiche/EcheancesFiche";
import { PlantationFiche } from "@/components/fiche/PlantationFiche";
import { TitreFiche } from "@/components/fiche/TitreFiche";
import { Panel, Screen, SectionLabel } from "@/components/Screen";
import { demoEnabled } from "@/demo/mode";
import { valeurAffichee } from "@/lib/data/fiche-vue";
import {
  LIBELLE_EMPLACEMENT,
  LIBELLE_POT,
  labelsPlante,
  situationPlante,
} from "@/lib/data/plantes";
import { emplacementsProposes } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import {
  lireCarnet,
  lireFiche,
  listerConsommables,
  listerEcheances,
  listerEmplacements,
} from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import {
  consommablesDeFiche,
  echeancesDeFiche,
  NATURE_LABELS,
  shortDate,
} from "@/lib/data/views";
import { toISO } from "@/lib/domain/plain-date";
import { annuler, cocher } from "../../_actions/echeances";
import { remplacer } from "../../_actions/entretien";

export const metadata: Metadata = { title: "Fiche" };

/**
 * ⚠️ Écran provisoire : la fiche n'est pas encore dessinée dans Claude
 * Design (`a-dessiner.md`, § 2.1). Titre renommable, plantation d'une
 * plante, attributs, pièces jointes, carnet d'entretien (une ligne par consommable),
 * échéances liées ; un tap sur l'une d'elles ouvre sa carte dans une modale. Le
 * reste (frise, archivage) viendra avec sa maquette.
 */
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const id = z.uuid().safeParse((await params).id);

  if (demoEnabled() || !id.success) {
    notFound();
  }

  await connection();
  const [fiche, emplacements, carnet, rows, consommables] = await enMonNom(tx =>
    Promise.all([
      lireFiche(tx, id.data),
      listerEmplacements(tx),
      lireCarnet(tx, id.data),
      listerEcheances(tx),
      listerConsommables(tx),
    ]),
  );

  if (fiche === null) {
    notFound();
  }

  const today = aujourdhuiAParis();
  const jour = { iso: toISO(today), court: shortDate(today) };
  const actions = { cocher, annuler, remplacer };
  const echeances = echeancesDeFiche(rows, fiche.id, today);
  const plante = fiche.nature === "plante";
  const situation = situationPlante(fiche.attributs);
  // Ceux d'une plante ont leur propre section, modifiable (§ 12.4).
  const informations = plante
    ? fiche.attributs.filter(
        a => a.libelle !== LIBELLE_POT && a.libelle !== LIBELLE_EMPLACEMENT,
      )
    : fiche.attributs;

  return (
    <Screen
      title={<TitreFiche ficheId={fiche.id} titre={fiche.titre} />}
      subtitle={[
        NATURE_LABELS[fiche.nature],
        fiche.categorie,
        ...(plante ? labelsPlante(situation) : []),
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {plante && (
        <PlantationFiche
          ficheId={fiche.id}
          situation={situation}
          emplacements={emplacementsProposes(emplacements)}
        />
      )}

      {informations.length > 0 && (
        <Panel className="gap-3 p-[18px]">
          <SectionLabel>Informations</SectionLabel>
          <dl className="m-0 flex flex-col gap-2.5">
            {informations.map(attribut => (
              <div key={attribut.libelle} className="flex flex-col gap-0.5">
                <dt className="text-[12.5px] text-ink-secondary">
                  {attribut.libelle}
                </dt>
                <dd className="m-0 text-[15px] text-ink">
                  {valeurAffichee(attribut)}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      <Panel className="gap-3 p-[18px]">
        <SectionLabel count={fiche.pieces.length}>Pièces jointes</SectionLabel>
        {fiche.pieces.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {fiche.pieces.map(piece => (
              <li key={piece.id}>
                <a
                  href={`/api/pieces-jointes/${piece.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[15px] text-ink underline"
                >
                  {piece.nom}
                </a>
                <span className="ml-2 text-[12.5px] text-ink-secondary">
                  {piece.typeMime === "application/pdf" ? "PDF" : "Photo"} ·
                  ajoutée le {piece.ajouteeLe.split("-").reverse().join("/")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <AjouterPiece ficheId={fiche.id} />
      </Panel>

      {carnet.entretien && (
        <CarnetEntretien
          consommables={consommablesDeFiche(consommables, fiche.id, today)}
          entrees={carnet.entrees}
          actions={actions}
          jour={jour}
        />
      )}

      {echeances.length > 0 && (
        <EcheancesFiche echeances={echeances} actions={actions} jour={jour} />
      )}
    </Screen>
  );
}
