import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";

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

const IDS = {
  allerNord: "UrYWvoqOWbzNcv53DyCS",
  allerSud: "2induumArFBxjVCTLaw0",
  allerBus: "s2-2026-bus-aller-final",
  retourNord: "04AhMrhz1dYCHxsI7yJp",
  retourSud: "E032d8KCH3OVHdgy5bA5",
  retourBus: "s2-2026-bus-retour-commun",
};
const NORD_CITIES = new Set(["Paris", "Lille", "Nantes", "Bordeaux"]);
const SUD_CITIES = new Set(["Lyon", "Valence", "Montpellier", "Marseille", "Toulouse"]);

const [reservationSnapshot, transportSnapshot] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);
const reservations = reservationSnapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((reservation) =>
    reservation.status === "validated"
    && String(reservation.sejour?.startDate || "").slice(0, 10) === "2026-07-20",
  );
const transports = new Map(transportSnapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
for (const id of Object.values(IDS)) {
  if (!transports.has(id)) throw new Error(`Transport S2 introuvable : ${id}`);
}

function cityFor(reservation, direction) {
  return String(reservation.transport?.[direction === "aller" ? "departureCity" : "returnCity"] || "").trim();
}

function childCount(reservation) {
  return Math.max(reservation.minor?.children?.length || 0, 1);
}

function isOnSite(city) {
  return normalize(city) === "surplace";
}

function campCode(reservation) {
  const name = normalize(reservation.sejour?.name);
  return name.includes("mycreativesurfcamp") || name.includes("mcsc") ? "MCSC" : "EVCC";
}

function campCity(reservation) {
  return campCode(reservation) === "MCSC" ? "Messanges" : "Bidarray";
}

function countChildren(rows) {
  return rows.reduce((total, reservation) => total + childCount(reservation), 0);
}

function expected(direction, cities = null) {
  return reservations.filter((reservation) => {
    const city = cityFor(reservation, direction);
    return city && !isOnSite(city) && (!cities || cities.has(city));
  });
}

function existingPassengerMap(transport) {
  return new Map((transport.passengers || []).map((passenger) => [passenger.reservationId, passenger]));
}

function passengerRows(transport, rows, direction, commonBus = false) {
  const existing = existingPassengerMap(transport);
  const cityOrder = direction === "aller"
    ? ["Lille", "Nantes", "Paris", "Lyon", "Valence", "Montpellier", "Marseille", "Toulouse", "Bordeaux"]
    : ["Bordeaux", "Paris", "Nantes", "Lille", "Toulouse", "Montpellier", "Valence", "Lyon", "Marseille"];
  return [...rows]
    .sort((a, b) => cityOrder.indexOf(cityFor(a, direction)) - cityOrder.indexOf(cityFor(b, direction)))
    .map((reservation) => {
      const previous = existing.get(reservation.id) || {};
      const city = cityFor(reservation, direction);
      const result = {
        reservationId: reservation.id,
        pickupCity: commonBus
          ? direction === "aller" ? "Bordeaux" : campCity(reservation)
          : city,
        dropoffCity: commonBus
          ? direction === "aller" ? campCity(reservation) : "Bordeaux"
          : direction === "aller" ? campCity(reservation) : city,
        stayCode: campCode(reservation),
      };
      if (typeof previous.convocationSent === "boolean") result.convocationSent = previous.convocationSent;
      if (previous.convocationSentAt) result.convocationSentAt = previous.convocationSentAt;
      return result;
    });
}

function childCountForCity(direction, city) {
  return countChildren(expected(direction).filter((reservation) => cityFor(reservation, direction) === city));
}

function namesForCity(direction, city) {
  return expected(direction)
    .filter((reservation) => cityFor(reservation, direction) === city)
    .flatMap((reservation) => reservation.minor?.children || [])
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean);
}

function usefulStop(id, city, arrivalTime, departureTime, direction, extra = {}) {
  const count = childCountForCity(direction, city);
  const action = direction === "aller" ? "Montée" : "Descente";
  return {
    id,
    city,
    arrivalTime,
    departureTime,
    meetingTime: extra.meetingTime || "",
    meetingPoint: "Rendez-vous sur le quai — l’animateur·ice vous contactera",
    stopType: "quai",
    instructions: `${action} de ${count} enfant${count > 1 ? "s" : ""} à ${city}. La voie, la voiture et l'heure précise seront communiquées par l’animateur·ice.`,
    [direction === "aller" ? "sharedPickupChildren" : "sharedDropoffChildren"]: count,
  };
}

