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

const WEEK_BY_DATE = { "2026-07-06": "S1", "2026-07-20": "S2", "2026-08-03": "S3", "2026-08-17": "S4" };
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();
const isOnSite = (value) => normalize(value) === "surplace";
const children = (reservation) => Math.max(reservation.minor?.children?.length || 0, 1);

const [reservationSnapshot, transportSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);
const reservations = reservationSnapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((item) => item.status === "validated" && ["S1", "S2"].includes(WEEK_BY_DATE[String(item.sejour?.startDate || "").slice(0, 10)]));
const transports = transportSnapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((item) => ["S1", "S2"].includes(item.week) && normalize(item.status) !== "annule");

const errors = [];
const warnings = [];
const infos = [];
const s2Schedules = new Map();
const s2MissingEmails = [];
const routeCities = (transport) => new Set([
  transport.departureCity,
  transport.arrivalCity,
  ...(transport.segments || []).flatMap((segment) => [segment.from, ...(segment.stops || []).map((stop) => stop.city), segment.to]),
  ...(transport.branches || []).flatMap((segment) => [segment.from, ...(segment.stops || []).map((stop) => stop.city), segment.to]),
].map(normalize).filter(Boolean));
const familyActionCities = (transport) => new Set([
  ...(transport.segments || []).flatMap((segment) => [
    transport.direction === "retour" ? segment.to : segment.from,
    ...(transport.direction === "retour" && transport.sharedConnection ? [] : (segment.stops || []).map((stop) => stop.city)),
  ]),
  ...(transport.branches || []).flatMap((segment) => [
    transport.direction === "retour" ? segment.to : segment.from,
    ...(transport.direction === "retour" && transport.sharedConnection ? [] : (segment.stops || []).map((stop) => stop.city)),
  ]),
].map(normalize).filter(Boolean));

