import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "a3nfZsgZQRhGxPEFvmAn";
const sourceTickets = [
  {
    id: "s4-aller-lyon-paris-5zws5n",
    filePath: "C:\\Users\\dreye\\Downloads\\ticket_M1WBGE.pdf",
    segmentId: "s4-aller-lyon-paris-rgfpn18b",
    name: "TGV INOUI 6616 - Lyon Part Dieu > Paris Gare de Lyon",
    segmentLabel: "Lyon Part Dieu > Paris Gare de Lyon",
    from: "Lyon",
    to: "Paris",
    trainNumber: "6616",
    departureTime: "11:34",
    arrivalTime: "13:30",
    seats: 10,
    price: 360,
    bookingReference: "5ZWS5N",
    notes: "Billets groupe du 17/08/2026. 10 places en voiture 8 bas, places 810, 811, 814 a 821. Fichier recu sous le nom ticket_M1WBGE.pdf.",
  },
  {
    id: "s4-aller-paris-dax-jq4mhh",
    filePath: "C:\\Users\\dreye\\Downloads\\ticket_IZTUGV.pdf",
    segmentId: "s4-aller-paris-dax-rc9h849i",
    name: "TGV INOUI 8549 - Paris Montparnasse > Dax",
    segmentLabel: "Paris Montparnasse > Dax",
    from: "Paris",
    to: "Dax",
    trainNumber: "8549",
    departureTime: "15:56",
    arrivalTime: "19:31",
    seats: 20,
    price: 735,
    bookingReference: "JQ4MHH",
    notes: "Billets groupe du 17/08/2026. 20 places en voiture 5 bas, places 500 a 519. Fichier recu sous le nom ticket_IZTUGV.pdf.",
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

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const uploadedTickets = [];
for (const item of sourceTickets) {
  if (!fs.existsSync(item.filePath)) throw new Error(`PDF introuvable: ${item.filePath}`);
  const segment = (transport.segments || []).find((candidate) => candidate.id === item.segmentId);
  if (!segment) throw new Error(`Segment introuvable: ${item.segmentId}`);
  const storagePath = `transports/${transportId}/billets/2026-08-17-${item.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(item.filePath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }
  uploadedTickets.push({
    id: item.id,
    name: item.name,
    url,
    storagePath,
    uploadedFileName: path.basename(item.filePath),
    date: "2026-08-17",
    segmentId: item.segmentId,
    segmentLabel: item.segmentLabel,
    from: item.from,
    to: item.to,
    coverageFrom: item.from,
    coverageTo: item.to,
    trainType: "TGV INOUI",
    trainNumber: item.trainNumber,
    departureTime: item.departureTime,
    arrivalTime: item.arrivalTime,
    seats: item.seats,
    price: item.price,
    purchased: true,
    option: false,
    bookingReference: item.bookingReference,
    externalReference: item.bookingReference,
    coveredReservationIds: segment.passengerReservationIds || [],
    coveredStaffIds: segment.assignedStaffIds || [],
    notes: item.notes,
    updatedAt: new Date().toISOString(),
  });
}

const replacedSegmentIds = new Set(sourceTickets.map((item) => item.segmentId));
const replacedTicketIds = new Set(sourceTickets.flatMap((item) => [
  item.id,
  item.segmentId === "s4-aller-lyon-paris-rgfpn18b" ? "s4-aller-lyon-paris-rgfpn18b" : "",
  item.segmentId === "s4-aller-paris-dax-rc9h849i" ? "s4-aller-paris-dax-rc9h849i" : "",
]).filter(Boolean));
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) =>
    !replacedSegmentIds.has(ticket.segmentId)
      && !replacedTicketIds.has(ticket.id)
      && !["RGFPN18B", "RC9H849I"].includes(ticket.bookingReference || ticket.externalReference || ticket.reference || "")
  ),
  ...uploadedTickets,
];

const nextSegments = (transport.segments || []).map((segment) => {
  const ticket = uploadedTickets.find((item) => item.segmentId === segment.id);
  if (!ticket) return segment;
  return {
    ...segment,
    trainType: "TGV INOUI",
    number: ticket.trainNumber,
    scheduleStatus: "billet achete",
  };
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets aller Lyon/Paris/Dax`);
console.log(JSON.stringify(uploadedTickets.map((ticket) => ({
  id: ticket.id,
  segmentId: ticket.segmentId,
  ref: ticket.bookingReference,
  seats: ticket.seats,
  price: ticket.price,
  coveredReservations: ticket.coveredReservationIds.length,
})), null, 2));

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    tickets: nextTickets,
    segments: nextSegments,
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
