import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "gYSCIzh4y1VbVojTAEzi";
const segmentId = "s3-aller-nantes-paris";
const sourcePath = "C:/Users/dreye/Downloads/RlNZeB2AjywSIurg2LCTGw.pdf";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const storage = getStorage(app);

if (!fs.existsSync(sourcePath)) throw new Error(`PDF introuvable : ${sourcePath}`);

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
const transport = { id: snap.id, ...snap.data() };
const branch = (transport.branches || []).find((item) => item.id === segmentId) || {};

const coveredReservationIds = (transport.passengers || [])
  .filter((passenger) => normalizeKey(passenger.pickupCity) === "nantes")
  .map((passenger) => passenger.reservationId)
  .filter(Boolean);

const storagePath = `transports/${transportId}/billets/2026-08-03-s3-aller-nantes-paris-b94dqr.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePath), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const ticket = {
  id: "s3-aller-nantes-paris-b94dqr",
  name: "TGV INOUI 12466 - Nantes > Paris Montparnasse - groupe B94DQR",
  url,
  storagePath,
  uploadedFileName: path.basename(sourcePath),
  segmentId,
  segmentLabel: "Nantes > Paris Montparnasse",
  from: "Nantes",
  to: "Paris",
  coverageFrom: "Nantes",
  coverageTo: "Paris",
  trainType: "TGV INOUI",
  trainNumber: "12466",
  departureTime: "12:09",
  arrivalTime: "14:10",
  seats: 10,
  purchased: true,
  option: false,
  bookingReference: "B94DQR",
  externalReference: "RlNZeB2AjywSIurg2LCTGw",
  coveredReservationIds,
  coveredStaffIds: branch.assignedStaffIds || [],
  seat: "Voiture 7 Bas - groupe",
  notes: "Billet groupe, 10 pages dans le PDF. Couvre les enfants de Nantes et l'animatrice jusqu'à Paris Montparnasse.",
  updatedAt: new Date().toISOString(),
};

const nextTickets = [
  ...(transport.tickets || []).filter((item) => item.id !== ticket.id && item.segmentId !== segmentId),
  ticket,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet groupe S3 aller Nantes > Paris`);
console.log(`Places : ${ticket.seats} | enfants couverts : ${coveredReservationIds.length} | staff couvert : ${ticket.coveredStaffIds.length} | dossier ${ticket.bookingReference}`);

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
  });
  console.log("Firestore + Storage mis à jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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
