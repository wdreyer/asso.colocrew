export const DAY_PLAN_STAY = {
  id: "mcsc-s1-2026",
  code: "MCSC",
  week: "S1",
  name: "My Creative Surf Camp",
  startDate: "2026-07-06",
  endDate: "2026-07-17",
};

export const DAY_PLAN_SECTIONS = [
  { key: "breakfast", label: "Petit déjeuner", icon: "☕", color: "#f59e0b" },
  { key: "morning", label: "Activités du matin", icon: "☀️", color: "#0ea5e9" },
  { key: "lunch", label: "Repas du midi", icon: "🥗", color: "#22c55e" },
  { key: "afternoon", label: "Activités de l’après-midi", icon: "🎨", color: "#8b5cf6" },
  { key: "dinner", label: "Dîner", icon: "🍽️", color: "#f97316" },
  { key: "evening", label: "Veillée", icon: "🌙", color: "#6366f1" },
];

export const TASK_TEMPLATES = [
  { label: "Partir de zéro", category: "morning", title: "", startTime: "10:00", endTime: "11:30" },
  { label: "Surf — groupes", category: "morning", title: "Surf", startTime: "09:30", endTime: "11:00", groups: "Groupe 1 et 2", location: "École de surf" },
  { label: "Projet artistique", category: "afternoon", title: "Projet artistique", startTime: "17:00", endTime: "19:00", groups: "Groupes de projets" },
  { label: "Temps calme", category: "afternoon", title: "Temps calme / vie quotidienne", startTime: "14:00", endTime: "15:00" },
  { label: "Repas avec groupe enfants", category: "dinner", title: "Préparation et dîner", startTime: "17:30", endTime: "20:30", groups: "Groupe repas", kitchen: true },
  { label: "Veillée", category: "evening", title: "Veillée", startTime: "21:00", endTime: "22:30" },
];

const ids = {
  noham: "noam-belayane",
  lea: "lea-chaptal",
  william: "william-dreyer",
  romane: "romane-kerveillant",
  elisa: "elisa-peau",
  sofian: "sofian-rhourbaly",
  lolita: "lolita-nom-a-completer",
};

function task(id, category, title, startTime, endTime, extra = {}) {
  return { id, category, title, startTime, endTime, details: "", location: "", groups: "", assigneeIds: [], documents: [], ...extra };
}

