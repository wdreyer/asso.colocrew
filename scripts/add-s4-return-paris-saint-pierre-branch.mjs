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
const meroualFamilyReservationId = "2D9PLkzAylHrHC1s3G2w";
const tahaReservationId = "2JlzTUf3PAHAJhJwXgEh";
const yahiaReservationId = "DHlTIJYou74nQEAVAhdh";

const samStaff = {
  id: "cc935297-ef32-4f44-bdf6-9e0b8fbfa12a",
  memberId: "sam-eyraud",
  name: "Sam eyraud",
  email: "eyraud.08@icloud.com",
  phone: "0786780191",
  role: "AS/SB",
  week: "S4",
  stayCode: "MCSC",
  contractId: "rh-2026-row-34",
  birthDate: "",
  boardingCity: "",
};

const pdfs = {
  taha: {
    label: "Taha Meroual",
    path: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_TAHA_M6ARR9_DpdDQfRCqpwj1kUQNyeq.pdf",
    reservationId: tahaReservationId,
    eTicketNumber: "669706184",
    seat: "Voiture 17 place 747",
    price: 37,
  },
  yahia: {
    label: "Yahia Meroual",
    path: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_MEROUAL_YAHIA_M6ARR9_ZIPO0FCNSpxyrmLWaBTl.pdf",
    reservationId: yahiaReservationId,
    eTicketNumber: "338255741",
    seat: "Voiture 17 place 751",
    price: 74,
  },
  samParisSaintPierre: {
    label: "Sam Eyraud",
    path: "C:\\Users\\dreye\\Downloads\\PARIS_MONTPARNASSE_1_ET_2-SAINT-PIERRE_DES_CORPS_28-08-26_EYRAUD_SAM_M6ARR9_PqvnlUo6xm8ymAsiwZo3.pdf",
    staffId: samStaff.id,
    eTicketNumber: "624791804",
    seat: "Voiture 17 place 750",
    price: 74,
  },
  samSaintPierreBordeaux: {
    label: "Sam Eyraud",
    path: "C:\\Users\\dreye\\Downloads\\SAINT-PIERRE_DES_CORPS-BORDEAUX-SAINT-JEAN_28-08-26_EYRAUD_SAM_N9AJBP_BrGQOC0L8XwKyAGWUZpx.pdf",
    staffId: samStaff.id,
    eTicketNumber: "272132852",
    seat: "Voiture 17 place 751",
    price: 43,
  },
};

for (const file of Object.values(pdfs)) {
  if (!fs.existsSync(file.path)) throw new Error(`PDF introuvable: ${file.path}`);
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

async function uploadPdf(key, file, folder = "billets") {
  const storagePath = `transports/${transportId}/${folder}/2026-08-28-${key}.pdf`;
  if (!shouldApply) {
    return { url: "", storagePath, uploadedFileName: path.basename(file.path) };
  }
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(file.path), {
    contentType: "application/pdf",
  });
  return {
    url: await getDownloadURL(uploaded.ref),
    storagePath,
    uploadedFileName: path.basename(file.path),
  };
}

const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const uploaded = {
  taha: await uploadPdf("meroual-taha-paris-saint-pierre-m6arr9", pdfs.taha),
  yahia: await uploadPdf("meroual-yahia-paris-saint-pierre-m6arr9", pdfs.yahia),
  samParisSaintPierre: await uploadPdf("sam-paris-saint-pierre-m6arr9", pdfs.samParisSaintPierre),
  samSaintPierreBordeaux: await uploadPdf(
    "sam-saint-pierre-bordeaux-n9ajbp",
    pdfs.samSaintPierreBordeaux,
    "staff-billets",
  ),
};

const branchSegmentId = "s4-retour-paris-saint-pierre-des-corps-m6arr9";
const staffContinuationTicketId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp";

const parisSaintPierreFiles = ["taha", "yahia", "samParisSaintPierre"].map((key) => ({
  label: pdfs[key].label,
  url: uploaded[key].url,
  storagePath: uploaded[key].storagePath,
  uploadedFileName: uploaded[key].uploadedFileName,
  eTicketNumber: pdfs[key].eTicketNumber,
  seat: pdfs[key].seat,
  price: pdfs[key].price,
  reservationId: pdfs[key].reservationId || null,
  staffId: pdfs[key].staffId || null,
}));