function segment(base, values) {
  return { ...base, ...values };
}

function ticketByRef(transport, reference) {
  return (transport.tickets || []).find((ticket) => ticket.bookingReference === reference) || {};
}

function coveredIds(rows) {
  return rows.map((reservation) => reservation.id);
}

function paymentUrl(reference) {
  return `https://www.voyages-train-groupes.sncf.fr/reservation/pay/${reference}?retailerPartnerNumber=804716&locale=fr&currency=EUR`;
}

const allerNord = transports.get(IDS.allerNord);
const allerSud = transports.get(IDS.allerSud);
const allerBus = transports.get(IDS.allerBus);
const retourNord = transports.get(IDS.retourNord);
const retourSud = transports.get(IDS.retourSud);
const retourBus = transports.get(IDS.retourBus);

const allerNordRows = expected("aller", NORD_CITIES);
const allerSudRows = expected("aller", SUD_CITIES);
const retourNordRows = expected("retour", NORD_CITIES);
const retourSudRows = expected("retour", SUD_CITIES);
const allAllerRows = expected("aller");
const allRetourRows = expected("retour");

const allerNordSegments = [
  segment(allerNord.segments?.[0] || {}, {
    id: "7acea846-4387-4b5c-a44a-252a3d726231",
    from: "Lille", to: "Paris", mode: "TGV INOUI", number: "7520",
    meetingPoint: "Gare de Lille Europe", meetingTime: "12:00",
    departureTime: "13:02", arrivalTime: "14:32", stopType: "rdv", stops: [],
    instructions: "8 enfants montent à Lille Europe. Transfert Paris-Nord → Paris Montparnasse à l'arrivée.",
  }),
  segment(allerNord.segments?.[1] || {}, {
    id: "3218d8dd-4be3-4ce8-be85-6b07ce80797a",
    from: "Paris", to: "Bordeaux", mode: "TGV INOUI", number: "",
    meetingPoint: "Gare de Paris Montparnasse – Hall 1", meetingTime: "15:30",
    departureTime: "16:39", arrivalTime: "20:06", stopType: "rdv", stops: [],
    instructions: "Les groupes Lille et Nantes rejoignent les enfants convoqués à Paris avant le départ vers Bordeaux.",
  }),
];
const allerNordBranches = [segment(allerNord.branches?.find((item) => item.id === "s2-aller-nantes-paris") || {}, {
  id: "s2-aller-nantes-paris", from: "Nantes", to: "Paris", mode: "TGV INOUI", number: "12466 / 8916",
  meetingPoint: "Gare de Nantes", meetingTime: "11:10", departureTime: "12:09", arrivalTime: "14:10",
  stopType: "rdv", stops: [], joinsAt: "Paris", kind: "branch", routeKind: "branch", estimatedTimes: false,
  instructions: "4 enfants montent à Nantes. Correspondance dans la même gare à Paris Montparnasse.",
})];

const allerSudSegments = [
  segment(allerSud.segments?.[0] || {}, {
    id: "1c9c0466-3faf-48d3-b118-0ec8a94c8ef8",
    from: "Lyon", to: "Toulouse", mode: "TGV INOUI", number: "6823",
    meetingPoint: "Gare de Lyon Part-Dieu", meetingTime: "11:10", departureTime: "12:10", arrivalTime: "16:20",
    stopType: "rdv",
    stops: [
      usefulStop("s2-aller-6823-valence", "Valence", "12:52", "12:52", "aller", {
        meetingTime: "12:00", meetingPoint: "Gare de Valence TGV Rhône-Alpes Sud",
      }),
    ],
    instructions: "Seule la montée à Valence est affichée. Les enfants de Montpellier prennent l'embranchement venant de Marseille.",
  }),
  segment(allerSud.segments?.[1] || {}, {
    id: "7de4e9df-4257-4e81-87e9-4c8304f092a1",
    from: "Toulouse", to: "Bordeaux", mode: "TGV INOUI", number: "8516",
    meetingPoint: "Gare de Toulouse Matabiau", meetingTime: "16:10", departureTime: "17:09", arrivalTime: "19:40",
    stopType: "rdv", stops: [],
    instructions: "Regroupement des convois Lyon et Marseille avec l'enfant convoqué à Toulouse.",
  }),
];
const allerSudBranches = [segment(allerSud.branches?.find((item) => item.id === "s2-aller-marseille-toulouse") || {}, {
  id: "s2-aller-marseille-toulouse", from: "Marseille", to: "Toulouse", mode: "INTERCITÉS", number: "4760",
  meetingPoint: "Gare de Marseille Saint-Charles", meetingTime: "10:20", departureTime: "11:22", arrivalTime: "15:15",
  stopType: "rdv", stops: [
    usefulStop("s2-aller-4760-montpellier", "Montpellier", "13:03", "13:03", "aller", {
      meetingTime: "12:15", meetingPoint: "Gare de Montpellier Saint-Roch",
    }),
  ], joinsAt: "Toulouse", kind: "branch", routeKind: "branch", estimatedTimes: false,
  instructions: "2 enfants partent de Marseille, 2 montent à Montpellier Saint-Roch, puis le groupe rejoint Toulouse.",
})];

