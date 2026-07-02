import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, updateDoc } from "firebase/firestore";

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

const CAPACITY = 55;
const PRICE_PER_DIRECTION = 920;
const IDS = {
  northAller: "UrYWvoqOWbzNcv53DyCS",
  southAller: "2induumArFBxjVCTLaw0",
  southRetour: "E032d8KCH3OVHdgy5bA5",
  northRetour: "04AhMrhz1dYCHxsI7yJp",
};

const transports = {};
for (const [key, id] of Object.entries(IDS)) {
  const snapshot = await getDoc(doc(db, "transports", id));
  if (!snapshot.exists()) throw new Error(`Transport S2 introuvable : ${key} (${id})`);
  transports[key] = { id, ...snapshot.data() };
}
const reservationSnapshot = await getDocs(collection(db, "reservations"));
const reservations = new Map(reservationSnapshot.docs.map((item) => [item.id, item.data()]));

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function passengerKey(passenger) {
  return passenger.reservationId || passenger.id || `${passenger.nom || "?"}-${passenger.childName || "?"}`;
}

function countSharedChildren(items) {
  const unique = new Map();
  items.flatMap((transport) => transport.passengers || []).forEach((passenger) => {
    unique.set(passengerKey(passenger), passenger);
  });
  return [...unique.values()].reduce(
    (total, passenger) => {
      const reservationChildren = reservations.get(passenger.reservationId)?.minor?.children?.length || 0;
      return total + Math.max(passenger.children?.length || 0, reservationChildren, 1);
    },
    0,
  );
}

function isBusSegment(segment, direction) {
  const expectedFrom = direction === "aller" ? "bordeaux" : "bidarray";
  const expectedTo = direction === "aller" ? "bidarray" : "bordeaux";
  return Boolean(segment.sharedBus)
    || normalize(segment.mode) === "autocar"
    || (normalize(segment.from) === expectedFrom && normalize(segment.to) === expectedTo);
}

function ensureBusSegment(transport, direction, sharedChildrenCount) {
  const segments = [...(transport.segments || [])];
  let index = segments.findIndex((segment) => isBusSegment(segment, direction));
  const from = direction === "aller" ? "Bordeaux" : "Bidarray";
  const to = direction === "aller" ? "Bidarray" : "Bordeaux";

  if (index < 0) {
    const segment = {
      id: `s2-${direction}-bus-${normalize(from)}-${normalize(to)}`,
      from,
      to,
      mode: "Autocar",
      number: "",
      departureTime: "",
      arrivalTime: "",
      meetingTime: "",
      meetingPoint: "",
      platform: "",
      stopType: "rdv",
      stops: [],
      assignedStaffIds: [],
    };
    if (direction === "aller") {
      index = segments.findIndex((item) => normalize(item.from) === "bordeaux");
      if (index < 0) index = segments.length;
    } else {
      index = 0;
    }
    segments.splice(index, 0, segment);
  }

  segments[index] = {
    ...segments[index],
    from,
    to,
    mode: "Autocar",
    sharedBus: true,
    sharedBusId: direction === "aller"
      ? "S2-2026-BORDEAUX-MESSANGES-BIDARRAY"
      : "S2-2026-BIDARRAY-MESSANGES-BORDEAUX",
    capacity: CAPACITY,
    sharedCapacity: CAPACITY,
    sharedChildrenCount,
    capacityShortage: Math.max(0, sharedChildrenCount - CAPACITY),
    instructions: direction === "aller"
      ? "Autocar partagé : regroupement à Bordeaux, arrêt à Messanges, puis arrivée à Bidarray."
      : "Autocar partagé : départ de Bidarray, prise en charge à Messanges, puis arrivée à Bordeaux.",
  };

  return { segments, busSegment: segments[index] };
}

function busTicket(transport, busSegment, direction) {
  const tickets = [...(transport.tickets || [])];
  const index = tickets.findIndex((ticket) =>
    ticket.segmentId === busSegment.id
    || normalize(ticket.trainType) === "autocar"
    || normalize(ticket.name).includes("autocar"),
  );
  const current = index >= 0 ? tickets[index] : {};
  const next = {
    ...current,
    id: current.id || `s2-bus-${direction}-ticket`,
    segmentId: busSegment.id,
    segmentLabel: `${busSegment.from} > ${busSegment.to}`,
    from: busSegment.from,
    to: busSegment.to,
    coverageFrom: busSegment.from,
    coverageTo: busSegment.to,
    name: `Autocar S2 ${direction} - 55 places`,
    trainType: "Autocar",
    seats: CAPACITY,
    price: PRICE_PER_DIRECTION,
    purchased: current.purchased ?? false,
    notes: `Autocar de ${CAPACITY} places. Coût total comptabilisé pour le trajet ${direction} : ${PRICE_PER_DIRECTION} € TTC.`,
  };
  if (index >= 0) tickets[index] = next;
  else tickets.push(next);
  return tickets;
}

function withoutDuplicateBusTickets(transport, busSegment) {
  return (transport.tickets || []).filter((ticket) => !(
    ticket.segmentId === busSegment.id
    || normalize(ticket.trainType) === "autocar"
    || normalize(ticket.name).includes("autocar")
  ));
}

const allerChildren = countSharedChildren([transports.northAller, transports.southAller]);
const retourChildren = countSharedChildren([transports.northRetour, transports.southRetour]);

const patches = {};
for (const [key, direction] of [
  ["northAller", "aller"],
  ["southAller", "aller"],
  ["northRetour", "retour"],
  ["southRetour", "retour"],
]) {
  const result = ensureBusSegment(
    transports[key],
    direction,
    direction === "aller" ? allerChildren : retourChildren,
  );
  const ownsDirectionCost = key === "northAller" || key === "northRetour";
  patches[key] = {
    segments: result.segments,
    tickets: ownsDirectionCost
      ? busTicket(transports[key], result.busSegment, direction)
      : withoutDuplicateBusTickets(transports[key], result.busSegment),
  };
  console.log(
    `${key}: ${result.busSegment.from} -> ${result.busSegment.to} · ${CAPACITY} places · `
    + `${direction === "aller" ? allerChildren : retourChildren} enfants · `
    + `${ownsDirectionCost ? `${PRICE_PER_DIRECTION} €` : "coût porté par le convoi Nord"}`,
  );
}

console.log(`Total autocar S2 : ${PRICE_PER_DIRECTION * 2} € (${PRICE_PER_DIRECTION} € aller + ${PRICE_PER_DIRECTION} € retour)`);

if (shouldApply) {
  for (const [key, patch] of Object.entries(patches)) {
    await updateDoc(doc(db, "transports", IDS[key]), patch);
  }
  console.log("Mise à jour Firebase terminée.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const separator = value.indexOf("=");
    if (separator < 0) continue;
    const key = value.slice(0, separator).trim();
    const envValue = value.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = envValue;
  }
}
