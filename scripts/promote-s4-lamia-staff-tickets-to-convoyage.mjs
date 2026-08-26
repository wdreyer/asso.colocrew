import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

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
const transportId = "bYO5pWEIqEbFjdNGEp4b";
const toulouseMarseilleSegmentId = "s4-retour-toulouse-marseille";
const marseilleParisSegmentId = "s4-retour-staff-lamia-marseille-paris-5y9q4g";
const lamiaToulouseMarseilleAttachmentId = "s4-retour-staff-lamia-toulouse-marseille-afvbet";
const lamiaMarseilleParisAttachmentId = "s4-retour-staff-lamia-marseille-paris-5y9q4g";
const visibleTicketIds = new Set([
  "s4-retour-staff-lamia-toulouse-marseille-afvbet-visible",
  "s4-retour-staff-lamia-marseille-paris-5y9q4g-visible",
]);

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const toulouseMarseilleBranch = (transport.branches || []).find((branch) => branch.id === toulouseMarseilleSegmentId);
if (!toulouseMarseilleBranch) throw new Error(`Branche introuvable: ${toulouseMarseilleSegmentId}`);

const lamiaStaffId = (toulouseMarseilleBranch.assignedStaffIds || [])[0]
  || (transport.staff || []).find((staff) => String(staff.name || "").toLowerCase().includes("lamia"))?.id
  || "lamia-fadl";

const attachmentsById = new Map((transport.staffTicketAttachments || []).map((attachment) => [attachment.id, attachment]));
const toulouseMarseilleAttachment = attachmentsById.get(lamiaToulouseMarseilleAttachmentId);
const marseilleParisAttachment = attachmentsById.get(lamiaMarseilleParisAttachmentId);
if (!toulouseMarseilleAttachment) throw new Error(`Piece jointe introuvable: ${lamiaToulouseMarseilleAttachmentId}`);
if (!marseilleParisAttachment) throw new Error(`Piece jointe introuvable: ${lamiaMarseilleParisAttachmentId}`);
if (!toulouseMarseilleAttachment.url) throw new Error(`PDF deja uploade introuvable pour ${lamiaToulouseMarseilleAttachmentId}`);
if (!marseilleParisAttachment.url) throw new Error(`PDF deja uploade introuvable pour ${lamiaMarseilleParisAttachmentId}`);

function visibleTicketFromAttachment(attachment, overrides) {
  return {
    id: overrides.id,
    name: overrides.name,
    url: attachment.url,
    storagePath: attachment.storagePath,
    uploadedFileName: attachment.uploadedFileName,
    segmentId: overrides.segmentId,
    segmentLabel: overrides.segmentLabel,
    from: overrides.from,
    to: overrides.to,
    coverageFrom: overrides.from,
    coverageTo: overrides.to,
    date: attachment.date || "2026-08-28",
    departureTime: overrides.departureTime || attachment.departureTime,
    arrivalTime: overrides.arrivalTime || attachment.arrivalTime,
    trainType: attachment.trainType,
    trainNumber: attachment.trainNumber,
    seats: 1,
    price: attachment.price,
    purchased: true,
    option: false,
    bookingReference: attachment.bookingReference,
    externalReference: attachment.externalReference || attachment.bookingReference,
    eTicketNumber: attachment.eTicketNumber,
    eTicketNumbers: attachment.eTicketNumbers || [attachment.eTicketNumber].filter(Boolean),
    seat: attachment.seat,
    coveredReservationIds: [],
    coveredStaffIds: [lamiaStaffId],
    staffOnly: true,
    notes: attachment.notes,
    updatedAt: new Date().toISOString(),
  };
}

