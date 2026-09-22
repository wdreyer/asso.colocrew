import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

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

const CONTACT_UPDATES = [
  { id: "MaXScEbFSjaDzRmpoRYK", child: "Capucine Lagathu", phone: "0608533728" },
  { id: "akh7JUUdq7qTH55Mn6xL", child: "Noor Couchy", phone: "0750345343" },
  { id: "k989tQzaGH4uRAkPT9vW", child: "Domitille Vighier", phone: "0750345343" },
];

const ACHOURI_ID = "vUJNND53gqF4bW7iXRT6";

const reservationSnap = await getDocs(collection(db, "reservations"));
const reservations = new Map(reservationSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
const transportSnap = await getDocs(collection(db, "transports"));
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

const updatedReservations = [];
for (const update of CONTACT_UPDATES) {
  const reservation = reservations.get(update.id);
  if (!reservation) throw new Error(`Réservation introuvable : ${update.child} (${update.id})`);
  const phones = unique([update.phone, reservation.phone, ...(reservation.phones || []), reservation.legal?.phone, ...(reservation.legal?.phones || [])]);
  await updateDoc(doc(db, "reservations", update.id), {
    phone: update.phone,
    phones,
    "legal.phone": update.phone,
    "legal.phones": phones,
    updatedAt: serverTimestamp(),
  });
  updatedReservations.push({ id: update.id, child: update.child, phone: update.phone });
}

const achouriReservation = reservations.get(ACHOURI_ID);
if (!achouriReservation) throw new Error("Réservation Mohamed-Amine Achouri introuvable");
await updateDoc(doc(db, "reservations", ACHOURI_ID), {
  departureCity: "Carcassonne",
  returnCity: "Carcassonne",
  "transport.departureCity": "Carcassonne",
  "transport.returnCity": "Carcassonne",
  updatedAt: serverTimestamp(),
});
updatedReservations.push({ id: ACHOURI_ID, child: "ACHOURI MOHAMED-AMINE", aller: "Carcassonne", retour: "Carcassonne" });

const contactPhoneById = new Map(CONTACT_UPDATES.map((item) => [item.id, item.phone]));
contactPhoneById.set(ACHOURI_ID, achouriReservation.phone || achouriReservation.legal?.phone || "0615135207");

const updatedTransports = [];
for (const transport of transports) {
  if (transport.week !== "S3") continue;
  let changed = false;
  let passengers = (transport.passengers || []).map((passenger) => {
    let next = passenger;
    const phone = contactPhoneById.get(passenger.reservationId);
    if (phone) {
      next = { ...next, phone, phones: unique([phone, passenger.phone, ...(passenger.phones || [])]) };
      changed = true;
    }
    if (passenger.reservationId === ACHOURI_ID) {
      next = {
        ...next,
        returnCity: "Carcassonne",
        ...(transport.direction === "aller" ? { pickupCity: "Carcassonne" } : {}),
        ...(transport.direction === "retour" && transport.routeGroup !== "direct" ? { pickupCity: "Carcassonne", dropoffCity: "Carcassonne" } : {}),
      };
      changed = true;
    }
    return next;
  });

  let segments = transport.segments || [];
  let branches = transport.branches || [];
  let tickets = transport.tickets || [];

  if (transport.id === "ZE9pRIszXarAjRBoQqhz") {
    segments = segments.map((segment) => {
      if (segment.id !== "s3-aller-lyon-toulouse") return segment;
      changed = true;
      return {
        ...segment,
        stops: upsertStop(segment.stops, {
          id: "s3-aller-6823-carcassonne",
          city: "Carcassonne",
          arrivalTime: "15:34",
          departureTime: "15:37",
          meetingPoint: "Gare de Carcassonne",
          stopType: "quai",
          instructions: "Montée à Carcassonne.",
        }, "Béziers"),
      };
    });
    tickets = tickets.map((ticket) => {
      if (ticket.id !== "s3-aller-beziers-toulouse-achouri-afzfmg") return ticket;
      changed = true;
      return {
        ...ticket,
        name: "TGV INOUI 6823 - Carcassonne > Toulouse Matabiau - Mohamed-Amine Achouri",
        from: "Carcassonne",
        coverageFrom: "Carcassonne",
        departureTime: "15:37",
        segmentLabel: "Carcassonne > Toulouse Matabiau",
        notes: "Billet individuel Mohamed-Amine Achouri. PDF initialement émis Béziers > Toulouse, rattaché à Carcassonne selon mise à jour opérationnelle.",
      };
    });
  }

  if (transport.id === "MgRgEaP3Pv4riMtvpR3m") {
    branches = branches.map((branch) => {
      if (branch.id !== "s3-retour-toulouse-lyon") return branch;
      changed = true;
      return {
        ...branch,
        stops: upsertStop(branch.stops, {
          id: "s3-retour-lyon-carcassonne",
          city: "Carcassonne",
          arrivalTime: "18:26",
          departureTime: "18:29",
          meetingTime: "18:26",
          meetingPoint: "Gare de Carcassonne",
          stopType: "quai",
          sharedDropoffChildren: 1,
          instructions: "Descente à Carcassonne.",
        }, "Béziers"),
      };
    });
  }

  if (changed) {
    await updateDoc(doc(db, "transports", transport.id), {
      passengers,
      segments,
      branches,
      tickets,
      updatedAt: serverTimestamp(),
    });
    updatedTransports.push({ id: transport.id, name: transport.sejourName || transport.id });
  }
}

console.log(JSON.stringify({ updatedReservations, updatedTransports }, null, 2));
process.exit(0);

function upsertStop(stops = [], stop, beforeCity = "") {
  const filtered = (stops || []).filter((item) => normalizeKey(item.city) !== normalizeKey(stop.city));
  const beforeIndex = filtered.findIndex((item) => normalizeKey(item.city) === normalizeKey(beforeCity));
  if (beforeIndex === -1) return [...filtered, stop];
  return [...filtered.slice(0, beforeIndex + 1), stop, ...filtered.slice(beforeIndex + 1)];
}

function unique(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.replace(/\s+/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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