const spreadsheetDays = {
  "2026-07-06": [
    task("s1-0607-dinner", "dinner", "Dîner d’arrivée", "19:30", "20:30", { assigneeIds: [ids.william] }),
    task("s1-0607-evening", "evening", "Accueil — Let’s go", "21:00", "22:30", { details: "Accueil, installation et lancement du séjour." }),
  ],
  "2026-07-07": [
    task("s1-0707-breakfast", "breakfast", "Petit déjeuner échelonné", "08:00", "10:00"),
    task("s1-0707-forum", "morning", "Présentation de l’équipe et règles de vie", "10:30", "11:30", { assigneeIds: [ids.romane], location: "Forum", details: "Romane présente. Chaque animateur·ice prend un thème." }),
    task("s1-0707-prono", "morning", "Présentation du petit prono", "11:30", "11:40"),
    task("s1-0707-pyramide", "morning", "Pyramide des défis", "11:40", "12:30", { assigneeIds: [ids.elisa] }),
    task("s1-0707-lunch", "lunch", "À table", "12:30", "13:30", { kitchen: true, menu: "À renseigner", mealLocation: "inside" }),
    task("s1-0707-calm", "afternoon", "Temps calme et installation des mobil-homes", "13:30", "15:00", { details: "Chaque animateur·ice reste dans son mobil-home référent." }),
    task("s1-0707-art", "afternoon", "Présentation des projets artistiques", "15:00", "16:00", { assigneeIds: [ids.romane], details: "Romane présente, puis chaque animateur·ice tient une table pour proposer un projet." }),
    task("s1-0707-icecream", "afternoon", "Glace à Vieux-Boucau", "16:30", "18:30", { groups: "2 groupes — 2 animateur·ices par groupe", location: "Vieux-Boucau" }),
    task("s1-0707-dinner", "dinner", "Dîner et vaisselle collective", "19:30", "20:30", { kitchen: true, groups: "Groupe repas à renseigner", details: "Tout le monde fait sa vaisselle.", mealLocation: "inside" }),
    task("s1-0707-evening", "evening", "Bookmaker", "21:00", "22:30", { assigneeIds: [ids.elisa, ids.noham], location: "Camping — à confirmer" }),
    task("s1-0707-bed", "evening", "Retour dans les mobil-homes", "23:00", "23:15", { details: "Tout le monde dans son mobil-home." }),
  ],
  "2026-07-08": [
    task("s1-0807-breakfast", "breakfast", "Petit déjeuner", "08:00", "10:00"),
    task("s1-0807-morning", "morning", "Grand jeu — Time’s Up", "10:30", "12:00"),
    task("s1-0807-lunch", "lunch", "Repas sur le centre ou pique-nique", "12:30", "13:30", { kitchen: true }),
    task("s1-0807-surf12", "afternoon", "Surf — groupes 1 et 2", "14:00", "15:30", { groups: "Groupes 1 et 2" }),
    task("s1-0807-surf34", "afternoon", "Surf — groupes 3 et 4", "15:30", "17:00", { groups: "Groupes 3 et 4" }),
    task("s1-0807-art", "afternoon", "Préparation projet artistique", "17:15", "19:00"),
    task("s1-0807-dinner", "dinner", "Dîner — groupe 1 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 1" }),
    task("s1-0807-evening", "evening", "Pimp my camp", "21:00", "22:30", { assigneeIds: [ids.noham] }),
  ],
  "2026-07-09": [
    task("s1-0907-morning", "morning", "Grand jeu — Ambassadeurs", "10:30", "12:00", { assigneeIds: [ids.elisa] }),
    task("s1-0907-lunch", "lunch", "Repas sur le centre ou pique-nique", "12:30", "13:30", { kitchen: true }),
    task("s1-0907-surf12", "afternoon", "Surf — groupes 1 et 2", "15:00", "16:30", { groups: "Groupes 1 et 2" }),
    task("s1-0907-surf34", "afternoon", "Surf — groupes 3 et 4", "16:30", "18:00", { groups: "Groupes 3 et 4" }),
    task("s1-0907-art", "afternoon", "Projet artistique", "18:00", "19:00"),
    task("s1-0907-dinner", "dinner", "Dîner — groupe 2 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 2" }),
    task("s1-0907-evening", "evening", "Match ou Loup-garou", "21:00", "22:30", { assigneeIds: [ids.lolita] }),
  ],
  "2026-07-10": [
    task("s1-1007-city", "morning", "Journée ville", "10:00", "18:00", { details: "Rallye photo TikTok, autonomie en ville.", location: "À renseigner" }),
    task("s1-1007-lunch", "lunch", "Repas en autonomie en ville", "12:30", "13:30", { kitchen: false }),
    task("s1-1007-dinner", "dinner", "Repas sur la plage", "19:30", "20:30", { mealLocation: "outside" }),
    task("s1-1007-evening", "evening", "Sunset", "20:30", "22:30", { location: "Plage" }),
  ],
  "2026-07-11": [
    task("s1-1107-lake", "morning", "Journée au lac", "09:30", "17:00", { assigneeIds: [ids.lolita] }),
    task("s1-1107-lunch", "lunch", "Repas sur le centre ou pique-nique", "12:30", "13:30", { kitchen: true }),
    task("s1-1107-surf12", "afternoon", "Surf — groupes 1 et 2", "17:00", "18:30", { groups: "Groupes 1 et 2" }),
    task("s1-1107-surf34", "afternoon", "Surf — groupes 3 et 4", "19:00", "20:30", { groups: "Groupes 3 et 4" }),
    task("s1-1107-dinner", "dinner", "Dîner — groupe 3 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 3" }),
    task("s1-1107-evening", "evening", "Sagamore", "21:00", "22:30", { assigneeIds: [ids.lea] }),
  ],
  "2026-07-12": [
    task("s1-1207-surf12", "morning", "Surf — groupes 1 et 2", "08:00", "09:30", { groups: "Groupes 1 et 2" }),
    task("s1-1207-surf34", "morning", "Surf — groupes 3 et 4", "09:30", "11:00", { groups: "Groupes 3 et 4" }),
    task("s1-1207-lunch", "lunch", "Repas sur le centre ou pique-nique", "12:30", "13:30", { kitchen: true }),
    task("s1-1207-afternoon", "afternoon", "Plage ou grand jeu en forêt", "14:30", "17:00", { details: "Option Pouic-Pouic." }),
    task("s1-1207-art", "afternoon", "Temps libre / chill", "17:00", "19:00"),
    task("s1-1207-dinner", "dinner", "Dîner — groupe 4 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 4" }),
    task("s1-1207-evening", "evening", "Cluedo", "21:00", "22:30", { assigneeIds: [ids.lea, ids.elisa] }),
  ],
  "2026-07-13": [
    task("s1-1307-kohlanta", "morning", "Grand jeu journée — Koh-Lanta", "10:00", "17:00"),
    task("s1-1307-lunch", "lunch", "Salade", "12:30", "13:30", { kitchen: true, menu: "Salade" }),
    task("s1-1307-art", "afternoon", "Préparation projet artistique", "17:00", "19:00"),
    task("s1-1307-dinner", "dinner", "Dîner préparé par les animateur·ices", "19:30", "20:30", { kitchen: true }),
    task("s1-1307-evening", "evening", "Zombies", "21:00", "22:30", { assigneeIds: [ids.elisa] }),
  ],
  "2026-07-14": [
    task("s1-1407-surf12", "morning", "Surf — groupes 1 et 2", "09:30", "11:00", { groups: "Groupes 1 et 2" }),
    task("s1-1407-surf34", "morning", "Surf — groupes 3 et 4", "11:00", "12:30", { groups: "Groupes 3 et 4" }),
    task("s1-1407-lunch", "lunch", "Repas sur le centre ou pique-nique", "12:30", "13:30", { kitchen: true }),
    task("s1-1407-afternoon", "afternoon", "Sardine", "15:00", "17:00"),
    task("s1-1407-art", "afternoon", "Temps libre et chill", "17:00", "19:00"),
    task("s1-1407-dinner", "dinner", "Dîner — groupe 5 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 5" }),
    task("s1-1407-evening", "evening", "Fête du 14 juillet / foot / soirée ville", "21:00", "23:00", { details: "Programme et lieu à confirmer." }),
  ],
  "2026-07-15": [
    task("s1-1507-surf12", "morning", "Surf — groupes 1 et 2", "10:30", "12:00", { groups: "Groupes 1 et 2" }),
    task("s1-1507-surf34", "morning", "Surf — groupes 3 et 4", "12:00", "13:30", { groups: "Groupes 3 et 4" }),
    task("s1-1507-lunch", "lunch", "Repas sur le centre ou pique-nique", "13:30", "14:30", { kitchen: true }),
    task("s1-1507-afternoon", "afternoon", "Tournois", "15:30", "17:30"),
    task("s1-1507-art", "afternoon", "Préparation projet artistique", "17:30", "19:00"),
    task("s1-1507-dinner", "dinner", "Dîner — groupe 6 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 6" }),
    task("s1-1507-evening", "evening", "Fureur / fête foraine / veillée surprise", "21:00", "22:30"),
  ],
  "2026-07-16": [
    task("s1-1607-breakfast", "breakfast", "Brunch", "09:30", "12:00", { kitchen: true }),
    task("s1-1607-lunch", "lunch", "Repas léger / fin du brunch", "12:30", "13:30", { kitchen: true }),
    task("s1-1607-afternoon", "afternoon", "Volley, cartes et activités libres", "15:00", "17:00"),
    task("s1-1607-art", "afternoon", "Finalisation des projets artistiques", "17:00", "19:00"),
    task("s1-1607-dinner", "dinner", "Dîner — groupe 7 avec le chef", "19:30", "20:30", { kitchen: true, groups: "Groupe 7" }),
    task("s1-1607-evening", "evening", "Restitution des projets / Boom", "21:00", "23:00"),
  ],
  "2026-07-17": [
    task("s1-1707-breakfast", "breakfast", "Petit déjeuner et rangement", "08:00", "10:00"),
    task("s1-1707-departure", "morning", "Départ — au revoir les jeunes", "10:00", "12:00"),
  ],
};

export function seedDay(date) {
  return {
    stayId: DAY_PLAN_STAY.id,
    stayCode: DAY_PLAN_STAY.code,
    week: DAY_PLAN_STAY.week,
    date,
    tasks: spreadsheetDays[date] || [],
    leaveMemberIds: [],
    notes: "",
    createdFrom: "Planning acti ColoCrew S1.xlsx",
    updatedAt: new Date().toISOString(),
  };
}

export function dayPlanDates() {
  const dates = [];
  let cursor = new Date(`${DAY_PLAN_STAY.startDate}T12:00:00`);
  const end = new Date(`${DAY_PLAN_STAY.endDate}T12:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
