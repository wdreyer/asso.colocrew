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
const sourcePdf = "C:\\Users\\dreye\\Downloads\\eto-9baaa60c-83e0-412a-9453-767525876896.pdf";

const daxBordeauxSegmentId = "s4-retour-dax-bordeaux";
const bordeauxToulouseSegmentId = "s4-retour-bordeaux-toulouse";
const oldBordeauxToulouseSegmentId = "s4-retour-dax-toulouse";
const ticketId = "s4-retour-dax-bordeaux-sm644846";
const bordeauxToulouseTicketId = "s4-retour-bordeaux-toulouse-bnjmhn";
const storagePath = `transports/${transportId}/billets/2026-08-28-${ticketId}.pdf`;
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

if (!fs.existsSync(sourcePdf)) throw new Error(`PDF introuvable: ${sourcePdf}`);

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const previousBordeauxToulouse = (transport.segments || []).find((item) =>
  item.id === bordeauxToulouseSegmentId || item.id === oldBordeauxToulouseSegmentId
);
if (!previousBordeauxToulouse) throw new Error("Segment Bordeaux > Toulouse introuvable");

const passengerReservationIds = previousBordeauxToulouse.passengerReservationIds || [];
const assignedStaffIds = previousBordeauxToulouse.assignedStaffIds || [];

let url = (transport.tickets || []).find((ticket) => ticket.id === ticketId)?.url || "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePdf), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const daxBordeauxSegment = {
  id: daxBordeauxSegmentId,
  from: "Dax",
  to: "Bordeaux",
  mode: "Train",
  trainType: "TER",
  trainNumber: "87690842",
  number: "87690842",
  departureTime: "09:22",
  arrivalTime: "10:42",
  meetingPoint: "Gare de Dax",
  meetingTime: "09:22",
  stopType: "rdv",
  platform: "",
  passengerReservationIds,
  assignedStaffIds,
  sharedPickupChildren: passengerReservationIds.length,
  stops: [],
  instructions: "TER Nouvelle-Aquitaine Dax -> Bordeaux Saint-Jean. Depart 09:22, arrivee 10:42. Billet TRIBU 40% pour Lamia + 3 enfants.",
  scheduleStatus: "billet achete",
};

const bordeauxToulouseSegment = {
  ...previousBordeauxToulouse,
  id: bordeauxToulouseSegmentId,
  from: "Bordeaux",
  to: "Toulouse",
  mode: "Train",
  trainType: "INTERCITES",
  trainNumber: "4661",
  number: "4661",
  departureTime: "12:10",
  arrivalTime: "14:37",
  meetingPoint: "Toulouse Matabiau - recuperation sur le quai",
  meetingTime: "14:37",
  stopType: "quai",
  familyPickupOnPlatform: true,
  familyPickupNote,
  shortStopMinutes: 5,
  scheduleStatus: "billet achete",
  instructions: "Retour Bordeaux Saint-Jean -> Toulouse Matabiau. INTERCITES 4661, depart 12:10, arrivee 14:37. Toulouse devient une ville etape quai : parents deja presents sur le quai, recuperation en environ 5 minutes.",
};

const nextSegments = [
  daxBordeauxSegment,
  bordeauxToulouseSegment,
  ...(transport.segments || []).filter((item) =>
    ![daxBordeauxSegmentId, bordeauxToulouseSegmentId, oldBordeauxToulouseSegmentId].includes(item.id)
  ),
];

const nextTickets = (transport.tickets || [])
  .filter((item) => item.id !== ticketId)
  .map((item) => {
    if (item.id !== bordeauxToulouseTicketId) return item;
    return {
      ...item,
      segmentId: bordeauxToulouseSegmentId,
      segmentLabel: "Bordeaux Saint-Jean > Toulouse Matabiau",
      from: "Bordeaux",
      to: "Toulouse",
      coverageFrom: "Bordeaux",
      coverageTo: "Toulouse",
    };
  });

nextTickets.push({
  id: ticketId,
  name: "TER Nouvelle-Aquitaine - Dax > Bordeaux Saint-Jean - groupe SM644846",
  segmentId: daxBordeauxSegmentId,
  segmentLabel: "Dax > Bordeaux Saint-Jean",
  from: "Dax",
  to: "Bordeaux",
  coverageFrom: "Dax",
  coverageTo: "Bordeaux",
  date: "2026-08-28",
  departureTime: "09:22",
  arrivalTime: "10:42",
  trainType: "TER",
  trainNumber: "87690842",
  seats: 4,
  price: 73.6,
  bookingReference: "SM644846",
  externalReference: "SM644846",
  eTicketNumbers: ["002286530"],
  seat: "Placement libre TER - billet TRIBU 40%",
  purchased: true,
  option: false,
  url,
  storagePath,
  uploadedFileName: path.basename(sourcePdf),
  coveredReservationIds: passengerReservationIds,
  coveredStaffIds: assignedStaffIds,
  notes: "Billet TER TRIBU 40% Dax -> Bordeaux Saint-Jean du 28/08/2026 pour 4 personnes. Horaires confirmes par capture : Dax 09:22 -> Bordeaux 10:42.",
  updatedAt: new Date().toISOString(),
});

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  transportId,
  nextTransport: {
    departureCity: "Dax",
    arrivalCity: "Toulouse",
    departureTime: "09:22",
    arrivalTime: "14:37",
    segments: nextSegments.map((segment) => ({
      id: segment.id,
      from: segment.from,
      to: segment.to,
      departureTime: segment.departureTime,
      arrivalTime: segment.arrivalTime,
      stopType: segment.stopType,
    })),
  },
  tickets: nextTickets.map((ticket) => ({
    id: ticket.id,
    segmentId: ticket.segmentId,
    ref: ticket.bookingReference,
    from: ticket.from,
    to: ticket.to,
    departureTime: ticket.departureTime,
    arrivalTime: ticket.arrivalTime,
    seats: ticket.seats,
    price: ticket.price,
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    sejourName: "Ete 2026 - S4 - Retour - Dax via Bordeaux et Toulouse",
    departureCity: "Dax",
    arrivalCity: "Toulouse",
    departureTime: "09:22",
    arrivalTime: "14:37",
    meetingPoint: "Gare de Dax",
    meetingTime: "09:22",
    trainType: "Train",
    trainNumber: "",
    segments: nextSegments,
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
