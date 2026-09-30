/**
 * Données de démonstration, reprises de la maquette Claude Design
 * (`Ecran.dc.html` : BASE, DECO, TAILLES, AVENIR, FICHES, récap).
 *
 * ⚠️ Montrées dans les previews et en local SEULEMENT (voir `mode.ts`) : la
 * prod affiche les états vides tant que les vraies données ne sont pas
 * branchées. Le dépôt étant public, ce qui identifierait le foyer (nom de
 * famille, commune, modèle de voiture, marque, variétés exactes) est remplacé
 * par des équivalents neutres.
 *
 * « Aujourd'hui » y est figé au 13 septembre 2026, comme dans la maquette :
 * c'est ce qui rend les captures comparables.
 */
import type { DeadlineView } from "@/lib/ui/deadline";
import type { RecordView } from "@/lib/ui/inventory";
import type { UpcomingItem, UpcomingRow } from "@/lib/ui/upcoming";

export const DEMO_TODAY = "2026-09-13";

type Required = "id" | "title" | "state" | "when" | "verb" | "note";

/** Une échéance de démonstration : seul ce qui s'écarte du cas courant. */
const deadline = (
  fields: Pick<DeadlineView, Required> & Partial<DeadlineView>,
): DeadlineView => ({
  detail: "",
  category: "Jardin",
  recipient: "Moi",
  importance: "memoire",
  raised: false,
  tenure: "souple",
  tone: "neutral",
  icon: "pruning",
  window: null,
  frostRange: null,
  canPostpone: true,
  history: [],
  plants: null,
  ...fields,
});

const history = (...entries: [string, string][]) =>
  entries.map(([date, text]) => ({ date, text }));

export const DEMO_DEADLINES: readonly DeadlineView[] = [
  deadline({
    id: "gel",
    title: "Gel en véranda cette nuit",
    state: "due",
    when: "ce soir",
    recipient: "Foyer",
    verb: "Chauffage lancé",
    note: "notifiée",
    importance: "critique",
    tenure: "ferme",
    tone: "critical",
    icon: "frost",
    frostRange: {
      lowerBound: -3.5,
      estimate: -2,
      margin: 1.5,
      damageThreshold: 0,
      deathThreshold: -5,
      explanation:
        "La fourchette entière passe sous le seuil de dégâts, sans atteindre celui de mort. Deux à trois heures de chauffage suffisent à passer la nuit.",
    },
    history: history(
      ["9 mars", "épisode précédent · chauffage 4 h, minimum relevé −3 °C"],
      ["21 févr.", "chauffage 2 h · aucun dégât constaté"],
      ["seuils", "citronnier : dégâts 0 °C, mort −5 °C"],
    ),
  }),
  deadline({
    id: "ct",
    title: "Contrôle technique — la voiture",
    detail: "2 octobre 2026 · préavis ouvert depuis 41 jours sur 60",
    state: "en préavis",
    when: "dans 19 jours",
    category: "Véhicule",
    recipient: "Parents",
    verb: "Rendez-vous pris",
    note: "récap seulement",
    importance: "important",
    raised: true,
    tenure: "ferme",
    tone: "serious",
    icon: "vehicle",
    window: { percent: 68, text: "41ᵉ jour sur 60" },
    history: history(
      ["2 oct. 2024", "contrôle favorable · 118 400 km"],
      ["4 oct. 2022", "contrôle favorable après reprise des plaquettes"],
    ),
  }),
  deadline({
    id: "garantie",
    title: "Fin de garantie — la télévision",
    detail: "12 mars 2027 · préavis ouvert depuis 12 jours sur 30",
    state: "en préavis",
    when: "dans 18 jours",
    category: "Garanties",
    recipient: "Foyer",
    verb: "Noté",
    note: "écran seulement",
    tone: "warning",
    icon: "warranty",
    window: { percent: 40, text: "12ᵉ jour sur 30" },
    canPostpone: false,
    history: history(
      ["12 mars 2024", "achat · facture jointe à la fiche"],
      ["12 mars 2024", "garantie légale de 3 ans enregistrée"],
    ),
  }),
  deadline({
    id: "engrais",
    title: "Engrais du citronnier",
    detail:
      "Tous les 15 jours d'avril à septembre · dernière fois il y a 17 jours",
    state: "en tolérance",
    when: "depuis 2 jours",
    verb: "Fait",
    note: "écran seulement",
    icon: "fertiliser",
    history: history(
      ["27 août", "fait · engrais agrumes"],
      ["11 août", "fait"],
      ["26 juil.", "fait"],
    ),
  }),
  deadline({
    id: "fanees",
    title: "Fleurs fanées du rosier grimpant",
    detail:
      "Tous les 15 jours de juin à septembre · dernière fois il y a 9 jours",
    state: "due",
    when: "aujourd'hui",
    verb: "Fait",
    note: "écran seulement",
    history: history(["4 sept.", "fait"], ["20 août", "fait"]),
  }),
  deadline({
    id: "tailles",
    title: "Tailles d'automne · 3 plantes",
    detail:
      "Fenêtre du 1er septembre au 30 novembre. Chaque plante se coche séparément ; la tâche se termine quand les trois sont faites.",
    state: "due",
    when: "jusqu'au 30 nov.",
    verb: "Tout est fait",
    note: "récap à l'ouverture et à la fin",
    importance: "normal",
    window: { percent: 14, text: "13ᵉ jour sur 91" },
    canPostpone: false,
    plants: [
      {
        id: "rosier",
        name: "Rosier grimpant",
        instruction:
          "Rabattre d'un tiers les tiges de l'année, supprimer le bois mort.",
        guideUrl: "https://exemple.fr/guides/taille-rosier-grimpant",
        doneOn: "9 sept.",
      },
      {
        id: "laurier",
        name: "Laurier rose",
        instruction:
          "Couper les tiges qui ont fleuri, juste au-dessus d'un nœud.",
        guideUrl: "",
        doneOn: null,
      },
      {
        id: "framboisier",
        name: "Framboisier remontant",
        instruction: "Couper au ras du sol les cannes qui ont donné cet été.",
        guideUrl: "https://exemple.fr/guides/taille-framboisier-remontant",
        doneOn: null,
      },
    ],
  }),
];

