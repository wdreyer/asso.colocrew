import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function childCount(reservation) {
  return Array.isArray(reservation.minor?.children) && reservation.minor.children.length
    ? reservation.minor.children.length
    : 1;
}

function childrenNames(reservation) {
  return (reservation.minor?.children || [])
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean);
}

function ids(reservations) {
  return reservations.map((reservation) => reservation.id);
}

function count(reservations) {
  return reservations.reduce((sum, reservation) => sum + childCount(reservation), 0);
}

function passengers(reservations, direction) {
  return reservations.map((reservation) => ({
    reservationId: reservation.id,
    pickupCity: direction === "aller" ? reservation.transport?.departureCity || "" : "Dax",
    departureCity: reservation.transport?.departureCity || "",
    dropoffCity: direction === "aller" ? "Dax" : reservation.transport?.returnCity || "",
    returnCity: reservation.transport?.returnCity || "",
  }));
}

function stop(id, city, arrivalTime, departureTime, extras = {}) {
  return {
    id,
    city,
    arrivalTime,
    departureTime,
    meetingTime: extras.meetingTime || "",
    meetingPoint: extras.meetingPoint || "",
    stopType: extras.stopType || "quai",
    platform: extras.platform || "",
    instructions: extras.instructions || "",
    ...extras,
  };
}

function ticket(base) {
  return {
    price: "",
    purchased: false,
    fileUrl: "",
    fileName: "",
    createdFrom: "manual_s4_restructure_2026_08_07",
    ...base,
  };
}

function summarizeTransport(patch, groupedReservations) {
  return {
    title: patch.sejourName,
    direction: patch.direction,
    route: `${patch.departureCity} -> ${patch.arrivalCity}`,
    passengers: patch.passengers.length,
    children: count(groupedReservations),
    segments: (patch.segments || []).map((segment) => ({
      id: segment.id,
      route: `${segment.from} -> ${segment.to}`,
      time: `${segment.departureTime || "?"} -> ${segment.arrivalTime || "?"}`,
      reservations: segment.passengerReservationIds?.length || 0,
      children: segment.sharedPickupChildren || segment.sharedDropoffChildren || segment.sharedChildrenCount || "",
      stops: (segment.stops || []).map((s) => `${s.city} ${s.arrivalTime || ""}${s.departureTime ? `/${s.departureTime}` : ""}`),
    })),
    branches: (patch.branches || []).map((branch) => ({
      id: branch.id,
      route: `${branch.from} -> ${branch.to}`,
      time: `${branch.departureTime || "?"} -> ${branch.arrivalTime || "?"}`,
      reservations: branch.passengerReservationIds?.length || 0,
      children: branch.sharedPickupChildren || branch.sharedDropoffChildren || branch.sharedChildrenCount || "",
    })),
    tickets: (patch.tickets || []).map((t) => ({
      id: t.id,
      route: `${t.from} -> ${t.to}`,
      ref: t.bookingReference || t.externalReference || "",
      seats: t.seats,
      time: `${t.departureTime || "?"} -> ${t.arrivalTime || "?"}`,
      due: t.paymentDueAt || "",
    })),
  };
}

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
const [transportSnap, reservationSnap] = await Promise.all([
  getDocs(collection(db, "transports")),
  getDocs(collection(db, "reservations")),
]);

