import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

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

const snap = await getDocs(collection(db, "transports"));
const transports = snap.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) =>
    transport.date === "2026-08-28"
    || (transport.week === "S4" && transport.direction === "retour")
  )
  .sort((a, b) => String(a.departureCity || "").localeCompare(String(b.departureCity || ""), "fr"));

const output = transports.map((transport) => {
  const segments = [...(transport.segments || []), ...(transport.branches || [])];
  const tickets = transport.tickets || [];
  const segmentRows = segments.map((segment) => {
    const linkedTickets = tickets.filter((ticket) => ticket.segmentId === segment.id);
    const seats = linkedTickets
      .filter((ticket) => ticket.purchased !== false && ticket.option !== true)
      .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
    const optionSeats = linkedTickets
      .filter((ticket) => ticket.option === true || ticket.purchased === false)
      .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
    return {
      id: segment.id,
      route: `${segment.from || "?"} -> ${segment.to || "?"}`,
      times: `${segment.departureTime || "?"}-${segment.arrivalTime || "?"}`,
      passengerCount: (segment.passengerReservationIds || []).length,
      staffCount: (segment.assignedStaffIds || []).length,
      scheduleStatus: segment.scheduleStatus || "",
      ticketSeats: seats,
      optionSeats,
      ticketRefs: linkedTickets.map((ticket) => ({
        id: ticket.id,
        ref: ticket.bookingReference || ticket.externalReference || "",
        seats: ticket.seats || 0,
        purchased: ticket.purchased !== false,
        option: ticket.option === true,
        price: ticket.price || "",
      })),
    };
  });

  return {
    id: transport.id,
    label: `${transport.departureCity || "?"} -> ${transport.arrivalCity || "?"}`,
    week: transport.week,
    direction: transport.direction,
    date: transport.date,
    status: transport.status || "",
    passengers: (transport.passengers || []).length,
    segments: segmentRows,
  };
});

console.log(JSON.stringify(output, null, 2));
