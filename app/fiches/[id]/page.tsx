import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AjouterPiece } from "@/components/ajout/AjouterPiece";
import { InfosFiche } from "@/components/fiche/InfosFiche";
import { PlantationFiche } from "@/components/fiche/PlantationFiche";
import { TitreFiche } from "@/components/fiche/TitreFiche";
import { Panel, Screen, SectionLabel } from "@/components/Screen";
import { demoEnabled } from "@/demo/mode";
import { valeurAffichee } from "@/lib/data/fiche-vue";
import { horsInfos, INFOS, infosDe, valeursInfos } from "@/lib/data/infos";
import {
  LIBELLES_PLANTATION,
  labelsPlante,
  plantation,
} from "@/lib/data/plantes";
import { emplacementsProposes, marquesConnues } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import { lireFiche, listerEmplacements, listerMarques } from "@/lib/data/store";
import { NATURE_LABELS } from "@/lib/data/views";

export const metadata: Metadata = { title: "Fiche" };

/**
 * ⚠️ Écran provisoire : la fiche n'est pas encore dessinée dans Claude
 * Design (`a-dessiner.md`, § 2.1). Titre renommable, plantation d'une
 * plante, attributs, échéances liées, pièces jointes ; le reste (historique, frise, archivage) viendra avec sa maquette.
 */
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const id = z.uuid().safeParse((await params).id);

  if (demoEnabled() || !id.success) {
    notFound();
  }

  await connection();
  const [fiche, emplacements, marques] = await enMonNom(tx =>
    Promise.all([
      lireFiche(tx, id.data),
      listerEmplacements(tx),
      listerMarques(tx),
    ]),
  );

  if (fiche === null) {
    notFound();
  }

  const plante = fiche.nature === "plante";
  const sectionPlante = plantation(fiche.attributs);
  // Ceux d'une plante ont leur propre section, modifiable (§ 12.4).
  const informations = plante
    ? fiche.attributs.filter(a => !LIBELLES_PLANTATION.includes(a.libelle))
    : fiche.attributs;
  // Les infos de base de sa nature, modifiables (§ 4.1).
  const avecInfos = INFOS[fiche.nature].length > 0;

  return (
    <Screen
      title={<TitreFiche ficheId={fiche.id} titre={fiche.titre} />}
      subtitle={[
        NATURE_LABELS[fiche.nature],
        fiche.categorie,
        ...(plante ? labelsPlante(sectionPlante) : []),
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {plante && (
        <PlantationFiche
          ficheId={fiche.id}
          plantation={sectionPlante}
          emplacements={emplacementsProposes(emplacements)}
        />
      )}

      {avecInfos && (
        <InfosFiche
          ficheId={fiche.id}
          nature={fiche.nature}
          infos={infosDe(informations, fiche.nature)}
          valeurs={valeursInfos(informations, fiche.nature)}
          autres={horsInfos(informations, fiche.nature)}
          marques={marquesConnues(marques)}
        />
      )}

      {!avecInfos && informations.length > 0 && (
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

      {fiche.echeances.length > 0 && (
        <Panel className="gap-3 p-[18px]">
          <SectionLabel count={fiche.echeances.length}>Échéances</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px] text-ink">
            {fiche.echeances.map(echeance => (
              <li key={echeance.id}>{echeance.titre}</li>
            ))}
          </ul>
        </Panel>
      )}
    </Screen>
  );
}