const transports = new Map(transportSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
const reservations = reservationSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((reservation) => String(reservation.sejour?.startDate || "").slice(0, 10) === "2026-08-17")
  .filter((reservation) => normalize(reservation.status) === "validated")
  .sort((a, b) => String(a.numeroDeReservation || a.id).localeCompare(String(b.numeroDeReservation || b.id), "fr"));

const byDeparture = (cities) => reservations.filter((reservation) => cities.includes(reservation.transport?.departureCity || ""));
const byReturn = (cities) => reservations.filter((reservation) => cities.includes(reservation.transport?.returnCity || ""));

const northAller = byDeparture(["Valence", "Lyon", "Paris"]);
const toulouseAller = byDeparture(["Toulouse"]);
const northRetour = byReturn(["Paris", "Lyon", "Valence"]);
const toulouseRetour = byReturn(["Toulouse"]);

const transportIds = {
  allerNorth: "a3nfZsgZQRhGxPEFvmAn",
  allerToulouse: "Ibr1tfH35ACGlbJbJR4B",
  retourNorth: "SN9Uc6i88JNkkScxLzcE",
  retourToulouse: "bYO5pWEIqEbFjdNGEp4b",
};

const lyonIds = ids(byDeparture(["Lyon", "Valence"]));
const valenceIds = ids(byDeparture(["Valence"]));
const parisDaxIds = ids(northAller);
const retourParisDaxIds = ids(northRetour);
const retourLyonValenceIds = ids(byReturn(["Lyon", "Valence"]));
const retourValenceIds = ids(byReturn(["Valence"]));

const patches = {
  [transportIds.allerNorth]: {
    ...transports.get(transportIds.allerNorth),
    sejourName: "Été 2026 - S4 - Aller - Convoi commun via Paris",
    routeGroup: "nord",
    direction: "aller",
    date: "2026-08-17",
    departureCity: "Valence",
    arrivalCity: "Dax",
    departureTime: "",
    arrivalTime: "19:31",
    meetingTime: "",
    meetingPoint: "",
    trainType: "Train",
    trainNumber: "RGFPN18B / RC9H849I",
    capacity: 20,
    passengers: passengers(northAller, "aller"),
    segments: [
      {
        id: "s4-aller-valence-lyon",
        from: "Valence",
        to: "Lyon",
        mode: "Train",
        trainType: "Train",
        number: "",
        meetingPoint: "Gare de Valence TGV Rhône-Alpes Sud",
        meetingTime: "",
        departureTime: "",
        arrivalTime: "",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: valenceIds,
        sharedPickupChildren: count(byDeparture(["Valence"])),
        stops: [],
        instructions: "Le jeune de Valence rejoint le groupe à Lyon. Horaire Valence -> Lyon à compléter dès billet confirmé.",
        scheduleStatus: "billet à acheter / horaire à confirmer",
      },
      {
        id: "s4-aller-lyon-paris-rgfpn18b",
        from: "Lyon",
        to: "Paris",
        mode: "Train",
        trainType: "Train",
        number: "RGFPN18B",
        meetingPoint: "Gare de Lyon Part-Dieu",
        meetingTime: "10:34",
        departureTime: "11:34",
        arrivalTime: "13:30",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: lyonIds,
        sharedPickupChildren: count(byDeparture(["Lyon", "Valence"])),
        stops: [],
        instructions: "RDV parents à Lyon Part-Dieu 1h avant le départ du train RGFPN18B. Le jeune de Valence est déjà intégré au groupe à Lyon.",
        scheduleStatus: "option groupe confirmée - paiement en attente",
      },
      {
        id: "s4-aller-paris-dax-rc9h849i",
        from: "Paris",
        to: "Dax",
        mode: "Train",
        trainType: "Train",
        number: "RC9H849I",
        meetingPoint: "Gare SNCF Paris Montparnasse - espace d'attente Hall 1 - Niveau 2 sortie Mouchotte (Espace Maine) - entre Moleskine et Sephora",
        meetingTime: "15:00",
        departureTime: "15:56",
        arrivalTime: "19:31",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: parisDaxIds,
        sharedPickupChildren: count(northAller),
        stops: [],
        instructions: "RDV parents Paris à 15:00. Les enfants de Valence/Lyon rejoignent les enfants convoqués à Paris, puis tout le groupe prend le Paris Montparnasse -> Dax RC9H849I.",
        scheduleStatus: "option groupe confirmée - paiement en attente",
      },
    ],
    branches: [],
    tickets: [
      ticket({
        id: "s4-aller-lyon-paris-rgfpn18b-option",
        segmentId: "s4-aller-lyon-paris-rgfpn18b",
        segmentLabel: "Lyon Part-Dieu > Paris Gare de Lyon Hall 1 & 2",
        name: "Option groupe RGFPN18B - Lyon Part-Dieu > Paris Gare de Lyon (10 places)",
        bookingReference: "RGFPN18B",
        externalReference: "RGFPN18B",
        trainType: "Train",
        trainNumber: "RGFPN18B",
        from: "Lyon",
        to: "Paris",
        coverageFrom: "Lyon",
        coverageTo: "Paris",
        date: "2026-08-17",
        departureTime: "11:34",
        arrivalTime: "13:30",
        seats: 10,
        option: true,
        paymentDueAt: "2026-08-07T18:04:00+02:00",
        coveredReservationIds: lyonIds,
        notes: "Créé depuis capture SNCF : 10 places, paiement dû avant le 07/08/2026 à 18:04. Prix non visible sur la capture.",
      }),
      ticket({
        id: "s4-aller-paris-dax-rc9h849i-option",
        segmentId: "s4-aller-paris-dax-rc9h849i",
        segmentLabel: "Paris Montparnasse > Dax",
        name: "Option groupe RC9H849I - Paris Montparnasse > Dax (20 places)",
        bookingReference: "RC9H849I",
        externalReference: "RC9H849I",
        trainType: "Train",
        trainNumber: "RC9H849I",
        from: "Paris",
        to: "Dax",
        coverageFrom: "Paris",
        coverageTo: "Dax",
        date: "2026-08-17",
        departureTime: "15:56",
        arrivalTime: "19:31",
        seats: 20,
        option: true,
        paymentDueAt: "2026-08-07T17:40:00+02:00",
        coveredReservationIds: parisDaxIds,
        notes: "Créé depuis capture SNCF : 20 places, paiement dû avant le 07/08/2026 à 17:40. Prix non visible sur la capture.",
      }),
    ],
    updatedAt: serverTimestamp(),
  },
  [transportIds.allerToulouse]: {
    ...transports.get(transportIds.allerToulouse),
    sejourName: "Été 2026 - S4 - Aller - Toulouse direct Dax",
    routeGroup: "sud-ouest",
    direction: "aller",
    date: "2026-08-17",
    departureCity: "Toulouse",
    arrivalCity: "Dax",
    departureTime: "15:31",
    arrivalTime: "19:08",
    meetingTime: "14:31",
    meetingPoint: "Gare de Toulouse Matabiau",
    trainType: "Train",
    trainNumber: "",
    capacity: count(toulouseAller),
    passengers: passengers(toulouseAller, "aller"),
    segments: [
      {
        id: "s4-aller-toulouse-dax",
        from: "Toulouse",
        to: "Dax",
        mode: "Train",
        trainType: "Train",
        number: "",
        meetingPoint: "Gare de Toulouse Matabiau",
        meetingTime: "14:31",
        departureTime: "15:31",
        arrivalTime: "19:08",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: ids(toulouseAller),
        sharedPickupChildren: count(toulouseAller),
        stops: [],
        instructions: "RDV parents à Toulouse Matabiau à 14:31, départ 15:31, arrivée Dax 19:08.",
        scheduleStatus: "horaire confirmé par capture",
      },
    ],
    branches: [],
    tickets: [],
    updatedAt: serverTimestamp(),
  },
  [transportIds.retourNorth]: {
    ...transports.get(transportIds.retourNorth),
    sejourName: "Été 2026 - S4 - Retour - Convoi commun via Paris",
    routeGroup: "nord",
    direction: "retour",
    date: "2026-08-28",
    departureCity: "Dax",
    arrivalCity: "Valence",
    departureTime: "",
    arrivalTime: "",
    meetingTime: "",
    meetingPoint: "Gare de Dax",
    trainType: "Train",
    trainNumber: "",
    capacity: count(northRetour),
    passengers: passengers(northRetour, "retour"),
    segments: [
      {
        id: "s4-retour-dax-paris",
        from: "Dax",
        to: "Paris",
        mode: "Train",
        trainType: "Train",
        number: "",
        meetingPoint: "Gare de Dax",
        meetingTime: "",
        departureTime: "",
        arrivalTime: "",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: retourParisDaxIds,
        sharedPickupChildren: count(northRetour),
        stops: [],
        instructions: "Retour commun Dax -> Paris pour les enfants Paris/Lyon/Valence. Horaires et billet à compléter.",
        scheduleStatus: "billet à acheter / horaire à confirmer",
      },
      {
        id: "s4-retour-paris-lyon-rangrjtt",
        from: "Paris",
        to: "Lyon",
        mode: "Train",
        trainType: "Train",
        number: "RANGRJTT",
        meetingPoint: "Paris Gare de Lyon Hall 1 & 2",
        meetingTime: "",
        departureTime: "17:52",
        arrivalTime: "19:54",
        stopType: "quai",
        platform: "",
        passengerReservationIds: retourLyonValenceIds,
        sharedDropoffChildren: count(byReturn(["Lyon", "Valence"])),
        stops: [],
        instructions: "À Paris, les enfants Lyon/Valence quittent le groupe Paris et prennent le Paris Gare de Lyon -> Lyon Part-Dieu RANGRJTT.",
        scheduleStatus: "option groupe confirmée - paiement en attente",
      },
      {
        id: "s4-retour-lyon-valence",
        from: "Lyon",
        to: "Valence",
        mode: "Train",
        trainType: "Train",
        number: "",
        meetingPoint: "Gare de Lyon Part-Dieu",
        meetingTime: "",
        departureTime: "",
        arrivalTime: "",
        stopType: "quai",
        platform: "",
        passengerReservationIds: retourValenceIds,
        sharedDropoffChildren: count(byReturn(["Valence"])),
        stops: [],
        instructions: "Le jeune de Valence poursuit après Lyon. Horaire Lyon -> Valence à compléter dès billet confirmé.",
        scheduleStatus: "billet à acheter / horaire à confirmer",
      },
    ],
    branches: [],
    tickets: [
      ticket({
        id: "s4-retour-paris-lyon-rangrjtt-option",
        segmentId: "s4-retour-paris-lyon-rangrjtt",
        segmentLabel: "Paris Gare de Lyon Hall 1 & 2 > Lyon Part-Dieu",
        name: "Option groupe RANGRJTT - Paris Gare de Lyon > Lyon Part-Dieu (10 places)",
        bookingReference: "RANGRJTT",
        externalReference: "RANGRJTT",
        trainType: "Train",
        trainNumber: "RANGRJTT",
        from: "Paris",
        to: "Lyon",
        coverageFrom: "Paris",
        coverageTo: "Lyon",
        date: "2026-08-28",
        departureTime: "17:52",
        arrivalTime: "19:54",
        seats: 10,
        option: true,
        paymentDueAt: "2026-08-18T17:52:00+02:00",
        coveredReservationIds: retourLyonValenceIds,
        notes: "Créé depuis capture SNCF : 10 places, paiement dû avant le 18/08/2026 à 17:52. Prix non visible sur la capture.",
      }),
    ],
    updatedAt: serverTimestamp(),
  },
  [transportIds.retourToulouse]: {
    ...transports.get(transportIds.retourToulouse),
    sejourName: "Été 2026 - S4 - Retour - Dax direct Toulouse",
    routeGroup: "sud-ouest",
    direction: "retour",
    date: "2026-08-28",
    departureCity: "Dax",
    arrivalCity: "Toulouse",
    departureTime: "",
    arrivalTime: "",
    meetingTime: "",
    meetingPoint: "Gare de Dax",
    trainType: "Train",
    trainNumber: "",
    capacity: count(toulouseRetour),
    passengers: passengers(toulouseRetour, "retour"),
    segments: [
      {
        id: "s4-retour-dax-toulouse",
        from: "Dax",
        to: "Toulouse",
        mode: "Train",
        trainType: "Train",
        number: "",
        meetingPoint: "Gare de Dax",
        meetingTime: "",
        departureTime: "",
        arrivalTime: "",
        stopType: "rdv",
        platform: "",
        passengerReservationIds: ids(toulouseRetour),
        sharedPickupChildren: count(toulouseRetour),
        stops: [],
        instructions: "Retour direct Dax -> Toulouse. Horaires et billet à compléter.",
        scheduleStatus: "billet à acheter / horaire à confirmer",
      },
    ],
    branches: [],
    tickets: [],
    updatedAt: serverTimestamp(),
  },
};

const summary = {
  mode: shouldApply ? "apply" : "dry-run",
  childrenByGroup: {
    allerViaParis: count(northAller),
    allerToulouse: count(toulouseAller),
    retourViaParis: count(northRetour),
    retourToulouse: count(toulouseRetour),
  },
  reservationsByGroup: {
    allerViaParis: northAller.map((reservation) => ({ id: reservation.id, ref: reservation.numeroDeReservation || "", city: reservation.transport?.departureCity || "", children: childrenNames(reservation) })),
    allerToulouse: toulouseAller.map((reservation) => ({ id: reservation.id, ref: reservation.numeroDeReservation || "", city: reservation.transport?.departureCity || "", children: childrenNames(reservation) })),
    retourViaParis: northRetour.map((reservation) => ({ id: reservation.id, ref: reservation.numeroDeReservation || "", city: reservation.transport?.returnCity || "", children: childrenNames(reservation) })),
    retourToulouse: toulouseRetour.map((reservation) => ({ id: reservation.id, ref: reservation.numeroDeReservation || "", city: reservation.transport?.returnCity || "", children: childrenNames(reservation) })),
  },
  transports: {
    allerViaParis: summarizeTransport(patches[transportIds.allerNorth], northAller),
    allerToulouse: summarizeTransport(patches[transportIds.allerToulouse], toulouseAller),
    retourViaParis: summarizeTransport(patches[transportIds.retourNorth], northRetour),
    retourToulouse: summarizeTransport(patches[transportIds.retourToulouse], toulouseRetour),
  },
};

console.log(JSON.stringify(summary, null, 2));

if (shouldApply) {
  await Promise.all(Object.entries(patches).map(([transportId, patch]) => {
    const { id, ...payload } = patch;
    return updateDoc(doc(db, "transports", transportId), payload);
  }));
}