const branchTicket = {
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
  eTicketNumbers: parisSaintPierreFiles.map((file) => file.eTicketNumber),
  seat: "Taha MEROUAL: voiture 17 place 747; Sam EYRAUD: voiture 17 place 750; Yahia MEROUAL: voiture 17 place 751",
  files: parisSaintPierreFiles,
  attachments: parisSaintPierreFiles,
  url: uploaded.taha.url,
  storagePath: uploaded.taha.storagePath,
  uploadedFileName: "M6ARR9 - 3 billets Paris Montparnasse > Saint-Pierre-des-Corps",
  coveredReservationIds: [tahaReservationId, yahiaReservationId],
  coveredStaffIds: [samStaff.id],
  purchased: true,
  option: false,
  notes:
    "Branche retour Meroual. Sam accompagne Taha et Yahia de Paris Montparnasse a Saint-Pierre-des-Corps, arrivee 17:49. Les parents recuperent les enfants sur le quai. Le meme train repart a 17:53 vers Bordeaux avec Sam.",
  updatedAt: new Date().toISOString(),
};

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
  assignedStaffIds: [samStaff.id],
  passengerReservationIds: [tahaReservationId, yahiaReservationId],
  familyPickupOnPlatform: true,
  platformStopMinutes: 4,
  instructions:
    "Sam recupere Taha et Yahia Meroual a Paris Montparnasse et les accompagne en TGV INOUI 8449 jusqu'a Saint-Pierre-des-Corps. Arrivee 17:49, depose sur le quai: les parents doivent etre deja presents. Le train repart a 17:53 et Sam reste a bord vers Bordeaux.",
  staffContinuation: {
    staffId: samStaff.id,
    staffName: samStaff.name,
    from: "Saint-Pierre-des-Corps",
    to: "Bordeaux-Saint-Jean",
    departureTime: "17:53",
    arrivalTime: "20:06",
    trainType: "TGV INOUI",
    trainNumber: "8449",
    bookingReference: "N9AJBP",
    ticketAttachmentId: staffContinuationTicketId,
  },
};

const staffContinuationAttachment = {
  id: staffContinuationTicketId,
  staffId: samStaff.id,
  staffName: samStaff.name,
  date: "2026-08-28",
  from: "Saint-Pierre-des-Corps",
  to: "Bordeaux-Saint-Jean",
  trainType: "TGV INOUI",
  trainNumber: "8449",
  departureTime: "17:53",
  arrivalTime: "20:06",
  bookingReference: "N9AJBP",
  eTicketNumber: pdfs.samSaintPierreBordeaux.eTicketNumber,
  seat: pdfs.samSaintPierreBordeaux.seat,
  price: pdfs.samSaintPierreBordeaux.price,
  url: uploaded.samSaintPierreBordeaux.url,
  storagePath: uploaded.samSaintPierreBordeaux.storagePath,
  uploadedFileName: uploaded.samSaintPierreBordeaux.uploadedFileName,
  visibleInRoutes: false,
  notes: "Billet staff Sam apres depot des Meroual a Saint-Pierre-des-Corps. Ne doit pas apparaitre comme billet/trajet enfant.",
  updatedAt: new Date().toISOString(),
};

