import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const staffReturnTransportId = "s4-rayan-retour-lyon-paris-2026-08-28";
const memberId = "rayan-mohamed-hassan-fadl";
const sourcePdf = "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-PARIS_GARE_DE_LYON_28-08-26_MOHAMED_HASSAN_FADL_RAYAN_V9LMCE_CANIg7A8najhIIg2P9lH.pdf";

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

if (!fs.existsSync(sourcePdf)) throw new Error(`PDF introuvable: ${sourcePdf}`);

const memberSnap = await getDoc(doc(db, "staff_members", memberId));
let member = memberSnap.exists() ? { id: memberSnap.id, ...memberSnap.data() } : null;
if (!member) {
  const allMembers = (await getDocs(collection(db, "staff_members"))).docs.map((item) => ({ id: item.id, ...item.data() }));
  member = allMembers.find((item) => normalize(`${item.firstName || ""} ${item.lastName || ""}`) === normalize("Rayan Mohamed Hassan Fadl"));
}
if (!member) throw new Error("Fiche RH Rayan introuvable.");

const staff = {
  id: member.id,
  memberId: member.id,
  name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim() || "Rayan Mohamed Hassan Fadl",
  phone: member.phone || "",
  email: member.email || "rayanmhfn@gmail.com",
  role: "AS/SB",
};

const storagePath = `transports/${staffReturnTransportId}/billets/rayan-lyon-paris-2026-08-28-v9lmce.pdf`;
let url = "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePdf), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const staffReturnTransport = {
  id: staffReturnTransportId,
  date: "2026-08-28",
  sejourName: "Retour staff S4 - Rayan Mohamed Hassan Fadl",
  week: "S4",
  direction: "retour",
  departureCity: "Lyon",
  arrivalCity: "Paris",
  departureTime: "21:04",
  arrivalTime: "23:09",
  status: "confirmé",
  staff: [staff],
  leadStaffId: staff.id,
  convoyeur: staff.name,
  convoyeurPhone: staff.phone,
  passengers: [],
  segments: [
    {
      id: "s4-rayan-train-lyon-paris-v9lmce",
      from: "Lyon",
      to: "Paris",
      mode: "TGV INOUI",
      trainType: "TGV INOUI",
      number: "6634",
      trainNumber: "6634",
      meetingPoint: "Gare de Lyon Part-Dieu",
      meetingTime: "20:45",
      departureTime: "21:04",
      arrivalTime: "23:09",
      stopType: "rdv",
      assignedStaffIds: [staff.id],
      instructions: "Retour staff Rayan Mohamed Hassan Fadl vers Paris Gare de Lyon. TGV INOUI 6634, voiture 8 bas, place 811.",
    },
  ],
  branches: [],
  tickets: [
    {
      id: "s4-rayan-train-v9lmce",
      name: "TGV INOUI 6634 - Lyon Part-Dieu > Paris Gare de Lyon - Rayan",
      url,
      storagePath,
      uploadedFileName: path.basename(sourcePdf),
      segmentId: "s4-rayan-train-lyon-paris-v9lmce",
      segmentLabel: "Lyon Part-Dieu > Paris Gare de Lyon",
      from: "Lyon",
      to: "Paris",
      coverageFrom: "Lyon",
      coverageTo: "Paris",
      date: "2026-08-28",
      departureTime: "21:04",
      arrivalTime: "23:09",
      trainType: "TGV INOUI",
      trainNumber: "6634",
      seats: 1,
      price: 74,
      purchased: true,
      option: false,
      bookingReference: "V9LMCE",
      externalReference: "V9LMCE",
      eTicketNumber: "119701414",
      eTicketNumbers: ["119701414"],
      seat: "Voiture 8 Bas - Place 811",
      coveredReservationIds: [],
      coveredStaffIds: [staff.id],
      notes: "Billet staff Rayan du 28/08/2026. TGV INOUI 6634 Lyon Part-Dieu 21:04 > Paris Gare de Lyon 23:09. 2e classe, voiture 8 bas place 811, e-billet 119701414, prix 74 EUR.",
      updatedAt: new Date().toISOString(),
    },
  ],
  notes: "Trajet staff retour Rayan après fin S4 / convoyage Lyon du 28/08.",
  updatedAt: serverTimestamp(),
  scheduleUpdatedAt: new Date().toISOString(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - retour staff Rayan Lyon > Paris`);
console.log(JSON.stringify({
  staffReturnTransportId,
  staff,
  ticket: staffReturnTransport.tickets[0],
}, null, 2));

if (shouldApply) {
  await setDoc(doc(db, "transports", staffReturnTransportId), staffReturnTransport, { merge: true });
  console.log("Firestore mis a jour.");
}

process.exit(0);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
