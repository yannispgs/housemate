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

export const DEMO_DEADLINES: readonly DeadlineView[] = [
  {
    id: "gel",
    title: "Gel en véranda cette nuit",
    detail: "",
    state: "due",
    when: "ce soir",
    category: "Jardin",
    recipient: "Foyer",
    verb: "Chauffage lancé",
    note: "notifiée",
    importance: "critique",
    raised: false,
    tenure: "ferme",
    tone: "critical",
    icon: "frost",
    window: null,
    frostRange: {
      lowerBound: -3.5,
      estimate: -2,
      margin: 1.5,
      damageThreshold: 0,
      deathThreshold: -5,
      explanation:
        "La fourchette entière passe sous le seuil de dégâts, sans atteindre celui de mort. Deux à trois heures de chauffage suffisent à passer la nuit.",
    },
    canPostpone: true,
    history: [
      {
        date: "9 mars",
        text: "épisode précédent · chauffage 4 h, minimum relevé −3 °C",
      },
      { date: "21 févr.", text: "chauffage 2 h · aucun dégât constaté" },
      { date: "seuils", text: "citronnier : dégâts 0 °C, mort −5 °C" },
    ],
    plants: null,
  },
  {
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
    frostRange: null,
    canPostpone: true,
    history: [
      { date: "2 oct. 2024", text: "contrôle favorable · 118 400 km" },
      {
        date: "4 oct. 2022",
        text: "contrôle favorable après reprise des plaquettes",
      },
    ],
    plants: null,
  },
  {
    id: "garantie",
    title: "Fin de garantie — la télévision",
    detail: "12 mars 2027 · préavis ouvert depuis 12 jours sur 30",
    state: "en préavis",
    when: "dans 18 jours",
    category: "Garanties",
    recipient: "Foyer",
    verb: "Noté",
    note: "écran seulement",
    importance: "memoire",
    raised: false,
    tenure: "souple",
    tone: "warning",
    icon: "warranty",
    window: { percent: 40, text: "12ᵉ jour sur 30" },
    frostRange: null,
    canPostpone: false,
    history: [
      { date: "12 mars 2024", text: "achat · facture jointe à la fiche" },
      { date: "12 mars 2024", text: "garantie légale de 3 ans enregistrée" },
    ],
    plants: null,
  },
  {
    id: "engrais",
    title: "Engrais du citronnier",
    detail:
      "Tous les 15 jours d'avril à septembre · dernière fois il y a 17 jours",
    state: "en tolérance",
    when: "depuis 2 jours",
    category: "Jardin",
    recipient: "Moi",
    verb: "Fait",
    note: "écran seulement",
    importance: "memoire",
    raised: false,
    tenure: "souple",
    tone: "neutral",
    icon: "fertiliser",
    window: null,
    frostRange: null,
    canPostpone: true,
    history: [
      { date: "27 août", text: "fait · engrais agrumes" },
      { date: "11 août", text: "fait" },
      { date: "26 juil.", text: "fait" },
    ],
    plants: null,
  },
  {
    id: "fanees",
    title: "Fleurs fanées du rosier grimpant",
    detail:
      "Tous les 15 jours de juin à septembre · dernière fois il y a 9 jours",
    state: "due",
    when: "aujourd'hui",
    category: "Jardin",
    recipient: "Moi",
    verb: "Fait",
    note: "écran seulement",
    importance: "memoire",
    raised: false,
    tenure: "souple",
    tone: "neutral",
    icon: "pruning",
    window: null,
    frostRange: null,
    canPostpone: true,
    history: [
      { date: "4 sept.", text: "fait" },
      { date: "20 août", text: "fait" },
    ],
    plants: null,
  },
  {
    id: "tailles",
    title: "Tailles d'automne · 3 plantes",
    detail:
      "Fenêtre du 1er septembre au 30 novembre. Chaque plante se coche séparément ; la tâche se termine quand les trois sont faites.",
    state: "due",
    when: "jusqu'au 30 nov.",
    category: "Jardin",
    recipient: "Moi",
    verb: "Tout est fait",
    note: "récap à l'ouverture et à la fin",
    importance: "normal",
    raised: false,
    tenure: "souple",
    tone: "neutral",
    icon: "pruning",
    window: { percent: 14, text: "13ᵉ jour sur 91" },
    frostRange: null,
    canPostpone: false,
    history: [],
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
  },
];

/** La date du jour de la maquette, pour le « faite le » d'une plante. */
export const DEMO_DONE_ON = "13 sept.";

/** Ce que l'accueil vide annonce, faute de mieux. */
export const DEMO_NEXT_UP =
  "Le prochain rendez-vous est le 1er octobre : rentrer le citronnier sous abri. Il apparaîtra ici quand son préavis s'ouvrira.";

/**
 * Les échéances d'« À venir ». L'importance est ici EFFECTIVE, déjà montée :
 * le contrôle technique (normal, préavis 60 jours, 19 jours restants) est
 * devenu important. Les vraies données passeront par le domaine.
 */
