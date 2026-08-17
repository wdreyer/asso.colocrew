import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "a3nfZsgZQRhGxPEFvmAn";
const segmentId = "s4-aller-paris-dax-rc9h849i";
const filePath = "C:\\Users\\dreye\\Downloads\\tickets_TZG2HD_Dreyer_UVV5KW.pdf";

const ticket = {
  id: "s4-aller-paris-dax-uvv5kw",
  name: "TGV INOUI 8549 - Paris Montparnasse > Dax - complement 7 places",
  segmentLabel: "Paris Montparnasse > Dax",
  from: "Paris",
  to: "Dax",
  trainType: "TGV INOUI",
  trainNumber: "8549",
  departureTime: "15:56",
  arrivalTime: "19:31",
  seats: 7,
  price: 175,
  bookingReference: "UVV5KW",
  eTicketNumbers: ["901173173", "955912523", "819862593", "771431493", "127251653", "506012354", "349523000"],
  seat: "Voiture 5 bas places 532, 533, 536, 537 ; voiture 6 bas places 600, 601, 603",
  notes: "Complement de 7 billets groupe enfants Paris Montparnasse > Dax du 17/08/2026. Dossier voyage UVV5KW. Prix extrait: 7 x 25 EUR.",
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

const storagePath = `transports/${transportId}/billets/2026-08-17-${ticket.id}.pdf`;
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
  date: "2026-08-17",
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

const nextTickets = [
  ...(transport.tickets || []).filter((item) =>
    item.id !== nextTicket.id
      && item.bookingReference !== nextTicket.bookingReference
      && item.externalReference !== nextTicket.bookingReference
  ),
  nextTicket,
];

const existingSegmentTickets = (transport.tickets || []).filter((item) => item.segmentId === segmentId);
console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet complementaire Paris > Dax UVV5KW`);
console.log(JSON.stringify({
  transportId,
  segmentId,
  existingSeats: existingSegmentTickets.reduce((sum, item) => sum + Number(item.seats || 0), 0),
  addedTicket: {
    id: nextTicket.id,
    ref: nextTicket.bookingReference,
    seats: nextTicket.seats,
    price: nextTicket.price,
    coveredReservations: nextTicket.coveredReservationIds.length,
    coveredStaff: nextTicket.coveredStaffIds.length,
    seat: nextTicket.seat,
  },
  nextSegmentSeats: nextTickets
    .filter((item) => item.segmentId === segmentId && item.purchased !== false && item.option !== true)
    .reduce((sum, item) => sum + Number(item.seats || 0), 0),
}, null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
