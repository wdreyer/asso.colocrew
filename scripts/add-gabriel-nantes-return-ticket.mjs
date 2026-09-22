import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "04AhMrhz1dYCHxsI7yJp";
const gabrielStaffId = "bbaa09c4-0c01-4e56-b3d0-205c0c666d7e";
const returnSegmentId = "s2-retour-gabriel-nantes-paris";
const fileName = "NANTES-PARIS_MONTPARNASSE_1_ET_2_31-07-26_MABIALA_FATUMA_GABRIEL_ZMKPWE_bMOTl0nr9oJXjHdMHiKr.pdf";
const sourceDir = "i:\\Shared drives\\ColoCrew\\S\u00e9jours\\Et\u00e9 26\\MCSC 2026\\JUILLET\\S2\\Convoyages\\31Juillet";
const sourcePath = path.join(sourceDir, fileName);

if (!fs.existsSync(sourcePath)) throw new Error(`PDF introuvable : ${sourcePath}`);

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "colocrew-5edf9.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "colocrew-5edf9",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "colocrew-5edf9.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "74332244617",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:74332244617:web:1947fe469b0ca4a103d458",
});

const db = getFirestore(app);
const storage = getStorage(app);

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const storagePath = `transports/${transportId}/billets/2026-07-31-gabriel-nantes-paris-zmkpwe.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePath), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const returnSegment = {
  id: returnSegmentId,
  from: "Nantes",
  to: "Paris",
  joinsAt: "Nantes",
  routeKind: "staff-return",
  kind: "branch",
  mode: "TGV INOUI",
  number: "8826",
  meetingPoint: "Gare de Nantes",
  meetingTime: "20:40",
  departureTime: "21:00",
  arrivalTime: "23:11",
  stopType: "rdv",
  stops: [],
  assignedStaffIds: [gabrielStaffId],
  scheduleStatus: "billet achete",
  instructions: "Retour staff Gabriel Mabiala Fatuma apres la depose des enfants a Nantes. TGV INOUI 8826 vers Paris Montparnasse 1 et 2.",
};

const ticket = {
  id: "s2-retour-gabriel-zmkpwe",
  name: "TGV INOUI 8826 - Nantes > Paris - Gabriel Mabiala Fatuma",
  url,
  storagePath,
  uploadedFileName: fileName,
  segmentId: returnSegmentId,
  segmentLabel: "Nantes > Paris Montparnasse 1 et 2",
  from: "Nantes",
  to: "Paris",
  coverageFrom: "Nantes",
  coverageTo: "Paris",
  trainType: "TGV INOUI",
  trainNumber: "8826",
  departureTime: "21:00",
  arrivalTime: "23:11",
  seats: 1,
  price: 36,
  purchased: true,
  option: false,
  bookingReference: "ZMKPWE",
  coveredReservationIds: [],
  coveredStaffIds: [gabrielStaffId],
  eTicketNumber: "609621010",
  seat: "Voiture 5 Place 523",
  notes: "Billet staff Gabriel Mabiala Fatuma du 31/07/2026. TGV INOUI 8826, voiture 5 place 523, e-billet 609621010.",
  updatedAt: new Date().toISOString(),
};

const nextBranches = [
  ...(transport.branches || []).filter((branch) => branch.id !== returnSegmentId),
  returnSegment,
];
const nextTickets = [
  ...(transport.tickets || []).filter((item) => item.id !== ticket.id),
  ticket,
];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billet Gabriel Nantes > Paris`);
console.log("Segment staff : Nantes 21:00 -> Paris Montparnasse 23:11, TGV INOUI 8826.");
console.log("Billet : ZMKPWE, voiture 5 place 523, 36 EUR.");

if (shouldApply) {
  await updateDoc(doc(db, "transports", transportId), {
    branches: nextBranches,
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
