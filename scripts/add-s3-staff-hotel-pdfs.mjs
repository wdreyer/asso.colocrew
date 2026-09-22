import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const sourceDir = "i:/Shared drives/ColoCrew/Séjours/Eté 26/Transport/Convoyages 3 août";

const docs = [
  {
    transportId: "gYSCIzh4y1VbVojTAEzi",
    fileName: "HotelNantes.pdf",
    id: "s3-hotel-axelle-nantes-2026-08-02",
    name: "Hôtel staff - Axelle Mousset - Nantes",
    staffName: "Axelle Mousset",
    coveredStaffIds: ["065cb0e2-9a2a-497a-ae33-ae84b01793cf"],
    from: "Nantes",
    to: "Nantes",
    date: "2026-08-02",
    departureTime: "16:00",
    arrivalTime: "11:00",
    trainType: "Hébergement",
    trainNumber: "Booking 5371.431.246",
    bookingReference: "5371.431.246",
    confidentialCode: "5080",
    price: 53.89,
    notes: "Appart’City Confort Nantes Centre, 4 rue des Petites Écuries, 44000 Nantes. Arrivée 02/08 à partir de 16:00, départ 03/08 jusqu'à 11:00. Téléphone : +33 2 28 08 10 20.",
  },
  {
    transportId: "ZE9pRIszXarAjRBoQqhz",
    fileName: "HotelLyon.pdf",
    id: "s3-hotel-matteo-lyon-2026-08-02",
    name: "Hôtel staff - Mattéo Mazzolini - Lyon",
    staffName: "Mattéo MAZZOLINI",
    coveredStaffIds: ["ee6ab14e-d0d8-4e97-a85d-b93b5fab12b4"],
    from: "Lyon",
    to: "Lyon",
    date: "2026-08-02",
    departureTime: "16:00",
    arrivalTime: "11:00",
    trainType: "Hébergement",
    trainNumber: "Booking 5773.168.028",
    bookingReference: "5773.168.028",
    confidentialCode: "6027",
    price: 54.65,
    notes: "Appart'City Classic Lyon Part Dieu Garibaldi, 40 rue de l'Abondance, 69003 Lyon. Arrivée 02/08 à partir de 16:00, départ 03/08 jusqu'à 11:00. Téléphone : +33 4 72 60 83 83.",
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

const byTransport = new Map();
for (const item of docs) {
  const fullPath = path.join(sourceDir, item.fileName);
  if (!fs.existsSync(fullPath)) throw new Error(`PDF introuvable : ${fullPath}`);
  const storagePath = `transports/${item.transportId}/documents/staff-hotels/${item.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(fullPath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(uploaded.ref);
  }
  const ticket = {
    ...item,
    url,
    storagePath,
    uploadedFileName: item.fileName,
    segmentId: item.id,
    segmentLabel: `Hébergement staff - ${item.from}`,
    coverageFrom: item.from,
    coverageTo: item.to,
    seats: 1,
    purchased: true,
    option: false,
    staffPositioning: true,
    accommodation: true,
    coveredReservationIds: [],
    seat: `Code confidentiel ${item.confidentialCode}`,
    updatedAt: new Date().toISOString(),
  };
  if (!byTransport.has(item.transportId)) byTransport.set(item.transportId, []);
  byTransport.get(item.transportId).push(ticket);
}

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - hôtels staff S3`);
for (const item of docs) {
  console.log(`- ${item.staffName}: ${item.from} | ${item.bookingReference} | ${item.fileName}`);
}

if (shouldApply) {
  for (const [transportId, ticketsToAdd] of byTransport.entries()) {
    const snap = await getDoc(doc(db, "transports", transportId));
    if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
    const transport = { id: snap.id, ...snap.data() };
    const ids = new Set(ticketsToAdd.map((ticket) => ticket.id));
    const nextTickets = [
      ...(transport.tickets || []).filter((ticket) => !ids.has(ticket.id)),
      ...ticketsToAdd,
    ];
    await updateDoc(doc(db, "transports", transportId), {
      tickets: nextTickets,
      updatedAt: serverTimestamp(),
    });
  }
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
