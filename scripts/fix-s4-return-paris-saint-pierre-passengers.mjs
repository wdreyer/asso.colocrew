import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref } from "firebase/storage";

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

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "SN9Uc6i88JNkkScxLzcE";

const keylaId = "2JlzTUf3PAHAJhJwXgEh";
const soumailaId = "DHlTIJYou74nQEAVAhdh";
const meroualId = "2D9PLkzAylHrHC1s3G2w";
const samStaffId = "cc935297-ef32-4f44-bdf6-9e0b8fbfa12a";
const branchSegmentId = "s4-retour-paris-saint-pierre-des-corps-m6arr9";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const storage = getStorage(app);

const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const keylaReservation = await readReservation(keylaId);
const soumailaReservation = await readReservation(soumailaId);
const meroualReservation = await readReservation(meroualId);

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function reservationPassenger(reservation, overrides = {}) {
  const transportData = reservation.transport || {};
  const children = reservation.children?.length ? reservation.children : reservation.minor?.children || [];
  const childName = children.length
    ? children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(" + ")
    : reservation.childName || "";
  return {
    reservationId: reservation.id,
    numeroDeReservation: reservation.numeroDeReservation || "",
    nom: reservation.nom || `${reservation.legal?.firstName || ""} ${reservation.legal?.lastName || ""}`.trim(),
    email: reservation.email || reservation.legal?.email || "",
    emails: reservation.emails || reservation.legal?.emails || [reservation.legal?.email].filter(Boolean),
    phone: reservation.phone || reservation.legal?.phone || "",
    phones: reservation.phones || reservation.legal?.phones || [reservation.legal?.phone].filter(Boolean),
    childName,
    children,
    departureCity: transportData.departureCity || reservation.departureCity || "",
    pickupCity: overrides.pickupCity || (transport.direction === "retour" ? "Dax" : transportData.departureCity || ""),
    dropoffCity: overrides.dropoffCity || transportData.returnCity || reservation.returnCity || "",
    returnCity: overrides.returnCity || transportData.returnCity || reservation.returnCity || "",
    stayCode: overrides.stayCode || "MCSC",
    ...overrides,
  };
}

const fixedPassengers = new Map([
  [keylaId, reservationPassenger(keylaReservation, {
    pickupCity: "Dax",
    dropoffCity: "Paris",
    returnCity: "Paris",
    routeNote: "Retour Dax -> Paris. Descente Paris, pas Saint-Pierre-des-Corps.",
  })],
  [soumailaId, reservationPassenger(soumailaReservation, {
    pickupCity: "Dax",
    dropoffCity: "Paris",
    returnCity: "Paris",
    routeNote: "Retour Dax -> Paris. Descente Paris, pas Saint-Pierre-des-Corps.",
  })],
  [meroualId, reservationPassenger(meroualReservation, {
    pickupCity: "Dax",
    dropoffCity: "Saint-Pierre-des-Corps",
    returnCity: "Saint-Pierre-des-Corps",
    routeNote: "Retour Dax -> Paris, puis embranchement Paris -> Saint-Pierre-des-Corps avec Sam.",
  })],
]);

const passengerIdsToForce = new Set([keylaId, soumailaId, meroualId]);
const retainedPassengers = (transport.passengers || [])
  .filter((passenger) => !passengerIdsToForce.has(passenger.reservationId));
const nextPassengers = [...retainedPassengers, ...fixedPassengers.values()];

const nextSegments = ensureBranchSegment(transport.segments || []).map((segment) => {
  if (segment.id === "s4-retour-dax-paris") {
    return {
      ...segment,
      passengerReservationIds: unique([
        ...(segment.passengerReservationIds || []).filter((id) => id !== meroualId),
        keylaId,
        soumailaId,
        meroualId,
      ]),
      instructions:
        "Convoi commun Dax -> Paris Montparnasse. Keyla Berthe et Soumaila Drame descendent a Paris. Taha et Yahia Meroual poursuivent avec Sam sur la branche Paris -> Saint-Pierre-des-Corps.",
    };
  }
  if (segment.id === branchSegmentId) {
    return {
      ...segment,
      passengerReservationIds: [meroualId],
      assignedStaffIds: unique([...(segment.assignedStaffIds || []), samStaffId]),
      instructions:
        "Sam accompagne Taha et Yahia Meroual de Paris Montparnasse a Saint-Pierre-des-Corps. Arrivee 17:49, depot sur le quai; les parents doivent etre deja presents. Le train repart a 17:53 et Sam reste a bord vers Bordeaux.",
    };
  }
  if (segment.id === "s4-retour-paris-lyon-rangrjtt") {
    return {
      ...segment,
      passengerReservationIds: (segment.passengerReservationIds || []).filter((id) => id !== meroualId),
    };
  }
  return segment;
});

