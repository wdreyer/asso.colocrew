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
const segmentId = "s4-retour-paris-lyon-rangrjtt";
const ticketId = "s4-retour-paris-lyon-rangrjtt-option";

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
    from: "Paris",
    to: "Lyon",
    mode: "Train",
    trainType: "Train",
    number: "RANGRJTT",
    meetingPoint: "Paris Gare de Lyon Hall 1 & 2",
    meetingTime: "",
    departureTime: "17:52",
    arrivalTime: "19:54",
    stopType: "quai",
    sharedDropoffChildren: 5,
    passengerReservationIds: coveredReservationIds,
    stops: [],
    instructions: "À Paris, les enfants Lyon/Valence quittent le groupe Paris et prennent le Paris Gare de Lyon -> Lyon Part-Dieu RANGRJTT.",
    scheduleStatus: "option groupe confirmée - paiement en attente",
  };
});

const existingTickets = (transport.tickets || []).filter((ticket) => ticket.id !== ticketId);
const tickets = [
  ...existingTickets,
  {
    id: ticketId,
    segmentId,
    segmentLabel: "Paris Gare de Lyon Hall 1 & 2 > Lyon Part-Dieu",
    name: "Option groupe RANGRJTT - Paris Gare de Lyon > Lyon Part-Dieu (10 places)",
    bookingReference: "RANGRJTT",
    externalReference: "RANGRJTT",
    trainType: "Train",
    trainNumber: "RANGRJTT",
    from: "Paris",
    to: "Lyon",
    coverageFrom: "Paris",
    coverageTo: "Lyon",
    date: "2026-08-28",
    departureTime: "17:52",
    arrivalTime: "19:54",
    seats: 10,
    price: "",
    purchased: false,
    option: true,
    paymentDueAt: "2026-08-18T17:52:00+02:00",
    coveredReservationIds,
    notes: "Créé depuis capture SNCF : 10 places, paiement dû avant le 18/08/2026 à 17:52. Prix non visible sur la capture.",
  },
];

await updateDoc(doc(db, "transports", transportId), {
  segments,
  tickets,
  trainNumber: "RANGRJTT",
  updatedAt: serverTimestamp(),
});

console.log(JSON.stringify({
  transportId,
  segmentId,
  ticketId,
  coveredReservations: coveredReservationIds.length,
  departureTime: "17:52",
  arrivalLyon: "19:54",
  seats: 10,
  paymentDueAt: "2026-08-18T17:52:00+02:00",
}, null, 2));
