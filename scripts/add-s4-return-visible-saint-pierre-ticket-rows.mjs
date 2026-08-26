import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

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

const shouldApply = process.argv.includes("--apply");
const transportId = "SN9Uc6i88JNkkScxLzcE";
const branchSegmentId = "s4-retour-paris-saint-pierre-des-corps-m6arr9";
const meroualId = "2D9PLkzAylHrHC1s3G2w";
const samStaffId = "cc935297-ef32-4f44-bdf6-9e0b8fbfa12a";

const sourceTickets = [
  {
    id: "s4-retour-paris-saint-pierre-m6arr9-taha-meroual",
    filePath: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_TAHA_M6ARR9_DpdDQfRCqpwj1kUQNyeq.pdf",
    name: "TGV INOUI 8449 - Paris Montparnasse > Saint-Pierre-des-Corps - Taha Meroual",
    travelerName: "Taha Meroual",
    segmentId: branchSegmentId,
    from: "Paris",
    to: "Saint-Pierre-des-Corps",
    departureTime: "16:39",
    arrivalTime: "17:49",
    bookingReference: "M6ARR9",
    eTicketNumber: "669706184",
    seat: "Voiture 17 place 747",
    price: 37,
    coveredReservationIds: [meroualId],
    coveredStaffIds: [],
  },
  {
    id: "s4-retour-paris-saint-pierre-m6arr9-yahia-meroual",
    filePath: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_YAHIA_M6ARR9_ZIPO0FCNSpxyrmLWaBTl.pdf",
    name: "TGV INOUI 8449 - Paris Montparnasse > Saint-Pierre-des-Corps - Yahia Meroual",
    travelerName: "Yahia Meroual",
    segmentId: branchSegmentId,
    from: "Paris",
    to: "Saint-Pierre-des-Corps",
    departureTime: "16:39",
    arrivalTime: "17:49",
    bookingReference: "M6ARR9",
    eTicketNumber: "338255741",
    seat: "Voiture 17 place 751",
    price: 74,
    coveredReservationIds: [meroualId],
    coveredStaffIds: [],
  },
  {
    id: "s4-retour-paris-saint-pierre-m6arr9-sam-eyraud",
    filePath: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_EYRAUD_SAM_M6ARR9_PqvnlUo6xm8ymAsiwZo3.pdf",
    name: "TGV INOUI 8449 - Paris Montparnasse > Saint-Pierre-des-Corps - Sam Eyraud",
    travelerName: "Sam Eyraud",
    segmentId: branchSegmentId,
    from: "Paris",
    to: "Saint-Pierre-des-Corps",
    departureTime: "16:39",
    arrivalTime: "17:49",
    bookingReference: "M6ARR9",
    eTicketNumber: "624791804",
    seat: "Voiture 17 place 750",
    price: 74,
    coveredReservationIds: [],
    coveredStaffIds: [samStaffId],
  },
  {
    id: "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp-visible",
    filePath: "C:\\Users\\dreye\\Downloads\\SAINT-PIERRE_DES_CORPS-BORDEAUX-SAINT-JEAN_28-08-26_EYRAUD_SAM_N9AJBP_BrGQOC0L8XwKyAGWUZpx.pdf",
    name: "TGV INOUI 8449 - Saint-Pierre-des-Corps > Bordeaux Saint-Jean - Sam Eyraud",
    travelerName: "Sam Eyraud",
    segmentId: "",
    from: "Saint-Pierre-des-Corps",
    to: "Bordeaux-Saint-Jean",
    departureTime: "17:53",
    arrivalTime: "20:06",
    bookingReference: "N9AJBP",
    eTicketNumber: "272132852",
    seat: "Voiture 17 place 751",
    price: 43,
    coveredReservationIds: [],
    coveredStaffIds: [samStaffId],
    staffOnly: true,
  },
];

for (const ticket of sourceTickets) {
  if (!fs.existsSync(ticket.filePath)) throw new Error(`PDF introuvable: ${ticket.filePath}`);
}

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
const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

async function upload(ticket) {
  const folder = ticket.staffOnly ? "staff-billets" : "billets";
  const storagePath = `transports/${transportId}/${folder}/2026-08-28-${ticket.id}.pdf`;
  if (!shouldApply) return { url: "", storagePath };
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(ticket.filePath), {
    contentType: "application/pdf",
  });
  return { url: await getDownloadURL(uploaded.ref), storagePath };
}

const visibleTickets = [];
for (const ticket of sourceTickets) {
  const uploaded = await upload(ticket);
  visibleTickets.push({
    id: ticket.id,
    name: ticket.name,
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    uploadedFileName: path.basename(ticket.filePath),
    segmentId: ticket.segmentId,
    segmentLabel: `${ticket.from} > ${ticket.to}`,
    from: ticket.from,
    to: ticket.to,
    coverageFrom: ticket.from,
    coverageTo: ticket.to,
    date: "2026-08-28",
    departureTime: ticket.departureTime,
    arrivalTime: ticket.arrivalTime,
    trainType: "TGV INOUI",
    trainNumber: "8449",
    seats: 1,
    price: ticket.price,
    purchased: true,
    option: false,
    bookingReference: ticket.bookingReference,
    externalReference: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    eTicketNumbers: [ticket.eTicketNumber],
    seat: ticket.seat,
    coveredReservationIds: ticket.coveredReservationIds,
    coveredStaffIds: ticket.coveredStaffIds,
    staffOnly: Boolean(ticket.staffOnly),
    notes: `Billet ${ticket.travelerName} du 28/08/2026. ${ticket.from} ${ticket.departureTime} > ${ticket.to} ${ticket.arrivalTime}. Dossier ${ticket.bookingReference}.`,
    updatedAt: new Date().toISOString(),
  });
}

const removedIds = new Set([
  "s4-retour-paris-saint-pierre-des-corps-m6arr9",
  ...visibleTickets.map((ticket) => ticket.id),
]);
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !removedIds.has(ticket.id)),
  ...visibleTickets,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets visibles Paris/Saint-Pierre`);
console.log(JSON.stringify({
  transportId,
  removedGroupedTicket: "s4-retour-paris-saint-pierre-des-corps-m6arr9",
  addedTickets: visibleTickets.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    seat: ticket.seat,
    price: ticket.price,
    segmentId: ticket.segmentId || null,
    children: ticket.coveredReservationIds.length,
    staff: ticket.coveredStaffIds.length,
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
