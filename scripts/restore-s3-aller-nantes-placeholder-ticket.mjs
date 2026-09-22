import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "gYSCIzh4y1VbVojTAEzi";
const ticket = {
  id: "s3-aller-nantes-paris-ticket",
  name: "À acheter - Nantes > Paris",
  segmentId: "s3-aller-nantes-paris",
  segmentLabel: "Nantes > Paris",
  from: "Nantes",
  to: "Paris",
  coverageFrom: "Nantes",
  coverageTo: "Paris",
  trainType: "TGV INOUI",
  trainNumber: "12466 / 8916",
  departureTime: "12:09",
  arrivalTime: "14:10",
  seats: 4,
  purchased: false,
  option: false,
  bookingReference: "",
  notes: "Billet à acheter. Besoin actuel : 5 enfants + 1 anim = 6 places.",
  updatedAt: new Date().toISOString(),
};

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
const transport = { id: snap.id, ...snap.data() };
const nextTickets = [...(transport.tickets || []).filter((item) => item.id !== ticket.id && item.segmentId !== ticket.segmentId), ticket];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - placeholder Nantes > Paris`);
if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), { tickets: nextTickets, updatedAt: serverTimestamp() });
  console.log("Firestore mis à jour.");
}
process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
