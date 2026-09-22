import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "rvRWSjpmMcmht8Hka2gn";
const sourceDir = ".tmp_tickets";

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

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const ticketSpecs = [
  {
    fileName: "2026-08-14-uCqsC7r52x8BRK4kSvzhNw.pdf",
    originalFileName: "uCqsC7r52x8BRK4kSvzhNw.pdf",
    id: "s3-retour-bordeaux-paris-j2k39s-extra",
    segmentId: "s3-retour-bordeaux-paris",
    segmentLabel: "Bordeaux > Paris",
    name: "TGV INOUI 8512 - Bordeaux Saint-Jean > Paris Montparnasse - complément J2K39S",
    from: "Bordeaux",
    to: "Paris",
    coverageFrom: "Bordeaux",
    coverageTo: "Paris",
    date: "2026-08-14",
    trainType: "TGV INOUI",
    trainNumber: "8512",
    departureTime: "14:46",
    arrivalTime: "17:15",
    seats: 3,
    price: 108,
    bookingReference: "J2K39S",
    externalReference: "J2K39S",
    coveredReservationIds: [],
    coveredStaffIds: [],
    notes: "Billet groupe complémentaire, 3 places, pour le retour Bordeaux > Paris.",
  },
  {
    fileName: "2026-08-14-ticket_73XZVK.pdf",
    originalFileName: "ticket_73XZVK.pdf",
    id: "s3-retour-paris-nantes-ticket",
    segmentId: "s3-retour-paris-nantes",
    segmentLabel: "Paris > Nantes",
    name: "TGV INOUI 8821 - Paris Montparnasse > Nantes - groupe 93H2UH",
    from: "Paris",
    to: "Nantes",
    coverageFrom: "Paris",
    coverageTo: "Nantes",
    date: "2026-08-14",
    trainType: "TGV INOUI",
    trainNumber: "8821",
    departureTime: "18:15",
    arrivalTime: "20:21",
    seats: 10,
    price: 270,
    bookingReference: "93H2UH",
    externalReference: "93H2UH",
    coveredReservationIds: (transport.passengers || [])
      .filter((passenger) => normalizeKey(passenger.dropoffCity || passenger.returnCity || passenger.pickupCity) === "nantes")
      .map((passenger) => passenger.reservationId)
      .filter(Boolean),
    coveredStaffIds: ["elorri-corbin", "4ec9eee0-047e-4a1e-8a3c-5f18a07448c3"],
    notes: "Remplace le placeholder Paris > Nantes sans PDF. Le billet réel part à 18:15 et arrive à 20:21.",
  },
];

const uploadedTickets = [];
for (const spec of ticketSpecs) {
  const sourcePath = path.join(sourceDir, spec.fileName);
  if (!fs.existsSync(sourcePath)) throw new Error(`PDF introuvable : ${sourcePath}`);
  const storagePath = `transports/${transport.id}/billets/2026-08-14-${spec.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }
  uploadedTickets.push({
    ...spec,
    url,
    storagePath,
    uploadedFileName: spec.originalFileName,
    purchased: true,
    option: false,
    updatedAt: new Date().toISOString(),
  });
}

const ids = new Set(uploadedTickets.map((ticket) => ticket.id));
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !ids.has(ticket.id)),
  ...uploadedTickets,
];

const nextBranches = (transport.branches || []).map((branch) => {
  if (branch.id !== "s3-retour-paris-nantes") return branch;
  return {
    ...branch,
    departureTime: "18:15",
    arrivalTime: "20:21",
    meetingTime: "17:45",
    scheduleStatus: "billet achete",
  };
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - ${transport.sejourName || transport.id}`);
for (const ticket of uploadedTickets) {
  console.log(`- ${ticket.name} | ${ticket.from} -> ${ticket.to} | ${ticket.departureTime}-${ticket.arrivalTime} | ${ticket.seats} place(s) | ref ${ticket.bookingReference} | ${ticket.uploadedFileName}`);
}
console.log("- Segment Paris > Nantes mis à jour : 18:15-20:21, convocation 17:45");

if (shouldApply) {
  await updateDoc(doc(db, "transports", transport.id), {
    tickets: nextTickets,
    branches: nextBranches,
    updatedAt: serverTimestamp(),
  });
  console.log("Firestore + Storage mis à jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
