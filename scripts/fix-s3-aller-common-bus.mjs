import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const TRANSPORT_ID = "s3-2026-bus-aller-autocar";
const SEGMENT_ID = "s3-bus-aller-bordeaux-bidarray";
const STRICT_RAW = `Depalle	Nilo
Depalle	Ethan
Aubrun	Egon
Javon Robellet	Maël
Pascot	Colin
Heffer	Aaron
MATHURIN	Jah Nah
RAMATCHANDIRIN	Rachel
MATHURIN	Jah-Lya
Bioulac	Zoé
Bachache	Lydia
FAHIM	Salma
FAHIM	Asma
EDJEHOU	Paule-Iris
Faramond	Charlotte
Faramond	Timothe
Hermosilla	Ines
Hermosilla	Léo
BERTRAND	Matthias
Rippling	Typhaine
DINDANGILA	Jahyan
Barvaut	Orlane
Gustave Dit Duflo	Maëlys
Eridan	Mayline
Boscher	Kyle
Thouard	Maxime
Luro	Apolline
Kehlaoui	Mohamed
	Denzel
PEDRON MALARTRE	Gabriel
BELKACEM	Mohamed
El Homrani	Anis
ERBILGIN	Buket
Ducheine	Lina
Hassani	Lina
BOUZIDI	Mohamed
ERBILGIN	Efe
ERGUN	Denis
GURBUZ	Mehmet
OUADAH	Djassim
SHAVESHYAN	Ramaz
Hamdane	Redwane
MOHAMED-AMINE	ACHOURI
SY	Issaga
Vidal	Joséphine
Vidal	Victor
Diallo	Lea
Bouhier fabre	Gianni
Le Rû	Louise
Lagathu	Capucine
ROUSSEAU AULO	Janis
FREY PILLET	ANABELLE
FREY PILLET	Ludivine
SACKO	Geidi
BOURGEOIS	Benjamin
LETELLIER	Jean
WERLEN	Jeanne
VALLOT-BAUDRY	Kiryan
ZOUON BI	David
GOLI	Chloé-Nohémie
Diallo	Khalifa
ZAIBI LOUIS	Syrine
GUEHILIZ	Naïl`;

const strictRows = STRICT_RAW.split(/\r?\n/).map((line, index) => {
  const [lastName = "", firstName = ""] = line.split("\t");
  return {
    line: index + 1,
    firstName: clean(firstName),
    lastName: clean(lastName),
    key: nameKey(firstName, lastName),
    label: `${clean(firstName)} ${clean(lastName)}`.trim(),
  };
});

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const [reservationSnap, transportSnap] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);

const reservations = reservationSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transport = transports.find((item) => item.id === TRANSPORT_ID);

if (!transport) {
  console.error(`Transport introuvable: ${TRANSPORT_ID}`);
  process.exit(1);
}

const s3Children = childrenForReservations(reservations)
  .filter((item) => item.week === "S3")
  .filter((item) => !isDeletedStatus(item.reservation.status));
const strictMatches = strictRows.map((strict) => {
  const matches = s3Children
    .filter((item) => item.key === strict.key || item.reversedKey === strict.key)
    .sort((left, right) => scoreReservationMatch(right.reservation) - scoreReservationMatch(left.reservation));
  return { strict, match: matches[0] || null };
});
const missingStrict = strictMatches.filter((item) => !item.match).map((item) => item.strict);

if (missingStrict.length) {
  console.error(JSON.stringify({ error: "missing_strict_children", missingStrict }, null, 2));
  process.exit(1);
}

const transportMatches = strictMatches.filter(({ match }) => !isSurPlace(match.reservation.transport?.departureCity));
const busPassengers = dedupePassengers(transportMatches.map(({ match }) => {
  const { reservation } = match;
  const stay = stayCodeFromName(reservation.sejour?.name || reservation.sejourName);
  return {
    reservationId: reservation.id,
    pickupCity: "Bordeaux",
    dropoffCity: stay === "MCSC" ? "Messanges" : "Bidarray",
    returnCity: stay === "MCSC" ? "Messanges" : "Bidarray",
    nom: reservationChildrenLabel(reservation),
    childName: reservationChildrenLabel(reservation),
    sejourName: stay,
    phone: reservation.legal?.phone || "",
    phones: [reservation.legal?.phone].filter(Boolean),
    children: [{
      firstName: clean(match.child.firstName),
      lastName: clean(match.child.lastName),
      birthDate: clean(match.child.birthDate),
      gender: clean(match.child.gender),
    }],
  };
}));

const childCount = countPassengerChildren(busPassengers);
const stayCounts = countByPassengerStay(busPassengers);
const currentIds = new Set((transport.passengers || []).map((passenger) => passenger.reservationId));
const nextIds = new Set(busPassengers.map((passenger) => passenger.reservationId));
const added = busPassengers.filter((passenger) => !currentIds.has(passenger.reservationId)).map(passengerLabel);
const removed = (transport.passengers || []).filter((passenger) => !nextIds.has(passenger.reservationId)).map(passengerLabel);

