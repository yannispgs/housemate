import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attributsPlante } from "@/lib/data/plantes";
import {
  evaluateEvening,
  reviewNight,
  sendPending,
} from "../../workers/collecteur/src/frost-run";
import type { Mail } from "../../workers/collecteur/src/frost-watch";
import type { Sql } from "../../workers/collecteur/src/store";
import { DIRECT_URL } from "./env";

/**
 * La veille de gel de bout en bout, contre la base locale, avec les seuls
 * droits de `meteo_veille` : relevés et prévisions sont posés par le
 * propriétaire, tout le reste passe par le rôle de la veille.
 */
const owner = postgres(DIRECT_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
});

let foyer: string;
let auteur: string;

beforeEach(async () => {
  await owner`delete from meteo.nuits_gel_plantes`;
  await owner`delete from meteo.minima_prevus`;
  await owner`delete from meteo.nuits_gel`;
  await owner`delete from meteo.releves`;
  await owner`delete from meteo.previsions`;
  await owner`grant meteo_veille to current_user`;
  // Un seul foyer suivi : les plantes laissées par les autres suites sortent
  // du jeu, archivées.
  await owner`
    update app.fiches set archivee_le = now()
    where nature = 'plante' and archivee_le is null`;
  const [nous] = await owner`
    insert into app.foyers (nom) values ('Nous') returning id`;
  foyer = nous?.id as string;
  const [moi] = await owner`
    insert into app.membres (foyer_id, auth_user_id)
    values (${foyer}, ${`veille-${crypto.randomUUID()}`}) returning id`;
  auteur = moi?.id as string;
});

/**
 * Une fiche de plante, écrite avec les attributs de l'app : la vue de la
 * veille doit les lire tels quels.
 */
async function plante(
  titre: string,
  emplacement: string,
  seuilDegats: number | null,
  { seuilMort = null as number | null, prive = false } = {},
): Promise<string> {
  const attributs = attributsPlante({
    pot: "En pot",
    emplacement,
    seuilDegats,
    seuilMort,
  });
  const [row] = await owner`
    insert into app.fiches (foyer_id, nature, titre, attributs, prive, cree_par)
    values (${foyer}, 'plante', ${titre},
      ${owner.json(attributs as unknown as postgres.JSONValue)}, ${prive},
      ${auteur})
    returning id`;

  return row?.id as string;
}

async function plantes() {
  return owner`
    select titre, emplacement, seuil_degats::float8 as seuil_degats,
      seuil_mort::float8 as seuil_mort, estimation::float8 as estimation,
      borne_basse::float8 as borne_basse, niveau
    from meteo.nuits_gel_plantes where nuit = ${NIGHT}
    order by titre`;
}

async function asWatch<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  return (await owner.begin(async tx => {
    await tx`set local role meteo_veille`;

    return run(tx as unknown as Sql);
  })) as T;
}

// La nuit du 14 au 15 décembre 2026 : Paris est à UTC+1, donc 20 h = 19 h UTC
// et 9 h = 8 h UTC.
const NIGHT = "2026-12-14";
const EVENING = new Date("2026-12-14T19:02:00Z");
const RETRIEVED = "2026-12-14T19:01:00Z";

async function reading(capteur: string, instant: string, temperature: number) {
  await owner`
    insert into meteo.releves (capteur, instant, temperature, origine)
    values (${capteur}, ${instant}, ${temperature}, 'api')`;
}

async function forecast(
  modele: string,
  cible: string,
  temperature: number,
  recuperee = RETRIEVED,
) {
  await owner`
    insert into meteo.previsions (source, modele, recuperee_le, cible, temperature)
    values ('open-meteo', ${modele}, ${recuperee}, ${cible}, ${temperature})`;
}

