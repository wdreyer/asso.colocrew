import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const s2ReturnTransportId = "E032d8KCH3OVHdgy5bA5";
const staffReturnTransportId = "s2-louis-richard-retour-2026-08-01";
const louis = {
  id: "louis-richard",
  memberId: "louis-richard",
  name: "Louis Richard",
  phone: "0633422251",
  email: "louis.richard.coste@gmail.com",
  role: "Animateur convoyeur",
};
const sourceDir = "i:\\Shared drives\\ColoCrew\\S\u00e9jours\\Et\u00e9 26\\MCSC 2026\\JUILLET\\S2\\Convoyages\\31Juillet";
const bookingFile = "Booking.com_ Confirmation.pdf";
const returnTicketFile = "MARSEILLE_SAINT-CHARLES-BORDEAUX-SAINT-JEAN_01-08-26_RICHARD_LOUIS_5GK7RQ_RoTRosdSqkl2MTTOXBSC.pdf";

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

const bookingPath = path.join(sourceDir, bookingFile);
const returnTicketPath = path.join(sourceDir, returnTicketFile);
if (!fs.existsSync(bookingPath)) throw new Error(`PDF introuvable : ${bookingPath}`);
if (!fs.existsSync(returnTicketPath)) throw new Error(`PDF introuvable : ${returnTicketPath}`);

const currentSnap = await getDoc(doc(db, "transports", s2ReturnTransportId));
if (!currentSnap.exists()) throw new Error(`Transport introuvable : ${s2ReturnTransportId}`);
const current = { id: currentSnap.id, ...currentSnap.data() };

const nextStaff = upsertById(current.staff || [], louis);
const nextBranches = (current.branches || []).map((branch) => {
  if (branch.id !== "s2-retour-toulouse-marseille") return branch;
  return {
    ...branch,
    assignedStaffIds: unique([...(branch.assignedStaffIds || []), louis.id]),
    instructions: appendInstruction(
      branch.instructions,
      "Louis Richard accompagne le trajet Toulouse > Montpellier/Marseille puis dort a Marseille avant son retour staff le 01/08.",
    ),
  };
});
const nextTickets = (current.tickets || []).map((ticket) => {
  if (ticket.id !== "s2-retour-ek4l4m-richard-louis") return ticket;
  return {
    ...ticket,
    coveredStaffIds: unique([...(ticket.coveredStaffIds || []), louis.id]),
    notes: appendInstruction(ticket.notes, "Billet accompagnateur Louis Richard."),
  };
});

let bookingUrl = "";
let bookingStoragePath = `transports/${staffReturnTransportId}/documents/booking-kley-marseille.pdf`;
let returnTicketUrl = "";
let returnTicketStoragePath = `transports/${staffReturnTransportId}/billets/louis-richard-marseille-bordeaux-2026-08-01.pdf`;

if (shouldApply) {
  const bookingUpload = await uploadBytes(ref(storage, bookingStoragePath), fs.readFileSync(bookingPath), {
    contentType: "application/pdf",
  });
  bookingUrl = await getDownloadURL(bookingUpload.ref);

  const ticketUpload = await uploadBytes(ref(storage, returnTicketStoragePath), fs.readFileSync(returnTicketPath), {
    contentType: "application/pdf",
  });
  returnTicketUrl = await getDownloadURL(ticketUpload.ref);
}

