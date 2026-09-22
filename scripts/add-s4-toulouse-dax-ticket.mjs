import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "Ibr1tfH35ACGlbJbJR4B";
const segmentId = "s4-aller-toulouse-dax";
const sourcePdf = "C:\\Users\\dreye\\Downloads\\ToulouseDAX.pdf";

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
const segment = (transport.segments || []).find((item) => item.id === segmentId);
if (!segment) throw new Error(`Segment introuvable: ${segmentId}`);

const storagePath = `transports/${transportId}/billets/2026-08-17-s4-aller-toulouse-dax-wc530652.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePdf), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const coveredReservationIds = segment.passengerReservationIds || [];
const coveredStaffIds = segment.assignedStaffIds || [];

const toulouseDaxTicket = {
  id: "s4-aller-toulouse-dax-wc530652",
  name: "TER liO 872735 + TER NA L52 - Toulouse Matabiau > Dax",
  url,
  storagePath,
  uploadedFileName: path.basename(sourcePdf),
  date: "2026-08-17",
  segmentId,
  segmentLabel: "Toulouse Matabiau > Pau > Dax",
  from: "Toulouse",
  to: "Dax",
  coverageFrom: "Toulouse",
  coverageTo: "Dax",
  trainType: "TER",
  trainNumber: "872735 + L52",
  departureTime: "15:31",
  arrivalTime: "19:08",
  seats: 4,
  price: 108.2,
  purchased: true,
  option: false,
  bookingReference: "WC530652",
  externalReference: "WC530652",
  fare: "TRIBU 40%",
  coveredReservationIds,
  coveredStaffIds,
  passengerSummary: "3 adultes et 1 enfant",
  eTicketNumber: "002274096",
  notes: "Billet TRIBU 40% Toulouse Matabiau > Dax du 17/08/2026. TER liO 872735 Toulouse 15:31 > Pau 18:02, correspondance 13 min, TER NA L52 Pau 18:15 > Dax 19:08.",
  updatedAt: new Date().toISOString(),
};

const nextSegments = (transport.segments || []).map((item) => {
  if (item.id !== segmentId) return item;
  return {
    ...item,
    from: "Toulouse",
    to: "Dax",
    mode: "Train",
    trainType: "TER",
    number: "872735 + L52",
    meetingPoint: "Gare de Toulouse Matabiau",
    meetingTime: "14:31",
    departureTime: "15:31",
    arrivalTime: "19:08",
    stopType: "rdv",
    scheduleStatus: "billet achete",
    instructions: "RDV parents a Toulouse Matabiau a 14:31. Train liO 872735 Toulouse 15:31 > Pau 18:02, correspondance 13 min, TER NA L52 Pau 18:15 > Dax 19:08.",
    stops: [
      {
        id: "s4-aller-toulouse-dax-pau",
        city: "Pau",
        arrivalTime: "18:02",
        departureTime: "18:15",
        meetingTime: "",
        meetingPoint: "Gare de Pau",
        stopType: "correspondance",
        instructions: "Correspondance de 13 min a Pau entre le train liO 872735 et le TER NA L52.",
      },
    ],
  };
});

const existingTickets = (transport.tickets || []).filter((ticket) =>
  ticket.id !== toulouseDaxTicket.id && ticket.segmentId !== segmentId
);
const nextTickets = [...existingTickets, toulouseDaxTicket];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet Toulouse > Dax`);
console.log(JSON.stringify({
  transportId,
  segmentId,
  coveredReservationIds,
  coveredStaffIds,
  ticket: {
    reference: toulouseDaxTicket.bookingReference,
    seats: toulouseDaxTicket.seats,
    price: toulouseDaxTicket.price,
    storagePath,
  },
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    departureCity: "Toulouse",
    arrivalCity: "Dax",
    departureTime: "15:31",
    arrivalTime: "19:08",
    meetingTime: "14:31",
    meetingPoint: "Gare de Toulouse Matabiau",
    segments: nextSegments,
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
