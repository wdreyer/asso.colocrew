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
const reservations = new Map(reservationSnapshot.docs.map((snapshot) => [snapshot.id, { id: snapshot.id, ...snapshot.data() }]));
const transports = transportSnapshot.docs
  .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  .filter((transport) => ["S1", "S2"].includes(transport.week))
  .sort((left, right) => `${left.week}-${left.direction}-${left.departureTime}`.localeCompare(`${right.week}-${right.direction}-${right.departureTime}`));

for (const transport of transports) {
  console.log(`\n${transport.week} ${transport.direction.toUpperCase()} ${transport.departureCity} -> ${transport.arrivalCity} [${transport.id}] shared=${Boolean(transport.sharedConnection)}`);
  const cityCounts = new Map();
  for (const passenger of transport.passengers || []) {
    const reservation = reservations.get(passenger.reservationId);
    const city = reservation?.transport?.[transport.direction === "retour" ? "returnCity" : "departureCity"] || passenger.pickupCity || passenger.dropoffCity || "?";
    const count = Math.max(reservation?.minor?.children?.length || passenger.children?.length || 0, 1);
    cityCounts.set(city, (cityCounts.get(city) || 0) + count);
  }
  console.log(`  ENFANTS: ${[...cityCounts.entries()].map(([city, count]) => `${city}=${count}`).join(" ; ")}`);
  for (const [kind, portions] of [["SEG", transport.segments || []], ["BR", transport.branches || []]]) {
    for (const portion of portions) {
      console.log(`  ${kind} ${portion.from} ${portion.departureTime || "?"} -> ${portion.to} ${portion.arrivalTime || "?"} | RDV ${portion.meetingTime || "-"} ${portion.meetingPoint || "-"} | type=${portion.stopType || "-"}`);
      for (const stop of portion.stops || []) {
        console.log(`    STOP ${stop.city} arr=${stop.arrivalTime || "-"} dep=${stop.departureTime || "-"} rdv=${stop.meetingTime || "-"} point=${stop.meetingPoint || "-"} type=${stop.stopType || "-"}`);
      }
    }
  }
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
