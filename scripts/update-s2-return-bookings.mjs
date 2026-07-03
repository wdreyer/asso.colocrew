import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

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

const [transportSnapshot, reservationSnapshot] = await Promise.all([
  getDocs(collection(db, "transports")),
  getDocs(collection(db, "reservations")),
]);
const transports = transportSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const reservations = new Map(reservationSnapshot.docs.map((item) => [item.id, item.data()]));
const nord = transports.find((transport) => transport.id === "04AhMrhz1dYCHxsI7yJp");
const sudOuest = transports.find((transport) => transport.id === "E032d8KCH3OVHdgy5bA5");
if (!nord || !sudOuest) throw new Error("Les convois retour S2 sont introuvables.");

function returnCity(passenger) {
  return reservations.get(passenger.reservationId)?.transport?.returnCity
    || passenger.returnCity
    || passenger.dropoffCity
    || "";
}

function enrichPassengers(transport) {
  return (transport.passengers || []).map((passenger) => {
    const city = returnCity(passenger);
    return { ...passenger, returnCity: city, dropoffCity: city };
  });
}

function stop(id, city, arrivalTime, departureTime = "", extra = {}) {
  return {
    id,
    city,
    arrivalTime,
    departureTime,
    stopType: "quai",
    meetingPoint: `Gare de ${city}`,
    instructions: "",
    ...extra,
  };
}

const nordPassengers = enrichPassengers(nord);
const sudOuestPassengers = enrichPassengers(sudOuest);
const nordSegment = {
  ...(nord.segments || [])[0],
  id: "c8a7c7bf-5ea8-49cc-86e5-9da3ab2f7b65",
  from: "Bordeaux",
  to: "Paris",
  mode: "TGV INOUI",
  number: "8470 / 8512",
  meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier",
  meetingTime: "13:45",
  departureTime: "14:46",
  arrivalTime: "17:15",
  stopType: "rdv",
  stops: [
    stop("s2-retour-8470-angouleme", "Angoulême", "15:21", "15:24"),
  ],
  instructions: "Train groupe confirmé par la réservation RHAR3ST9. Arrivée à Paris Montparnasse.",
  scheduleStatus: "réservation groupe confirmée – paiement en attente",
};

const nordBranches = [
  {
    ...(nord.branches || []).find((branch) => branch.id === "s2-retour-paris-lille"),
    id: "s2-retour-paris-lille",
    from: "Paris",
    to: "Lille",
    mode: "TGV INOUI",
    number: "7069",
    meetingPoint: "Gare de Paris-Nord – quai communiqué par l'animateur·ice",
    meetingTime: "18:15",
    departureTime: "18:45",
    arrivalTime: "19:48",
    stopType: "rdv",
    joinsAt: "Paris",
    routeKind: "branch",
    kind: "branch",
    stops: [],
    instructions: "Transfert en métro de Paris Montparnasse à Paris-Nord, puis TGV direct vers Lille Flandres. Horaire à confirmer lors de l'achat du billet.",
    estimatedTimes: true,
    scheduleStatus: "billet à acheter",
  },
  {
    ...(nord.branches || []).find((branch) => branch.id === "s2-retour-paris-nantes"),
    id: "s2-retour-paris-nantes",
    from: "Paris",
    to: "Nantes",
    mode: "TGV INOUI",
    number: "8931 / 8985",
    meetingPoint: "Gare de Paris Montparnasse – quai communiqué par l'animateur·ice",
    meetingTime: "18:15",
    departureTime: "18:47",
    arrivalTime: "20:54",
    stopType: "rdv",
    joinsAt: "Paris",
    routeKind: "branch",
    kind: "branch",
    stops: [
      stop("s2-retour-nantes-sable", "Sablé-sur-Sarthe", "19:51", "19:54"),
      stop("s2-retour-nantes-angers", "Angers Saint-Laud", "20:13", "20:16"),
    ],
    instructions: "Correspondance dans la même gare à Paris Montparnasse. Horaire à confirmer lors de l'achat du billet.",
    estimatedTimes: true,
    scheduleStatus: "billet à acheter",
  },
];

const nordTrainPassengerIds = nordPassengers
  .filter((passenger) => returnCity(passenger) !== "Bordeaux")
  .map((passenger) => passenger.reservationId);
const nordTickets = [
  {
    id: "s2-retour-rhar3st9",
    name: "TGV INOUI 8470 / 8512 – Bordeaux > Paris (43 places)",
    segmentId: nordSegment.id,
    segmentLabel: "Bordeaux Saint-Jean > Paris Montparnasse",
    from: "Bordeaux",
    to: "Paris",
    coverageFrom: "Bordeaux",
    coverageTo: "Paris",
    trainType: "TGV INOUI",
    trainNumber: "8470 / 8512",
    departureTime: "14:46",
    arrivalTime: "17:15",
    seats: 43,
    price: 0,
    purchased: false,
    bookingReference: "RHAR3ST9",
    paymentDueAt: "2026-07-21T14:46:00+02:00",
    paymentUrl: "https://www.voyages-train-groupes.sncf.fr/reservation/pay/RHAR3ST9?retailerPartnerNumber=804716&locale=fr&currency=EUR",
    coveredReservationIds: nordTrainPassengerIds,
    notes: "Réservation groupe du 31/07/2026. Paiement dû avant le 21/07/2026 à 14h46.",
  },
];