function uniqById(items) {
  return [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
}

const nextStaff = uniqById([...(transport.staff || []), samStaff]);

const currentSegments = transport.segments || [];
const segmentWithoutBranch = currentSegments.filter((segment) => segment.id !== branchSegmentId);
const daxParisIndex = segmentWithoutBranch.findIndex((segment) => segment.id === "s4-retour-dax-paris");
const insertionIndex = daxParisIndex >= 0 ? daxParisIndex + 1 : segmentWithoutBranch.length;
const nextSegments = [
  ...segmentWithoutBranch.slice(0, insertionIndex),
  branchSegment,
  ...segmentWithoutBranch.slice(insertionIndex),
].map((segment) => {
  if (segment.id !== "s4-retour-dax-paris") return segment;
  return {
    ...segment,
    instructions:
      "Convoi commun Dax -> Paris Montparnasse. Taha et Yahia Meroual poursuivent ensuite avec Sam sur la branche Paris -> Saint-Pierre-des-Corps (arrivee 17:49, depot quai).",
  };
});

const nextTickets = [
  ...(transport.tickets || []).filter((ticket) =>
    ticket.id !== branchTicket.id
    && ticket.bookingReference !== branchTicket.bookingReference
    && ticket.externalReference !== branchTicket.bookingReference
  ),
  branchTicket,
];

const nextPassengers = (transport.passengers || []).map((passenger) => {
  if (passenger.reservationId === tahaReservationId) {
    return {
      ...passenger,
      reservationId: tahaReservationId,
      familyReservationId: meroualFamilyReservationId,
      firstName: "Taha",
      lastName: "MEROUAL",
      name: "Taha MEROUAL",
      departureCity: "Libourne",
      pickupCity: "Dax",
      dropoffCity: "Saint-Pierre-des-Corps",
      returnCity: "Saint-Pierre-des-Corps",
      routeNote: "Retour via Paris puis depot a Saint-Pierre-des-Corps avec Sam.",
    };
  }
  if (passenger.reservationId === yahiaReservationId) {
    return {
      ...passenger,
      reservationId: yahiaReservationId,
      familyReservationId: meroualFamilyReservationId,
      firstName: "Yahia",
      lastName: "MEROUAL",
      name: "Yahia MEROUAL",
      departureCity: "Libourne",
      pickupCity: "Dax",
      dropoffCity: "Saint-Pierre-des-Corps",
      returnCity: "Saint-Pierre-des-Corps",
      routeNote: "Retour via Paris puis depot a Saint-Pierre-des-Corps avec Sam.",
    };
  }
  return passenger;
});

const branch = {
  id: "s4-retour-branch-saint-pierre-des-corps",
  label: "Branche Paris > Saint-Pierre-des-Corps",
  date: "2026-08-28",
  from: "Paris",
  to: "Saint-Pierre-des-Corps",
  segmentIds: [branchSegmentId],
  staffIds: [samStaff.id],
  passengerReservationIds: [tahaReservationId, yahiaReservationId],
  notes: "Taha et Yahia Meroual recuperes sur le quai de Saint-Pierre-des-Corps a 17:49. Sam continue dans le meme train vers Bordeaux.",
};

const nextBranches = uniqById([...(transport.branches || []).filter((item) => item.id !== branch.id), branch]);
const nextStaffTicketAttachments = uniqById([
  ...(transport.staffTicketAttachments || []).filter((item) => item.id !== staffContinuationTicketId),
  staffContinuationAttachment,
]);

const coverage = {
  segments: nextSegments.map((segment) => ({
    id: segment.id,
    route: `${segment.from} > ${segment.to}`,
    train: segment.trainNumber || segment.number || "",
    time: `${segment.departureTime || "?"} > ${segment.arrivalTime || "?"}`,
    children: (segment.passengerReservationIds || []).length,
    staff: (segment.assignedStaffIds || []).length,
  })),
  tickets: nextTickets.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference || ticket.externalReference || "",
    children: (ticket.coveredReservationIds || []).length,
    staff: (ticket.coveredStaffIds || []).length,
    price: ticket.price || 0,
  })),
  staffTicketAttachments: nextStaffTicketAttachments.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    staff: ticket.staffName,
    visibleInRoutes: ticket.visibleInRoutes,
  })),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - branche Paris > Saint-Pierre-des-Corps Meroual`);
console.log(JSON.stringify({
  transportId,
  addedStaff: !((transport.staff || []).some((staff) => staff.id === samStaff.id)),
  branchSegment,
  branchTicket: {
    id: branchTicket.id,
    ref: branchTicket.bookingReference,
    children: branchTicket.coveredReservationIds,
    staff: branchTicket.coveredStaffIds,
    price: branchTicket.price,
    files: branchTicket.files.map((file) => ({
      label: file.label,
      eTicketNumber: file.eTicketNumber,
      seat: file.seat,
      price: file.price,
    })),
  },
  staffContinuationAttachment: {
    id: staffContinuationAttachment.id,
    route: `${staffContinuationAttachment.from} > ${staffContinuationAttachment.to}`,
    ref: staffContinuationAttachment.bookingReference,
    visibleInRoutes: staffContinuationAttachment.visibleInRoutes,
  },
  coverage,
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    staff: nextStaff,
    passengers: nextPassengers,
    segments: nextSegments,
    tickets: nextTickets,
    branches: nextBranches,
    staffTicketAttachments: nextStaffTicketAttachments,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