const retourNordSegment = segment(retourNord.segments?.[0] || {}, {
  id: "c8a7c7bf-5ea8-49cc-86e5-9da3ab2f7b65",
  from: "Bordeaux", to: "Paris", mode: "TGV INOUI", number: "8470 / 8512",
  meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier", meetingTime: "13:45",
  departureTime: "14:46", arrivalTime: "17:15", stopType: "rdv", stops: [],
  instructions: "Les 2 enfants de Bordeaux quittent le groupe avant ce train. Aucun arrêt intermédiaire sans enfant n'est affiché.",
  scheduleStatus: "réservation groupe – paiement en attente",
});
const retourNordBranches = [
  segment(retourNord.branches?.find((item) => item.id === "s2-retour-paris-nantes") || {}, {
    id: "s2-retour-paris-nantes", from: "Paris", to: "Nantes", mode: "TGV INOUI", number: "8821",
    meetingPoint: "Gare de Paris Montparnasse", meetingTime: "17:45", departureTime: "18:15", arrivalTime: "20:21",
    stopType: "rdv", stops: [], joinsAt: "Paris", kind: "branch", routeKind: "branch", estimatedTimes: false,
    instructions: "Correspondance dans la même gare à Paris Montparnasse. Réservation R5MY5YCU.",
    scheduleStatus: "réservation groupe – paiement en attente",
  }),
  segment(retourNord.branches?.find((item) => item.id === "s2-retour-paris-lille") || {}, {
    id: "s2-retour-paris-lille", from: "Paris", to: "Lille", mode: "TGV INOUI", number: "7069",
    meetingPoint: "Gare de Paris-Nord", meetingTime: "18:15", departureTime: "18:45", arrivalTime: "19:48",
    stopType: "rdv", stops: [], joinsAt: "Paris", kind: "branch", routeKind: "branch", estimatedTimes: false,
    instructions: "Transfert Paris Montparnasse → Paris-Nord puis train direct vers Lille Flandres. Réservation RSBG8VL5.",
    scheduleStatus: "réservation groupe – paiement en attente",
  }),
];

const retourSudSegment = segment(retourSud.segments?.[0] || {}, {
  id: "d9550583-b326-4b0b-b436-8f73399cd22e",
  from: "Bordeaux", to: "Toulouse", mode: "INTERCITÉS", number: "4663",
  meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier", meetingTime: "13:10",
  departureTime: "14:10", arrivalTime: "16:37", stopType: "rdv", stops: [],
  instructions: "Aucun arrêt intermédiaire n'est affiché : aucun enfant ne descend à Agen ou Montauban.",
  scheduleStatus: "réservations groupe – paiement en attente",
});
const retourSudBranches = [
  segment(retourSud.branches?.find((item) => item.id === "s2-retour-toulouse-lyon") || {}, {
    id: "s2-retour-toulouse-lyon", from: "Toulouse", to: "Lyon", mode: "TGV INOUI", number: "6875",
    meetingPoint: "Gare de Toulouse Matabiau", meetingTime: "17:10", departureTime: "17:41", arrivalTime: "21:38",
    stopType: "rdv", joinsAt: "Toulouse", kind: "branch", routeKind: "branch", estimatedTimes: false,
    stops: [
      usefulStop("s2-retour-6875-valence", "Valence", "20:56", "20:59", "retour", {
        meetingPoint: "Gare de Valence TGV Rhône-Alpes Sud",
      }),
    ],
    instructions: "Seule la descente à Valence est affichée avant Lyon. Les enfants de Montpellier prennent l'embranchement vers Marseille.",
    scheduleStatus: "réservation groupe – paiement en attente",
  }),
  segment(retourSud.branches?.find((item) => item.id === "s2-retour-toulouse-marseille") || {}, {
    id: "s2-retour-toulouse-marseille", from: "Toulouse", to: "Marseille", mode: "INTERCITÉS", number: "4665",
    meetingPoint: "Gare de Toulouse Matabiau", meetingTime: "18:00", departureTime: "18:45", arrivalTime: "22:39",
    stopType: "rdv", stops: [
      usefulStop("s2-retour-4665-montpellier", "Montpellier", "20:54", "20:57", "retour", {
        meetingPoint: "Gare de Montpellier Saint-Roch",
      }),
    ], joinsAt: "Toulouse", kind: "branch", routeKind: "branch", estimatedTimes: false,
    instructions: "2 enfants descendent à Montpellier Saint-Roch et 3 poursuivent vers Marseille. Billets individuels Toulouse → Montpellier à acheter.",
    scheduleStatus: "billet manquant",
  }),
];

