// split-s2-paris-branches.mjs
// Le trajet retour S2 "Nord" (04AhMrhz1dYCHxsI7yJp) traite aujourd'hui Lille comme la
// suite du tronc commun (Bidarray -> Bordeaux -> Paris -> Lille) sans aucun embranchement,
// alors que 3 enfants de ce même trajet rentrent en fait à Nantes (déjà visible côté aller,
// où Nantes est un embranchement de Paris). Pour que Lille et Nantes soient affichés comme
// deux embranchements symétriques à partir de Paris (comme Marseille/Lyon à Toulouse), ce
// script coupe le tronc commun à Paris et transforme Paris->Lille en embranchement, à côté
// d'un nouvel embranchement Paris->Nantes.
//
// Dry-run par défaut : node scripts/split-s2-paris-branches.mjs
// Écriture réelle    : node scripts/split-s2-paris-branches.mjs --apply

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const NORTH_RETOUR_ID = "04AhMrhz1dYCHxsI7yJp";

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const snap = await getDoc(doc(db, "transports", NORTH_RETOUR_ID));
if (!snap.exists()) throw new Error(`Transport introuvable: ${NORTH_RETOUR_ID}`);
const transport = snap.data();
const segments = transport.segments || [];

const parisLille = segments.find((s) => normalized(s.from) === "paris" && normalized(s.to) === "lille");

if (!parisLille) {
  console.log("Segment Paris->Lille introuvable — le trajet a peut-être déjà été scindé.");
  console.log("Segments actuels:", segments.map((s) => `${s.from}->${s.to}`).join(" | "));
  console.log("Branches actuelles:", (transport.branches || []).map((b) => `${b.from}->${b.to}`).join(" | ") || "aucune");
  process.exit(0);
}

const mainSegments = segments.filter((s) => s !== parisLille);

const lilleBranch = {
  id: "s2-retour-paris-lille",
  kind: "branch",
  routeKind: "branch",
  from: "Paris",
  to: "Lille",
  joinsAt: "Paris",
  mode: parisLille.mode || "Train",
  number: "",
  platform: "",
  meetingPoint: parisLille.meetingPoint || "Gare de Paris",
  meetingTime: "",
  departureTime: parisLille.departureTime || "",
  arrivalTime: parisLille.arrivalTime || "",
  estimatedTimes: true,
  stopType: "rdv",
  assignedStaffIds: [],
  instructions: "Séparation à Paris vers Lille. Horaires estimatifs à confirmer après achat des billets.",
};

const nantesBranch = {
  id: "s2-retour-paris-nantes",
  kind: "branch",
  routeKind: "branch",
  from: "Paris",
  to: "Nantes",
  joinsAt: "Paris",
  mode: "Train",
  number: "",
  platform: "",
  meetingPoint: "Gare de Paris Montparnasse",
  meetingTime: "",
  departureTime: "",
  arrivalTime: "",
  estimatedTimes: true,
  stopType: "rdv",
  assignedStaffIds: [],
  instructions: "Séparation à Paris vers Nantes. Horaires estimatifs à confirmer après achat des billets.",
};

const existingBranches = Array.isArray(transport.branches) ? transport.branches : [];
const nextBranches = [
  ...existingBranches.filter((b) => b.id !== lilleBranch.id && b.id !== nantesBranch.id),
  lilleBranch,
  nantesBranch,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} — scission des embranchements Lille/Nantes (S2 retour Nord)`);
console.log("Tronc commun avant:", segments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("Tronc commun après:", mainSegments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("Embranchements après:", nextBranches.map((b) => `${b.from}->${b.to} (joinsAt:${b.joinsAt})`).join(" | "));

if (shouldApply) {
  await updateDoc(doc(db, "transports", NORTH_RETOUR_ID), {
    segments: mainSegments,
    branches: nextBranches,
  });
  console.log("Mise à jour Firebase terminée.");
} else {
  console.log("\nDry-run uniquement — relancez avec --apply pour appliquer.");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const separator = value.indexOf("=");
    if (separator < 0) continue;
    const key = value.slice(0, separator).trim();
    const envValue = value.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = envValue;
  }
}
