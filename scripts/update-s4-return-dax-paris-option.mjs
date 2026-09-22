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
const transportId = "SN9Uc6i88JNkkScxLzcE";
const segmentId = "s4-retour-dax-paris";
const ticketId = "s4-retour-dax-paris-rdx2zhgl-option";

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const segment = (transport.segments || []).find((item) => item.id === segmentId);
if (!segment) throw new Error(`Segment introuvable ${segmentId}`);

const coveredReservationIds = segment.passengerReservationIds || [];
const segments = (transport.segments || []).map((item) => {
  if (item.id !== segmentId) return item;
  return {
    ...item,
    from: "Dax",
    to: "Paris",
    mode: "Train",
    trainType: "Train",
    number: "RDX2ZHGL",
    meetingPoint: "Gare de Dax",
    meetingTime: "",
    departureTime: "12:23",
    arrivalTime: "16:03",
    stopType: "quai",
    passengerReservationIds: coveredReservationIds,
    sharedPickupChildren: 20,
    stops: [],
    instructions: "Retour commun Dax -> Paris Montparnasse pour les enfants Paris/Lyon/Valence. Départ Dax 12:23, arrivée Paris Montparnasse 16:03.",
    scheduleStatus: "option groupe confirmée - paiement en attente",
  };
});

const existingTickets = (transport.tickets || []).filter((ticket) => ticket.id !== ticketId);
const tickets = [
  ...existingTickets,
  {
    id: ticketId,
    segmentId,
    segmentLabel: "Dax > Paris Montparnasse",
    name: "Option groupe RDX2ZHGL - Dax > Paris Montparnasse (25 places)",
    bookingReference: "RDX2ZHGL",
    externalReference: "RDX2ZHGL",
    trainType: "Train",
    trainNumber: "RDX2ZHGL",
    from: "Dax",
    to: "Paris",
    coverageFrom: "Dax",
    coverageTo: "Paris",
    date: "2026-08-28",
    departureTime: "12:23",
    arrivalTime: "16:03",
    seats: 25,
    price: "",
    purchased: false,
    option: true,
    paymentDueAt: "2026-08-18T12:23:00+02:00",
    coveredReservationIds,
    notes: "Créé depuis capture SNCF : 25 places, paiement dû avant le 18/08/2026 à 12:23. Prix non visible sur la capture.",
  },
];

await updateDoc(doc(db, "transports", transportId), {
  departureTime: "12:23",
  trainNumber: "RDX2ZHGL / RANGRJTT",
  segments,
  tickets,
  updatedAt: serverTimestamp(),
});

console.log(JSON.stringify({
  transportId,
  segmentId,
  ticketId,
  coveredReservations: coveredReservationIds.length,
  departureTime: "12:23",
  arrivalParis: "16:03",
  seats: 25,
  paymentDueAt: "2026-08-18T12:23:00+02:00",
}, null, 2));