export const DEMO_UPCOMING: readonly UpcomingItem[] = [
  {
    date: "2026-09-13",
    title: "Gel en véranda cette nuit",
    detail: "Citronnier des 4 saisons",
    category: "Jardin",
    importance: "critique",
    raised: false,
    tenure: "ferme",
  },
  {
    date: "2026-09-13",
    title: "Fleurs fanées du rosier grimpant",
    detail: "tous les 15 jours de juin à septembre",
    category: "Jardin",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-09-01",
    title: "Tailles d'automne · 3 plantes",
    detail: "jusqu'au 30 nov. · rosier, laurier rose, framboisier",
    category: "Jardin",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-09-14",
    title: "Engrais du citronnier",
    detail: "en tolérance · tous les 15 jours",
    category: "Jardin",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-09-28",
    title: "Engrais du citronnier",
    detail: "dernier passage de la saison",
    category: "Jardin",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-10-01",
    title: "Rentrer le citronnier sous abri",
    detail: "Citronnier des 4 saisons",
    category: "Jardin",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-10-02",
    title: "Contrôle technique — la voiture",
    detail: "préavis ouvert · Parents",
    category: "Véhicule",
    importance: "important",
    raised: true,
    tenure: "ferme",
  },
  {
    date: "2026-10-24",
    title: "Venue des parents",
    detail: "courses, ménage, draps",
    category: "Occasions",
    importance: "normal",
    raised: false,
    tenure: "ferme",
  },
  {
    date: "2026-11-15",
    title: "Hivernage du laurier rose",
    detail: "Laurier rose",
    category: "Jardin",
    importance: "memoire",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-11-20",
    title: "Fertiliser le framboisier",
    detail: "Framboisier remontant",
    category: "Jardin",
    importance: "memoire",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2026-12-10",
    title: "Entretien annuel de la chaudière",
    detail: "Chaudière",
    category: "Bricolage",
    importance: "normal",
    raised: false,
    tenure: "souple",
  },
  {
    date: "2027-01-01",
    title: "Renouvellement de l'assurance habitation",
    detail: "Assurance habitation",
    category: "Administratif",
    importance: "normal",
    raised: false,
    tenure: "ferme",
  },
  {
    date: "2027-03-12",
    title: "Fin de garantie — la télévision",
    detail: "préavis de 30 jours",
    category: "Garanties",
    importance: "memoire",
    raised: false,
    tenure: "souple",
  },
];

export const DEMO_RECORDS: readonly RecordView[] = [
  {
    title: "Citronnier des 4 saisons",
    nature: "Plante",
    category: "Jardin",
    descriptor: "Rentrer sous abri — octobre",
  },
  {
    title: "Rosier grimpant",
    nature: "Plante",
    category: "Jardin",
    descriptor: "Plantation — oct. → mars",
  },
  {
    title: "Laurier rose",
    nature: "Plante",
    category: "Jardin",
    descriptor: "Hivernage sous abri — novembre",
  },
  {
    title: "Framboisier remontant",
    nature: "Plante",
    category: "Jardin",
    descriptor: "Fertilisation — novembre",
  },
  {
    title: "Voiture",
    nature: "Véhicule",
    category: "Véhicule",
    descriptor: "Contrôle technique dans 19 jours",
  },
  {
    title: "Télévision",
    nature: "Équipement",
    category: "Garanties",
    descriptor: "Fin de garantie dans 18 jours",
  },
  {
    title: "Chaudière",
    nature: "Équipement",
    category: "Bricolage",
    descriptor: "Installée dans la maison",
  },
  {
    title: "Assurance habitation",
    nature: "Contrat",
    category: "Administratif",
    descriptor: "Couvre la maison",
  },
  {
    title: "Venue des parents",
    nature: "Séjour",
    category: "Occasions",
    descriptor: "Grappe : courses, ménage, draps",
  },
];

const row = (
  weekday: string,
  dayOfMonth: string,
  item: Omit<UpcomingRow, "weekday" | "dayOfMonth" | "date">,
): UpcomingRow => ({ ...item, weekday, dayOfMonth, date: "" });

/** Le récap : ce qui vient cette semaine, et ce qui a été fait la dernière. */
export const DEMO_RECAP = {
  coming: [
    row("lun", "14", {
      title: "Engrais du citronnier",
      detail: "en tolérance depuis 2 jours · tous les 15 jours",
      category: "Jardin",
      importance: "normal",
      raised: false,
      tenure: "souple",
    }),
    row("mar", "15", {
      title: "Fleurs fanées du rosier grimpant",
      detail: "tous les 15 jours de juin à septembre",
      category: "Jardin",
      importance: "normal",
      raised: false,
      tenure: "souple",
    }),
  ],
  comingNote: "Une seule échéance ferme cette semaine. Le reste peut glisser.",
  done: [
    row("dim", "13", {
      title: "Gel en véranda",
      detail: "chauffage 3 h · minimum relevé −1 °C",
      category: "Jardin",
      importance: "critique",
      raised: false,
      tenure: "ferme",
    }),
    row("mer", "09", {
      title: "Fleurs fanées du rosier",
      detail: "",
      category: "Jardin",
      importance: "normal",
      raised: false,
      tenure: "souple",
    }),
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
