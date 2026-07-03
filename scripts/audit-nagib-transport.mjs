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
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const reservations = reservationSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const transports = transportSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const matches = reservations.filter((reservation) => normalize(JSON.stringify({
  legal: reservation.legal,
  children: reservation.minor?.children,
  reference: reservation.numeroDeReservation,
})).includes("nagib"));

console.log(`Dossiers Nagib trouvés : ${matches.length}`);
for (const reservation of matches) {
  const assignments = transports.filter((transport) =>
    (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id),
  ).map((transport) => ({
    id: transport.id,
    week: transport.week,
    direction: transport.direction,
    route: `${transport.departureCity || "?"} → ${transport.arrivalCity || "?"}`,
    passenger: (transport.passengers || []).find((passenger) => passenger.reservationId === reservation.id),
  }));
  console.log(JSON.stringify({
    id: reservation.id,
    reference: reservation.numeroDeReservation || "",
    legal: reservation.legal,
    children: reservation.minor?.children || [],
    sejour: reservation.sejour,
    transport: reservation.transport,
    assignments,
  }, null, 2));
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
