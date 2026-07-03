import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

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
const ref = doc(db, "transports", "2induumArFBxjVCTLaw0");
const snapshot = await getDoc(ref);
if (!snapshot.exists()) throw new Error("Trajet S2 aller sud introuvable.");
const transport = snapshot.data();
let found = false;
const patchPortions = (portions = []) => portions.map((portion) => ({
  ...portion,
  stops: (portion.stops || []).map((stop) => {
    if (normalize(stop.city) !== "montpellier") return stop;
    found = true;
    return { ...stop, meetingTime: "12:15", arrivalTime: "13:03", departureTime: "13:03" };
  }),
}));
const segments = patchPortions(transport.segments);
const branches = patchPortions(transport.branches);
if (!found) throw new Error("Étape Montpellier introuvable dans l’embranchement Marseille → Toulouse.");
await updateDoc(ref, { segments, branches, updatedAt: serverTimestamp() });
console.log("S2 aller Montpellier : RDV corrigé à 12:15 pour un passage du train à 13:03.");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
