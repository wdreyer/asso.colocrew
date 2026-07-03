import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";

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
const QUAI_RDV = "Rendez-vous sur le quai — l’animateur·ice vous contactera";
const QUAI_INSTRUCTIONS = "La voie, la voiture et l'heure précise de rendez-vous seront communiquées par l’animateur·ice.";

const [reservationSnapshot, transportSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);
const reservations = new Map(reservationSnapshot.docs.map((item) => [item.id, item.data()]));
const transports = transportSnapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) => ["S1", "S2"].includes(transport.week) && transport.routeGroup !== "direct");

function passengerCity(transport, passenger) {
  const reservation = reservations.get(passenger.reservationId);
  return String(reservation?.transport?.[transport.direction === "aller" ? "departureCity" : "returnCity"] || passenger.pickupCity || "").trim();
}

function childNames(transport, city) {
  return (transport.passengers || [])
    .filter((passenger) => normalize(passengerCity(transport, passenger)) === normalize(city))
    .flatMap((passenger) => reservations.get(passenger.reservationId)?.minor?.children || [])
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean);
}

function cleanPortion(transport, portion, removed) {
  const stops = (portion.stops || []).flatMap((stop) => {
    const names = childNames(transport, stop.city);
    if (names.length === 0) {
      removed.push(`${transport.week} ${transport.direction} · ${stop.city}`);
      return [];
    }
    return [{
      ...stop,
      stopType: "quai",
      meetingPoint: QUAI_RDV,
      platform: "",
      instructions: `${transport.direction === "aller" ? "Montée" : "Descente"} de ${names.length} enfant${names.length > 1 ? "s" : ""} à ${stop.city}. ${QUAI_INSTRUCTIONS}`,
    }];
  });
  return { ...portion, stops };
}

const removed = [];
const patches = new Map();
for (const transport of transports) {
  patches.set(transport.id, {
    segments: (transport.segments || []).map((portion) => cleanPortion(transport, portion, removed)),
    branches: (transport.branches || []).map((portion) => cleanPortion(transport, portion, removed)),
  });
}

const errors = [];
for (const transport of transports) {
  const patch = patches.get(transport.id);
  const routeCities = new Set([
    ...(patch.segments || []).flatMap((portion) => [portion.from, portion.to, ...(portion.stops || []).map((stop) => stop.city)]),
    ...(patch.branches || []).flatMap((portion) => [portion.from, portion.to, ...(portion.stops || []).map((stop) => stop.city)]),
  ].map(normalize));
  for (const passenger of transport.passengers || []) {
    const city = passengerCity(transport, passenger);
    if (city && !routeCities.has(normalize(city))) errors.push(`${transport.id} : ${city} absent pour ${passenger.reservationId}`);
  }
  for (const portion of [...patch.segments, ...patch.branches]) {
    for (const stop of portion.stops || []) {
      if (childNames(transport, stop.city).length === 0) errors.push(`${transport.id} : arrêt inutile ${stop.city}`);
      if (stop.stopType !== "quai" || stop.meetingPoint !== QUAI_RDV) errors.push(`${transport.id} : consigne quai incorrecte ${stop.city}`);
    }
  }
}

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} – nettoyage des villes-étapes S1/S2`);
console.log("Arrêts supprimés :", removed.length ? removed.join(" ; ") : "aucun");
if (errors.length) {
  console.error("Erreurs :", errors);
  process.exit(1);
}
console.log("Chaque arrêt conservé correspond à au moins un enfant et utilise la consigne rendez-vous quai.");

if (shouldApply) {
  const batch = writeBatch(db);
  for (const [id, patch] of patches) {
    batch.update(doc(db, "transports", id), { ...patch, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  console.log("Firebase mis à jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
