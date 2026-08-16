import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";

loadEnv(".env.local");

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const stay = {
  id: "mcsc-s4-2026",
  code: "MCSC",
  week: "S4",
  name: "My Creative Surf Camp",
  startDate: "2026-08-17",
  endDate: "2026-08-28",
};
const createdFrom = "Planning surf prestataire S4 2026";
const details = "Activite normale. Planning prestataire S4 importe depuis Planning MY Creative SURF Camp - aout 2026.";

const surfByDate = {
  "2026-08-19": [
    surfTask("s4-1908-surf-1230-g12", "12:30", "14:00", "Groupes 1 et 2"),
    surfTask("s4-1908-surf-1400-g34", "14:00", "15:30", "Groupes 3 et 4"),
  ],
  "2026-08-20": [
    surfTask("s4-2008-surf-1300-g34", "13:00", "14:30", "Groupes 3 et 4"),
    surfTask("s4-2008-surf-1430-g12", "14:30", "16:00", "Groupes 1 et 2"),
  ],
  "2026-08-22": [
    surfTask("s4-2208-surf-1700-g12", "17:00", "18:30", "Groupes 1 et 2"),
    surfTask("s4-2208-surf-1830-g34", "18:30", "20:00", "Groupes 3 et 4"),
  ],
  "2026-08-23": [
    surfTask("s4-2308-surf-1800-g34", "18:00", "19:30", "Groupes 3 et 4"),
    surfTask("s4-2308-surf-1930-g12", "19:30", "21:00", "Groupes 1 et 2"),
  ],
  "2026-08-25": [
    surfTask("s4-2508-surf-0930-g12", "09:30", "11:00", "Groupes 1 et 2"),
    surfTask("s4-2508-surf-1100-g34", "11:00", "12:30", "Groupes 3 et 4"),
  ],
  "2026-08-26": [
    surfTask("s4-2608-surf-1130-g34", "11:30", "13:00", "Groupes 3 et 4"),
    surfTask("s4-2608-surf-1300-g12", "13:00", "14:30", "Groupes 1 et 2"),
  ],
};

const updated = [];

for (const [date, surfTasks] of Object.entries(surfByDate)) {
  const ref = doc(db, "day_plans", `${stay.id}-${date}`);
  const snap = await getDoc(ref);
  const current = snap.exists()
    ? { id: snap.id, ...snap.data() }
    : seedDay(date);
  const baseTasks = current.tasks?.length ? current.tasks : seedDay(date).tasks;
  const nextTasks = sortTasks([
    ...baseTasks.filter((item) => !isGenericOrSurfActivity(item)),
    ...surfTasks,
  ]);
  await setDoc(ref, {
    ...current,
    stayId: stay.id,
    stayCode: stay.code,
    week: stay.week,
    date,
    tasks: nextTasks,
    createdFrom,
    updatedAt: new Date().toISOString(),
    updatedBy: "codex",
  }, { merge: true });
  updated.push({
    date,
    surf: surfTasks.map((item) => `${item.startTime}-${item.endTime} ${item.groups}`),
    totalTasks: nextTasks.length,
  });
}

console.log(JSON.stringify({ updated }, null, 2));
process.exit(0);

function surfTask(id, startTime, endTime, groups) {
  const hour = Number(startTime.split(":")[0]);
  return task(id, hour < 12 ? "morning" : "afternoon", `Surf - ${groups.toLowerCase()}`, startTime, endTime, {
    groups,
    location: "Ecole de surf",
    details,
  });
}

function seedDay(date) {
  return {
    stayId: stay.id,
    stayCode: stay.code,
    week: stay.week,
    date,
    tasks: basicTasks(date),
    leaveMemberIds: [],
    notes: "",
    createdFrom,
    updatedAt: new Date().toISOString(),
  };
}

function basicTasks(date) {
  const isFirst = date === stay.startDate;
  const isLast = date === stay.endDate;
  const key = `mcsc-s4-${date.slice(8, 10)}${date.slice(5, 7)}`;
  if (isFirst) {
    return [
      task(`${key}-dinner`, "dinner", "Diner d'arrivee", "19:30", "20:30", { kitchen: true, groups: "Tous les groupes" }),
      task(`${key}-evening`, "evening", "Accueil, installation et lancement du sejour", "21:00", "22:30", { details: "Presentation de l'equipe, regles de vie et installation." }),
    ];
  }
  if (isLast) {
    return [
      task(`${key}-breakfast`, "breakfast", "Petit dejeuner et rangement", "08:00", "10:00", { kitchen: true }),
      task(`${key}-departure`, "morning", "Depart du groupe", "10:00", "12:00", { details: "Inventaire, rangement et departs." }),
    ];
  }
  return [
    task(`${key}-breakfast`, "breakfast", "Petit dejeuner", "08:00", "09:30", { kitchen: true }),
    task(`${key}-morning`, "morning", "Activite principale / projets", "10:00", "12:00", { details: "Creneau a completer selon le planning d'activites." }),
    task(`${key}-lunch`, "lunch", "Repas du midi", "12:30", "13:30", { kitchen: true }),
    task(`${key}-afternoon`, "afternoon", "Activites ColoCrew / surf / grand jeu", "14:30", "17:30", { groups: "Groupes a renseigner", details: "Deroule a preciser par l'equipe." }),
    task(`${key}-projects`, "afternoon", "Temps projets / vie quotidienne", "17:30", "19:00"),
    task(`${key}-dinner`, "dinner", "Diner", "19:30", "20:30", { kitchen: true }),
    task(`${key}-evening`, "evening", "Veillee a construire", "21:00", "22:30"),
  ];
}

function task(id, category, title, startTime, endTime, extra = {}) {
  return { id, category, title, startTime, endTime, details: "", location: "", groups: "", assigneeIds: [], documents: [], ...extra };
}

function isGenericOrSurfActivity(item) {
  if (!["morning", "afternoon"].includes(item.category)) return false;
  return /Activite principale|Temps projets|surf|grand jeu/i.test(`${item.title || ""} ${item.details || ""}`);
}

function sortTasks(items) {
  return [...items].sort((left, right) =>
    `${left.startTime || "99:99"}-${left.title || ""}`.localeCompare(`${right.startTime || "99:99"}-${right.title || ""}`, "fr"),
  );
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