const staffReturnTransport = {
  id: staffReturnTransportId,
  date: "2026-08-01",
  sejourName: "Retour staff S2 - Louis Richard",
  week: "S2",
  direction: "retour",
  departureCity: "Marseille",
  arrivalCity: "Bordeaux",
  departureTime: "13:22",
  arrivalTime: "19:54",
  status: "confirmé",
  staff: [louis],
  leadStaffId: louis.id,
  convoyeur: louis.name,
  convoyeurPhone: louis.phone,
  passengers: [],
  segments: [
    {
      id: "s2-louis-hotel-marseille",
      from: "Marseille",
      to: "Marseille",
      mode: "Hébergement",
      number: "Booking 6406.864.241",
      meetingPoint: "Résidence Kley Marseille République, 63 Rue de la République, 13002 Marseille",
      meetingTime: "31/07 15:00-23:00",
      departureTime: "",
      arrivalTime: "",
      stopType: "rdv",
      assignedStaffIds: [louis.id],
      instructions: "Nuit du 31/07 au 01/08. Départ possible le 01/08 entre 06:00 et 12:00. Téléphone résidence : +33 4 12 29 01 39. Code confidentiel Booking : 8796.",
      bookingReference: "6406.864.241",
    },
    {
      id: "s2-louis-train-marseille-bordeaux",
      from: "Marseille",
      to: "Bordeaux",
      mode: "INTERCITES",
      number: "4762",
      meetingPoint: "Gare de Marseille Saint-Charles",
      meetingTime: "13:00",
      departureTime: "13:22",
      arrivalTime: "19:54",
      stopType: "rdv",
      assignedStaffIds: [louis.id],
      instructions: "Retour staff Louis Richard vers Bordeaux Saint-Jean. Voiture 2, place 26, 1e classe.",
    },
  ],
  branches: [],
  tickets: [
    {
      id: "s2-louis-booking-kley-marseille",
      name: "Booking.com - Résidence Kley Marseille République",
      url: bookingUrl,
      storagePath: bookingStoragePath,
      uploadedFileName: bookingFile,
      segmentId: "s2-louis-hotel-marseille",
      segmentLabel: "Nuit Marseille - Résidence Kley Marseille République",
      from: "Marseille",
      to: "Marseille",
      trainType: "Hébergement",
      trainNumber: "Booking 6406.864.241",
      departureTime: "31/07 15:00",
      arrivalTime: "01/08 12:00",
      seats: 1,
      price: 79.04,
      purchased: true,
      option: false,
      bookingReference: "6406.864.241",
      coveredStaffIds: [louis.id],
      notes: "Studio 1 adulte. Code confidentiel 8796. Adresse : 63 Rue de la République, 13002 Marseille. Téléphone : +33 4 12 29 01 39.",
    },
    {
      id: "s2-louis-train-5gk7rq",
      name: "INTERCITES 4762 - Marseille > Bordeaux - Louis Richard",
      url: returnTicketUrl,
      storagePath: returnTicketStoragePath,
      uploadedFileName: returnTicketFile,
      segmentId: "s2-louis-train-marseille-bordeaux",
      segmentLabel: "Marseille Saint-Charles > Bordeaux Saint-Jean",
      from: "Marseille",
      to: "Bordeaux",
      coverageFrom: "Marseille",
      coverageTo: "Bordeaux",
      trainType: "INTERCITES",
      trainNumber: "4762",
      departureTime: "13:22",
      arrivalTime: "19:54",
      seats: 1,
      price: 96,
      purchased: true,
      option: false,
      bookingReference: "5GK7RQ",
      coveredStaffIds: [louis.id],
      eTicketNumber: "127032210",
      seat: "Voiture 2 Place 26",
      notes: "Billet staff Louis Richard du 01/08/2026. 1e classe, voiture 2 place 26, e-billet 127032210.",
    },
  ],
  notes: "Trajet staff retour Louis Richard après convoyage Marseille du 31/07.",
  updatedAt: serverTimestamp(),
  scheduleUpdatedAt: new Date().toISOString(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - Louis Richard /convoyages`);
console.log("31/07 : Louis affecte au segment Toulouse > Marseille et a son billet EK4L4M.");
console.log("01/08 : transport staff Marseille 13:22 > Bordeaux 19:54, billet 5GK7RQ.");
console.log("Hebergement : Residence Kley Marseille Republique, booking 6406.864.241.");

if (shouldApply) {
  await updateDoc(doc(db, "transports", s2ReturnTransportId), {
    staff: nextStaff,
    branches: nextBranches,
    tickets: nextTickets,
    leadStaffId: current.leadStaffId || louis.id,
    convoyeur: current.convoyeur || louis.name,
    convoyeurPhone: current.convoyeurPhone || louis.phone,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "transports", staffReturnTransportId), staffReturnTransport, { merge: true });
  console.log("Firestore mis a jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function upsertById(items, item) {
  const exists = new Set(items.map((entry) => entry.id));
  return exists.has(item.id)
    ? items.map((entry) => entry.id === item.id ? { ...entry, ...item } : entry)
    : [...items, item];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function appendInstruction(current, addition) {
  const text = String(current || "").trim();
  if (text.includes(addition)) return text;
  return [text, addition].filter(Boolean).join(" ");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
