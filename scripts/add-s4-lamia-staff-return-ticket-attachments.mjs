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
const transportId = "bYO5pWEIqEbFjdNGEp4b";
const toulouseMarseilleSegmentId = "s4-retour-toulouse-marseille";

const sourceTickets = [
  {
    id: "s4-retour-staff-lamia-toulouse-marseille-afvbet",
    segmentId: toulouseMarseilleSegmentId,
    filePath: "C:\\Users\\dreye\\Downloads\\TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_28-08-26_FADL_LAMIA_AFVBET_BOgD1Z0SQHPvvvmPrRvP.pdf",
    staffName: "Lamia Fadl",
    from: "Toulouse",
    to: "Marseille",
    segmentLabel: "Toulouse Matabiau > Marseille Saint-Charles",
    trainType: "INTERCITES",
    trainNumber: "4661",
    departureTime: "14:45",
    arrivalTime: "18:37",
    bookingReference: "AFVBET",
    eTicketNumber: "706080300",
    seat: "Voiture 6 place 34",
    price: 70,
    notes: "Billet staff Lamia sur la branche Toulouse Matabiau -> Marseille Saint-Charles, avec Emma Chacard dans le meme train.",
  },
  {
    id: "s4-retour-staff-lamia-marseille-paris-5y9q4g",
    segmentId: null,
    filePath: "C:\\Users\\dreye\\Downloads\\Billet.pdf",
    staffName: "Lamia Fadl",
    from: "Marseille",
    to: "Paris",
    segmentLabel: "Marseille Saint-Charles > Paris Gare de Lyon",
    trainType: "TGV INOUI",
    trainNumber: "6132",
    departureTime: "19:12",
    arrivalTime: "22:33",
    bookingReference: "5Y9Q4G",
    eTicketNumber: "318172910",
    seat: "Voiture 3 bas place 323",
    price: 30,
    notes: "Billet staff retour Lamia apres le depot Marseille. Trajet vers Paris Gare de Lyon.",
  },
];

for (const ticket of sourceTickets) {
  if (!fs.existsSync(ticket.filePath)) throw new Error(`PDF introuvable: ${ticket.filePath}`);
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
const branch = (transport.branches || []).find((item) => item.id === toulouseMarseilleSegmentId);
if (!branch) throw new Error(`Branche introuvable: ${toulouseMarseilleSegmentId}`);

const lamiaStaffId = (branch.assignedStaffIds || [])[0]
  || (transport.staff || []).find((staff) => String(staff.name || "").toLowerCase().includes("lamia"))?.id
  || "lamia-fadl";

async function uploadTicket(ticket) {
  const storagePath = `transports/${transportId}/staff-billets/2026-08-28-${ticket.id}.pdf`;
  if (!shouldApply) {
    return { url: "", storagePath, uploadedFileName: path.basename(ticket.filePath) };
  }
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(ticket.filePath), {
    contentType: "application/pdf",
  });
  return {
    url: await getDownloadURL(uploaded.ref),
    storagePath,
    uploadedFileName: path.basename(ticket.filePath),
  };
}

const attachments = [];
for (const ticket of sourceTickets) {
  const uploaded = await uploadTicket(ticket);
  attachments.push({
    id: ticket.id,
    staffId: lamiaStaffId,
    staffName: ticket.staffName,
    segmentId: ticket.segmentId,
    segmentLabel: ticket.segmentLabel,
    date: "2026-08-28",
    from: ticket.from,
    to: ticket.to,
    trainType: ticket.trainType,
    trainNumber: ticket.trainNumber,
    departureTime: ticket.departureTime,
    arrivalTime: ticket.arrivalTime,
    bookingReference: ticket.bookingReference,
    externalReference: ticket.bookingReference,
    eTicketNumber: ticket.eTicketNumber,
    eTicketNumbers: [ticket.eTicketNumber],
    seat: ticket.seat,
    price: ticket.price,
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    uploadedFileName: uploaded.uploadedFileName,
    visibleInRoutes: false,
    purchased: true,
    option: false,
    notes: ticket.notes,
    updatedAt: new Date().toISOString(),
  });
}

const existingAttachments = (transport.staffTicketAttachments || [])
  .filter((item) => !attachments.some((ticket) => ticket.id === item.id));
const nextStaffTicketAttachments = [...existingAttachments, ...attachments];

const nextBranches = (transport.branches || []).map((item) => {
  if (item.id !== toulouseMarseilleSegmentId) return item;
  return {
    ...item,
    from: "Toulouse",
    to: "Marseille",
    mode: "Train",
    trainType: "INTERCITES",
    number: "4661",
    trainNumber: "4661",
    departureTime: "14:45",
    arrivalTime: "18:37",
    meetingPoint: "Toulouse Matabiau - continuation dans le meme train",
    stopType: "quai",
    scheduleStatus: "billet achete",
    instructions: "Continuation Toulouse Matabiau -> Marseille Saint-Charles dans l'INTERCITES 4661, depart 14:45, arrivee 18:37. Billet staff Lamia ajoute en piece jointe.",
  };
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets staff Lamia retour S4`);
console.log(JSON.stringify({
  transportId,
  lamiaStaffId,
  attachments: attachments.map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference,
    train: ticket.trainNumber,
    time: `${ticket.departureTime} > ${ticket.arrivalTime}`,
    eTicketNumber: ticket.eTicketNumber,
    seat: ticket.seat,
    price: ticket.price,
    visibleInRoutes: ticket.visibleInRoutes,
    storagePath: ticket.storagePath,
  })),
  visibleTicketsUnchanged: (transport.tickets || []).map((ticket) => ({
    id: ticket.id,
    route: `${ticket.from} > ${ticket.to}`,
    ref: ticket.bookingReference || ticket.externalReference || "",
    children: (ticket.coveredReservationIds || []).length,
    staff: (ticket.coveredStaffIds || []).length,
  })),
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    branches: nextBranches,
    staffTicketAttachments: nextStaffTicketAttachments,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
