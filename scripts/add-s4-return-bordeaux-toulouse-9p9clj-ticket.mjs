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
const segmentId = "s4-retour-dax-toulouse";
const sourcePdf = "C:\\Users\\dreye\\Downloads\\Nrqa3jS_Pm5G7EJ9dG34gQ.pdf";

const ticketId = "s4-retour-bordeaux-toulouse-9p9clj";
const storagePath = `transports/${transportId}/billets/2026-08-25-${ticketId}.pdf`;
const familyPickupNote = "Toulouse est une ville etape : les parents doivent etre presents directement sur le quai avant l'arrivee du train. Arret tres court, environ 5 minutes pour recuperer les enfants.";

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

if (!fs.existsSync(sourcePdf)) {
  throw new Error(`PDF introuvable: ${sourcePdf}`);
}

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const segment = (transport.segments || []).find((item) => item.id === segmentId);
if (!segment) throw new Error(`Segment introuvable: ${segmentId}`);

let url = (transport.tickets || []).find((ticket) => ticket.id === ticketId)?.url || "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePdf), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const toulousePickupReservationIds = (transport.passengers || [])
  .filter((passenger) => String(passenger.returnCity || passenger.dropoffCity || "").toLowerCase() === "toulouse")
  .map((passenger) => passenger.reservationId)
  .filter(Boolean);

const updatedSegments = (transport.segments || []).map((item) => {
  if (item.id !== segmentId) return item;
  return {
    ...item,
    from: "Bordeaux",
    to: "Toulouse",
    mode: "Train",
    trainType: "INTERCITES",
    number: "4661",
    trainNumber: "4661",
    departureTime: "12:10",
    arrivalTime: "14:37",
    meetingTime: "14:37",
    meetingPoint: "Toulouse Matabiau - recuperation sur le quai",
    stopType: "quai",
    scheduleStatus: "billet achete",
    familyPickupOnPlatform: true,
    familyPickupNote,
    shortStopMinutes: 5,
    instructions: "Retour Bordeaux Saint-Jean -> Toulouse Matabiau. INTERCITES 4661, depart 12:10, arrivee 14:37. Toulouse devient une ville etape quai : parents deja presents sur le quai, recuperation en environ 5 minutes.",
  };
});

const updatedBranches = (transport.branches || []).map((item) => {
  if (item.id !== "s4-retour-toulouse-marseille") return item;
  return {
    ...item,
    from: "Toulouse",
    to: "Marseille",
    mode: "Train",
    trainType: "INTERCITES",
    number: "4661",
    trainNumber: "4661",
    departureTime: "14:45",
    arrivalTime: "18:37",
    meetingPoint: "Toulouse Matabiau - continuation dans le meme train",
    stopType: "quai",
    scheduleStatus: "billet achete",
    instructions: "Continuation Toulouse Matabiau -> Marseille Saint-Charles dans l'INTERCITES 4661, depart 14:45, arrivee 18:37.",
  };
});

const ticket = {
  id: ticketId,
  name: "INTERCITES 4661 - Bordeaux Saint-Jean > Toulouse Matabiau - groupe 9P9CLJ",
  segmentId,
  segmentLabel: "Bordeaux Saint-Jean > Toulouse Matabiau",
  from: "Bordeaux",
  to: "Toulouse",
  coverageFrom: "Bordeaux",
  coverageTo: "Toulouse",
  date: "2026-08-25",
  transportDate: transport.date || "2026-08-28",
  departureTime: "12:10",
  arrivalTime: "14:37",
  trainType: "INTERCITES",
  trainNumber: "4661",
  seats: 10,
  price: 87.2,
  bookingReference: "9P9CLJ",
  externalReference: "9P9CLJ",
  eTicketNumbers: [
    "870475633",
    "374712482",
    "474431264",
    "999916491",
    "430118410",
    "722730331",
    "221960191",
    "544973650",
    "869945052",
    "742045594",
  ],
  seat: "Voiture 6 places 41, 42, 43, 44, 45, 46, 48, 51, 52, 56",
  purchased: true,
  option: false,
  url,
  storagePath,
  uploadedFileName: path.basename(sourcePdf),
  coveredReservationIds: segment.passengerReservationIds || [],
  coveredStaffIds: segment.assignedStaffIds || [],
  notes: "PDF date du mardi 25/08/2026. Billet groupe INTERCITES 4661 Bordeaux Saint-Jean 12:10 -> Toulouse Matabiau 14:37. Toulouse est une ville etape quai pour les familles Toulouse.",
  updatedAt: new Date().toISOString(),
};

const existingTickets = (transport.tickets || []).filter((item) => item.id !== ticketId);
const tickets = [...existingTickets, ticket];

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  transportId,
  segmentId,
  previous: {
    from: segment.from,
    to: segment.to,
    departureTime: segment.departureTime,
    arrivalTime: segment.arrivalTime,
    stopType: segment.stopType,
  },
  next: {
    from: "Bordeaux",
    to: "Toulouse",
    departureTime: "12:10",
    arrivalTime: "14:37",
    stopType: "quai",
    familyPickupNote,
    toulousePickupReservationIds,
  },
  ticket: {
    id: ticket.id,
    date: ticket.date,
    ref: ticket.bookingReference,
    seats: ticket.seats,
    price: ticket.price,
    coveredReservations: ticket.coveredReservationIds.length,
    coveredStaff: ticket.coveredStaffIds.length,
    storagePath,
  },
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    sejourName: "Ete 2026 - S4 - Retour - Bordeaux vers Toulouse",
    departureCity: "Bordeaux",
    arrivalCity: "Toulouse",
    departureTime: "12:10",
    arrivalTime: "14:37",
    meetingTime: "14:37",
    meetingPoint: "Toulouse Matabiau - recuperation sur le quai",
    trainType: "INTERCITES",
    trainNumber: "4661",
    familyPickupOnPlatform: true,
    familyPickupNote,
    shortStopMinutes: 5,
    segments: updatedSegments,
    branches: updatedBranches,
    tickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
