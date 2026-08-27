import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

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
const parisLyonSegmentId = "s4-retour-paris-lyon-rangrjtt";
const valenceBranchId = "s4-retour-lyon-valence-ykjav8";
const kaisReservationId = "BLouSqR2utaBBHi7R4Vp";
const rayanStaffId = "057f664a-04c5-48e1-9eee-fed14746d961";
const cheriheneStaffId = "08c9772c-b437-4f54-a54f-d5739790cb9d";
const oldRayanAttachmentId = "s4-retour-staff-rayan-lyon-paris-v9lmce";

const files = {
  kaisLyonValence: "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-VALENCE_TGV_RH_NE-ALPES_SUD_28-08-26_EVIN_DJERIDI_KAIS_YKJAV8_Xq67vQcZTp1q6sAiEOUY.pdf",
  cheriheneLyonValence: "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-VALENCE_TGV_RH_NE-ALPES_SUD_28-08-26_KAMECHE_CHERIHENE_YKJAV8_APeIOPZlG5nJKcHpo5u8.pdf",
  rayanLyonValence: "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-VALENCE_TGV_RH_NE-ALPES_SUD_28-08-26_MOHAMED_HASSAN_FADL_RAYAN_YKJAV8_4TzBQjutKnPBf3CiTjaT.pdf",
  cheriheneValenceLyon: "C:\\Users\\dreye\\Downloads\\VALENCE_TGV_RH_NE-ALPES_SUD-LYON_PART_DIEU_29-08-26_KAMECHE_CHERIHENE_EAC6TN_zORDbbsTcXEScfq4F0yA.pdf",
  rayanValenceLyon: "C:\\Users\\dreye\\Downloads\\VALENCE_TGV_RH_NE-ALPES_SUD-LYON_PART_DIEU_29-08-26_MOHAMED_HASSAN_FADL_RAYAN_EAC6TN_q8Wa5uqTZP1RaOOIvFZZ.pdf",
  rayanLyonParis: "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-PARIS_GARE_DE_LYON_29-08-26_MOHAMED_HASSAN_FADL_RAYAN_V9LMCE_u6yrRtTHSplU7IPTyG6V.pdf",
};

for (const [key, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) throw new Error(`PDF introuvable (${key}): ${filePath}`);
}

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

async function uploadPdf(kind, filePath) {
  const storagePath = `transports/${transportId}/${kind.folder}/2026-08-28-${kind.id}.pdf`;
  if (!shouldApply) return { url: "", storagePath, uploadedFileName: path.basename(filePath) };
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(filePath), {
    contentType: "application/pdf",
  });
  return { url: await getDownloadURL(uploaded.ref), storagePath, uploadedFileName: path.basename(filePath) };
}

const ticketSources = [
  {
    id: "s4-retour-lyon-valence-ykjav8-kais",
    filePath: files.kaisLyonValence,
    name: "TGV INOUI 5316 - Lyon Part-Dieu > Valence TGV - Kais Evin-Djeridi",
    travelerName: "Kais Evin-Djeridi",
    price: 11,
    eTicketNumber: "305125784",
    seat: "Voiture 6 haut place 665",
    coveredReservationIds: [kaisReservationId],
    coveredStaffIds: [],
  },
  {
    id: "s4-retour-lyon-valence-ykjav8-cherihene",
    filePath: files.cheriheneLyonValence,
    name: "TGV INOUI 5316 - Lyon Part-Dieu > Valence TGV - Cherihene Kameche",
    travelerName: "Cherihene Kameche",
    price: 22,
    eTicketNumber: "636312951",
    seat: "Voiture 6 haut place 668",
    coveredReservationIds: [],
    coveredStaffIds: [cheriheneStaffId],
  },
  {
    id: "s4-retour-lyon-valence-ykjav8-rayan",
    filePath: files.rayanLyonValence,
    name: "TGV INOUI 5316 - Lyon Part-Dieu > Valence TGV - Rayan",
    travelerName: "Rayan Mohamed Hassan Fadl",
    price: 22,
    eTicketNumber: "679510061",
    seat: "Voiture 6 haut place 664",
    coveredReservationIds: [],
    coveredStaffIds: [rayanStaffId],
  },
];