async function journal() {
  const rows = await owner`
    select alerte, message, estimation::float8 as estimation,
      borne_basse::float8 as borne_basse, prevision_min::float8 as prevision_min,
      prevision_methode, extrapolation, envoyee_le,
      min_exterieur::float8 as min_exterieur, min_veranda::float8 as min_veranda,
      erreur_prevision::float8 as erreur_prevision,
      erreur_modele::float8 as erreur_modele
    from meteo.nuits_gel where nuit = ${NIGHT}`;

  return rows[0];
}

/** Un soir froid : véranda à 4 °C, extérieur à 1 °C, −4 °C annoncé. */
async function coldEvening() {
  await reading("exterieur", "2026-12-14T19:01:00Z", 1);
  await reading("veranda", "2026-12-14T19:01:00Z", 4);
  await forecast("arome", "2026-12-15T05:00:00Z", -4);
  await forecast("icon_d2", "2026-12-15T05:00:00Z", -2);
}

describe("evaluateEvening", () => {
  it("fait la moyenne des modèles, dans la fenêtre de la nuit", async () => {
    await coldEvening();
    // Hors fenêtre (10 h le 15) : ne compte pas, même plus froid.
    await forecast("arome", "2026-12-15T09:00:00Z", -9);
    // Une récupération plus ancienne du même modèle : périmée.
    await forecast(
      "icon_d2",
      "2026-12-15T05:00:00Z",
      -8,
      "2026-12-14T18:01:00Z",
    );

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();
    const detail = await owner`
      select modele, minimum::float8 as minimum, poids::float8 as poids
      from meteo.minima_prevus where nuit = ${NIGHT} order by modele`;

    // Aucun modèle noté : moyenne simple de −4 et −2.
    expect(row?.prevision_min).toBe(-3);
    expect(row?.prevision_methode).toBe(
      "moyenne simple de 2 modèles, pas encore notés",
    );
    expect(detail).toEqual([
      { modele: "arome", minimum: -4, poids: 0.5 },
      { modele: "icon_d2", minimum: -2, poids: 0.5 },
    ]);
  });

  it("pondère par la fiabilité mesurée les nuits précédentes", async () => {
    // Cinq nuits notées : AROME se trompe de 0,5 °C, ICON de 1 °C.
    for (let day = 9; day <= 13; day += 1) {
      const nuit = `2026-12-${day}`;
      await owner`
        insert into meteo.nuits_gel (nuit, seuil_degats, alerte, min_exterieur)
        values (${nuit}, 0, false, 0)`;
      await owner`
        insert into meteo.minima_prevus (nuit, source, modele, minimum, poids)
        values (${nuit}, 'open-meteo', 'arome', -0.5, 0.5),
          (${nuit}, 'open-meteo', 'icon_d2', 1, 0.5)`;
    }
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    // Poids 4 et 1 : 0,8 × −4 + 0,2 × −2 = −3,6.
    expect(row?.prevision_min).toBe(-3.6);
    expect(row?.prevision_methode).toBe(
      "moyenne de 2 modèles sur 2, pondérée par leur fiabilité",
    );
  });

  it("alerte sur le pire cas, et ouvre l'épisode", async () => {
    await plante("Le citronnier", "Véranda", 0, { seuilMort: -5 });
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    // Prévision retenue −3 (moyenne). Δ_aube = 1,66 + 0,39 × 3 + 0,32 × 4
    // = 4,11 → −3 + 4,11 = 1,1 ; extrapolation (−3 < 0,3) : marge du modèle
    // doublée à 2,2. Borne basse : 1,1 − 2,2 − 2 − 3 = −6,1.
    expect(row?.estimation).toBe(1.1);
    expect(row?.extrapolation).toBe("low");
    expect(row?.borne_basse).toBe(-6.1);
    expect(row?.alerte).toBe(true);
    expect(row?.message).toBe("alerte");
    expect(await plantes()).toEqual([
      {
        titre: "Le citronnier",
        emplacement: "Véranda",
        seuil_degats: 0,
        seuil_mort: -5,
        estimation: 1.1,
        borne_basse: -6.1,
        niveau: "alerte",
      },
    ]);
  });

  it("juge chaque plante avec le modèle de son emplacement", async () => {
    await plante("Le citronnier", "Véranda", -10);
    await plante("Le laurier rose", "Extérieur", -10, { seuilMort: -15 });
    await plante("Le rosier", "Extérieur", -20);
    await plante("Le figuier", "Extérieur", null);
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    // Dehors : −3 − 2 − 3 − 1,5 = −9,5, à 0,5 °C du seuil du laurier.
    expect(await plantes()).toEqual([
      expect.objectContaining({ titre: "Le citronnier", niveau: null }),
      expect.objectContaining({
        titre: "Le figuier",
        seuil_degats: null,
        estimation: -3,
        niveau: null,
      }),
      expect.objectContaining({
        titre: "Le laurier rose",
        estimation: -3,
        borne_basse: -9.5,
        niveau: "vigilance",
      }),
      expect.objectContaining({ titre: "Le rosier", niveau: null }),
    ]);
    // La vigilance seule ne fait pas partir de mail.
    expect(await journal()).toMatchObject({ alerte: false, message: null });
  });

  it("ne suit ni « Autre pièce », ni une fiche privée, ni une archivée", async () => {
    await plante("Le ficus", "Salon", 10);
    await plante("Le bonsaï", "Extérieur", 10, { prive: true });
    const archivee = await plante("Le basilic", "Extérieur", 10);
    await owner`update app.fiches set archivee_le = now() where id = ${archivee}`;
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect(await plantes()).toEqual([]);
  });

  it("alerte dehors même quand la véranda est muette", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await plante("Le laurier rose", "Extérieur", -5);
    await forecast("arome", "2026-12-15T05:00:00Z", -3);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect(await journal()).toMatchObject({
      alerte: true,
      message: "alerte",
      estimation: null,
    });
    expect((await plantes()).map(p => [p.titre, p.niveau])).toEqual([
      ["Le citronnier", "indisponible"],
      ["Le laurier rose", "alerte"],
    ]);
  });

  it("prolonge l'épisode par un rappel le lendemain d'une alerte", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte, message)
      values ('2026-12-13', 0, true, 'alerte')`;
    await plante("Le citronnier", "Véranda", 0);
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect((await journal())?.message).toBe("rappel");
  });

  it("se tait par nuit douce", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await reading("exterieur", "2026-12-14T19:01:00Z", 12);
    await reading("veranda", "2026-12-14T19:01:00Z", 18);
    await forecast("arome", "2026-12-15T05:00:00Z", 9);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    expect(row?.alerte).toBe(false);
    expect(row?.message).toBeNull();
  });

  it("dit qu'il ne peut pas décider quand un capteur manque et que la nuit peut geler", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await forecast("arome", "2026-12-15T05:00:00Z", -1);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const row = await journal();

    expect(row?.alerte).toBe(false);
    expect(row?.message).toBe("indisponible");
  });

  it("ignore un relevé d'un autre soir", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await reading("veranda", "2026-12-13T19:01:00Z", 4);
    await forecast("arome", "2026-12-15T05:00:00Z", 8);

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    expect((await journal())?.estimation).toBeNull();
  });

  it("échoue haut et fort sans aucune prévision", async () => {
    await reading("exterieur", "2026-12-14T19:01:00Z", 1);
    await reading("veranda", "2026-12-14T19:01:00Z", 4);

    await expect(
      asWatch(sql => evaluateEvening(sql, NIGHT, EVENING)),
    ).rejects.toThrow("aucune prévision");
  });

  it("n'écrit qu'une fois si 20 h se déclenche deux fois", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await coldEvening();

    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    // Une plante ajoutée entre-temps n'entre pas dans une nuit déjà décidée.
    await plante("Le laurier rose", "Extérieur", -5);
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    const rows = await owner`select count(*)::int as n from meteo.nuits_gel`;

    expect(rows[0]?.n).toBe(1);
    expect(await plantes()).toHaveLength(1);
  });
});

describe("sendPending", () => {
  it("envoie une fois, et une seule", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await plante("Le laurier rose", "Extérieur", -5);
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    const sent: Mail[] = [];

    await asWatch(sql =>
      sendPending(sql, NIGHT, async mail => {
        sent.push(mail);
      }),
    );
    await asWatch(sql =>
      sendPending(sql, NIGHT, async mail => {
        sent.push(mail);
      }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe(
      "Gel possible cette nuit : Le citronnier et Le laurier rose",
    );
    expect(sent[0]?.text).toContain("Véranda : chauffer");
    expect(sent[0]?.text).toContain("Dehors : protéger");
    expect((await journal())?.envoyee_le).toBeInstanceOf(Date);
  });

  it("rend le message à la tentative suivante si l'envoi échoue", async () => {
    await plante("Le citronnier", "Véranda", 0);
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      asWatch(sql =>
        sendPending(sql, NIGHT, async () => {
          throw new Error("relais indisponible");
        }),
      ),
    ).rejects.toThrow("relais indisponible");

    expect((await journal())?.envoyee_le).toBeNull();
  });

  it("n'envoie rien une nuit sans message", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte)
      values (${NIGHT}, 0, false)`;
    let calls = 0;

    await asWatch(sql =>
      sendPending(sql, NIGHT, async () => {
        calls += 1;
      }),
    );

    expect(calls).toBe(0);
  });
});

