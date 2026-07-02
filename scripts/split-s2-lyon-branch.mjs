// split-s2-lyon-branch.mjs
// Le trajet retour S2 (southRetour) traite aujourd'hui Lyon comme la suite du tronc
// commun (Bidarray -> Bordeaux -> Toulouse -> Valence -> Lyon) et Marseille comme un
// simple embranchement à Toulouse. Pour que Marseille et Lyon soient affichés comme
// deux embranchements symétriques à partir de Toulouse (demande utilisateur), ce
// script coupe le tronc commun à Toulouse et transforme Toulouse->Valence->Lyon en
// un second embranchement, à côté de celui de Marseille.
//
// Dry-run par défaut : node scripts/split-s2-lyon-branch.mjs
// Écriture réelle    : node scripts/split-s2-lyon-branch.mjs --apply

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const SOUTH_RETOUR_ID = "E032d8KCH3OVHdgy5bA5";

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

const snap = await getDoc(doc(db, "transports", SOUTH_RETOUR_ID));
if (!snap.exists()) throw new Error(`Transport introuvable: ${SOUTH_RETOUR_ID}`);
const transport = snap.data();
const segments = transport.segments || [];

const toulouseValence = segments.find((s) => normalized(s.from) === "toulouse" && normalized(s.to) === "valence");
const valenceLyon     = segments.find((s) => normalized(s.from) === "valence"  && normalized(s.to) === "lyon");

if (!toulouseValence || !valenceLyon) {
  console.log("Segments Toulouse->Valence / Valence->Lyon introuvables — le trajet a peut-être déjà été scindé.");
  console.log("Segments actuels:", segments.map((s) => `${s.from}->${s.to}`).join(" | "));
  console.log("Branches actuelles:", (transport.branches || []).map((b) => `${b.from}->${b.to}`).join(" | ") || "aucune");
  process.exit(0);
}

const mainSegments = segments.filter((s) => s !== toulouseValence && s !== valenceLyon);

const lyonBranch = {
  id: "s2-retour-toulouse-lyon",
  kind: "branch",
  routeKind: "branch",
  from: "Toulouse",
  to: "Lyon",
  joinsAt: "Toulouse",
  mode: valenceLyon.mode || "Train",
  number: "",
  platform: "",
  meetingPoint: toulouseValence.meetingPoint || "Gare de Toulouse Matabiau",
  meetingTime: "",
  departureTime: toulouseValence.departureTime || "",
  arrivalTime: valenceLyon.arrivalTime || "",
  estimatedTimes: true,
  stopType: "rdv",
  assignedStaffIds: [],
  instructions: "Séparation à Toulouse vers Lyon (via Valence). Horaires estimatifs à confirmer après achat des billets.",
  stops: [{
    id: "s2-retour-lyon-branch-stop-valence",
    city: "Valence",
    stopType: valenceLyon.stopType || "quai",
    meetingPoint: valenceLyon.meetingPoint || "",
    arrivalTime: toulouseValence.arrivalTime || "",
    departureTime: valenceLyon.departureTime || "",
    instructions: "",
  }],
};

const existingBranches = Array.isArray(transport.branches) ? transport.branches : [];
const nextBranches = [
  ...existingBranches.filter((b) => b.id !== lyonBranch.id),
  lyonBranch,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} — scission de l'embranchement Lyon (S2 retour)`);
console.log("Tronc commun avant:", segments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("Tronc commun après:", mainSegments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("Embranchements après:", nextBranches.map((b) => `${b.from}->${b.to} (joinsAt:${b.joinsAt})`).join(" | "));

if (shouldApply) {
  await updateDoc(doc(db, "transports", SOUTH_RETOUR_ID), {
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
