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
const transportId = "bYO5pWEIqEbFjdNGEp4b";
const segmentId = "s4-retour-toulouse-marseille";

const sourceTickets = [
  {
    id: "s4-retour-toulouse-marseille-afvbet-emma-chacard",
    filePath: "C:\\Users\\dreye\\Downloads\\TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_28-08-26_CHACARD_EMMA_AFVBET_tIzcM0lTg0iotIdlvh5G.pdf",
    name: "INTERCITES 4661 - Toulouse Matabiau > Marseille Saint-Charles - Emma Chacard",
    travelerName: "Emma Chacard",
    coveredType: "child",
    eTicketNumbers: ["216369901"],
    seat: "Voiture 6 place 33",
  },
  {
    id: "s4-retour-toulouse-marseille-afvbet-lamia-fadl",
    filePath: "C:\\Users\\dreye\\Downloads\\TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_28-08-26_FADL_LAMIA_AFVBET_aA2NqxGjVNslsxA3ut6Q.pdf",
    name: "INTERCITES 4661 - Toulouse Matabiau > Marseille Saint-Charles - Lamia Fadl",
    travelerName: "Lamia Fadl",
    coveredType: "staff",
    eTicketNumbers: ["706080300"],
    seat: "Voiture 6 place 34",
  },
];

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

for (const ticket of sourceTickets) {
  if (!fs.existsSync(ticket.filePath)) throw new Error(`PDF introuvable: ${ticket.filePath}`);
}

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };
const segmentSource = (transport.segments || []).some((item) => item.id === segmentId) ? "segments" : "branches";
const segment = (transport[segmentSource] || []).find((item) => item.id === segmentId);
if (!segment) throw new Error(`Segment introuvable: ${segmentId}`);

const updatedSegment = (item) => ({
  ...item,
  from: "Toulouse",
  to: "Marseille",
  mode: "Train",
  trainType: "INTERCITES",
  number: "4661",
  trainNumber: "4661",
  departureTime: "14:45",
  arrivalTime: "18:37",
  meetingPoint: "Toulouse Matabiau",
  stopType: "quai",
  scheduleStatus: "billet achete",
  instructions: "Retour Toulouse Matabiau -> Marseille Saint-Charles. INTERCITES 4661, depart 14:45, arrivee 18:37.",
});

const nextSegments = (transport.segments || []).map((item) => {
  if (item.id !== segmentId) return item;
  return updatedSegment(item);
});

const nextBranches = (transport.branches || []).map((item) => {
  if (item.id !== segmentId) return item;
  return updatedSegment(item);
});

const nextTickets = [];
for (const ticket of sourceTickets) {
  const storagePath = `transports/${transportId}/billets/2026-08-28-${ticket.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(ticket.filePath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }

  nextTickets.push({
    id: ticket.id,
    name: ticket.name,
    segmentId,
    segmentLabel: "Toulouse Matabiau > Marseille Saint-Charles",
    from: "Toulouse",
    to: "Marseille",
    coverageFrom: "Toulouse",
    coverageTo: "Marseille",
    date: "2026-08-28",
    departureTime: "14:45",
    arrivalTime: "18:37",
    trainType: "INTERCITES",
    trainNumber: "4661",
    seats: 1,
    price: 70,
    bookingReference: "AFVBET",
    externalReference: "AFVBET",
    eTicketNumbers: ticket.eTicketNumbers,
    seat: ticket.seat,
    purchased: true,
    option: false,
    url,
    storagePath,
    uploadedFileName: path.basename(ticket.filePath),
    coveredReservationIds: ticket.coveredType === "child" ? (segment.passengerReservationIds || []) : [],
    coveredStaffIds: ticket.coveredType === "staff" ? (segment.assignedStaffIds || []) : [],
    notes: `Billet retour S4 du 28/08/2026 pour ${ticket.travelerName}. INTERCITES 4661 Toulouse Matabiau 14:45 > Marseille Saint-Charles 18:37. Dossier voyage AFVBET.`,
    updatedAt: new Date().toISOString(),
  });
}

const nextTicketIds = new Set(nextTickets.map((ticket) => ticket.id));
const existingTickets = (transport.tickets || []).filter((ticket) => !nextTicketIds.has(ticket.id));
const tickets = [...existingTickets, ...nextTickets];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets Toulouse > Marseille AFVBET`);
console.log(JSON.stringify({
  transportId,
  segmentId,
  previousTimes: `${segment.departureTime || "?"}-${segment.arrivalTime || "?"}`,
  nextTimes: "14:45-18:37",
  addedTickets: nextTickets.map((ticket) => ({
    id: ticket.id,
    ref: ticket.bookingReference,
    seats: ticket.seats,
    price: ticket.price,
    eTicketNumbers: ticket.eTicketNumbers,
    coveredReservations: ticket.coveredReservationIds.length,
    coveredStaff: ticket.coveredStaffIds.length,
    seat: ticket.seat,
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    segments: nextSegments,
    branches: nextBranches,
    tickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
