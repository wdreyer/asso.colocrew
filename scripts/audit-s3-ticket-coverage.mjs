import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

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

const [transportSnap, reservationSnap] = await Promise.all([
  getDocs(collection(db, "transports")),
  getDocs(collection(db, "reservations")),
]);
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) => transport.week === "S3")
  .filter((transport) => !isDeletedStatus(transport.status));
const reservations = new Map(reservationSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));

const rows = [];
for (const transport of transports.sort(compareTransport)) {
  const portions = [...(transport.segments || []), ...(transport.branches || [])];
  for (const portion of portions) {
    const passengers = passengersForPortion(transport, portion);
    const childSeats = countPassengerChildren(passengers);
    const staffSeats = (portion.assignedStaffIds || []).length;
    const neededSeats = childSeats + staffSeats;
    const tickets = (transport.tickets || []).filter((ticket) => ticket.segmentId === portion.id);
    const ticketSeats = tickets.reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
    const purchasedSeats = tickets.filter((ticket) => ticket.purchased).reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
    const pdfTickets = tickets.filter((ticket) => Boolean(ticket.url || ticket.downloadURL || ticket.storagePath)).length;
    rows.push({
      transport: transport.sejourName || transport.id,
      direction: transport.direction,
      portionId: portion.id,
      trajet: `${portion.from || "?"} -> ${portion.to || "?"}`,
      horaire: `${portion.departureTime || "?"}-${portion.arrivalTime || "?"}`,
      enfants: childSeats,
      staff: staffSeats,
      besoin: neededSeats,
      billets: tickets.length,
      places: ticketSeats,
      placesAchetees: purchasedSeats,
      pdf: pdfTickets,
      status: ticketSeats >= neededSeats ? "OK" : "MANQUE",
      manque: Math.max(0, neededSeats - ticketSeats),
      tickets: tickets.map((ticket) => ({
        name: ticket.name || ticket.id,
        seats: Number(ticket.seats || 0),
        purchased: Boolean(ticket.purchased),
        pdf: Boolean(ticket.url || ticket.downloadURL || ticket.storagePath),
        bookingReference: ticket.bookingReference || ticket.externalReference || "",
      })),
    });
  }
}

console.log(JSON.stringify({ rows }, null, 2));
process.exit(0);

function passengersForPortion(transport, portion) {
  const ids = Array.isArray(portion.passengerReservationIds) && portion.passengerReservationIds.length
    ? new Set(portion.passengerReservationIds)
    : null;
  if (ids) return (transport.passengers || []).filter((passenger) => ids.has(passenger.reservationId));
  const fromKey = normalizeKey(portion.from);
  const toKey = normalizeKey(portion.to);
  if (transport.direction === "aller") {
    if (toKey === "bordeaux" || toKey === "bidarray") return transport.passengers || [];
    return (transport.passengers || []).filter((passenger) => normalizeKey(passenger.pickupCity) === fromKey);
  }
  if (isBranchPortion(portion)) {
    return (transport.passengers || []).filter((passenger) => normalizeKey(passenger.pickupCity) === toKey);
  }
  if (fromKey === "bidarray" || toKey === "bordeaux" || toKey === "paris" || toKey === "toulouse") {
    return transport.passengers || [];
  }
  return (transport.passengers || []).filter((passenger) => normalizeKey(passenger.pickupCity) === toKey);
}

function isBranchPortion(portion) {
  return portion.kind === "branch" || portion.routeKind === "branch" || Boolean(portion.joinsAt);
}

function countPassengerChildren(passengers) {
  return (passengers || []).reduce((sum, passenger) => {
    const reservation = reservations.get(passenger.reservationId);
    const children = passenger.children?.length ? passenger.children : (reservation?.minor?.children || []);
    return sum + Math.max(children.length || 0, 1);
  }, 0);
}

function compareTransport(a, b) {
  const dateCmp = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCmp) return dateCmp;
  const dirCmp = String(a.direction || "").localeCompare(String(b.direction || ""));
  if (dirCmp) return dirCmp;
  return String(a.sejourName || "").localeCompare(String(b.sejourName || ""), "fr");
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