const mcscAller = allAllerRows.filter((reservation) => campCode(reservation) === "MCSC");
const evccAller = allAllerRows.filter((reservation) => campCode(reservation) === "EVCC");
const mcscRetour = allRetourRows.filter((reservation) => campCode(reservation) === "MCSC");
const evccRetour = allRetourRows.filter((reservation) => campCode(reservation) === "EVCC");
const allerBusSegment = segment(allerBus.segments?.[0] || {}, {
  id: "s2-bus-aller-bordeaux-bidarray", from: "Bordeaux", to: "Bidarray", mode: "Autocar", number: "",
  meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier", meetingTime: "20:15",
  departureTime: "20:30", arrivalTime: "00:40", arrivalDateOffset: 1, stopType: "rdv",
  capacity: 55, sharedCapacity: 55, sharedChildrenCount: countChildren(allAllerRows), sharedBus: true,
  stops: [{
    id: "s2-bus-aller-stop-messanges", city: "Messanges", meetingPoint: "Centre MCSC",
    meetingTime: "", arrivalTime: "22:45", departureTime: "23:05", stopType: "quai",
    sharedDropoffChildren: countChildren(mcscAller),
    instructions: `Descente des ${countChildren(mcscAller)} enfants MCSC et pause de 20 minutes.`,
  }],
  instructions: `52 enfants au total : ${countChildren(mcscAller)} descendent à Messanges et ${countChildren(evccAller)} poursuivent vers Bidarray.`,
});
const retourBusSegment = segment(retourBus.segments?.[0] || {}, {
  id: "s2-bus-retour-bidarray-bordeaux", from: "Bidarray", to: "Bordeaux", mode: "Autocar", number: "",
  meetingPoint: "Centre EVCC – Bidarray", meetingTime: "08:15", departureTime: "08:30", arrivalTime: "12:40",
  stopType: "rdv", capacity: 55, sharedCapacity: 55, sharedChildrenCount: countChildren(allRetourRows),
  sharedStartChildren: countChildren(evccRetour), sharedBus: true,
  stops: [{
    id: "s2-bus-retour-stop-messanges", city: "Messanges", meetingPoint: "Centre MCSC",
    meetingTime: "09:50", arrivalTime: "10:05", departureTime: "10:25", stopType: "rdv",
    sharedPickupChildren: countChildren(mcscRetour),
    instructions: `Prise en charge des ${countChildren(mcscRetour)} enfants MCSC et pause de 20 minutes.`,
  }],
  instructions: `${countChildren(evccRetour)} enfants partent de Bidarray, ${countChildren(mcscRetour)} montent à Messanges, soit ${countChildren(allRetourRows)} enfants vers Bordeaux.`,
});

const nordReturnTrainRows = retourNordRows.filter((reservation) => cityFor(reservation, "retour") !== "Bordeaux");
const lyonReturnRows = retourSudRows.filter((reservation) => ["Lyon", "Valence"].includes(cityFor(reservation, "retour")));
const montpellierReturnRows = retourSudRows.filter((reservation) => cityFor(reservation, "retour") === "Montpellier");
const marseilleReturnRows = retourSudRows.filter((reservation) => cityFor(reservation, "retour") === "Marseille");
const lilleReturnRows = retourNordRows.filter((reservation) => cityFor(reservation, "retour") === "Lille");
const nantesReturnRows = retourNordRows.filter((reservation) => cityFor(reservation, "retour") === "Nantes");