const nextSegments = (transport.segments || []).map((segment) => {
  if (segment.id !== SEGMENT_ID) return segment;
  const capacity = Number(segment.sharedCapacity || segment.capacity || 55);
  return {
    ...segment,
    from: "Bordeaux",
    to: "Bidarray",
    mode: segment.mode || "Autocar",
    passengerReservationIds: busPassengers.map((passenger) => passenger.reservationId),
    sharedChildrenCount: childCount,
    sharedCapacity: capacity,
    capacityShortage: Math.max(0, childCount + (segment.assignedStaffIds || []).length - capacity),
    instructions: `Autocar commun S3 aller : tout le monde monte à Bordeaux, ${stayCounts.MCSC || 0} enfants MCSC descendent à Messanges, ${stayCounts.EVCC || 0} enfants EVCC poursuivent vers Bidarray.`,
    stops: [{
      id: "s3-bus-aller-stop-messanges",
      city: "Messanges",
      meetingPoint: "Centre MCSC",
      arrivalTime: "22:45",
      departureTime: "23:05",
      sharedDropoffChildren: stayCounts.MCSC || 0,
      instructions: "Dépose des enfants MCSC à Messanges, puis poursuite vers Bidarray avec les enfants EVCC.",
    }],
  };
});

if (shouldApply) {
  await updateDoc(doc(db, "transports", TRANSPORT_ID), {
    passengers: busPassengers,
    segments: nextSegments,
    departureCity: "Bordeaux",
    arrivalCity: "Bidarray",
    updatedAt: serverTimestamp(),
    s3CommonBusSync: {
      source: "correction autocar commun aller S3 03/08/2026",
      syncedAt: serverTimestamp(),
      children: childCount,
      mcsc: stayCounts.MCSC || 0,
      evcc: stayCounts.EVCC || 0,
    },
  });
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  transportId: TRANSPORT_ID,
  segmentId: SEGMENT_ID,
  strictChildren: strictRows.length,
  strictChildrenWithAllerTransport: transportMatches.length,
  children: childCount,
  stayCounts,
  added,
  removed,
  segment: nextSegments.find((segment) => segment.id === SEGMENT_ID),
}, null, 2));

process.exit(0);

function childrenForReservations(items) {
  const result = [];
  for (const reservation of items) {
    for (const child of reservation.minor?.children || []) {
      result.push({
        reservation,
        child,
        week: weekFromReservation(reservation),
        key: nameKey(child.firstName, child.lastName),
        reversedKey: nameKey(child.lastName, child.firstName),
      });
    }
  }
  return result;
}

function weekFromReservation(reservation) {
  const date = String(reservation.sejour?.startDate || reservation.startDate || "").slice(0, 10);
  if (date === "2026-08-03") return "S3";
  return reservation.week || reservation.sejour?.week || "";
}

function scoreReservationMatch(reservation) {
  let score = 0;
  if (isValidatedStatus(reservation.status)) score += 100;
  if (reservation.id.startsWith("ete26-")) score += 10;
  if (reservation.numeroDeReservation?.startsWith("ETE26")) score += 5;
  return score;
}

function isValidatedStatus(value) {
  return /valid|confirm/.test(normalizeKey(value));
}

function isSurPlace(value) {
  return /surplace|sur place|aucun|non|sans/.test(normalizeKey(value));
}

function dedupePassengers(passengers) {
  const grouped = new Map();
  for (const passenger of passengers) {
    if (!grouped.has(passenger.reservationId)) {
      grouped.set(passenger.reservationId, { ...passenger, children: [] });
    }
    const target = grouped.get(passenger.reservationId);
    for (const child of passenger.children || []) {
      if (!target.children.some((item) => nameKey(item.firstName, item.lastName) === nameKey(child.firstName, child.lastName))) {
        target.children.push(child);
      }
    }
    target.nom = reservationChildrenLabel({ minor: { children: target.children } }) || target.nom || "";
    target.childName = target.nom;
  }
  return [...grouped.values()].sort((left, right) =>
    staySortRank(left.sejourName) - staySortRank(right.sejourName)
    || passengerLabel(left).localeCompare(passengerLabel(right), "fr", { sensitivity: "base" }),
  );
}

function passengerLabel(passenger) {
  return (passenger.children || [])
    .map((child) => `${clean(child.firstName)} ${clean(child.lastName)}`.trim())
    .filter(Boolean)
    .join(", ") || passenger.childName || passenger.nom || passenger.reservationId;
}

function reservationChildrenLabel(reservation) {
  return (reservation.minor?.children || [])
    .map((child) => `${clean(child.firstName)} ${clean(child.lastName)}`.trim())
    .filter(Boolean)
    .join(", ");
}

function countPassengerChildren(passengers) {
  return passengers.reduce((sum, passenger) => sum + Math.max(passenger.children?.length || 0, 1), 0);
}

function countByPassengerStay(passengers) {
  return passengers.reduce((result, passenger) => {
    const key = passenger.sejourName || "?";
    result[key] = (result[key] || 0) + Math.max(passenger.children?.length || 0, 1);
    return result;
  }, {});
}

function stayCodeFromName(value) {
  const key = normalizeKey(value);
  if (key.includes("eaux") || key.includes("evcc") || key.includes("bidarray")) return "EVCC";
  return "MCSC";
}

function staySortRank(value) {
  if (value === "EVCC") return 0;
  if (value === "MCSC") return 1;
  return 2;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
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
