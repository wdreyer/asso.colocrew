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
const segmentId = "s4-retour-paris-lyon-rangrjtt";
const previousOptionTicketId = "s4-retour-paris-lyon-rangrjtt-option";
const filePath = "C:\\Users\\dreye\\Downloads\\PxEf62yS4KVDnieXkfvWjA.pdf";

const ticket = {
  id: "s4-retour-paris-lyon-8bja4l",
  name: "TGV INOUI 6669 - Paris Gare de Lyon > Lyon Part-Dieu - 10 places",
  segmentLabel: "Paris Gare de Lyon > Lyon Part-Dieu",
  from: "Paris",
  to: "Lyon",
  trainType: "TGV INOUI",
  trainNumber: "6669",
  departureTime: "18:26",
  arrivalTime: "20:22",
  seats: 10,
  price: 342,
  bookingReference: "8BJA4L",
  eTicketNumbers: [
    "983769694",
    "895343440",
    "992975433",
    "188419971",
    "443892884",
    "161702474",
    "800719801",
    "471511231",
    "345363893",
    "724748600",
  ],
  seat: "Voiture 8 bas places 812, 813, 814, 815, 820, 821, 822, 823, 828, 829",
  notes:
    "Billet groupe retour S4 du 28/08/2026. TGV INOUI 6669 Paris Gare de Lyon 18:26 > Lyon Part-Dieu 20:22. Dossier voyage 8BJA4L. Total PDF: 342 EUR.",
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
const storage = getStorage(app);

if (!fs.existsSync(filePath)) throw new Error(`PDF introuvable: ${filePath}`);

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };
const segment = (transport.segments || []).find((item) => item.id === segmentId);
if (!segment) throw new Error(`Segment introuvable: ${segmentId}`);

const storagePath = `transports/${transportId}/billets/2026-08-28-${ticket.id}.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(filePath), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const nextTicket = {
  ...ticket,
  url,
  storagePath,
  uploadedFileName: path.basename(filePath),
  date: "2026-08-28",
  segmentId,
  coverageFrom: ticket.from,
  coverageTo: ticket.to,
  purchased: true,
  option: false,
  externalReference: ticket.bookingReference,
  coveredReservationIds: segment.passengerReservationIds || [],
  coveredStaffIds: segment.assignedStaffIds || [],
  updatedAt: new Date().toISOString(),
};

const nextSegments = (transport.segments || []).map((item) => {
  if (item.id !== segmentId) return item;
  return {
    ...item,
    from: "Paris",
    to: "Lyon",
    mode: "Train",
    trainType: "TGV INOUI",
    number: "6669",
    trainNumber: "6669",
    departureTime: "18:26",
    arrivalTime: "20:22",
    meetingPoint: "Paris Gare de Lyon Hall 1 & 2",
    stopType: "quai",
    scheduleStatus: "billet achete",
    instructions: "Retour Paris Gare de Lyon -> Lyon Part-Dieu. TGV INOUI 6669, depart 18:26, arrivee 20:22.",
  };
});

const nextTickets = [
  ...(transport.tickets || []).filter((item) =>
    item.id !== nextTicket.id
    && item.id !== previousOptionTicketId
    && item.bookingReference !== nextTicket.bookingReference
    && item.externalReference !== nextTicket.bookingReference
  ),
  nextTicket,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet Paris > Lyon 8BJA4L`);
console.log(JSON.stringify({
  transportId,
  segmentId,
  previousTimes: `${segment.departureTime || "?"}-${segment.arrivalTime || "?"}`,
  nextTimes: "18:26-20:22",
  addedTicket: {
    id: nextTicket.id,
    ref: nextTicket.bookingReference,
    seats: nextTicket.seats,
    price: nextTicket.price,
    coveredReservations: nextTicket.coveredReservationIds.length,
    coveredStaff: nextTicket.coveredStaffIds.length,
    seat: nextTicket.seat,
  },
  removedOptionTicketId: previousOptionTicketId,
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    segments: nextSegments,
    tickets: nextTickets,
    trainNumber: "6669",
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