const splitSouthRows = (() => {
  const groups = [[], []];
  const totals = [0, 0];
  for (const reservation of retourSudRows) {
    const index = totals[0] <= totals[1] ? 0 : 1;
    groups[index].push(reservation);
    totals[index] += childCount(reservation);
  }
  return groups;
})();

const allerNordTickets = [
  { ...ticketByRef(allerNord, "9LZJXR"), segmentId: allerNordSegments[0].id, trainType: "TGV INOUI", trainNumber: "7520", departureTime: "13:02", arrivalTime: "14:32", coveredReservationIds: coveredIds(allerNordRows.filter((r) => cityFor(r, "aller") === "Lille")) },
  { ...ticketByRef(allerNord, "R943Q9_DREYER_R5FDV6"), segmentId: allerNordBranches[0].id, trainType: "TGV INOUI", trainNumber: "12466 / 8916", departureTime: "12:09", arrivalTime: "14:10", coveredReservationIds: coveredIds(allerNordRows.filter((r) => cityFor(r, "aller") === "Nantes")) },
  { ...ticketByRef(allerNord, "R94MZA_DREYER_TTP2FU"), segmentId: allerNordSegments[1].id, trainType: "TGV INOUI", departureTime: "16:39", arrivalTime: "20:06", coveredReservationIds: coveredIds(allerNordRows.filter((r) => cityFor(r, "aller") !== "Bordeaux")) },
];
const allerSudTickets = [
  { ...ticketByRef(allerSud, "1MDUXW"), segmentId: allerSudSegments[0].id, trainType: "TGV INOUI", trainNumber: "6823", departureTime: "12:10", arrivalTime: "16:20", coveredReservationIds: coveredIds(allerSudRows.filter((r) => ["Lyon", "Valence"].includes(cityFor(r, "aller")))) },
  { ...ticketByRef(allerSud, "Y4TMFX"), segmentId: allerSudBranches[0].id, trainType: "INTERCITÉS", trainNumber: "4760", departureTime: "11:22", arrivalTime: "15:15", coveredReservationIds: coveredIds(allerSudRows.filter((r) => cityFor(r, "aller") === "Marseille")) },
  {
    id: "s2-aller-montpellier-individual", segmentId: allerSudBranches[0].id,
    name: "À acheter – 2 billets individuels INTERCITÉS 4760 Montpellier > Toulouse",
    bookingReference: "", trainType: "INTERCITÉS", trainNumber: "4760", from: "Montpellier", to: "Toulouse",
    coverageFrom: "Montpellier", coverageTo: "Toulouse", segmentLabel: "Montpellier Saint-Roch > Toulouse Matabiau",
    departureTime: "13:03", arrivalTime: "15:15", seats: 2, price: 0, purchased: false,
    coveredReservationIds: coveredIds(allerSudRows.filter((r) => cityFor(r, "aller") === "Montpellier")),
    notes: "Billets individuels à acheter pour Christina Fernandez-Cano et Lucas Hamiche.",
  },
  {
    ...(ticketByRef(allerSud, "425CDI").id ? ticketByRef(allerSud, "425CDI") : ticketByRef(allerSud, "R54SQ5L8")),
    id: "s2-aller-toulouse-bordeaux-425cdi",
    segmentId: allerSudSegments[1].id,
    name: "TGV INOUI 8516 – Toulouse Matabiau > Bordeaux Saint-Jean (18 places)",
    bookingReference: "425CDI",
    trainType: "TGV INOUI",
    trainNumber: "8516",
    departureTime: "17:09",
    arrivalTime: "19:40",
    seats: 18,
    purchased: true,
    coveredReservationIds: coveredIds(allerSudRows),
    notes: "Billet confirmé pour 18 voyageurs le lundi 20 juillet 2026. Remplace l'ancienne préréservation R54SQ5L8 de 11 places.",
  },
];
const retourNordTickets = [
  {
    ...ticketByRef(retourNord, "RHAR3ST9"), id: "s2-retour-rhar3st9", segmentId: retourNordSegment.id,
    name: "TGV INOUI 8470 / 8512 – Bordeaux > Paris (43 places)", bookingReference: "RHAR3ST9",
    trainType: "TGV INOUI", trainNumber: "8470 / 8512", from: "Bordeaux", to: "Paris",
    coverageFrom: "Bordeaux", coverageTo: "Paris", segmentLabel: "Bordeaux Saint-Jean > Paris Montparnasse",
    departureTime: "14:46", arrivalTime: "17:15", seats: 43, price: 0, purchased: false,
    paymentDueAt: "2026-07-21T14:46:00+02:00", paymentUrl: paymentUrl("RHAR3ST9"), coveredReservationIds: coveredIds(nordReturnTrainRows),
  },
  {
    id: "s2-retour-r5my5ycu", segmentId: "s2-retour-paris-nantes", name: "TGV INOUI 8821 – Paris > Nantes (10 places)",
    bookingReference: "R5MY5YCU", trainType: "TGV INOUI", trainNumber: "8821", from: "Paris", to: "Nantes",
    coverageFrom: "Paris", coverageTo: "Nantes", segmentLabel: "Paris Montparnasse > Nantes",
    departureTime: "18:15", arrivalTime: "20:21", seats: 10, price: 0, purchased: false,
    paymentDueAt: "2026-07-21T18:15:00+02:00", paymentUrl: paymentUrl("R5MY5YCU"), coveredReservationIds: coveredIds(nantesReturnRows),
    notes: "Réservation groupe extraite de Ticketsalleretour.pdf. Paiement dû avant le 21/07/2026 à 18h15.",
  },
  {
    id: "s2-retour-rsbg8vl5", segmentId: "s2-retour-paris-lille", name: "TGV INOUI 7069 – Paris Nord > Lille Flandres (11 places)",
    bookingReference: "RSBG8VL5", trainType: "TGV INOUI", trainNumber: "7069", from: "Paris", to: "Lille",
    coverageFrom: "Paris", coverageTo: "Lille", segmentLabel: "Paris Nord > Lille Flandres",
    departureTime: "18:45", arrivalTime: "19:48", seats: 11, price: 0, purchased: false,
    paymentDueAt: "2026-07-21T18:45:00+02:00", paymentUrl: paymentUrl("RSBG8VL5"), coveredReservationIds: coveredIds(lilleReturnRows),
    notes: "Réservation groupe extraite de Ticketsalleretour.pdf. Paiement dû avant le 21/07/2026 à 18h45.",
  },
];
const retourSudTickets = [
  ...["R5LBFBKI", "RURP633W"].map((reference, index) => ({
    ...ticketByRef(retourSud, reference), id: `s2-retour-${reference.toLowerCase()}`, segmentId: retourSudSegment.id,
    name: `INTERCITÉS 4663 – Bordeaux > Toulouse (18 places – réservation ${index + 1}/2)`, bookingReference: reference,
    trainType: "INTERCITÉS", trainNumber: "4663", from: "Bordeaux", to: "Toulouse",
    coverageFrom: "Bordeaux", coverageTo: "Toulouse", segmentLabel: "Bordeaux Saint-Jean > Toulouse Matabiau",
    departureTime: "14:10", arrivalTime: "16:37", seats: 18, price: 0, purchased: false,
    paymentDueAt: "2026-07-21T14:10:00+02:00", paymentUrl: paymentUrl(reference), coveredReservationIds: coveredIds(splitSouthRows[index]),
  })),
  {
    id: "s2-retour-r1dn3kh1", segmentId: "s2-retour-toulouse-lyon", name: "TGV INOUI 6875 – Toulouse > Lyon (11 places)",
    bookingReference: "R1DN3KH1", trainType: "TGV INOUI", trainNumber: "6875", from: "Toulouse", to: "Lyon",
    coverageFrom: "Toulouse", coverageTo: "Lyon", segmentLabel: "Toulouse Matabiau > Lyon Part-Dieu",
    departureTime: "17:41", arrivalTime: "21:38", seats: 11, price: 0, purchased: false,
    paymentDueAt: "2026-07-21T17:41:00+02:00", paymentUrl: paymentUrl("R1DN3KH1"), coveredReservationIds: coveredIds(lyonReturnRows),
    notes: "Réservation groupe extraite de Ticketsalleretour.pdf. Paiement dû avant le 21/07/2026 à 17h41.",
  },
  {
    id: "s2-retour-marseille-missing", segmentId: "s2-retour-toulouse-marseille", name: "À acheter – INTERCITÉS 4665 Toulouse > Marseille (minimum 4 places)",
    bookingReference: "", trainType: "INTERCITÉS", trainNumber: "4665", from: "Toulouse", to: "Marseille",
    coverageFrom: "Toulouse", coverageTo: "Marseille", segmentLabel: "Toulouse Matabiau > Marseille Saint-Charles",
    departureTime: "18:45", arrivalTime: "22:39", seats: 4, price: 0, purchased: false,
    coveredReservationIds: coveredIds(marseilleReturnRows), notes: "Billet absent de Ticketsalleretour.pdf : 3 enfants + au moins 1 animateur·ice.",
  },
  {
    id: "s2-retour-montpellier-individual", segmentId: "s2-retour-toulouse-marseille", name: "À acheter – 2 billets individuels INTERCITÉS 4665 Toulouse > Montpellier",
    bookingReference: "", trainType: "INTERCITÉS", trainNumber: "4665", from: "Toulouse", to: "Montpellier",
    coverageFrom: "Toulouse", coverageTo: "Montpellier", segmentLabel: "Toulouse Matabiau > Montpellier Saint-Roch",
    departureTime: "18:45", arrivalTime: "20:54", seats: 2, price: 0, purchased: false,
    coveredReservationIds: coveredIds(montpellierReturnRows), notes: "Billets individuels à acheter pour Christina Fernandez-Cano et Lucas Hamiche.",
  },
];

