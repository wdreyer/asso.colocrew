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
const parisTransportId = "SN9Uc6i88JNkkScxLzcE";
const toulouseTransportId = "bYO5pWEIqEbFjdNGEp4b";

const samStaffSegmentId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp";
const samAttachmentId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp";
const samVisibleTicketId = "s4-retour-staff-sam-saint-pierre-bordeaux-n9ajbp-visible";
const samConvoyageSegmentId = "s4-retour-paris-saint-pierre-des-corps-m6arr9";

const rayanAttachmentId = "s4-retour-staff-rayan-lyon-paris-v9lmce";
const rayanConvoyageSegmentId = "s4-retour-paris-lyon-rangrjtt";
const rayanPdfPath = "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-PARIS_GARE_DE_LYON_28-08-26_MOHAMED_HASSAN_FADL_RAYAN_V9LMCE_CANIg7A8najhIIg2P9lH.pdf";

const lamiaToulouseMarseilleSegmentId = "s4-retour-toulouse-marseille";
const lamiaStaffBranchId = "s4-retour-staff-lamia-marseille-paris-5y9q4g";
const lamiaVisibleTicketIds = new Set([
  "s4-retour-staff-lamia-toulouse-marseille-afvbet-visible",
  "s4-retour-staff-lamia-marseille-paris-5y9q4g-visible",
]);
const lamiaAttachmentIds = new Set([
  "s4-retour-staff-lamia-toulouse-marseille-afvbet",
  "s4-retour-staff-lamia-marseille-paris-5y9q4g",
]);

if (!fs.existsSync(rayanPdfPath)) throw new Error(`PDF Rayan introuvable: ${rayanPdfPath}`);

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

async function readTransport(id) {
  const snap = await getDoc(doc(db, "transports", id));
  if (!snap.exists()) throw new Error(`Transport introuvable: ${id}`);
  return { id: snap.id, ...snap.data() };
}

function staffIdByName(transport, pattern) {
  const found = (transport.staff || []).find((staff) => pattern.test(String(staff.name || "")));
  return found?.id || "";
}

async function rayanUpload() {
  const storagePath = `transports/${parisTransportId}/staff-billets/2026-08-28-${rayanAttachmentId}.pdf`;
  if (!shouldApply) return { url: "", storagePath };
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(rayanPdfPath), {
    contentType: "application/pdf",
  });
  return { url: await getDownloadURL(uploaded.ref), storagePath };
}

const parisTransport = await readTransport(parisTransportId);
const toulouseTransport = await readTransport(toulouseTransportId);
const rayanStaffId = staffIdByName(parisTransport, /rayan/i) || "057f664a-04c5-48e1-9eee-fed14746d961";

const existingRayanAttachment = (parisTransport.staffTicketAttachments || []).find((item) => item.id === rayanAttachmentId);
const uploadedRayan = existingRayanAttachment?.url
  ? { url: existingRayanAttachment.url, storagePath: existingRayanAttachment.storagePath }
  : await rayanUpload();

const rayanAttachment = {
  id: rayanAttachmentId,
  staffId: rayanStaffId,
  staffName: "Rayan Mohamed Hassan Fadl",
  segmentId: rayanConvoyageSegmentId,
  segmentLabel: "Paris Gare de Lyon > Lyon Part-Dieu",
  date: "2026-08-28",
  from: "Lyon",
  to: "Paris",
  trainType: "TGV INOUI",
  trainNumber: "6634",
  departureTime: "21:04",
  arrivalTime: "23:09",
  bookingReference: "V9LMCE",
  externalReference: "V9LMCE",
  eTicketNumber: "119701414",
  eTicketNumbers: ["119701414"],
  seat: "Voiture 8 bas place 811",
  price: 74,
  url: uploadedRayan.url,
  storagePath: uploadedRayan.storagePath,
  uploadedFileName: path.basename(rayanPdfPath),
  visibleInRoutes: true,
  purchased: true,
  option: false,
  notes: "Piece jointe staff Rayan apres son convoyage Paris -> Lyon : retour Lyon Part-Dieu 21:04 > Paris Gare de Lyon 23:09.",
  updatedAt: new Date().toISOString(),
};

const nextParisSegments = (parisTransport.segments || []).filter((segment) => segment.id !== samStaffSegmentId);
const nextParisTickets = (parisTransport.tickets || []).filter((ticket) => ticket.id !== samVisibleTicketId);
const nextParisAttachments = [
  ...(parisTransport.staffTicketAttachments || [])
    .filter((attachment) => attachment.id !== rayanAttachmentId)
    .map((attachment) => {
      if (attachment.id !== samAttachmentId) return attachment;
      return {
        ...attachment,
        staffId: attachment.staffId || staffIdByName(parisTransport, /sam/i),
        segmentId: samConvoyageSegmentId,
        visibleInRoutes: true,
        updatedAt: new Date().toISOString(),
      };
    }),
  rayanAttachment,
];

const nextToulouseBranches = (toulouseTransport.branches || []).filter((branch) => branch.id !== lamiaStaffBranchId);
const nextToulouseTickets = (toulouseTransport.tickets || []).filter((ticket) => !lamiaVisibleTicketIds.has(ticket.id));
const nextToulouseAttachments = (toulouseTransport.staffTicketAttachments || []).map((attachment) => {
  if (!lamiaAttachmentIds.has(attachment.id)) return attachment;
  return {
    ...attachment,
    segmentId: lamiaToulouseMarseilleSegmentId,
    visibleInRoutes: true,
    updatedAt: new Date().toISOString(),
  };
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - staff tickets en pieces jointes /convoyages`);
console.log(JSON.stringify({
  parisTransportId,
  removedSamSegment: samStaffSegmentId,
  removedSamTicket: samVisibleTicketId,
  samAttachmentSegmentId: samConvoyageSegmentId,
  rayanAttachment: {
    id: rayanAttachment.id,
    segmentId: rayanAttachment.segmentId,
    route: `${rayanAttachment.from} > ${rayanAttachment.to}`,
    ref: rayanAttachment.bookingReference,
    hasUrl: Boolean(rayanAttachment.url || existingRayanAttachment?.url),
  },
  toulouseTransportId,
  removedLamiaBranch: lamiaStaffBranchId,
  removedLamiaTickets: [...lamiaVisibleTicketIds],
  lamiaAttachmentsSegmentId: lamiaToulouseMarseilleSegmentId,
}, null, 2));

if (shouldApply) {
  await Promise.all([
    updateDoc(doc(db, "transports", parisTransportId), {
      segments: nextParisSegments,
      tickets: nextParisTickets,
      staffTicketAttachments: nextParisAttachments,
      updatedAt: serverTimestamp(),
      scheduleUpdatedAt: new Date().toISOString(),
    }),
    updateDoc(doc(db, "transports", toulouseTransportId), {
      branches: nextToulouseBranches,
      tickets: nextToulouseTickets,
      staffTicketAttachments: nextToulouseAttachments,
      updatedAt: serverTimestamp(),
      scheduleUpdatedAt: new Date().toISOString(),
    }),
  ]);
  console.log("Firestore mis a jour.");
}

process.exit(0);