const staffAttachmentSources = [
  {
    id: "s4-retour-staff-cherihene-hotel-valence-2026-08-28",
    staffId: cheriheneStaffId,
    staffName: "Chérihène Kameche",
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV",
    date: "2026-08-28",
    from: "Valence",
    to: "Hotel",
    trainType: "Hotel",
    trainNumber: "",
    departureTime: "",
    arrivalTime: "",
    bookingReference: "Hotel Valence",
    eTicketNumber: "",
    seat: "",
    price: "",
    url: "",
    storagePath: "",
    uploadedFileName: "",
    notes: "Hotel staff Chérihène a Valence, nuit du 28 au 29 août. Piece jointe de suivi sans PDF fourni.",
  },
  {
    id: "s4-retour-staff-rayan-hotel-valence-2026-08-28",
    staffId: rayanStaffId,
    staffName: "Rayan Mohamed Hassan Fadl",
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV",
    date: "2026-08-28",
    from: "Valence",
    to: "Hotel",
    trainType: "Hotel",
    trainNumber: "",
    departureTime: "",
    arrivalTime: "",
    bookingReference: "Hotel Valence",
    eTicketNumber: "",
    seat: "",
    price: "",
    url: "",
    storagePath: "",
    uploadedFileName: "",
    notes: "Hotel staff Rayan a Valence, nuit du 28 au 29 août. Piece jointe de suivi sans PDF fourni.",
  },
  {
    id: "s4-retour-staff-cherihene-valence-lyon-eac6tn",
    staffId: cheriheneStaffId,
    staffName: "Chérihène Kameche",
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV",
    date: "2026-08-29",
    from: "Valence TGV Rhône-Alpes Sud",
    to: "Lyon Part-Dieu",
    trainType: "TGV INOUI",
    trainNumber: "6871",
    departureTime: "11:11",
    arrivalTime: "11:48",
    bookingReference: "EAC6TN",
    eTicketNumber: "551943273",
    seat: "Voiture 7 haut place 786",
    price: 35,
    filePath: files.cheriheneValenceLyon,
    notes: "Billet staff Chérihène du 29/08/2026 : Valence TGV 11:11 > Lyon Part-Dieu 11:48.",
  },
  {
    id: "s4-retour-staff-rayan-valence-lyon-eac6tn",
    staffId: rayanStaffId,
    staffName: "Rayan Mohamed Hassan Fadl",
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV",
    date: "2026-08-29",
    from: "Valence TGV Rhône-Alpes Sud",
    to: "Lyon Part-Dieu",
    trainType: "TGV INOUI",
    trainNumber: "6871",
    departureTime: "11:11",
    arrivalTime: "11:48",
    bookingReference: "EAC6TN",
    eTicketNumber: "354877382",
    seat: "Voiture 7 haut place 787",
    price: 35,
    filePath: files.rayanValenceLyon,
    notes: "Billet staff Rayan du 29/08/2026 : Valence TGV 11:11 > Lyon Part-Dieu 11:48.",
  },
  {
    id: "s4-retour-staff-rayan-lyon-paris-v9lmce-2026-08-29",
    staffId: rayanStaffId,
    staffName: "Rayan Mohamed Hassan Fadl",
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV",
    date: "2026-08-29",
    from: "Lyon Part-Dieu",
    to: "Paris Gare de Lyon",
    trainType: "TGV INOUI",
    trainNumber: "6616",
    departureTime: "12:00",
    arrivalTime: "13:58",
    bookingReference: "V9LMCE",
    eTicketNumber: "245899583",
    seat: "Voiture 6 haut place 677",
    price: 84,
    filePath: files.rayanLyonParis,
    notes: "Billet staff Rayan du 29/08/2026 : Lyon Part-Dieu 12:00 > Paris Gare de Lyon 13:58.",
  },
];

const uploadedTickets = [];
for (const source of ticketSources) {
  const uploaded = await uploadPdf({ folder: "billets", id: source.id }, source.filePath);
  uploadedTickets.push({
    id: source.id,
    name: source.name,
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    uploadedFileName: uploaded.uploadedFileName,
    segmentId: valenceBranchId,
    segmentLabel: "Lyon Part-Dieu > Valence TGV Rhône-Alpes Sud",
    from: "Lyon",
    to: "Valence",
    coverageFrom: "Lyon",
    coverageTo: "Valence",
    date: "2026-08-28",
    departureTime: "20:40",
    arrivalTime: "21:15",
    trainType: "TGV INOUI",
    trainNumber: "5316",
    seats: 1,
    price: source.price,
    purchased: true,
    option: false,
    bookingReference: "YKJAV8",
    externalReference: "YKJAV8",
    eTicketNumber: source.eTicketNumber,
    eTicketNumbers: [source.eTicketNumber],
    seat: source.seat,
    coveredReservationIds: source.coveredReservationIds,
    coveredStaffIds: source.coveredStaffIds,
    notes: `Billet ${source.travelerName} du 28/08/2026. Lyon Part-Dieu 20:40 > Valence TGV 21:15. Dossier YKJAV8.`,
    updatedAt: new Date().toISOString(),
  });
}