/** Ce que l'accueil vide annonce, faute de mieux. */
export const DEMO_NEXT_UP =
  "Le prochain rendez-vous est le 1er octobre : rentrer le citronnier sous abri. Il apparaîtra ici quand son préavis s'ouvrira.";

/** Une échéance d'« À venir » : jardin, souple et normale sauf mention. */
const upcoming = (
  date: string,
  title: string,
  detail: string,
  fields: Partial<UpcomingItem> = {},
): UpcomingItem => ({
  date,
  title,
  detail,
  category: "Jardin",
  importance: "normal",
  raised: false,
  tenure: "souple",
  ...fields,
});

/**
 * Les échéances d'« À venir ». L'importance est ici EFFECTIVE, déjà montée :
 * le contrôle technique (normal, préavis 60 jours, 19 jours restants) est
 * devenu important. Les vraies données passeront par le domaine.
 */
export const DEMO_UPCOMING: readonly UpcomingItem[] = [
  upcoming(
    "2026-09-13",
    "Gel en véranda cette nuit",
    "Citronnier des 4 saisons",
    { importance: "critique", tenure: "ferme" },
  ),
  upcoming(
    "2026-09-13",
    "Fleurs fanées du rosier grimpant",
    "tous les 15 jours de juin à septembre",
  ),
  upcoming(
    "2026-09-01",
    "Tailles d'automne · 3 plantes",
    "jusqu'au 30 nov. · rosier, laurier rose, framboisier",
  ),
  upcoming(
    "2026-09-14",
    "Engrais du citronnier",
    "en tolérance · tous les 15 jours",
  ),
  upcoming(
    "2026-09-28",
    "Engrais du citronnier",
    "dernier passage de la saison",
  ),
  upcoming(
    "2026-10-01",
    "Rentrer le citronnier sous abri",
    "Citronnier des 4 saisons",
  ),
  upcoming(
    "2026-10-02",
    "Contrôle technique — la voiture",
    "préavis ouvert · Parents",
    {
      category: "Véhicule",
      importance: "important",
      raised: true,
      tenure: "ferme",
    },
  ),
  upcoming("2026-10-24", "Venue des parents", "courses, ménage, draps", {
    category: "Occasions",
    tenure: "ferme",
  }),
  upcoming("2026-11-15", "Hivernage du laurier rose", "Laurier rose", {
    importance: "memoire",
  }),
  upcoming("2026-11-20", "Fertiliser le framboisier", "Framboisier remontant", {
    importance: "memoire",
  }),
  upcoming("2026-12-10", "Entretien annuel de la chaudière", "Chaudière", {
    category: "Bricolage",
  }),
  upcoming(
    "2027-01-01",
    "Renouvellement de l'assurance habitation",
    "Assurance habitation",
    { category: "Administratif", tenure: "ferme" },
  ),
  upcoming(
    "2027-03-12",
    "Fin de garantie — la télévision",
    "préavis de 30 jours",
    { category: "Garanties", importance: "memoire" },
  ),
];

