import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AjouterPiece } from "@/components/ajout/AjouterPiece";
import { CarnetEntretien } from "@/components/CarnetEntretien";
import { Panel, Screen, SectionLabel } from "@/components/Screen";
import { demoEnabled } from "@/demo/mode";
import { valeurAffichee } from "@/lib/data/fiche-vue";
import { enMonNom } from "@/lib/data/server";
import { lireCarnet, lireFiche } from "@/lib/data/store";
import { NATURE_LABELS } from "@/lib/data/views";

export const metadata: Metadata = { title: "Fiche" };

/**
 * ⚠️ Écran provisoire : la fiche n'est pas encore dessinée dans Claude
 * Design (`a-dessiner.md`, § 2.1). Attributs, pièces jointes, carnet
 * d'entretien, échéances liées ; le reste (frise, archivage) viendra avec sa
 * maquette.
 */
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const id = z.uuid().safeParse((await params).id);

  if (demoEnabled() || !id.success) {
    notFound();
  }

  await connection();
  const [fiche, carnet] = await enMonNom(
    async tx =>
      [await lireFiche(tx, id.data), await lireCarnet(tx, id.data)] as const,
  );

  if (fiche === null) {
    notFound();
  }

  return (
    <Screen
      title={fiche.titre}
      subtitle={[NATURE_LABELS[fiche.nature], fiche.categorie]
        .filter(Boolean)
        .join(" · ")}
    >
      {fiche.attributs.length > 0 && (
        <Panel className="gap-3 p-[18px]">
          <SectionLabel>Informations</SectionLabel>
          <dl className="m-0 flex flex-col gap-2.5">
            {fiche.attributs.map(attribut => (
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

      {carnet.entretien && <CarnetEntretien entrees={carnet.entrees} />}

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
