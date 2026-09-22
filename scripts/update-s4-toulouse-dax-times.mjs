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
const transportId = "Ibr1tfH35ACGlbJbJR4B";
const segmentId = "s4-aller-toulouse-dax";

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const segments = (transport.segments || []).map((segment) => {
  if (segment.id !== segmentId) return segment;
  return {
    ...segment,
    from: "Toulouse",
    to: "Dax",
    meetingPoint: "Gare de Toulouse Matabiau",
    meetingTime: "14:31",
    departureTime: "15:31",
    arrivalTime: "19:08",
    stopType: "rdv",
    instructions: "RDV parents à Toulouse Matabiau à 14:31, départ 15:31, arrivée Dax 19:08.",
    scheduleStatus: "horaire confirmé par capture",
  };
});

await updateDoc(doc(db, "transports", transportId), {
  departureCity: "Toulouse",
  arrivalCity: "Dax",
  departureTime: "15:31",
  arrivalTime: "19:08",
  meetingTime: "14:31",
  meetingPoint: "Gare de Toulouse Matabiau",
  segments,
  updatedAt: serverTimestamp(),
});

console.log(JSON.stringify({
  transportId,
  segmentId,
  meetingTime: "14:31",
  departureTime: "15:31",
  arrivalTime: "19:08",
  passengers: transport.passengers?.length || 0,
}, null, 2));
