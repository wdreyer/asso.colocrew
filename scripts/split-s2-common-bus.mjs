import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, writeBatch,
} from "firebase/firestore";

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

const IDS = {
  northAller: "UrYWvoqOWbzNcv53DyCS",
  southAller: "2induumArFBxjVCTLaw0",
  northRetour: "04AhMrhz1dYCHxsI7yJp",
  southRetour: "E032d8KCH3OVHdgy5bA5",
  busAller: "s2-2026-bus-aller-final",
  busRetour: "s2-2026-bus-retour-commun",
};

const transports = {};
for (const [key, id] of Object.entries(IDS).filter(([key]) => !key.startsWith("bus"))) {
  const snapshot = await getDoc(doc(db, "transports", id));
  if (!snapshot.exists()) throw new Error(`Transport introuvable : ${key} (${id})`);
  transports[key] = { id, ...snapshot.data() };
}
const existingBusAller = await getDoc(doc(db, "transports", IDS.busAller));
const existingBusRetour = await getDoc(doc(db, "transports", IDS.busRetour));
const reservationSnapshot = await getDocs(collection(db, "reservations"));
const reservations = new Map(reservationSnapshot.docs.map((item) => [item.id, item.data()]));

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function passengerKey(passenger) {
  return passenger.reservationId || passenger.id || `${passenger.nom || "?"}-${passenger.childName || "?"}`;
}

function uniquePassengers(...groups) {
  const result = new Map();
  groups.flat().forEach((passenger) => result.set(passengerKey(passenger), passenger));
  return [...result.values()];
}

function stayCode(passenger) {
  if (passenger.stayCode || passenger.camp) return String(passenger.stayCode || passenger.camp).toUpperCase();
  const reservation = reservations.get(passenger.reservationId) || {};
  const name = `${reservation.sejourName || ""} ${reservation.sejour?.name || ""}`.toLowerCase();
  if (name.includes("surf") || name.includes("mcsc")) return "MCSC";
  if (name.includes("eaux") || name.includes("evcc")) return "EVCC";
  return "";
}

function childCount(passengers) {
  return passengers.reduce((sum, passenger) => {
    const reservationChildren = reservations.get(passenger.reservationId)?.minor?.children?.length || 0;
    return sum + Math.max(passenger.children?.length || 0, reservationChildren, 1);
  }, 0);
}

function isBusSegment(segment) {
  const endpoints = [normalize(segment.from), normalize(segment.to)];
  return Boolean(segment.sharedBus)
    || normalize(segment.mode) === "autocar"
    || (endpoints.includes("bordeaux") && endpoints.includes("bidarray"));
}

function withoutBus(transport, direction) {
  const busIds = new Set((transport.segments || []).filter(isBusSegment).map((segment) => segment.id));
  const segments = (transport.segments || []).filter((segment) => !busIds.has(segment.id));
  const tickets = (transport.tickets || []).filter((ticket) =>
    !busIds.has(ticket.segmentId)
    && normalize(ticket.trainType) !== "autocar"
    && !normalize(ticket.name).includes("autocar"),
  );
  const first = segments[0] || {};
  const last = segments.at(-1) || {};
  return {
    segments,
    tickets,
    departureCity: direction === "retour" ? "Bordeaux" : transport.departureCity,
    arrivalCity: direction === "aller" ? "Bordeaux" : transport.arrivalCity,
    departureTime: direction === "retour" ? first.departureTime || "" : transport.departureTime || first.departureTime || "",
    arrivalTime: direction === "aller" ? last.arrivalTime || "" : transport.arrivalTime || last.arrivalTime || "",
    passengers: (transport.passengers || []).map((passenger) => ({
      ...passenger,
      ...(direction === "aller" ? { dropoffCity: "Bordeaux" } : { pickupCity: "Bordeaux" }),
    })),
    updatedAt: serverTimestamp(),
  };
}

const allerPassengers = uniquePassengers(
  transports.northAller.passengers || [],
  transports.southAller.passengers || [],
);
const retourPassengers = uniquePassengers(
  transports.northRetour.passengers || [],
  transports.southRetour.passengers || [],
);
const allerMcsc = allerPassengers.filter((passenger) => stayCode(passenger) === "MCSC");
const allerEvcc = allerPassengers.filter((passenger) => stayCode(passenger) === "EVCC");
const retourMcsc = retourPassengers.filter((passenger) => stayCode(passenger) === "MCSC");
const retourEvcc = retourPassengers.filter((passenger) => stayCode(passenger) === "EVCC");