const visibleTickets = [
  visibleTicketFromAttachment(toulouseMarseilleAttachment, {
    id: "s4-retour-staff-lamia-toulouse-marseille-afvbet-visible",
    name: "INTERCITES 4661 - Toulouse Matabiau > Marseille Saint-Charles - Lamia Fadl",
    segmentId: toulouseMarseilleSegmentId,
    segmentLabel: "Toulouse Matabiau > Marseille Saint-Charles",
    from: "Toulouse",
    to: "Marseille",
    departureTime: "14:45",
    arrivalTime: "18:37",
  }),
  visibleTicketFromAttachment(marseilleParisAttachment, {
    id: "s4-retour-staff-lamia-marseille-paris-5y9q4g-visible",
    name: "TGV INOUI 6132 - Marseille Saint-Charles > Paris Gare de Lyon - Lamia Fadl",
    segmentId: marseilleParisSegmentId,
    segmentLabel: "Marseille Saint-Charles > Paris Gare de Lyon",
    from: "Marseille",
    to: "Paris",
    departureTime: "19:12",
    arrivalTime: "22:33",
  }),
];

const marseilleParisBranch = {
  id: marseilleParisSegmentId,
  from: "Marseille",
  to: "Paris",
  mode: "Train",
  trainType: "TGV INOUI",
  number: "6132",
  trainNumber: "6132",
  date: "2026-08-28",
  meetingPoint: "Marseille Saint-Charles - Lamia continue seule apres le depot",
  meetingTime: "18:55",
  departureTime: "19:12",
  arrivalTime: "22:33",
  stopType: "quai",
  scheduleStatus: "billet achete",
  assignedStaffIds: [lamiaStaffId],
  passengerReservationIds: [],
  staffOnly: true,
  convoyageDisplay: true,
  instructions:
    "Retour staff uniquement : apres le depot a Marseille Saint-Charles, Lamia prend le TGV INOUI 6132 vers Paris Gare de Lyon. Billet 5Y9Q4G, voiture 3 bas place 323.",
};

const nextBranchesBase = (transport.branches || []).filter((branch) => branch.id !== marseilleParisSegmentId);
const toulouseIndex = nextBranchesBase.findIndex((branch) => branch.id === toulouseMarseilleSegmentId);
const nextBranches = toulouseIndex === -1
  ? [...nextBranchesBase, marseilleParisBranch]
  : [
      ...nextBranchesBase.slice(0, toulouseIndex + 1),
      marseilleParisBranch,
      ...nextBranchesBase.slice(toulouseIndex + 1),
    ];

const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !visibleTicketIds.has(ticket.id)),
  ...visibleTickets,
];

const nextStaffTicketAttachments = (transport.staffTicketAttachments || []).map((attachment) => {
  if (attachment.id === lamiaToulouseMarseilleAttachmentId) {
    return { ...attachment, segmentId: toulouseMarseilleSegmentId, visibleInRoutes: true, updatedAt: new Date().toISOString() };
  }
  if (attachment.id === lamiaMarseilleParisAttachmentId) {
    return { ...attachment, segmentId: marseilleParisSegmentId, visibleInRoutes: true, updatedAt: new Date().toISOString() };
  }
  return attachment;
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets staff Lamia visibles dans /convoyages`);
console.log(JSON.stringify({
  transportId,
  lamiaStaffId,
  addedBranch: {
    id: marseilleParisBranch.id,
    route: `${marseilleParisBranch.from} > ${marseilleParisBranch.to}`,
    time: `${marseilleParisBranch.departureTime} > ${marseilleParisBranch.arrivalTime}`,
    children: marseilleParisBranch.passengerReservationIds.length,
    staff: marseilleParisBranch.assignedStaffIds.length,
  },
  visibleTickets: visibleTickets.map((ticket) => ({
    id: ticket.id,
    segmentId: ticket.segmentId,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    staff: ticket.coveredStaffIds.length,
    children: ticket.coveredReservationIds.length,
    hasUrl: Boolean(ticket.url),
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    branches: nextBranches,
    tickets: nextTickets,
    staffTicketAttachments: nextStaffTicketAttachments,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
