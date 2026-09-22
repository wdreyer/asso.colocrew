import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "gYSCIzh4y1VbVojTAEzi";

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

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const staffBySegment = new Map(
  [...(transport.segments || []), ...(transport.branches || [])].map((portion) => [portion.id, portion.assignedStaffIds || []]),
);

const ticketSpecs = [
  {
    sourcePath: "C:/Users/dreye/Downloads/ticket_ZV41RC (1).pdf",
    id: "s3-aller-lille-paris-zv41rc",
    segmentId: "s3-aller-lille-paris",
    name: "TGV INOUI 7520 - Lille Europe > Paris Nord - groupe ZV41RC",
    from: "Lille",
    to: "Paris",
    trainNumber: "7520",
    departureTime: "13:02",
    arrivalTime: "14:32",
    seats: 12,
    price: 330,
    bookingReference: "VUYCG9",
    externalReference: "ZV41RC",
    coveredReservationIds: idsForCity("Lille"),
    notes: "Billet groupe jeunes, 12 pages dans le PDF. Couvre les 10 enfants de Lille et les 2 animateurs jusqu'à Paris.",
  },
  {
    sourcePath: "C:/Users/dreye/Downloads/ticket_NA5WY9.pdf",
    id: "s3-aller-paris-bordeaux-na5wy9",
    segmentId: "s3-aller-paris-bordeaux",
    name: "TGV INOUI 8449 - Paris Montparnasse > Bordeaux Saint-Jean - groupe NA5WY9",
    from: "Paris",
    to: "Bordeaux",
    trainNumber: "8449",
    departureTime: "16:39",
    arrivalTime: "20:06",
    seats: 43,
    price: 2021,
    bookingReference: "R43NZ4",
    externalReference: "NA5WY9",
    coveredReservationIds: (transport.passengers || []).map((passenger) => passenger.reservationId).filter(Boolean),
    notes: "Billet groupe, 43 pages dans le PDF. Couvre le convoi Nord/Ouest Paris → Bordeaux.",
  },
];

const uploadedTickets = [];
for (const spec of ticketSpecs) {
  if (!fs.existsSync(spec.sourcePath)) throw new Error(`PDF introuvable : ${spec.sourcePath}`);
  const storagePath = `transports/${transportId}/billets/2026-08-03-${spec.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(spec.sourcePath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }
  uploadedTickets.push({
    ...spec,
    url,
    storagePath,
    uploadedFileName: path.basename(spec.sourcePath),
    segmentLabel: `${spec.from} > ${spec.to}`,
    coverageFrom: spec.from,
    coverageTo: spec.to,
    trainType: "TGV INOUI",
    purchased: true,
    option: false,
    coveredStaffIds: staffBySegment.get(spec.segmentId) || [],
    updatedAt: new Date().toISOString(),
  });
}

const replacingSegmentIds = new Set(uploadedTickets.map((ticket) => ticket.segmentId));
const replacingIds = new Set(uploadedTickets.map((ticket) => ticket.id));
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !replacingIds.has(ticket.id) && !replacingSegmentIds.has(ticket.segmentId)),
  ...uploadedTickets,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets groupe S3 aller Nord/Ouest`);
for (const ticket of uploadedTickets) {
  console.log(`- ${ticket.name} | ${ticket.departureTime} -> ${ticket.arrivalTime} | places ${ticket.seats} | enfants ${ticket.coveredReservationIds.length} | staff ${ticket.coveredStaffIds.length} | dossier ${ticket.bookingReference}`);
}

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

function idsForCity(city) {
  const key = normalizeKey(city);
  return (transport.passengers || [])
    .filter((passenger) => normalizeKey(passenger.pickupCity) === key)
    .map((passenger) => passenger.reservationId)
    .filter(Boolean);
}

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
