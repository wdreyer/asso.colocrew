import fs from "node:fs";
import crypto from "node:crypto";
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

const IDS = {
  northAller: "UrYWvoqOWbzNcv53DyCS",
  southAller: "2induumArFBxjVCTLaw0",
  southRetour: "E032d8KCH3OVHdgy5bA5",
  northRetour: "04AhMrhz1dYCHxsI7yJp",
};

const reservationSnap = await getDocs(collection(db, "reservations"));
const reservations = new Map(reservationSnap.docs.map((item) => [item.id, item.data()]));

const docs = {};
for (const [key, id] of Object.entries(IDS)) {
  const snapshot = await getDoc(doc(db, "transports", id));
  if (!snapshot.exists()) throw new Error(`Transport introuvable: ${key} (${id})`);
  docs[key] = snapshot.data();
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function passengerCity(passenger, direction) {
  const reservation = reservations.get(passenger.reservationId) || {};
  if (direction === "retour") {
    return passenger.returnCity || reservation.returnCity || reservation.transport?.returnCity || "";
  }
  return passenger.departureCity || reservation.departureCity || reservation.transport?.departureCity || "";
}

function childCount(passengers) {
  return passengers.reduce((sum, passenger) => {
    const reservation = reservations.get(passenger.reservationId) || {};
    const reservationChildren = reservation.minor?.children?.length || 0;
    return sum + Math.max(passenger.children?.length || 0, reservationChildren, 1);
  }, 0);
}

function stayCode(passenger) {
  if (passenger.stayCode || passenger.camp) return passenger.stayCode || passenger.camp;
  const reservation = reservations.get(passenger.reservationId) || {};
  const name = `${reservation.sejourName || ""} ${reservation.sejour?.name || ""}`.toLowerCase();
  if (name.includes("surf") || name.includes("mcsc")) return "MCSC";
  if (name.includes("eaux") || name.includes("evcc")) return "EVCC";
  return "";
}

function branch(id, from, to, departureTime, arrivalTime, direction) {
  return {
    id,
    kind: "branch",
    routeKind: "branch",
    from,
    to,
    joinsAt: "Toulouse",
    mode: "Train",
    number: "",
    platform: "",
    meetingPoint: direction === "aller" ? "Gare de Marseille Saint-Charles" : "Gare de Toulouse Matabiau",
    meetingTime: "",
    departureTime,
    arrivalTime,
    estimatedTimes: true,
    stopType: "rdv",
    assignedStaffIds: [],
    instructions: direction === "aller"
      ? "Embranchement Marseille : rejoindre le convoi principal à Toulouse. Horaires estimatifs à confirmer après achat des billets."
      : "Séparation à Toulouse vers Marseille. Horaires estimatifs à confirmer après achat des billets.",
  };
}

function upsertBranch(transport, nextBranch) {
  const branches = Array.isArray(transport.branches) ? transport.branches : [];
  const existing = branches.findIndex((item) => item.id === nextBranch.id || (
    normalized(item.from) === normalized(nextBranch.from)
    && normalized(item.to) === normalized(nextBranch.to)
  ));
  if (existing === -1) return [...branches, nextBranch];
  return branches.map((item, index) => index === existing ? { ...item, ...nextBranch } : item);
}

const southAller = docs.southAller;
const northAller = docs.northAller;
const southRetour = docs.southRetour;
const northRetour = docs.northRetour;
const allRetourPassengers = [...(southRetour.passengers || []), ...(northRetour.passengers || [])];
const uniqueRetourPassengers = [...new Map(allRetourPassengers.map((passenger) => [passenger.reservationId || passenger.id, passenger])).values()];
const retourMcscChildren = childCount(uniqueRetourPassengers.filter((passenger) => stayCode(passenger) === "MCSC"));
const retourEvccChildren = childCount(uniqueRetourPassengers.filter((passenger) => stayCode(passenger) === "EVCC"));
const retourSharedChildren = childCount(uniqueRetourPassengers);

const allerMarseille = (southAller.passengers || []).filter((passenger) =>
  normalized(passengerCity(passenger, "aller")) === "marseille",
);
const allerNantes = (northAller.passengers || []).filter((passenger) =>
  normalized(passengerCity(passenger, "aller")) === "nantes",
);
const retourMarseille = (southRetour.passengers || []).filter((passenger) =>
  normalized(passengerCity(passenger, "retour")) === "marseille",
);

const allerBranch = branch("s2-aller-marseille-toulouse", "Marseille", "Toulouse", "12:15", "16:05", "aller");
const nantesBranch = {
  ...branch("s2-aller-nantes-paris", "Nantes", "Paris", "", "", "aller"),
  joinsAt: "Paris",
  meetingPoint: "Gare de Nantes",
  instructions: "Embranchement Nantes : rejoindre le convoi principal à Paris. Horaires à compléter après achat des billets.",
};
const retourBranch = branch("s2-retour-toulouse-marseille", "Toulouse", "Marseille", "", "", "retour");

const allerSegments = (southAller.segments || []).map((segment) => segment.sharedBus
  ? {
      ...segment,
      from: "Bordeaux",
      to: "Bidarray",
      mode: "Autocar",
      sharedBus: true,
      sharedBusId: "S2-2026-BORDEAUX-MESSANGES-BIDARRAY",
      instructions: "Regroupement de tous les convois à Bordeaux, puis autocar partagé. MCSC descend à Messanges, EVCC descend à Bidarray.",
    }
  : segment);

// Le retour principal passe par Toulouse puis continue vers Valence/Lyon.
// Marseille devient un embranchement séparé à partir de Toulouse.
const retourOriginal = southRetour.segments || [];
const byLeg = (from, to) => retourOriginal.find((segment) =>
  normalized(segment.from) === normalized(from) && normalized(segment.to) === normalized(to),
);
const retourSegments = [
  {
    ...(byLeg("Bidarray", "Bordeaux") || byLeg("Messanges", "Marseille") || {}),
    id: (byLeg("Bidarray", "Bordeaux") || byLeg("Messanges", "Marseille"))?.id || "s2-retour-bus-bidarray-bordeaux",
    from: "Bidarray",
    to: "Bordeaux",
    mode: "Autocar",
    sharedBus: true,
    sharedBusId: "S2-2026-BIDARRAY-MESSANGES-BORDEAUX",
    sharedChildrenCount: retourSharedChildren,
    sharedCapacity: 50,
    capacityShortage: Math.max(0, retourSharedChildren - 50),
    sharedStartChildren: retourEvccChildren,
    stops: [{
      id: "s2-retour-stop-messanges",
      city: "Messanges",
      stopType: "quai",
      meetingPoint: "Point de rendez-vous à confirmer",
      arrivalTime: "",
      departureTime: "",
      instructions: "Prise en charge des enfants MCSC, puis regroupement complet vers Bordeaux.",
      sharedPickupChildren: retourMcscChildren,
    }],
    instructions: "Autocar partagé : départ EVCC de Bidarray, prise en charge MCSC à Messanges, puis regroupement de tous les enfants à Bordeaux.",
  },
  {
    ...(byLeg("Bordeaux", "Toulouse") || byLeg("Marseille", "Toulouse") || {}),
    id: (byLeg("Bordeaux", "Toulouse") || byLeg("Marseille", "Toulouse"))?.id || "s2-retour-bordeaux-toulouse",
    from: "Bordeaux",
    to: "Toulouse",
    mode: "Train",
    stops: [],
    instructions: "Tous les enfants du convoi Sud/Ouest voyagent ensemble jusqu'à Toulouse.",
  },
  byLeg("Toulouse", "Valence") || {
    id: crypto.randomUUID(), from: "Toulouse", to: "Valence", mode: "Train", stopType: "quai",
    departureTime: "", arrivalTime: "", meetingPoint: "", assignedStaffIds: [],
  },
  byLeg("Valence", "Lyon") || {
    id: crypto.randomUUID(), from: "Valence", to: "Lyon", mode: "Train", stopType: "quai",
    departureTime: "", arrivalTime: "", meetingPoint: "", assignedStaffIds: [],
  },
];

const northRetourSegments = (northRetour.segments || []).map((segment, index) => index === 0
  ? {
      ...segment,
      from: "Bidarray",
      to: "Bordeaux",
      mode: "Autocar",
      sharedBus: true,
      sharedBusId: "S2-2026-BIDARRAY-MESSANGES-BORDEAUX",
      sharedChildrenCount: retourSharedChildren,
      sharedCapacity: 50,
      capacityShortage: Math.max(0, retourSharedChildren - 50),
      sharedStartChildren: retourEvccChildren,
      stops: [{
        id: "s2-retour-stop-messanges",
        city: "Messanges",
        stopType: "quai",
        meetingPoint: "Point de rendez-vous à confirmer",
        arrivalTime: "",
        departureTime: "",
        instructions: "Prise en charge des enfants MCSC, puis regroupement complet vers Bordeaux.",
        sharedPickupChildren: retourMcscChildren,
      }],
      instructions: "Autocar partagé : départ EVCC de Bidarray, prise en charge MCSC à Messanges, puis regroupement de tous les enfants à Bordeaux.",
    }
  : segment);

const seen = new Set();
const duplicateIds = [];
const northRetourPassengers = (northRetour.passengers || []).filter((passenger) => {
  const key = passenger.reservationId || passenger.id;
  if (!key || !seen.has(key)) {
    if (key) seen.add(key);
    return true;
  }
  duplicateIds.push(key);
  return false;
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - mise à jour S2`);
console.log(`Marseille aller: ${allerMarseille.length} dossiers / ${childCount(allerMarseille)} enfants`);
console.log(`Nantes aller: ${allerNantes.length} dossiers / ${childCount(allerNantes)} enfants`);
console.log(`Marseille retour: ${retourMarseille.length} dossiers / ${childCount(retourMarseille)} enfants`);
console.log("Aller:", [...allerSegments, allerBranch].map((item) => `${item.from}->${item.to}`).join(" | "));
console.log("Retour:", [...retourSegments, retourBranch].map((item) => `${item.from}->${item.to}`).join(" | "));
console.log(`Doublons retirés du retour Nord: ${duplicateIds.join(", ") || "aucun"}`);
console.log(`Autocar retour partagé: ${retourSharedChildren} enfants (${retourEvccChildren} EVCC à Bidarray + ${retourMcscChildren} MCSC à Messanges)`);
console.log("Retour Nord actuel:", (northRetour.segments || []).map((item) => `${item.from}->${item.to}`).join(" | "));
console.log("Billets retour Sud/Ouest:", (southRetour.tickets || []).map((item) => `${item.from || "?"}->${item.to || "?"} (${item.segmentId || "sans segment"}, ${item.seats || 0} places)`).join(" | ") || "aucun");
console.log("Billets retour Nord:", (northRetour.tickets || []).map((item) => `${item.from || "?"}->${item.to || "?"} (${item.segmentId || "sans segment"}, ${item.seats || 0} places)`).join(" | ") || "aucun");

if (shouldApply) {
  await updateDoc(doc(db, "transports", IDS.northAller), {
    branches: upsertBranch(northAller, nantesBranch),
  });
  await updateDoc(doc(db, "transports", IDS.southAller), {
    segments: allerSegments,
    branches: upsertBranch(southAller, allerBranch),
  });
  await updateDoc(doc(db, "transports", IDS.southRetour), {
    departureCity: "Bidarray",
    arrivalCity: "Lyon",
    segments: retourSegments,
    branches: upsertBranch(southRetour, retourBranch),
  });
  await updateDoc(doc(db, "transports", IDS.northRetour), {
    departureCity: "Bidarray",
    segments: northRetourSegments,
    passengers: northRetourPassengers,
  });
  console.log("Mise à jour Firebase terminée.");
}

const freshTransportSnap = await getDocs(collection(db, "transports"));
const s2Trips = freshTransportSnap.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) => transport.week === "S2" && normalized(transport.status) !== "annule");
const freshNorthAller = s2Trips.find((transport) => transport.id === IDS.northAller);
const freshNantesBranch = (freshNorthAller?.branches || []).find((item) => item.id === nantesBranch.id);
console.log(`Branche Nantes -> Paris: ${freshNantesBranch ? "présente" : "absente"} · ${childCount(allerNantes)} enfants`);
const validatedS2 = reservationSnap.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((reservation) => reservation.status === "validated" && String(reservation.sejour?.startDate || "").slice(0, 10) === "2026-07-20");

for (const direction of ["aller", "retour"]) {
  const cityField = direction === "aller" ? "departureCity" : "returnCity";
  const expected = validatedS2.filter((reservation) => normalized(reservation.transport?.[cityField]) !== "sur place");
  const assignments = new Map();
  s2Trips.filter((transport) => transport.direction === direction).forEach((transport) => {
    (transport.passengers || []).forEach((passenger) => {
      assignments.set(passenger.reservationId, (assignments.get(passenger.reservationId) || 0) + 1);
    });
  });
  const missing = expected.filter((reservation) => !assignments.has(reservation.id));
  const duplicated = expected.filter((reservation) => (assignments.get(reservation.id) || 0) > 1);
  const expectedChildren = expected.reduce((sum, reservation) => sum + Math.max(reservation.minor?.children?.length || 0, 1), 0);
  console.log(`Audit ${direction}: ${expectedChildren} enfants attendus, ${missing.length} dossier(s) manquant(s), ${duplicated.length} doublon(s)`);
  if (missing.length) console.log("  Manquants:", missing.map((reservation) => reservation.id).join(", "));
  if (duplicated.length) console.log("  Doublons:", duplicated.map((reservation) => reservation.id).join(", "));
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
