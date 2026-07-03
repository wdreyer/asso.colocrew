import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, orderBy, query } from "firebase/firestore";

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

const [reservationSnapshot, transportSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(query(collection(db, "transports"), orderBy("date", "asc"))),
]);
const reservations = reservationSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const transports = transportSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

function portions(transport) {
  return [...(transport.segments || []), ...(transport.branches || [])];
}

function actionStop(transport, city) {
  const key = normalize(city);
  for (const segment of portions(transport)) {
    const endpoint = transport.direction === "retour" ? segment.to : segment.from;
    if (normalize(endpoint) === key) return { type: "endpoint", segment, city: endpoint };
    if (!(transport.direction === "retour" && transport.sharedConnection)) {
      const stop = (segment.stops || []).find((item) => normalize(item.city) === key);
      if (stop) return { type: "stop", segment, stop, city: stop.city };
    }
  }
  return null;
}

function correctReturnInfo(transport, city) {
  const action = actionStop(transport, city);
  if (!action) return null;
  const time = action.type === "stop"
    ? action.stop.arrivalTime || action.stop.departureTime || ""
    : action.segment.arrivalTime || transport.arrivalTime || "";
  return { transport, time, city: action.city };
}

function oldReturnInfo(transport, city) {
  if (!transport) return null;
  const key = normalize(city);
  for (const segment of portions(transport)) {
    if (normalize(segment.to) === key) {
      return { time: segment.meetingTime || transport.meetingTime || "", transport };
    }
    const stop = (segment.stops || []).find((item) => normalize(item.city) === key);
    if (stop) return { time: stop.meetingTime || "", transport };
  }
  return { time: transport.meetingTime || "", transport };
}

function assigned(transport, reservationId) {
  return (transport.passengers || []).some((passenger) => passenger.reservationId === reservationId);
}

function sentAt(value) {
  if (!value) return "date inconnue";
  const date = typeof value.toDate === "function" ? value.toDate() : value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "date inconnue" : date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
}

const rows = reservations.filter((reservation) => reservation.convocationSent).map((reservation) => {
  const week = WEEK_BY_DATE[String(reservation.sejour?.startDate || "").slice(0, 10)] || "";
  const returnCity = reservation.transport?.returnCity || "";
  const returns = transports.filter((transport) => transport.week === week && transport.direction === "retour");
  const correct = returns
    .filter((transport) => assigned(transport, reservation.id))
    .map((transport) => correctReturnInfo(transport, returnCity))
    .find(Boolean)
    || returns.map((transport) => correctReturnInfo(transport, returnCity)).find(Boolean)
    || null;
  const firstReturn = returns[0] || null;
  const old = oldReturnInfo(firstReturn, returnCity);
  const children = (reservation.minor?.children || []).map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", ");
  return {
    reservationId: reservation.id,
    reference: reservation.numeroDeReservation || "",
    family: `${reservation.legal?.firstName || ""} ${reservation.legal?.lastName || ""}`.trim(),
    email: reservation.legal?.email || "",
    children,
    week,
    returnCity,
    sentAt: sentAt(reservation.convocationSentAt),
    oldRoute: old?.transport ? `${old.transport.departureCity || "?"} → ${old.transport.arrivalCity || "?"}` : "aucun",
    oldTime: old?.time || "non indiquée",
    correctRoute: correct?.transport ? `${correct.transport.departureCity || "?"} → ${correct.transport.arrivalCity || "?"}` : "aucun",
    correctTime: correct?.time || "non trouvée",
    wrongRoute: Boolean(old?.transport && correct?.transport && old.transport.id !== correct.transport.id),
    wrongTime: (old?.time || "") !== (correct?.time || ""),
  };
}).filter((row) => ["S1", "S2"].includes(row.week));

console.log(JSON.stringify({ totalSent: rows.length, affected: rows.filter((row) => row.wrongRoute || row.wrongTime), allSent: rows }, null, 2));

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