const existingTicketsWithUpdatedTargets = (transport.tickets || []).map((ticket) => {
  if (ticket.id === "s4-retour-dax-paris-anfqbu") {
    return {
      ...ticket,
      coveredReservationIds: unique([
        ...(ticket.coveredReservationIds || []),
        keylaId,
        soumailaId,
        meroualId,
      ]),
      notes:
        "Billet groupe Dax -> Paris du 28/08/2026. Inclut Keyla Berthe, Soumaila Drame et la famille Meroual jusqu'a Paris. Les Meroual poursuivent ensuite Paris -> Saint-Pierre-des-Corps avec Sam.",
      updatedAt: new Date().toISOString(),
    };
  }
  if (ticket.id === "s4-retour-paris-saint-pierre-des-corps-m6arr9") {
    return {
      ...ticket,
      coveredReservationIds: [meroualId],
      coveredStaffIds: unique([...(ticket.coveredStaffIds || []), samStaffId]),
      seat: "Taha MEROUAL: voiture 17 place 747; Sam EYRAUD: voiture 17 place 750; Yahia MEROUAL: voiture 17 place 751",
      notes:
        "Branche retour Meroual. Sam accompagne Taha et Yahia de Paris Montparnasse a Saint-Pierre-des-Corps, arrivee 17:49. Les parents recuperent les enfants sur le quai. Le meme train repart a 17:53 vers Bordeaux avec Sam.",
      updatedAt: new Date().toISOString(),
    };
  }
  if (ticket.id === "s4-retour-paris-lyon-8bja4l") {
    return {
      ...ticket,
      coveredReservationIds: (ticket.coveredReservationIds || []).filter((id) => id !== meroualId),
    };
  }
  return ticket;
});

const branchTicket = await buildBranchTicket();
const nextTickets = existingTicketsWithUpdatedTargets.some((ticket) => ticket.id === branchTicket.id)
  ? existingTicketsWithUpdatedTargets
  : [...existingTicketsWithUpdatedTargets, branchTicket];

const branch = {
  id: "s4-retour-branch-saint-pierre-des-corps",
  label: "Branche Paris > Saint-Pierre-des-Corps",
  date: "2026-08-28",
  from: "Paris",
  to: "Saint-Pierre-des-Corps",
  segmentIds: [branchSegmentId],
  staffIds: [samStaffId],
  passengerReservationIds: [meroualId],
  notes: "Taha et Yahia Meroual recuperes sur le quai de Saint-Pierre-des-Corps a 17:49. Sam continue dans le meme train vers Bordeaux.",
};
const nextBranches = [
  ...(transport.branches || []).filter((item) => item.id !== branch.id),
  branch,
];

const passengerById = new Map(nextPassengers.map((p) => [p.reservationId, p]));
const report = {
  mode: shouldApply ? "apply" : "dry-run",
  transportId,
  passengers: [keylaId, soumailaId, meroualId].map((id) => {
    const p = passengerById.get(id);
    return {
      id,
      ref: p.numeroDeReservation,
      name: p.childName || (p.children || []).map((child) => `${child.firstName} ${child.lastName}`).join(" + "),
      children: (p.children || []).map((child) => `${child.firstName} ${child.lastName}`),
      dropoffCity: p.dropoffCity,
      returnCity: p.returnCity,
    };
  }),
  segments: nextSegments
    .filter((segment) => ["s4-retour-dax-paris", branchSegmentId, "s4-retour-paris-lyon-rangrjtt"].includes(segment.id))
    .map((segment) => ({
      id: segment.id,
      route: `${segment.from} > ${segment.to}`,
      childCount: (segment.passengerReservationIds || []).reduce((total, id) => {
        const passenger = passengerById.get(id);
        return total + Math.max(passenger?.children?.length || 0, 1);
      }, 0),
      targetIds: (segment.passengerReservationIds || []).filter((id) => [keylaId, soumailaId, meroualId].includes(id)),
    })),
  tickets: nextTickets
    .filter((ticket) => ["s4-retour-dax-paris-anfqbu", "s4-retour-paris-saint-pierre-des-corps-m6arr9", "s4-retour-paris-lyon-8bja4l"].includes(ticket.id))
    .map((ticket) => ({
      id: ticket.id,
      route: `${ticket.from} > ${ticket.to}`,
      ref: ticket.bookingReference || ticket.externalReference,
      targetCoveredIds: (ticket.coveredReservationIds || []).filter((id) => [keylaId, soumailaId, meroualId].includes(id)),
    })),
};

console.log(JSON.stringify(report, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    passengers: nextPassengers,
    segments: nextSegments,
    tickets: nextTickets,
    branches: nextBranches,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);

async function readReservation(id) {
  const reservationSnap = await getDoc(doc(db, "reservations", id));
  if (!reservationSnap.exists()) throw new Error(`Reservation introuvable: ${id}`);
  return { id: reservationSnap.id, ...reservationSnap.data() };
}

async function getUrl(storagePath) {
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    return "";
  }
}

