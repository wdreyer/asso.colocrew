// assign-missing-transports.mjs
// Ajoute aux "transports" (convois) les enfants validés qui n'y figurent pas
// encore, sur la base de reservation.transport.departureCity / returnCity.
// La S1 est volontairement exclue (convois déjà finalisés, ne pas y toucher).
//
// Dry-run par défaut. --apply pour écrire.

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");
const EXCLUDED_WEEKS = new Set(["S1"]);

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });
const db = getFirestore(app);

const NORD_CITIES = new Set(["paris", "lille", "nantes"]);
const SUDOUEST_CITIES = new Set(["lyon", "montpellier", "bordeaux", "toulouse", "marseille", "valence", "bezier", "beziers"]);

function normKey(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function convoiFor(city) {
  const k = normKey(city);
  if (NORD_CITIES.has(k)) return "Convoi Nord";
  if (SUDOUEST_CITIES.has(k)) return "Convoi Sud / Ouest";
  return null;
}
function weekFromStart(v) {
  return { "2026-07-06": "S1", "2026-07-20": "S2", "2026-08-03": "S3", "2026-08-17": "S4" }[String(v || "").slice(0, 10)] || "";
}

const rSnap = await getDocs(collection(db, "reservations"));
const reservations = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const tSnap = await getDocs(collection(db, "transports"));
const transports = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const tIndex = new Map();
for (const t of transports) {
  const convoi = t.sejourName.includes("Sud") ? "Convoi Sud / Ouest" : "Convoi Nord";
  tIndex.set(`${t.week}|${t.direction}|${convoi}`, t);
}

const passengerSet = new Set();
for (const t of transports) {
  for (const p of t.passengers || []) passengerSet.add(`${t.week}|${t.direction}|${p.reservationId}`);
}

const toAdd = new Map(); // transportId -> [{reservationId, pickupCity, child}]
const queuedForReservation = new Set();
const report = {};
const validated = reservations.filter((r) => r.status === "validated");

for (const r of validated) {
  const week = weekFromStart(r.sejour?.startDate);
  if (!week || EXCLUDED_WEEKS.has(week)) continue;
  const kids = r.minor?.children || [];
  for (const k of kids) {
    for (const direction of ["aller", "retour"]) {
      const city = direction === "aller" ? r.transport?.departureCity : r.transport?.returnCity;
      if (!city || normKey(city) === "surplace") continue;
      const convoi = convoiFor(city);
      if (!convoi) continue;
      const key = `${week}|${direction}|${r.id}`;
      const alreadyExisting = passengerSet.has(key);
      const alreadyQueuedForChild = queuedForReservation.has(`${key}|${normKey(k.firstName)}|${normKey(k.lastName)}`);
      if (alreadyExisting || alreadyQueuedForChild) continue; // déjà assigné (au moins un siège pour cet enfant précis)
      const t = tIndex.get(`${week}|${direction}|${convoi}`);
      if (!t) { console.log("AUCUN CONVOI TROUVÉ POUR", week, direction, convoi); continue; }
      if (!toAdd.has(t.id)) toAdd.set(t.id, []);
      toAdd.get(t.id).push({ reservationId: r.id, pickupCity: city, convocationSent: false, child: `${k.firstName} ${k.lastName}`.trim() });
      queuedForReservation.add(`${key}|${normKey(k.firstName)}|${normKey(k.lastName)}`);
      report[week] = report[week] || {};
      report[week][direction] = report[week][direction] || {};
      report[week][direction][city] = (report[week][direction][city] || 0) + 1;
    }
  }
}

console.log(`\n${shouldApply ? "APPLY" : "DRY-RUN"} — ajout de passagers manquants (hors S1)\n`);
for (const [tId, list] of toAdd.entries()) {
  const t = transports.find((x) => x.id === tId);
  console.log(`${t.sejourName} (${t.direction}) : +${list.length} — ${list.map((p) => p.child).join(", ")}`);
}

let totalAdded = 0;
for (const [tId, list] of toAdd.entries()) {
  totalAdded += list.length;
  if (shouldApply) {
    const t = transports.find((x) => x.id === tId);
    const newPassengers = [...(t.passengers || []), ...list.map(({ child, ...p }) => p)];
    await updateDoc(doc(db, "transports", tId), { passengers: newPassengers });
  }
}

console.log(`\nTotal: ${totalAdded} passager(s) ${shouldApply ? "ajoutés" : "à ajouter"}.`);
console.log("\n=== Résumé destination par destination ===");
for (const week of Object.keys(report).sort()) {
  console.log(`-- ${week} --`);
  for (const direction of Object.keys(report[week])) {
    for (const city of Object.keys(report[week][direction])) {
      console.log(`  ${direction.padEnd(7)} ${city.padEnd(14)} +${report[week][direction][city]}`);
    }
  }
}
process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