describe("reviewNight", () => {
  it("mesure les minima de 20 h à 9 h et sépare les deux erreurs", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));
    // Avant 20 h : hors de la nuit, même plus froid.
    await reading("exterieur", "2026-12-14T18:30:00Z", -10);
    await reading("exterieur", "2026-12-15T05:01:00Z", -2);
    await reading("veranda", "2026-12-15T06:01:00Z", 1.2);
    // Après 9 h 30 : le jour, hors de la nuit.
    await reading("veranda", "2026-12-15T10:01:00Z", -5);

    await asWatch(sql => reviewNight(sql, NIGHT));

    const row = await journal();

    // Prévision −3, mesuré −2 : la moyenne était trop froide d'un degré.
    // Modèle avec l'extérieur mesuré : Δ = 1,66 + 1,17 + 0,32 × 3 = 3,79,
    // soit 1,8 prédit pour 1,2 mesuré.
    expect(row?.min_exterieur).toBe(-2);
    expect(row?.min_veranda).toBe(1.2);
    expect(row?.erreur_prevision).toBe(1);
    expect(row?.erreur_modele).toBe(-0.6);
  });

  it("ne fait pas de bilan quand le soir n'avait pas de quoi prédire", async () => {
    await owner`
      insert into meteo.nuits_gel (nuit, seuil_degats, alerte, message, prevision_min)
      values (${NIGHT}, 0, false, 'indisponible', -1)`;
    await reading("exterieur", "2026-12-15T05:01:00Z", -3);

    await asWatch(sql => reviewNight(sql, NIGHT));

    expect((await journal())?.min_exterieur).toBeNull();
  });
});

describe("les droits de la veille", () => {
  it("ne voit des fiches que les plantes suivies, et cinq colonnes", async () => {
    await plante("Le citronnier", "Véranda", 0);

    const vues = await asWatch(
      sql => sql`select * from meteo.plantes_suivies` as Promise<unknown>,
    );

    expect(vues).toEqual([
      expect.objectContaining({
        titre: "Le citronnier",
        emplacement: "Véranda",
      }),
    ]);
    expect(Object.keys((vues as object[])[0] ?? {})).toHaveLength(5);
    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_veille`;
        await tx`select titre from app.fiches`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas déclarer une nuit chauffée : c'est au foyer de le dire", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_veille`;
        await tx`update meteo.nuits_gel set chauffee = true`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas réécrire la décision du soir", async () => {
    await coldEvening();
    await asWatch(sql => evaluateEvening(sql, NIGHT, EVENING));

    await expect(
      owner.begin(async tx => {
        await tx`set local role meteo_veille`;
        await tx`update meteo.nuits_gel set alerte = false`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
