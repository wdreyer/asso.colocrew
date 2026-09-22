import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

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
const transportId = "bYO5pWEIqEbFjdNGEp4b";
const segmentId = "s4-retour-dax-toulouse";

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const segments = (transport.segments || []).map((segment) => {
  if (segment.id !== segmentId) return segment;
  return {
    ...segment,
    from: "Dax",
    to: "Toulouse",
    mode: "Train",
    trainType: "Train",
    meetingPoint: "Gare de Toulouse Matabiau",
    meetingTime: "16:30",
    departureTime: "12:42",
    arrivalTime: "16:30",
    stopType: "return",
    instructions: "Retour direct Dax -> Toulouse Matabiau : départ 12:42, récupération familles à Toulouse Matabiau à 16:30.",
    scheduleStatus: "horaire confirmé par capture",
  };
});

await updateDoc(doc(db, "transports", transportId), {
  departureCity: "Dax",
  arrivalCity: "Toulouse",
  departureTime: "12:42",
  arrivalTime: "16:30",
  meetingTime: "16:30",
  meetingPoint: "Gare de Toulouse Matabiau",
  segments,
  updatedAt: serverTimestamp(),
});

console.log(JSON.stringify({
  transportId,
  segmentId,
  departureTime: "12:42",
  arrivalTime: "16:30",
  familyMeetingTime: "16:30",
  passengers: transport.passengers?.length || 0,
}, null, 2));