async function buildBranchTicket() {
  const files = [
    {
      label: "Taha Meroual",
      storagePath: `transports/${transportId}/billets/2026-08-28-meroual-taha-paris-saint-pierre-m6arr9.pdf`,
      uploadedFileName: "PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_TAHA_M6ARR9_DpdDQfRCqpwj1kUQNyeq.pdf",
      eTicketNumber: "669706184",
      seat: "Voiture 17 place 747",
      price: 37,
      reservationId: meroualId,
      staffId: null,
    },
    {
      label: "Yahia Meroual",
      storagePath: `transports/${transportId}/billets/2026-08-28-meroual-yahia-paris-saint-pierre-m6arr9.pdf`,
      uploadedFileName: "PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_YAHIA_M6ARR9_ZIPO0FCNSpxyrmLWaBTl.pdf",
      eTicketNumber: "338255741",
      seat: "Voiture 17 place 751",
      price: 74,
      reservationId: meroualId,
      staffId: null,
    },
    {
      label: "Sam Eyraud",
      storagePath: `transports/${transportId}/billets/2026-08-28-sam-paris-saint-pierre-m6arr9.pdf`,
      uploadedFileName: "PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_EYRAUD_SAM_M6ARR9_PqvnlUo6xm8ymAsiwZo3.pdf",
      eTicketNumber: "624791804",
      seat: "Voiture 17 place 750",
      price: 74,
      reservationId: null,
      staffId: samStaffId,
    },
  ];
  const filesWithUrls = [];
  for (const file of files) filesWithUrls.push({ ...file, url: await getUrl(file.storagePath) });
  return {
    id: "s4-retour-paris-saint-pierre-des-corps-m6arr9",
    name: "TGV INOUI 8449 - Paris Montparnasse > Saint-Pierre-des-Corps - Meroual + Sam",
    segmentId: branchSegmentId,
    segmentLabel: "Paris Montparnasse > Saint-Pierre-des-Corps",
    from: "Paris",
    to: "Saint-Pierre-des-Corps",
    coverageFrom: "Paris",
    coverageTo: "Saint-Pierre-des-Corps",
    trainType: "TGV INOUI",
    trainNumber: "8449",
    number: "8449",
    date: "2026-08-28",
    departureTime: "16:39",
    arrivalTime: "17:49",
    seats: 3,
    price: 185,
    bookingReference: "M6ARR9",
    externalReference: "M6ARR9",
    eTicketNumbers: filesWithUrls.map((file) => file.eTicketNumber),
    seat: "Taha MEROUAL: voiture 17 place 747; Sam EYRAUD: voiture 17 place 750; Yahia MEROUAL: voiture 17 place 751",
    files: filesWithUrls,
    attachments: filesWithUrls,
    url: filesWithUrls[0]?.url || "",
    storagePath: filesWithUrls[0]?.storagePath || "",
    uploadedFileName: "M6ARR9 - 3 billets Paris Montparnasse > Saint-Pierre-des-Corps",
    coveredReservationIds: [meroualId],
    coveredStaffIds: [samStaffId],
    purchased: true,
    option: false,
    notes:
      "Branche retour Meroual. Sam accompagne Taha et Yahia de Paris Montparnasse a Saint-Pierre-des-Corps, arrivee 17:49. Les parents recuperent les enfants sur le quai. Le meme train repart a 17:53 vers Bordeaux avec Sam.",
    updatedAt: new Date().toISOString(),
  };
}

function ensureBranchSegment(segments) {
  if (segments.some((segment) => segment.id === branchSegmentId)) return segments;
  const branchSegment = {
    id: branchSegmentId,
    from: "Paris",
    to: "Saint-Pierre-des-Corps",
    mode: "Train",
    trainType: "TGV INOUI",
    trainNumber: "8449",
    number: "8449",
    date: "2026-08-28",
    meetingPoint: "Paris Montparnasse 1 et 2",
    meetingTime: "16:15",
    departureTime: "16:39",
    arrivalTime: "17:49",
    stopType: "quai",
    scheduleStatus: "billet achete",
    assignedStaffIds: [samStaffId],
    passengerReservationIds: [meroualId],
    familyPickupOnPlatform: true,
    platformStopMinutes: 4,
    staffContinuation: {
      staffId: samStaffId,
      staffName: "Sam eyraud",
      from: "Saint-Pierre-des-Corps",
      to: "Bordeaux-Saint-Jean",
      departureTime: "17:53",
      arrivalTime: "20:06",
      trainType: "TGV INOUI",
      trainNumber: "8449",
      bookingReference: "N9AJBP",
      ticketAttachmentId: "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp",
    },
  };
  const daxParisIndex = segments.findIndex((segment) => segment.id === "s4-retour-dax-paris");
  const insertionIndex = daxParisIndex >= 0 ? daxParisIndex + 1 : segments.length;
  return [
    ...segments.slice(0, insertionIndex),
    branchSegment,
    ...segments.slice(insertionIndex),
  ];
}
