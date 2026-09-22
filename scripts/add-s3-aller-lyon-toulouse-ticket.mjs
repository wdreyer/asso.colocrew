import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "ZE9pRIszXarAjRBoQqhz";
const segmentId = "s3-aller-lyon-toulouse";
const sourcePath = "C:/Users/dreye/Downloads/ticket_Z7SCFQ.pdf";

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

const segmentPassengerIds = (transport.passengers || [])
  .filter((passenger) => ["lyon", "valence", "montpellier", "beziers", "bezier"].includes(normalizeKey(passenger.pickupCity)))
  .map((passenger) => passenger.reservationId)
  .filter(Boolean);

const storagePath = `transports/${transportId}/billets/2026-08-03-s3-aller-lyon-toulouse-z7scfq.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePath), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const ticket = {
  id: "s3-aller-lyon-toulouse-z7scfq",
  name: "TGV INOUI 6823 - Lyon Part Dieu > Toulouse Matabiau - groupe Z7SCFQ",
  url,
  storagePath,
  uploadedFileName: path.basename(sourcePath),
  segmentId,
  segmentLabel: "Lyon Part Dieu > Toulouse Matabiau",
  from: "Lyon",
  to: "Toulouse",
  coverageFrom: "Lyon",
  coverageTo: "Toulouse",
  trainType: "TGV INOUI",
  trainNumber: "6823",
  departureTime: "12:10",
  arrivalTime: "16:20",
  seats: 10,
  price: 1080,
  purchased: true,
  option: false,
  bookingReference: "XNNMQG",
  externalReference: "Z7SCFQ",
  coveredReservationIds: segmentPassengerIds,
  coveredStaffIds: ["ee6ab14e-d0d8-4e97-a85d-b93b5fab12b4"],
  seat: "Voiture 12 Haut - places 269 à 272 et groupe",
  notes: "Billet groupe jeunes, 10 pages dans le PDF. Couvre les enfants montant entre Lyon, Valence, Montpellier, Béziers et Mattéo jusqu'à Toulouse.",
  updatedAt: new Date().toISOString(),
};

const nextTickets = [
  ...(transport.tickets || []).filter((item) => item.id !== ticket.id && item.segmentId !== segmentId),
  ticket,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet groupe S3 aller Lyon > Toulouse`);
console.log(`PDF : ${sourcePath}`);
console.log(`Segment : ${segmentId}`);
console.log(`Places : ${ticket.seats} | enfants couverts : ${segmentPassengerIds.length} | staff couvert : ${ticket.coveredStaffIds.length}`);
console.log(`Référence dossier : ${ticket.bookingReference} | fichier : ${ticket.externalReference}`);

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