const oldAllerBusTicket = [
  ...(transports.northAller.tickets || []),
  ...(transports.southAller.tickets || []),
  ...(existingBusAller.data()?.tickets || []),
].find((ticket) => normalize(ticket.trainType) === "autocar" || normalize(ticket.name).includes("autocar"));
const oldRetourBusTicket = [
  ...(transports.northRetour.tickets || []),
  ...(transports.southRetour.tickets || []),
  ...(existingBusRetour.data()?.tickets || []),
].find((ticket) => normalize(ticket.trainType) === "autocar" || normalize(ticket.name).includes("autocar"));

function commonStaff(...items) {
  const rows = uniquePassengers(...items.map((transport) => transport.staff || []));
  return rows;
}

const allerSegmentId = "s2-bus-aller-bordeaux-bidarray";
const retourSegmentId = "s2-bus-retour-bidarray-bordeaux";
const busAller = {
  sejourName: "Transport commun S2 – MCSC / EVCC",
  direction: "aller",
  routeGroup: "direct",
  week: "S2",
  date: "2026-07-20",
  departureCity: "Bordeaux",
  arrivalCity: "Bidarray",
  departureTime: "20:30",
  arrivalTime: "00:40",
  arrivalDateOffset: 1,
  trainType: "Autocar",
  trainNumber: "",
  meetingPoint: "Gare Bordeaux Saint-Jean – côté Belcier",
  meetingTime: "20:15",
  platform: "",
  capacity: 55,
  status: existingBusAller.data()?.status || "brouillon",
  routeLabel: "Trajet final commun",
  sharedConnection: true,
  coverageExcluded: true,
  notes: "Trajet final commun aux convois Nord et Est/Ouest. Arrivée à Bidarray le 21 juillet à 00:40.",
  passengers: allerPassengers.map((passenger) => ({
    ...passenger,
    pickupCity: "Bordeaux",
    dropoffCity: stayCode(passenger) === "MCSC" ? "Messanges" : "Bidarray",
    stayCode: stayCode(passenger),
  })),
  staff: existingBusAller.data()?.staff || commonStaff(transports.northAller, transports.southAller),
  leadStaffId: existingBusAller.data()?.leadStaffId || "",
  branches: [],
  segments: [{
    id: allerSegmentId,
    from: "Bordeaux",
    to: "Bidarray",
    mode: "Autocar",
    departureTime: "20:30",
    arrivalTime: "00:40",
    arrivalDateOffset: 1,
    meetingTime: "20:15",
    meetingPoint: "Gare Bordeaux Saint-Jean – côté Belcier",
    stopType: "rdv",
    sharedBus: true,
    sharedBusId: "S2-2026-BORDEAUX-MESSANGES-BIDARRAY",
    capacity: 55,
    sharedCapacity: 55,
    sharedChildrenCount: childCount(allerPassengers),
    assignedStaffIds: existingBusAller.data()?.segments?.[0]?.assignedStaffIds || [],
    stops: [{
      id: "s2-bus-aller-stop-messanges",
      city: "Messanges",
      arrivalTime: "22:45",
      departureTime: "23:05",
      stopType: "rdv",
      meetingPoint: "Centre MCSC – point de dépose à confirmer",
      sharedDropoffChildren: childCount(allerMcsc),
      dropoffStayCode: "MCSC",
      instructions: "Descente de tous les enfants MCSC et pause de 20 minutes.",
    }],
    instructions: "Regroupement des convois à Bordeaux, dépose MCSC à Messanges, puis arrivée EVCC à Bidarray.",
  }],
  tickets: [{
    ...oldAllerBusTicket,
    id: oldAllerBusTicket?.id || "s2-bus-aller-ticket",
    segmentId: allerSegmentId,
    segmentLabel: "Bordeaux > Messanges > Bidarray",
    from: "Bordeaux",
    to: "Bidarray",
    coverageFrom: "Bordeaux",
    coverageTo: "Bidarray",
    name: "Autocar S2 aller – Bordeaux > Messanges > Bidarray (55 places)",
    trainType: "Autocar",
    seats: 55,
    price: 920,
    purchased: oldAllerBusTicket?.purchased ?? false,
    coveredReservationIds: allerPassengers.map((passenger) => passenger.reservationId).filter(Boolean),
  }],
  updatedAt: serverTimestamp(),
  createdAt: existingBusAller.data()?.createdAt || serverTimestamp(),
};