function minutesBefore(value, amount) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const total = (Number(match[1]) * 60 + Number(match[2]) - amount + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function actionSchedule(transport, city) {
  const key = normalize(city);
  for (const portion of [...(transport.segments || []), ...(transport.branches || [])]) {
    const endpoint = transport.direction === "retour" ? portion.to : portion.from;
    if (normalize(endpoint) === key) {
      const time = transport.direction === "retour"
        ? portion.arrivalTime || transport.arrivalTime || ""
        : portion.meetingTime || transport.meetingTime || minutesBefore(portion.departureTime || transport.departureTime, 60);
      return { time, route: `${portion.from} → ${portion.to}` };
    }
    if (!(transport.direction === "retour" && transport.sharedConnection)) {
      const stop = (portion.stops || []).find((item) => normalize(item.city) === key);
      if (stop) {
        const time = transport.direction === "retour"
          ? stop.arrivalTime || stop.departureTime || ""
          : stop.meetingTime || minutesBefore(stop.departureTime || stop.arrivalTime, 60);
        return { time, route: `${portion.from} → ${portion.to}` };
      }
    }
  }
  return null;
}

for (const transport of transports) {
  const label = `${transport.week} ${transport.direction} ${transport.departureCity || "?"} → ${transport.arrivalCity || "?"}`;
  const cities = routeCities(transport);
  const joins = new Set((transport.branches || []).map((branch) => normalize(branch.joinsAt || (transport.direction === "retour" ? branch.from : branch.to))));
  const passengerCities = new Set((transport.passengers || []).flatMap((passenger) => [
    passenger.pickupCity || passenger.departureCity,
    passenger.dropoffCity || passenger.returnCity,
  ]).map(normalize).filter(Boolean));

  if (!(transport.staff || []).length) warnings.push(`${label} : aucun animateur affecté.`);
  for (const passenger of transport.passengers || []) {
    const city = transport.direction === "retour" && transport.sharedConnection
      ? passenger.pickupCity
      : transport.direction === "retour"
      ? passenger.dropoffCity || passenger.returnCity || passenger.pickupCity
      : passenger.pickupCity || passenger.departureCity;
    if (city && !cities.has(normalize(city))) errors.push(`${label} : ${passenger.reservationId || passenger.nom || "passager"} a la ville ${city}, absente du trajet.`);
  }

  for (const portion of [...(transport.segments || []), ...(transport.branches || [])]) {
    const portionLabel = `${label} / ${portion.from || "?"} → ${portion.to || "?"}`;
    if (!portion.from || !portion.to) errors.push(`${portionLabel} : origine ou destination manquante.`);
    if (!portion.departureTime || !portion.arrivalTime) errors.push(`${portionLabel} : horaire de départ ou d’arrivée manquant.`);
    for (const stop of portion.stops || []) {
      if (!stop.arrivalTime || !stop.departureTime) errors.push(`${portionLabel} / ${stop.city || "étape"} : horaire d’arrivée ou de départ manquant.`);
      const key = normalize(stop.city);
      if (!passengerCities.has(key) && !joins.has(key)) infos.push(`${label} : étape ${stop.city} sans enfant, conservée comme étape opérationnelle.`);
    }
  }
}

for (const reservation of reservations) {
  const week = WEEK_BY_DATE[String(reservation.sejour?.startDate || "").slice(0, 10)];
  if (week === "S2" && (!reservation.legal?.email || reservation.legal.email === "-")) {
    const names = (reservation.minor?.children || []).map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", ");
    s2MissingEmails.push(`${names || reservation.numeroDeReservation || reservation.id}`);
  }
  for (const direction of ["aller", "retour"]) {
    const city = reservation.transport?.[direction === "aller" ? "departureCity" : "returnCity"] || "";
    if (!city || isOnSite(city)) continue;
    const candidates = transports.filter((transport) =>
      transport.week === week
      && transport.direction === direction
      && familyActionCities(transport).has(normalize(city))
      && (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id),
    );
    if (!candidates.length) errors.push(`${week} ${direction} : dossier ${reservation.numeroDeReservation || reservation.id}, ville ${city}, sans trajet affecté cohérent.`);
    const feederCandidates = candidates.filter((transport) => !transport.sharedConnection);
    if (feederCandidates.length > 1) warnings.push(`${week} ${direction} : dossier ${reservation.numeroDeReservation || reservation.id}, ville ${city}, présent sur ${feederCandidates.length} trajets principaux.`);
    if (week === "S2" && candidates.length) {
      const schedule = actionSchedule(candidates[0], city);
      if (!schedule?.time || !/^\d{2}:\d{2}$/.test(schedule.time)) {
        errors.push(`S2 ${direction} : dossier ${reservation.numeroDeReservation || reservation.id}, horaire de convocation/récupération introuvable à ${city}.`);
      } else {
        const key = `${direction}|${city}`;
        if (!s2Schedules.has(key)) s2Schedules.set(key, new Set());
        s2Schedules.get(key).add(schedule.time);
      }
    }
  }
}

for (const [key, times] of s2Schedules) {
  if (times.size > 1) warnings.push(`S2 ${key.replace("|", " ")} : horaires différents selon les dossiers (${[...times].join(", ")}).`);
}

const totalChildren = reservations.reduce((total, reservation) => total + children(reservation), 0);
console.log(`Audit convoyages S1/S2 — ${reservations.length} dossiers, ${totalChildren} enfants, ${transports.length} trajets`);
console.log(`ERREURS ${errors.length}`);
errors.forEach((message) => console.log(`  - ${message}`));
console.log(`AVERTISSEMENTS ${warnings.length}`);
warnings.forEach((message) => console.log(`  - ${message}`));
console.log(`INFORMATIONS ${infos.length}`);
infos.forEach((message) => console.log(`  - ${message}`));
console.log("HORAIRES CONVOCATIONS S2");
[...s2Schedules.entries()].sort(([left], [right]) => left.localeCompare(right, "fr")).forEach(([key, times]) => {
  const [direction, city] = key.split("|");
  console.log(`  - ${direction} ${city} : ${[...times].join(", ")}`);
});
console.log(`EMAILS S2 MANQUANTS ${s2MissingEmails.length}`);
s2MissingEmails.forEach((name) => console.log(`  - ${name}`));
process.exitCode = errors.length ? 1 : 0;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