const uploadedAttachments = [];
for (const source of staffAttachmentSources) {
  let uploaded = { url: source.url || "", storagePath: source.storagePath || "", uploadedFileName: source.uploadedFileName || "" };
  if (source.filePath) {
    uploaded = await uploadPdf({ folder: "staff-billets", id: source.id }, source.filePath);
  }
  uploadedAttachments.push({
    id: source.id,
    staffId: source.staffId,
    staffName: source.staffName,
    segmentId: source.segmentId,
    segmentLabel: source.segmentLabel,
    date: source.date,
    from: source.from,
    to: source.to,
    trainType: source.trainType,
    trainNumber: source.trainNumber,
    departureTime: source.departureTime,
    arrivalTime: source.arrivalTime,
    bookingReference: source.bookingReference,
    externalReference: source.bookingReference,
    eTicketNumber: source.eTicketNumber,
    eTicketNumbers: source.eTicketNumber ? [source.eTicketNumber] : [],
    seat: source.seat,
    price: source.price,
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    uploadedFileName: uploaded.uploadedFileName,
    visibleInRoutes: true,
    purchased: true,
    option: false,
    notes: source.notes,
    updatedAt: new Date().toISOString(),
  });
}

const valenceBranch = {
  id: valenceBranchId,
  from: "Lyon",
  to: "Valence",
  joinsAt: "Lyon",
  mode: "Train",
  trainType: "TGV INOUI",
  number: "5316",
  trainNumber: "5316",
  date: "2026-08-28",
  meetingPoint: "Lyon Part-Dieu - correspondance depuis Paris",
  meetingTime: "20:22",
  departureTime: "20:40",
  arrivalTime: "21:15",
  stopType: "quai",
  scheduleStatus: "billet achete",
  assignedStaffIds: [rayanStaffId, cheriheneStaffId],
  passengerReservationIds: [kaisReservationId],
  instructions:
    "Embranchement apres le Paris -> Lyon : Kais continue vers Valence avec Rayan et Chérihène. TGV INOUI 5316, depart Lyon Part-Dieu 20:40, arrivee Valence TGV 21:15.",
};

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

const nextSegments = (transport.segments || []).map((segment) => {
  if (segment.id !== parisLyonSegmentId) return segment;
  return {
    ...segment,
    assignedStaffIds: unique([...(segment.assignedStaffIds || []), cheriheneStaffId]),
    passengerReservationIds: unique([...(segment.passengerReservationIds || []), kaisReservationId]),
    instructions: `${segment.instructions || "Paris Gare de Lyon -> Lyon Part-Dieu."} Chérihène est aussi affectée sur ce segment avant l'embranchement Lyon -> Valence.`,
  };
});

const nextBranches = [
  ...(transport.branches || []).filter((branch) => branch.id !== valenceBranchId),
  valenceBranch,
];

const ticketIds = new Set(uploadedTickets.map((ticket) => ticket.id));
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !ticketIds.has(ticket.id)),
  ...uploadedTickets,
];

const attachmentIds = new Set([
  oldRayanAttachmentId,
  ...uploadedAttachments.map((attachment) => attachment.id),
]);
const nextStaffTicketAttachments = [
  ...(transport.staffTicketAttachments || []).filter((attachment) => !attachmentIds.has(attachment.id)),
  ...uploadedAttachments,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - branche Valence S4 retour`);
console.log(JSON.stringify({
  transportId,
  parisLyonSegment: {
    id: parisLyonSegmentId,
    addStaff: cheriheneStaffId,
    keepPassenger: kaisReservationId,
  },
  branch: {
    id: valenceBranch.id,
    route: `${valenceBranch.from} > ${valenceBranch.to}`,
    time: `${valenceBranch.departureTime} > ${valenceBranch.arrivalTime}`,
    children: valenceBranch.passengerReservationIds.length,
    staff: valenceBranch.assignedStaffIds.length,
  },
  tickets: uploadedTickets.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    children: ticket.coveredReservationIds.length,
    staff: ticket.coveredStaffIds.length,
    hasUrl: Boolean(ticket.url),
  })),
  staffAttachments: uploadedAttachments.map((attachment) => ({
    id: attachment.id,
    route: `${attachment.from} > ${attachment.to}`,
    ref: attachment.bookingReference,
    staffName: attachment.staffName,
    hasUrl: Boolean(attachment.url),
  })),
  removedOldRayanAttachment: oldRayanAttachmentId,
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    segments: nextSegments,
    branches: nextBranches,
    tickets: nextTickets,
    staffTicketAttachments: nextStaffTicketAttachments,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