const patches = new Map([
  [IDS.allerNord, { passengers: passengerRows(allerNord, allerNordRows, "aller"), segments: allerNordSegments, branches: allerNordBranches, tickets: allerNordTickets, departureTime: "13:02", arrivalTime: "20:06", status: "brouillon" }],
  [IDS.allerSud, { passengers: passengerRows(allerSud, allerSudRows, "aller"), segments: allerSudSegments, branches: allerSudBranches, tickets: allerSudTickets, departureTime: "12:10", arrivalTime: "19:40", status: "brouillon" }],
  [IDS.allerBus, {
    passengers: passengerRows(allerBus, allAllerRows, "aller", true), segments: [allerBusSegment], branches: [],
    tickets: (allerBus.tickets || []).map((ticket) => ({ ...ticket, segmentId: allerBusSegment.id, departureTime: "20:30", arrivalTime: "00:40", seats: 55, price: 920 })),
    departureTime: "20:30", arrivalTime: "00:40", arrivalDateOffset: 1, status: "brouillon",
  }],
  [IDS.retourNord, { passengers: passengerRows(retourNord, retourNordRows, "retour"), segments: [retourNordSegment], branches: retourNordBranches, tickets: retourNordTickets, departureTime: "14:46", arrivalTime: "19:48", status: "brouillon" }],
  [IDS.retourSud, { passengers: passengerRows(retourSud, retourSudRows, "retour"), segments: [retourSudSegment], branches: retourSudBranches, tickets: retourSudTickets, departureTime: "14:10", arrivalTime: "21:38", status: "brouillon" }],
  [IDS.retourBus, {
    passengers: passengerRows(retourBus, allRetourRows, "retour", true), segments: [retourBusSegment], branches: [],
    tickets: (retourBus.tickets || []).map((ticket) => ({ ...ticket, segmentId: retourBusSegment.id, departureTime: "08:30", arrivalTime: "12:40", seats: 55, price: 920 })),
    departureTime: "08:30", arrivalTime: "12:40", status: "brouillon",
  }],
]);