const busRetour = {
  sejourName: "Transport commun S2 – MCSC / EVCC",
  direction: "retour",
  routeGroup: "direct",
  week: "S2",
  date: "2026-07-31",
  departureCity: "Bidarray",
  arrivalCity: "Bordeaux",
  departureTime: "08:30",
  arrivalTime: "12:40",
  trainType: "Autocar",
  trainNumber: "",
  meetingPoint: "Centre EVCC – Bidarray",
  meetingTime: "08:15",
  platform: "",
  capacity: 55,
  status: existingBusRetour.data()?.status || "brouillon",
  routeLabel: "Premier trajet commun",
  sharedConnection: true,
  coverageExcluded: true,
  notes: "Premier trajet commun du retour : prise en charge EVCC à Bidarray, puis MCSC à Messanges, avant Bordeaux.",
  passengers: retourPassengers.map((passenger) => ({
    ...passenger,
    pickupCity: stayCode(passenger) === "MCSC" ? "Messanges" : "Bidarray",
    dropoffCity: "Bordeaux",
    stayCode: stayCode(passenger),
  })),
  staff: existingBusRetour.data()?.staff || commonStaff(transports.northRetour, transports.southRetour),
  leadStaffId: existingBusRetour.data()?.leadStaffId || "",
  branches: [],
  segments: [{
    id: retourSegmentId,
    from: "Bidarray",
    to: "Bordeaux",
    mode: "Autocar",
    departureTime: "08:30",
    arrivalTime: "12:40",
    meetingTime: "08:15",
    meetingPoint: "Centre EVCC – Bidarray",
    stopType: "rdv",
    sharedBus: true,
    sharedBusId: "S2-2026-BIDARRAY-MESSANGES-BORDEAUX",
    capacity: 55,
    sharedCapacity: 55,
    sharedChildrenCount: childCount(retourPassengers),
    sharedStartChildren: childCount(retourEvcc),
    assignedStaffIds: existingBusRetour.data()?.segments?.[0]?.assignedStaffIds || [],
    stops: [{
      id: "s2-bus-retour-stop-messanges",
      city: "Messanges",
      arrivalTime: "10:05",
      departureTime: "10:25",
      stopType: "rdv",
      meetingPoint: "Centre MCSC – point de prise en charge à confirmer",
      sharedPickupChildren: childCount(retourMcsc),
      instructions: "Prise en charge de tous les enfants MCSC et pause de 20 minutes.",
    }],
    instructions: "Départ avec les enfants EVCC, prise en charge MCSC à Messanges, puis trajet commun vers Bordeaux.",
  }],
  tickets: [{
    ...oldRetourBusTicket,
    id: oldRetourBusTicket?.id || "s2-bus-retour-ticket",
    segmentId: retourSegmentId,
    segmentLabel: "Bidarray > Messanges > Bordeaux",
    from: "Bidarray",
    to: "Bordeaux",
    coverageFrom: "Bidarray",
    coverageTo: "Bordeaux",
    name: "Autocar S2 retour – Bidarray > Messanges > Bordeaux (55 places)",
    trainType: "Autocar",
    seats: 55,
    price: 920,
    purchased: oldRetourBusTicket?.purchased ?? false,
    coveredReservationIds: retourPassengers.map((passenger) => passenger.reservationId).filter(Boolean),
  }],
  updatedAt: serverTimestamp(),
  createdAt: existingBusRetour.data()?.createdAt || serverTimestamp(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} – séparation des autocars communs S2`);
console.log(`Aller : ${childCount(allerPassengers)} enfants (${childCount(allerMcsc)} MCSC à Messanges, ${childCount(allerEvcc)} EVCC à Bidarray)`);
console.log("  Bordeaux 20:30 -> Messanges 22:45/23:05 -> Bidarray 00:40 (+1 jour)");
console.log(`Retour : ${childCount(retourPassengers)} enfants (${childCount(retourEvcc)} EVCC à Bidarray, ${childCount(retourMcsc)} MCSC à Messanges)`);
console.log("  Bidarray 08:30 -> Messanges 10:05/10:25 -> Bordeaux 12:40");
console.log("Les segments autocar et leurs billets seront retirés des quatre convois ferroviaires.");

if (shouldApply) {
  const batch = writeBatch(db);
  batch.update(doc(db, "transports", IDS.northAller), withoutBus(transports.northAller, "aller"));
  batch.update(doc(db, "transports", IDS.southAller), withoutBus(transports.southAller, "aller"));
  batch.update(doc(db, "transports", IDS.northRetour), withoutBus(transports.northRetour, "retour"));
  batch.update(doc(db, "transports", IDS.southRetour), withoutBus(transports.southRetour, "retour"));
  batch.set(doc(db, "transports", IDS.busAller), busAller);
  batch.set(doc(db, "transports", IDS.busRetour), busRetour);
  await batch.commit();
  console.log("Mise à jour Firebase terminée.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
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
