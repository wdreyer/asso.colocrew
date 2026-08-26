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

const shouldApply = process.argv.includes("--apply");
const transportId = "SN9Uc6i88JNkkScxLzcE";
const parisSaintPierreSegmentId = "s4-retour-paris-saint-pierre-des-corps-m6arr9";
const staffSegmentId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp";
const staffTicketId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp-visible";
const samStaffId = "cc935297-ef32-4f44-bdf6-9e0b8fbfa12a";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

function withoutDuplicate(items, id) {
  return (items || []).filter((item) => item?.id !== id);
}

function insertAfter(items, afterId, item) {
  const base = withoutDuplicate(items, item.id);
  const index = base.findIndex((entry) => entry?.id === afterId);
  if (index === -1) return [...base, item];
  return [...base.slice(0, index + 1), item, ...base.slice(index + 1)];
}

const staffSegment = {
  id: staffSegmentId,
  from: "Saint-Pierre-des-Corps",
  to: "Bordeaux-Saint-Jean",
  mode: "Train",
  trainType: "TGV INOUI",
  trainNumber: "8449",
  number: "8449",
  date: "2026-08-28",
  meetingPoint: "Saint-Pierre-des-Corps - Sam reste dans le meme train",
  meetingTime: "17:49",
  departureTime: "17:53",
  arrivalTime: "20:06",
  stopType: "quai",
  scheduleStatus: "billet achete",
  assignedStaffIds: [samStaffId],
  passengerReservationIds: [],
  staffOnly: true,
  convoyageDisplay: true,
  instructions:
    "Apres depot de Taha et Yahia Meroual a Saint-Pierre-des-Corps, Sam reste dans le TGV INOUI 8449 et continue vers Bordeaux-Saint-Jean avec son billet staff N9AJBP.",
};

const nextSegments = insertAfter(transport.segments || [], parisSaintPierreSegmentId, staffSegment);
let ticketWasFound = false;
const nextTickets = (transport.tickets || []).map((ticket) => {
  if (ticket.id !== staffTicketId) return ticket;
  ticketWasFound = true;
  return {
    ...ticket,
    segmentId: staffSegmentId,
    segmentLabel: "Saint-Pierre-des-Corps > Bordeaux-Saint-Jean",
    from: "Saint-Pierre-des-Corps",
    to: "Bordeaux-Saint-Jean",
    coverageFrom: "Saint-Pierre-des-Corps",
    coverageTo: "Bordeaux-Saint-Jean",
    coveredReservationIds: [],
    coveredStaffIds: [samStaffId],
    staffOnly: true,
    updatedAt: new Date().toISOString(),
  };
});

if (!ticketWasFound) {
  throw new Error(`Billet visible introuvable: ${staffTicketId}`);
}

const visibleCheck = nextSegments.find((segment) => segment.id === staffSegmentId);
const linkedTickets = nextTickets.filter((ticket) => ticket.segmentId === staffSegmentId);

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - rattachement billet staff Sam a /convoyages`);
console.log(JSON.stringify({
  transportId,
  segment: {
    id: visibleCheck.id,
    route: `${visibleCheck.from} > ${visibleCheck.to}`,
    departureTime: visibleCheck.departureTime,
    arrivalTime: visibleCheck.arrivalTime,
    children: visibleCheck.passengerReservationIds.length,
    staff: visibleCheck.assignedStaffIds.length,
  },
  linkedTickets: linkedTickets.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    segmentId: ticket.segmentId,
    staff: ticket.coveredStaffIds?.length || 0,
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    segments: nextSegments,
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