const record = (
  title: string,
  nature: RecordView["nature"],
  category: string,
  descriptor: string,
): RecordView => ({ title, nature, category, descriptor });

export const DEMO_RECORDS: readonly RecordView[] = [
  record(
    "Citronnier des 4 saisons",
    "Plante",
    "Jardin",
    "Rentrer sous abri — octobre",
  ),
  record("Rosier grimpant", "Plante", "Jardin", "Plantation — oct. → mars"),
  record("Laurier rose", "Plante", "Jardin", "Hivernage sous abri — novembre"),
  record(
    "Framboisier remontant",
    "Plante",
    "Jardin",
    "Fertilisation — novembre",
  ),
  record("Voiture", "Véhicule", "Véhicule", "Contrôle technique dans 19 jours"),
  record(
    "Télévision",
    "Équipement",
    "Garanties",
    "Fin de garantie dans 18 jours",
  ),
  record("Chaudière", "Équipement", "Bricolage", "Installée dans la maison"),
  record(
    "Assurance habitation",
    "Contrat",
    "Administratif",
    "Couvre la maison",
  ),
  record(
    "Venue des parents",
    "Séjour",
    "Occasions",
    "Grappe : courses, ménage, draps",
  ),
];

/** Une ligne de récap : la date en colonne, le reste comme « À venir ». */
const row = (
  weekday: string,
  dayOfMonth: string,
  item: UpcomingItem,
): UpcomingRow => ({ ...item, weekday, dayOfMonth });

/** Le récap : ce qui vient cette semaine, et ce qui a été fait la dernière. */
export const DEMO_RECAP = {
  coming: [
    row(
      "lun",
      "14",
      upcoming(
        "",
        "Engrais du citronnier",
        "en tolérance depuis 2 jours · tous les 15 jours",
      ),
    ),
    row(
      "mar",
      "15",
      upcoming(
        "",
        "Fleurs fanées du rosier grimpant",
        "tous les 15 jours de juin à septembre",
      ),
    ),
  ],
  comingNote: "Une seule échéance ferme cette semaine. Le reste peut glisser.",
  done: [
    row(
      "dim",
      "13",
      upcoming("", "Gel en véranda", "chauffage 3 h · minimum relevé −1 °C", {
        importance: "critique",
        tenure: "ferme",
      }),
    ),
    row("mer", "09", upcoming("", "Fleurs fanées du rosier", "")),
  ],
} as const;

/** La colonne latérale du bureau, sur l'accueil et le récap. */
export const DEMO_ASIDE = {
  upcoming: [
    { title: "Rentrer le citronnier sous abri", when: "oct." },
    { title: "Hivernage du laurier rose", when: "nov." },
    { title: "Taille du citronnier", when: "mars" },
    { title: "Plantation du rosier", when: "oct. → mars" },
  ],
  notifications:
    "Une seule : le gel en véranda. Les quatre autres échéances restent à l'écran sans rien envoyer.",
} as const;

/** Ce que l'en-tête du bureau dit du foyer (neutralisé : dépôt public). */
export const DEMO_HOUSEHOLD = "Foyer · Démonstration";
