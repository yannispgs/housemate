import { describe, expect, it, vi } from "vitest";
import { plainDate } from "@/lib/domain/plain-date";
import { REGLAGES_CRECHE_PAR_DEFAUT } from "./creche";
import type { AbonneCreche } from "./creche-store";
import { type EnvoiCrecheDeps, envoyerRappelsCreche } from "./envoi-creche";

const MERCREDI_22H = { jour: plainDate(2026, 10, 21), heure: 22 };

function abonne(
  membre: string,
  jours = REGLAGES_CRECHE_PAR_DEFAUT.jours,
): AbonneCreche {
  return {
    membre,
    email: `${membre}@exemple.fr`,
    reglages: { ...REGLAGES_CRECHE_PAR_DEFAUT, jours },
    exceptions: [],
  };
}

function deps(abonnes: AbonneCreche[], reserves = new Set<string>()) {
  const d = {
    abonnes: vi.fn(async () => abonnes),
    pluie: vi.fn(async () => []),
    reserver: vi.fn(async (membre: string, pourLe: string) => {
      const cle = `${membre} ${pourLe}`;

      if (reserves.has(cle)) {
        return false;
      }

      reserves.add(cle);

      return true;
    }),
    liberer: vi.fn(async (membre: string, pourLe: string) => {
      reserves.delete(`${membre} ${pourLe}`);
    }),
    envoyer: vi.fn(async () => {}),
  } satisfies EnvoiCrecheDeps;

  return d;
}

describe("envoyerRappelsCreche", () => {
  it("envoie à chaque abonné dont demain est un jour de crèche", async () => {
    const d = deps([abonne("a"), abonne("b", [3])]);

    expect(await envoyerRappelsCreche(d, MERCREDI_22H)).toEqual({
      envoyes: 1,
      echecs: 0,
    });
    expect(d.reserver).toHaveBeenCalledExactlyOnceWith("a", "2026-10-22");
    expect(d.envoyer).toHaveBeenCalledExactlyOnceWith(
      "a@exemple.fr",
      expect.objectContaining({
        subject: "Crèche demain : la pluie est incertaine",
      }),
    );
  });

  it("se tait pour un foyer qui a retiré ce jour-là", async () => {
    const d = deps([
      { ...abonne("a"), exceptions: [{ jour: "2026-10-22", creche: false }] },
    ]);

    expect(await envoyerRappelsCreche(d, MERCREDI_22H)).toEqual({
      envoyes: 0,
      echecs: 0,
    });
    expect(d.envoyer).not.toHaveBeenCalled();
  });

  it("ne lit pas la pluie quand personne n'attend de rappel", async () => {
    const d = deps([abonne("a")]);

    expect(
      await envoyerRappelsCreche(d, { ...MERCREDI_22H, heure: 20 }),
    ).toEqual({ envoyes: 0, echecs: 0 });
    expect(d.pluie).not.toHaveBeenCalled();
  });

  it("n'envoie pas deux fois le même rappel", async () => {
    const reserves = new Set<string>();
    await envoyerRappelsCreche(deps([abonne("a")], reserves), MERCREDI_22H);
    const second = deps([abonne("a")], reserves);

    expect(await envoyerRappelsCreche(second, MERCREDI_22H)).toEqual({
      envoyes: 0,
      echecs: 0,
    });
    expect(second.envoyer).not.toHaveBeenCalled();
  });

  it("rend la réservation d'un envoi échoué, pour le retenter", async () => {
    const d = deps([abonne("a")]);
    d.envoyer.mockRejectedValueOnce(new Error("SMTP indisponible"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    expect(await envoyerRappelsCreche(d, MERCREDI_22H)).toEqual({
      envoyes: 0,
      echecs: 1,
    });
    expect(d.liberer).toHaveBeenCalledExactlyOnceWith("a", "2026-10-22");
  });
});
