import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";

loadEnv(".env.local");
const apply = process.argv.includes("--apply");
const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const [reservationSnapshot, transportSnapshot, pointSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
  getDocs(collection(db, "transport_rdv_points")),
]);
const allReservations = reservationSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const ACTIVE_START_DATES = new Set(["2026-07-06", "2026-07-20"]);
const activeReservations = allReservations.filter((reservation) =>
  reservation.status === "validated"
  && ACTIVE_START_DATES.has(String(reservation.sejour?.startDate || "").slice(0, 10))
);
const reservations = new Map(activeReservations.map((item) => [item.id, item]));
const transports = transportSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const points = pointSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const scopedWeeks = new Set(["S1", "S2"]);
const CAMP_ACTION_CITIES = new Set(["messange", "messanges", "bidarray"]);
const patches = new Map();
const removedStops = [];
const errors = [];

const passengerActionCities = (transport) => {
  const cities = new Set();
  for (const passenger of transport.passengers || []) {
    const reservation = reservations.get(passenger.reservationId);
    if (!reservation) continue;
    const familyCity = reservation?.transport?.[transport.direction === "retour" ? "returnCity" : "departureCity"];
    if (familyCity) cities.add(normalize(familyCity));
    [passenger.pickupCity, passenger.dropoffCity]
      .map(normalize)
      .filter((city) => CAMP_ACTION_CITIES.has(city))
      .forEach((city) => cities.add(city));
  }
  return cities;
};

function cleanStops(transport, portion, usefulCities) {
  return {
    ...portion,
    stops: (portion.stops || []).filter((stop) => {
      const keep = usefulCities.has(normalize(stop.city));
      if (!keep) removedStops.push(`${transport.week} ${transport.direction} · ${portion.from} → ${portion.to} · ${stop.city}`);
      return keep;
    }),
  };
}

for (const transport of transports) {
  if (!scopedWeeks.has(transport.week)) continue;
  const usefulCities = passengerActionCities(transport);
  patches.set(transport.id, {
    segments: (transport.segments || []).map((portion) => cleanStops(transport, portion, usefulCities)),
    branches: (transport.branches || []).map((portion) => cleanStops(transport, portion, usefulCities)),
  });
}

function forceMontpellier(transportId, from, to, stop) {
  const transport = transports.find((item) => item.id === transportId);
  const patch = patches.get(transportId);
  if (!transport || !patch) {
    errors.push(`Trajet introuvable : ${transportId}`);
    return;
  }
  let targetFound = false;
  const updatePortions = (portions) => portions.map((portion) => {
    const isTarget = normalize(portion.from) === normalize(from) && normalize(portion.to) === normalize(to);
    const withoutMontpellier = (portion.stops || []).filter((item) => normalize(item.city) !== "montpellier");
    if (!isTarget) return { ...portion, stops: withoutMontpellier };
    targetFound = true;
    return { ...portion, stops: [...withoutMontpellier, stop] };
  });
  patch.segments = updatePortions(patch.segments);
  patch.branches = updatePortions(patch.branches);
  if (!targetFound) errors.push(`${transport.week} ${transport.direction} : portion ${from} → ${to} introuvable.`);
}

forceMontpellier("2induumArFBxjVCTLaw0", "Marseille", "Toulouse", {
  id: "s2-aller-4760-montpellier",
  city: "Montpellier",
  meetingPoint: "Rendez-vous sur le quai — l’animateur·ice vous contactera",
  meetingTime: "12:15",
  arrivalTime: "13:03",
  departureTime: "13:03",
  platform: "",
  stopType: "quai",
  instructions: "Montée de 2 enfants à Montpellier. La voie et la voiture seront communiquées par l’animateur·ice.",
});
forceMontpellier("E032d8KCH3OVHdgy5bA5", "Toulouse", "Marseille", {
  id: "s2-retour-4665-montpellier",
  city: "Montpellier",
  meetingPoint: "Rendez-vous sur le quai — l’animateur·ice vous contactera",
  meetingTime: "",
  arrivalTime: "20:54",
  departureTime: "20:57",
  platform: "",
  stopType: "quai",
  instructions: "Descente de 2 enfants à Montpellier. La voie et la voiture seront communiquées par l’animateur·ice.",
});

const usefulGlobalCities = new Set();
const cityUsage = new Map();
for (const reservation of activeReservations) {
  [reservation.transport?.departureCity, reservation.transport?.returnCity].map(normalize).filter(Boolean).forEach((city) => {
    usefulGlobalCities.add(city);
    cityUsage.set(city, (cityUsage.get(city) || 0) + Math.max(reservation.minor?.children?.length || 0, 1));
  });
}
for (const transport of transports) {
  if (!scopedWeeks.has(transport.week)) continue;
  const activePassengers = (transport.passengers || []).filter((passenger) => reservations.has(passenger.reservationId));
  if (activePassengers.length) {
    [transport.departureCity, transport.arrivalCity].map(normalize).filter(Boolean).forEach((city) => usefulGlobalCities.add(city));
  }
  for (const passenger of activePassengers) {
    if (!reservations.has(passenger.reservationId)) continue;
    [passenger.pickupCity, passenger.dropoffCity]
      .map(normalize)
      .filter((city) => CAMP_ACTION_CITIES.has(city))
      .forEach((city) => usefulGlobalCities.add(city));
  }
}
const pointsToDelete = points.filter((point) => !usefulGlobalCities.has(normalize(point.city)));

for (const [transportId, patch] of patches) {
  const transport = transports.find((item) => item.id === transportId);
  for (const portion of [...patch.segments, ...patch.branches]) {
    for (const stop of portion.stops || []) {
      if (!passengerActionCities(transport).has(normalize(stop.city))) {
        errors.push(`${transport.week} ${transport.direction} : arrêt ${stop.city} sans enfant après nettoyage.`);
      }
    }
  }
}

console.log(`${apply ? "APPLICATION" : "SIMULATION"} — nettoyage des villes sans enfant`);
console.log(`Arrêts de segments supprimés (${removedStops.length}) : ${removedStops.join(" ; ") || "aucun"}`);
console.log(`Points de RDV globaux supprimés (${pointsToDelete.length}) : ${pointsToDelete.map((point) => point.city).join(" ; ") || "aucun"}`);
console.log("S2 aller : Marseille → Montpellier 13:03 → Toulouse 15:15 (RDV Montpellier 12:15).");
console.log("S2 retour : Toulouse 18:45 → Montpellier 20:54 → Marseille 22:39.");
console.log(`Usage: ${["beziers", "narbonne", "carcassonne", "montauban ville bourbon", "marmande", "montpellier"].map((city) => `${city}=${cityUsage.get(city) || 0}`).join(" ; ")}`);
if (errors.length) {
  console.error("Erreurs :", errors);
  process.exit(1);
}

if (apply) {
  const batch = writeBatch(db);
  for (const [transportId, patch] of patches) {
    batch.update(doc(db, "transports", transportId), { ...patch, updatedAt: serverTimestamp() });
  }
  pointsToDelete.forEach((point) => batch.delete(doc(db, "transport_rdv_points", point.id)));
  await batch.commit();
  console.log("Firebase mis à jour.");
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