const sudOuestSegment = {
  ...(sudOuest.segments || [])[0],
  id: "d9550583-b326-4b0b-b436-8f73399cd22e",
  from: "Bordeaux",
  to: "Toulouse",
  mode: "INTERCITÉS",
  number: "4663",
  meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier",
  meetingTime: "13:10",
  departureTime: "14:10",
  arrivalTime: "16:37",
  stopType: "rdv",
  stops: [
    stop("s2-retour-4663-agen", "Agen", "15:23", "15:26"),
    stop("s2-retour-4663-montauban", "Montauban Ville Bourbon", "16:00", "16:03"),
  ],
  instructions: "Train groupe confirmé par les réservations R5LBFBKI et RURP633W. Un enfant descend à Toulouse ; les autres poursuivent sur leur embranchement.",
  scheduleStatus: "réservations groupe confirmées – paiement en attente",
};

const sudOuestBranches = [
  {
    ...(sudOuest.branches || []).find((branch) => branch.id === "s2-retour-toulouse-lyon"),
    id: "s2-retour-toulouse-lyon",
    from: "Toulouse",
    to: "Lyon",
    mode: "TGV INOUI",
    number: "6875",
    meetingPoint: "Gare de Toulouse Matabiau – quai communiqué par l'animateur·ice",
    meetingTime: "17:10",
    departureTime: "17:41",
    arrivalTime: "21:38",
    stopType: "rdv",
    joinsAt: "Toulouse",
    routeKind: "branch",
    kind: "branch",
    stops: [
      stop("s2-retour-6875-carcassonne", "Carcassonne", "18:26", "18:29"),
      stop("s2-retour-6875-narbonne", "Narbonne", "18:57", "19:00"),
      stop("s2-retour-6875-beziers", "Béziers", "19:13", "19:16"),
      stop("s2-retour-6875-sete", "Sète", "19:38", "19:41"),
      stop("s2-retour-6875-montpellier", "Montpellier", "19:55", "19:58", { meetingPoint: "Gare de Montpellier Sud de France", sharedDropoffChildren: 2 }),
      stop("s2-retour-6875-nimes", "Nîmes Pont du Gard", "20:16", "20:19"),
      stop("s2-retour-6875-valence", "Valence", "20:56", "20:59", { meetingPoint: "Gare de Valence TGV Rhône-Alpes Sud", sharedDropoffChildren: 1 }),
    ],
    instructions: "TGV direct desservant Montpellier Sud de France, Valence TGV et Lyon Part-Dieu. Horaire à confirmer lors de l'achat du billet.",
    estimatedTimes: true,
    scheduleStatus: "billet à acheter",
  },
  {
    ...(sudOuest.branches || []).find((branch) => branch.id === "s2-retour-toulouse-marseille"),
    id: "s2-retour-toulouse-marseille",
    from: "Toulouse",
    to: "Marseille",
    mode: "INTERCITÉS",
    number: "4665",
    meetingPoint: "Gare de Toulouse Matabiau – quai communiqué par l'animateur·ice",
    meetingTime: "18:00",
    departureTime: "18:45",
    arrivalTime: "22:39",
    stopType: "rdv",
    joinsAt: "Toulouse",
    routeKind: "branch",
    kind: "branch",
    stops: [
      stop("s2-retour-4665-carcassonne", "Carcassonne", "19:27", "19:30"),
      stop("s2-retour-4665-narbonne", "Narbonne", "19:57", "20:00"),
      stop("s2-retour-4665-beziers", "Béziers", "20:14", "20:17"),
      stop("s2-retour-4665-montpellier", "Montpellier Saint-Roch", "20:54", "20:57"),
      stop("s2-retour-4665-nimes", "Nîmes Centre", "21:24", "21:27"),
    ],
    instructions: "INTERCITÉS direct vers Marseille Saint-Charles. Horaire à confirmer lors de l'achat du billet.",
    estimatedTimes: true,
    scheduleStatus: "billet à acheter",
  },
];

