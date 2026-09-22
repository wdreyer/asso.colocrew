import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "gYSCIzh4y1VbVojTAEzi";
const sourceDir = "i:/Shared drives/ColoCrew/Séjours/Eté 26/Transport/Convoyages 3 août";

const files = [
  {
    fileName: "BORDEAUX-SAINT-JEAN-NANTES_02-08-26_MOUSSET_AXELLE_P79HAZ_MRFWBZLmJq8MfNE4XXJy.pdf",
    id: "s3-positioning-axelle-bordeaux-nantes-2026-08-02",
    staffName: "Axelle Mousset",
    coveredStaffIds: ["065cb0e2-9a2a-497a-ae33-ae84b01793cf"],
    name: "Positionnement staff - Axelle Mousset - Bordeaux > Nantes",
    from: "Bordeaux",
    to: "Nantes",
    date: "2026-08-02",
    trainType: "INTERCITÉS",
    trainNumber: "3858",
    departureTime: "18:06",
    arrivalTime: "22:16",
    seats: 1,
    price: 57,
    bookingReference: "P79HAZ",
    seat: "Voiture 4 Place 38",
    notes: "Billet de positionnement staff la veille du convoi S3. Ne compte pas dans les places enfants.",
  },
  {
    fileName: "7656TKEKSM6700215711260730143129087302401.pdf",
    id: "s3-positioning-shirley-bordeaux-paris-2026-08-03",
    staffName: "Shirley Siousarram Annerose",
    coveredStaffIds: ["95a24984-67c5-41ef-8a57-92a85284c60d"],
    name: "Positionnement staff - Shirley Siousarram Annerose - Bordeaux > Paris",
    from: "Bordeaux",
    to: "Paris",
    date: "2026-08-03",
    trainType: "OUIGO",
    trainNumber: "7656",
    departureTime: "11:55",
    arrivalTime: "14:46",
    seats: 1,
    price: 39,
    bookingReference: "TKEKSM",
    seat: "Voiture 18 Place 857",
    notes: "Billet de positionnement staff vers Paris avant le convoi S3. Ne compte pas dans les places enfants.",
  },
  {
    fileName: "7656TKEKSM6700215721260730143129796620826.pdf",
    id: "s3-positioning-axel-bordeaux-paris-2026-08-03",
    staffName: "Axel Raharinosy",
    coveredStaffIds: ["d48753c6-15d3-46d1-9ae1-0bc30c0d331f"],
    name: "Positionnement staff - Axel Raharinosy - Bordeaux > Paris",
    from: "Bordeaux",
    to: "Paris",
    date: "2026-08-03",
    trainType: "OUIGO",
    trainNumber: "7656",
    departureTime: "11:55",
    arrivalTime: "14:46",
    seats: 1,
    price: 39,
    bookingReference: "TKEKSM",
    seat: "Voiture 18 Place 858",
    notes: "Billet de positionnement staff vers Paris avant le convoi S3. Ne compte pas dans les places enfants.",
  },
];

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

const uploadedTickets = [];
for (const item of files) {
  const fullPath = path.join(sourceDir, item.fileName);
  if (!fs.existsSync(fullPath)) throw new Error(`PDF introuvable : ${fullPath}`);
  const storagePath = `transports/${transportId}/billets/positionnement-staff/${item.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(fullPath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }
  uploadedTickets.push({
    ...item,
    url,
    storagePath,
    uploadedFileName: item.fileName,
    segmentId: item.id,
    segmentLabel: `Positionnement staff - ${item.from} > ${item.to}`,
    coverageFrom: item.from,
    coverageTo: item.to,
    purchased: true,
    option: false,
    staffPositioning: true,
    coveredReservationIds: [],
    updatedAt: new Date().toISOString(),
  });
}

const ids = new Set(uploadedTickets.map((ticket) => ticket.id));
const nextTickets = [
  ...(transport.tickets || []).filter((ticket) => !ids.has(ticket.id)),
  ...uploadedTickets,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - PDFs positionnement staff S3`);
for (const ticket of uploadedTickets) {
  console.log(`- ${ticket.staffName}: ${ticket.from} -> ${ticket.to} ${ticket.date} ${ticket.departureTime}-${ticket.arrivalTime} | ${ticket.bookingReference}`);
}

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
  });
  console.log("Firestore + Storage mis à jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

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