const audit = auditPatches(patches);
console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} – réconciliation complète S2`);
console.log(`Enfants transportés : ${countChildren(allAllerRows)} à l'aller, ${countChildren(allRetourRows)} au retour.`);
console.log("Villes aller :", citySummary("aller"));
console.log("Villes retour :", citySummary("retour"));
console.log("Arrêts enfants conservés : aller Valence, Montpellier, Messanges ; retour Messanges, Montpellier, Valence.");
console.log("Réservations retour PDF : R5LBFBKI, RURP633W, RHAR3ST9, R1DN3KH1, R5MY5YCU, RSBG8VL5.");
if (audit.errors.length) {
  console.error("ERREURS AUDIT :", audit.errors);
  process.exit(1);
}
console.log(`Audit nominatif : ${audit.checkedAssignments} affectations enfant/direction vérifiées, aucune ville non couverte.`);
console.log("Points de vigilance : 0 animateur assigné ; Toulouse→Bordeaux aller dispose de 18 places pour 15 enfants ; deux réservations retour Bordeaux→Toulouse totalisent 36 places pour 15 enfants ; billets retour Marseille et Montpellier à acheter.");

if (shouldApply) {
  const batch = writeBatch(db);
  for (const [id, patch] of patches) {
    batch.update(doc(db, "transports", id), {
      ...patch,
      scheduleUpdatedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  const savedSnapshot = await getDocs(collection(db, "transports"));
  const savedPatches = new Map(savedSnapshot.docs
    .filter((item) => Object.values(IDS).includes(item.id))
    .map((item) => [item.id, item.data()]));
  const savedAudit = auditPatches(savedPatches);
  const savedReferences = new Set([...savedPatches.values()].flatMap((transport) =>
    (transport.tickets || []).map((ticket) => ticket.bookingReference).filter(Boolean),
  ));
  const expectedPdfReferences = ["R5LBFBKI", "RURP633W", "RHAR3ST9", "R1DN3KH1", "R5MY5YCU", "RSBG8VL5"];
  if (savedAudit.errors.length || expectedPdfReferences.some((reference) => !savedReferences.has(reference))) {
    throw new Error(`La vérification après écriture a échoué : ${savedAudit.errors.join(" ; ") || "référence PDF absente"}`);
  }
  console.log("Mise à jour Firebase terminée et relue : 6 références PDF présentes, 103 affectations valides.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function auditPatches(candidatePatches) {
  const errors = [];
  let checkedAssignments = 0;
  for (const direction of ["aller", "retour"]) {
    const rows = expected(direction);
    const nordId = direction === "aller" ? IDS.allerNord : IDS.retourNord;
    const sudId = direction === "aller" ? IDS.allerSud : IDS.retourSud;
    const busId = direction === "aller" ? IDS.allerBus : IDS.retourBus;
    for (const reservation of rows) {
      const city = cityFor(reservation, direction);
      const feederId = NORD_CITIES.has(city) ? nordId : SUD_CITIES.has(city) ? sudId : "";
      if (!feederId) errors.push(`${reservation.id} : ville ${city} sans convoi ${direction}`);
      const feederHits = [nordId, sudId].filter((id) => candidatePatches.get(id).passengers.some((passenger) => passenger.reservationId === reservation.id));
      if (feederHits.length !== 1 || feederHits[0] !== feederId) errors.push(`${reservation.id} : mauvaise affectation feeder ${direction}`);
      const busHits = candidatePatches.get(busId).passengers.filter((passenger) => passenger.reservationId === reservation.id).length;
      if (busHits !== 1) errors.push(`${reservation.id} : affectation bus ${direction} = ${busHits}`);
      const feeder = candidatePatches.get(feederId);
      const routeCities = new Set([
        ...(feeder.segments || []).flatMap((item) => [item.from, item.to, ...(item.stops || []).map((stop) => stop.city)]),
        ...(feeder.branches || []).flatMap((item) => [item.from, item.to, ...(item.stops || []).map((stop) => stop.city)]),
      ]);
      if (!routeCities.has(city)) errors.push(`${reservation.id} : ville ${city} absente du trajet ${direction}`);
      checkedAssignments += childCount(reservation);
    }
  }
  for (const [id, patch] of candidatePatches) {
    for (const portion of [...(patch.segments || []), ...(patch.branches || [])]) {
      if (!portion.from || !portion.to || !portion.departureTime || !portion.arrivalTime || !portion.meetingTime) {
        errors.push(`${id}/${portion.id} : horaire principal incomplet`);
      }
      for (const stop of portion.stops || []) {
        if (!stop.city || !stop.arrivalTime || !stop.departureTime) errors.push(`${id}/${portion.id}/${stop.id} : horaire d'arrêt incomplet`);
      }
    }
    for (const ticket of patch.tickets || []) {
      if (!ticket.departureTime || !ticket.arrivalTime) errors.push(`${id}/${ticket.id} : horaire billet incomplet`);
    }
  }
  return { errors, checkedAssignments };
}

function citySummary(direction) {
  return Object.fromEntries([...new Set(expected(direction).map((reservation) => cityFor(reservation, direction)))]
    .sort()
    .map((city) => [city, childCountForCity(direction, city)]));
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