const sudOuestPassengerIds = sudOuestPassengers.map((passenger) => passenger.reservationId);
const splitIndex = Math.ceil(sudOuestPassengerIds.length / 2);
const firstBookingPassengerIds = sudOuestPassengerIds.slice(0, splitIndex);
const secondBookingPassengerIds = sudOuestPassengerIds.slice(splitIndex);
const commonTicketFields = {
  segmentId: sudOuestSegment.id,
  segmentLabel: "Bordeaux Saint-Jean > Toulouse Matabiau",
  from: "Bordeaux",
  to: "Toulouse",
  coverageFrom: "Bordeaux",
  coverageTo: "Toulouse",
  trainType: "INTERCITÉS",
  trainNumber: "4663",
  departureTime: "14:10",
  arrivalTime: "16:37",
  seats: 18,
  price: 0,
  purchased: false,
};
const sudOuestTickets = [
  {
    ...commonTicketFields,
    id: "s2-retour-r5lbfbki",
    name: "INTERCITÉS 4663 – Bordeaux > Toulouse (18 places – réservation 1/2)",
    bookingReference: "R5LBFBKI",
    coveredReservationIds: firstBookingPassengerIds,
    paymentDueAt: "2026-07-21T14:10:00+02:00",
    paymentUrl: "https://www.voyages-train-groupes.sncf.fr/reservation/pay/R5LBFBKI?retailerPartnerNumber=804716&locale=fr&currency=EUR",
    notes: "Réservation groupe du 31/07/2026. Paiement dû avant le 21/07/2026 à 14h10.",
  },
  {
    ...commonTicketFields,
    id: "s2-retour-rurp633w",
    name: "INTERCITÉS 4663 – Bordeaux > Toulouse (18 places – réservation 2/2)",
    bookingReference: "RURP633W",
    coveredReservationIds: secondBookingPassengerIds,
    paymentDueAt: "2026-07-21T14:10:00+02:00",
    paymentUrl: "https://www.voyages-train-groupes.sncf.fr/reservation/pay/RURP633W?retailerPartnerNumber=804716&locale=fr&currency=EUR",
    notes: "Réservation groupe du 31/07/2026. Paiement dû avant le 21/07/2026 à 14h10.",
  },
];

const nordPatch = {
  passengers: nordPassengers,
  segments: [nordSegment],
  branches: nordBranches,
  tickets: nordTickets,
  departureTime: "14:46",
  arrivalTime: "19:48",
  status: "brouillon",
  scheduleUpdatedAt: new Date().toISOString(),
  updatedAt: serverTimestamp(),
};
const sudOuestPatch = {
  passengers: sudOuestPassengers,
  segments: [sudOuestSegment],
  branches: sudOuestBranches,
  tickets: sudOuestTickets,
  departureTime: "14:10",
  arrivalTime: "21:38",
  status: "brouillon",
  scheduleUpdatedAt: new Date().toISOString(),
  updatedAt: serverTimestamp(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} – retour S2 du 31/07/2026`);
console.log("INTERCITÉS 4663 : Bordeaux 14:10 → Agen 15:23 → Montauban 16:00 → Toulouse 16:37 (2 × 18 places)");
console.log("TGV INOUI 8470 / 8512 : Bordeaux 14:46 → Angoulême 15:21 → Paris 17:15 (43 places)");
console.log("Embranchements proposés : Toulouse → Lyon 17:41–21:38, Toulouse → Marseille 18:45–22:39, Paris → Lille 18:45–19:48, Paris → Nantes 18:47–20:54.");

if (shouldApply) {
  await Promise.all([
    updateDoc(doc(db, "transports", nord.id), nordPatch),
    updateDoc(doc(db, "transports", sudOuest.id), sudOuestPatch),
  ]);
  const [savedNord, savedSudOuest] = await Promise.all([
    getDoc(doc(db, "transports", nord.id)),
    getDoc(doc(db, "transports", sudOuest.id)),
  ]);
  const savedTransports = [savedNord.data(), savedSudOuest.data()];
  const savedReferences = new Set(savedTransports.flatMap((transport) =>
    (transport.tickets || []).map((ticket) => ticket.bookingReference),
  ));
  const expectedReferences = ["R5LBFBKI", "RURP633W", "RHAR3ST9"];
  const uncoveredCities = savedTransports.flatMap((transport) => {
    const routeCities = new Set([
      ...(transport.segments || []).flatMap((segment) => [segment.from, segment.to, ...(segment.stops || []).map((item) => item.city)]),
      ...(transport.branches || []).flatMap((branch) => [branch.from, branch.to, ...(branch.stops || []).map((item) => item.city)]),
    ]);
    return (transport.passengers || [])
      .map((passenger) => passenger.returnCity)
      .filter((city) => city && !routeCities.has(city));
  });
  if (expectedReferences.some((reference) => !savedReferences.has(reference)) || uncoveredCities.length > 0) {
    throw new Error(`La vérification Firebase a échoué. Villes non couvertes : ${[...new Set(uncoveredCities)].join(", ") || "aucune"}.`);
  }
  console.log("Mise à jour Firebase vérifiée : 3 réservations enregistrées et toutes les villes enfants couvertes.");
  console.log("Les embranchements non réservés restent marqués « billet à acheter ».");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
