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
const [reservationSnapshot, transportSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);
const WEEK = { "2026-07-06": "S1", "2026-07-20": "S2" };
const reservations = reservationSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  .filter((reservation) => reservation.status === "validated" && WEEK[String(reservation.sejour?.startDate || "").slice(0, 10)]);
const transports = transportSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  .filter((transport) => ["S1", "S2"].includes(transport.week) && norm(transport.status) !== "annule");
const errors = [];
const connections = [];

const familyCities = (transport) => new Set([
  ...(transport.segments || []).flatMap((portion) => [transport.direction === "retour" ? portion.to : portion.from, ...(transport.direction === "retour" && transport.sharedConnection ? [] : (portion.stops || []).map((stop) => stop.city))]),
  ...(transport.branches || []).flatMap((portion) => [transport.direction === "retour" ? portion.to : portion.from, ...(transport.direction === "retour" && transport.sharedConnection ? [] : (portion.stops || []).map((stop) => stop.city))]),
].map(norm).filter(Boolean));

for (const reservation of reservations) {
  const week = WEEK[String(reservation.sejour?.startDate || "").slice(0, 10)];
  for (const direction of ["aller", "retour"]) {
    const city = reservation.transport?.[direction === "aller" ? "departureCity" : "returnCity"] || "";
    if (!city || norm(city) === "surplace") continue;
    const matches = transports.filter((transport) => transport.week === week && transport.direction === direction
      && familyCities(transport).has(norm(city))
      && (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id));
    if (matches.length !== 1) errors.push(`${week} ${direction} ${reservation.numeroDeReservation || reservation.id} (${city}) : ${matches.length} trajet(s) famille.`);
  }
}

for (const transport of transports) {
  const portions = [...(transport.segments || []), ...(transport.branches || [])];
  for (const portion of portions) {
    for (const stop of portion.stops || []) {
      const road = [portion.mode, portion.trainType, transport.trainType].map(norm).some((mode) => mode.includes("bus") || mode.includes("car") || mode.includes("minibus"));
      if (!road && norm(stop.stopType) !== "quai") errors.push(`${transport.week} ${transport.direction} ${stop.city} : etape ferroviaire non marquee quai.`);
      if (!stop.arrivalTime || !stop.departureTime) errors.push(`${transport.week} ${transport.direction} ${stop.city} : horaire intermediaire incomplet.`);
    }
  }
  if (transport.week !== "S2") continue;
  const segments = transport.segments || [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (norm(segments[index].to) !== norm(segments[index + 1].from)) continue;
    checkConnection(transport, segments[index].to, segments[index].arrivalTime, segments[index + 1].departureTime);
  }
  for (const branch of transport.branches || []) {
    const main = transport.direction === "aller"
      ? segments.find((segment) => norm(segment.from) === norm(branch.to))
      : segments.find((segment) => norm(segment.to) === norm(branch.from));
    if (!main) continue;
    checkConnection(transport, branch.to || branch.from,
      transport.direction === "aller" ? branch.arrivalTime : main.arrivalTime,
      transport.direction === "aller" ? main.departureTime : branch.departureTime);
  }
}

assertSpecialCases();
console.log(`AUDIT CRITIQUE S1/S2 : ${reservations.length} dossiers, ${errors.length} erreur(s)`);
connections.forEach((item) => console.log(`  CORRESPONDANCE ${item}`));
errors.forEach((error) => console.log(`  ERREUR ${error}`));
process.exitCode = errors.length ? 1 : 0;

function checkConnection(transport, city, arrival, departure) {
  const start = toMinutes(arrival);
  const end = toMinutes(departure);
  if (start === null || end === null) {
    errors.push(`${transport.week} ${transport.direction} ${city} : correspondance sans horaire complet.`);
    return;
  }
  const duration = (end - start + 1440) % 1440;
  connections.push(`${transport.direction} ${city} ${arrival}->${departure} (${duration} min)`);
  if (duration < 20) errors.push(`${transport.week} ${transport.direction} ${city} : correspondance trop courte (${duration} min).`);
}

function assertSpecialCases() {
  const s1Aller = transports.find((transport) => transport.id === "GXvhfCTPBcKdnIFHHZIe");
  const s1Retour = transports.find((transport) => transport.id === "mqhiRrp6KjvJZF8FQhsO");
  const s2Aller = transports.find((transport) => transport.id === "2induumArFBxjVCTLaw0");
  const s2Retour = transports.find((transport) => transport.id === "E032d8KCH3OVHdgy5bA5");
  for (const transport of [s1Aller, s1Retour]) {
    const stop = (transport?.segments || []).flatMap((segment) => segment.stops || []).find((item) => norm(item.city) === "toulouse");
    if (!stop || norm(stop.stopType) !== "quai") errors.push(`S1 ${transport?.direction || "?"} Toulouse n'est pas une etape quai.`);
  }
  const toulouse = (s2Aller?.segments || []).find((segment) => norm(segment.from) === "toulouse" && norm(segment.to) === "bordeaux");
  if (!toulouse || norm(toulouse.stopType) !== "rdv" || !norm(toulouse.meetingPoint).includes("hall1") || toulouse.meetingTime !== "16:10") {
    errors.push("S2 aller Toulouse n'est pas un vrai RDV Hall 1 a 16:10.");
  }
  const allerMontpellier = [...(s2Aller?.segments || []), ...(s2Aller?.branches || [])].filter((portion) => (portion.stops || []).some((stop) => norm(stop.city) === "montpellier"));
  if (allerMontpellier.length !== 1 || norm(allerMontpellier[0].from) !== "marseille") errors.push("S2 aller Montpellier n'est pas exclusivement sur Marseille.");
  const retourMontpellier = [...(s2Retour?.segments || []), ...(s2Retour?.branches || [])].filter((portion) => (portion.stops || []).some((stop) => norm(stop.city) === "montpellier"));
  if (retourMontpellier.length !== 1 || norm(retourMontpellier[0].to) !== "marseille") errors.push("S2 retour Montpellier n'est pas exclusivement sur Marseille.");
}

function toMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function norm(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase(); }
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
