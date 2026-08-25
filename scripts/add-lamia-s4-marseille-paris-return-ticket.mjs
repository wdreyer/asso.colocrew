import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const staffReturnTransportId = "s4-lamia-retour-marseille-paris-2026-08-28";
const sourcePdf = "C:\\Users\\dreye\\Downloads\\Billet.pdf";

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

const allMembers = (await getDocs(collection(db, "staff_members"))).docs.map((item) => ({ id: item.id, ...item.data() }));
const member = allMembers.find((item) =>
  normalize(`${item.firstName || ""} ${item.lastName || ""}`) === normalize("Lamia Fadl")
  || normalize(item.email) === normalize("mhflamia23@gmail.com")
);
if (!member) throw new Error("Fiche RH Lamia introuvable.");

const staff = {
  id: member.id,
  memberId: member.id,
  name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim() || "Lamia Fadl",
  phone: member.phone || "0695972898",
  email: member.email || "mhflamia23@gmail.com",
  role: "Adjointe / DSA",
};

const storagePath = `transports/${staffReturnTransportId}/billets/lamia-marseille-paris-2026-08-28-5y9q4g.pdf`;
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
  sejourName: "Retour staff S4 - Lamia Fadl",
  week: "S4",
  direction: "retour",
  departureCity: "Marseille",
  arrivalCity: "Paris",
  departureTime: "19:12",
  arrivalTime: "22:33",
  status: "confirmé",
  staff: [staff],
  leadStaffId: staff.id,
  convoyeur: staff.name,
  convoyeurPhone: staff.phone,
  passengers: [],
  segments: [
    {
      id: "s4-lamia-train-marseille-paris-5y9q4g",
      from: "Marseille",
      to: "Paris",
      mode: "TGV INOUI",
      trainType: "TGV INOUI",
      number: "6132",
      trainNumber: "6132",
      meetingPoint: "Gare de Marseille Saint-Charles",
      meetingTime: "18:55",
      departureTime: "19:12",
      arrivalTime: "22:33",
      stopType: "rdv",
      assignedStaffIds: [staff.id],
      instructions: "Retour staff Lamia Fadl vers Paris Gare de Lyon. TGV INOUI 6132, voiture 3 bas, place 323.",
    },
  ],
  branches: [],
  tickets: [
    {
      id: "s4-lamia-train-5y9q4g",
      name: "TGV INOUI 6132 - Marseille Saint-Charles > Paris Gare de Lyon - Lamia Fadl",
      url,
      storagePath,
      uploadedFileName: path.basename(sourcePdf),
      segmentId: "s4-lamia-train-marseille-paris-5y9q4g",
      segmentLabel: "Marseille Saint-Charles > Paris Gare de Lyon",
      from: "Marseille",
      to: "Paris",
      coverageFrom: "Marseille",
      coverageTo: "Paris",
      date: "2026-08-28",
      departureTime: "19:12",
      arrivalTime: "22:33",
      trainType: "TGV INOUI",
      trainNumber: "6132",
      seats: 1,
      price: 30,
      purchased: true,
      option: false,
      bookingReference: "5Y9Q4G",
      externalReference: "5Y9Q4G",
      eTicketNumber: "318172910",
      eTicketNumbers: ["318172910"],
      seat: "Voiture 3 Bas - Place 323",
      coveredReservationIds: [],
      coveredStaffIds: [staff.id],
      notes: "Billet staff Lamia du 28/08/2026. TGV INOUI 6132 Marseille Saint-Charles 19:12 > Paris Gare de Lyon 22:33. 2e classe, voiture 3 bas place 323, e-billet 318172910, prix 30 EUR.",
      updatedAt: new Date().toISOString(),
    },
  ],
  notes: "Trajet staff retour Lamia après fin S4 / convoyage Marseille du 28/08.",
  updatedAt: serverTimestamp(),
  scheduleUpdatedAt: new Date().toISOString(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - retour staff Lamia Marseille > Paris`);
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
