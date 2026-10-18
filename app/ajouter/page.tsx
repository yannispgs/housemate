import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { EcheanceForm } from "@/components/ajout/EcheanceForm";
import { FicheForm } from "@/components/ajout/FicheForm";
import { GarantieForm } from "@/components/ajout/GarantieForm";
import { Panel, Screen } from "@/components/Screen";
import { demoEnabled } from "@/demo/mode";
import { categoriesProposees } from "@/lib/data/saisie";
import { enMonNom } from "@/lib/data/server";
import { listerCategories, listerFiches } from "@/lib/data/store";
import { aujourdhuiAParis } from "@/lib/data/today";
import { toISO } from "@/lib/domain/plain-date";

export const metadata: Metadata = { title: "Ajouter" };

const CHOIX = [
  {
    type: "garantie",
    titre: "Une garantie",
    texte: "Un objet acheté, sa facture, et la fin de sa garantie.",
  },
  {
    type: "echeance",
    titre: "Une échéance",
    texte: "Une chose à faire ou à ne pas oublier, une fois ou régulièrement.",
  },
  {
    type: "fiche",
    titre: "Une fiche",
    texte: "Quelque chose que le foyer possède, pour le retrouver.",
  },
] as const;

/**
 * ⚠️ Écran provisoire : l'ajout n'est pas encore dessiné dans Claude Design
 * (`a-dessiner.md`, § 2.2 et 2.3). Il reprend les éléments de la refonte.
 */
export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<{ type?: string }> }>) {
  const { type } = await searchParams;

  if (demoEnabled()) {
    return (
      <Screen title="Ajouter">
        <Panel className="p-[18px]">
          <p className="m-0 text-[14.5px] text-ink-secondary">
            L'ajout demande une connexion : indisponible en démonstration.
          </p>
        </Panel>
      </Screen>
    );
  }

  await connection();
  const aujourdhui = toISO(aujourdhuiAParis());
  const choix = CHOIX.find(c => c.type === type);

  if (choix === undefined) {
    return (
      <Screen title="Ajouter" subtitle="Que veux-tu ajouter ?">
        <div className="flex flex-col gap-2.5">
          {CHOIX.map(c => (
            <Link
              key={c.type}
              href={`/ajouter?type=${c.type}`}
              className="no-underline"
            >
              <Panel className="gap-1.5 p-[18px] hover:bg-grid">
                <span className="font-display text-[17px] text-ink">
                  {c.titre}
                </span>
                <span className="text-[13.5px] leading-normal text-ink-secondary">
                  {c.texte}
                </span>
              </Panel>
            </Link>
          ))}
        </div>
      </Screen>
    );
  }

  const [lues, employees] = await enMonNom(tx =>
    Promise.all([listerFiches(tx), listerCategories(tx)]),
  );
  const fiches = lues.map(f => ({ id: f.id, titre: f.titre }));
  const categories = categoriesProposees(employees);

  return (
    <Screen title={choix.titre} subtitle={choix.texte}>
      <Panel className="p-[18px]">
        {choix.type === "garantie" && (
          <GarantieForm aujourdhui={aujourdhui} categories={categories} />
        )}
        {choix.type === "echeance" && (
          <EcheanceForm
            fiches={fiches}
            aujourdhui={aujourdhui}
            categories={categories}
          />
        )}
        {choix.type === "fiche" && <FicheForm categories={categories} />}
      </Panel>
      <Link
        href="/ajouter"
        className="px-1 text-[13.5px] text-ink-secondary underline"
      >
        Ajouter autre chose
      </Link>
    </Screen>
  );
}
