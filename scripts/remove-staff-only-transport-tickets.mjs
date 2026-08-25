import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

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

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);

const snapshot = await getDocs(collection(db, "transports"));

const isStaffOnlyTicket = (ticket) => {
  const staffCount = Array.isArray(ticket.coveredStaffIds) ? ticket.coveredStaffIds.length : 0;
  const reservationCount = Array.isArray(ticket.coveredReservationIds) ? ticket.coveredReservationIds.length : 0;
  return staffCount > 0 && reservationCount === 0;
};

const isStaffOnlyTransport = (transport) => {
  const passengers = Array.isArray(transport.passengers) ? transport.passengers : [];
  const tickets = Array.isArray(transport.tickets) ? transport.tickets : [];
  const segments = Array.isArray(transport.segments) ? transport.segments : [];
  const staff = Array.isArray(transport.staff) ? transport.staff : [];

  return (
    passengers.length === 0 &&
    staff.length > 0 &&
    tickets.length > 0 &&
    tickets.every(isStaffOnlyTicket) &&
    segments.every((segment) => {
      const reservationIds = Array.isArray(segment.passengerReservationIds) ? segment.passengerReservationIds : [];
      return reservationIds.length === 0;
    })
  );
};

const deletedTransports = [];
const updatedTransports = [];

for (const item of snapshot.docs) {
  const transport = { id: item.id, ...item.data() };
  const tickets = Array.isArray(transport.tickets) ? transport.tickets : [];
  const staffOnlyTickets = tickets.filter(isStaffOnlyTicket);
  if (!staffOnlyTickets.length) continue;

  if (isStaffOnlyTransport(transport)) {
    deletedTransports.push({
      id: transport.id,
      sejourName: transport.sejourName,
      tickets: staffOnlyTickets.map((ticket) => ({
        id: ticket.id,
        name: ticket.name,
        trainNumber: ticket.trainNumber,
        from: ticket.from,
        to: ticket.to,
        departureTime: ticket.departureTime,
        arrivalTime: ticket.arrivalTime,
      })),
    });

    if (shouldApply) {
      await deleteDoc(doc(db, "transports", transport.id));
    }
    continue;
  }

  const nextTickets = tickets.filter((ticket) => !isStaffOnlyTicket(ticket));
  updatedTransports.push({
    id: transport.id,
    sejourName: transport.sejourName,
    removedTickets: staffOnlyTickets.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      trainNumber: ticket.trainNumber,
      from: ticket.from,
      to: ticket.to,
      departureTime: ticket.departureTime,
      arrivalTime: ticket.arrivalTime,
    })),
  });

  if (shouldApply) {
    await updateDoc(doc(db, "transports", transport.id), {
      tickets: nextTickets,
      updatedAt: serverTimestamp(),
    });
  }
}

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - retrait billets staff des trajets`);
console.log(JSON.stringify({ deletedTransports, updatedTransports }, null, 2));

if (shouldApply) console.log("Firestore mis a jour.");
