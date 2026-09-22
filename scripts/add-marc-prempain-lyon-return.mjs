import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const s2ReturnTransportId = "E032d8KCH3OVHdgy5bA5";
const staffReturnTransportId = "s2-marc-prempain-retour-2026-08-01";
const marc = {
  id: "ae49f0e1-59a5-40dc-ac9d-8dab695af239",
  memberId: "ryuqHACdIqx2bhjFC0CY",
  name: "Marc Prempain",
  phone: "+33 6 98 27 63 45",
  email: "",
  role: "DSA bénévole",
};
const sourceDir = "i:\\Shared drives\\ColoCrew\\S\u00e9jours\\Et\u00e9 26\\MCSC 2026\\JUILLET\\S2\\Convoyages\\31Juillet";
const hotelFile = "Lyonhotel.pdf";
const trainFile = "LYON-SAINT_EXUP_RY_TGV-PARIS_GARE_DE_LYON_01-08-26_PREMPAIN_MARC_L8AT6W_YdQWheV359hglC1McTV6.pdf";

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

const hotelPath = path.join(sourceDir, hotelFile);
const trainPath = path.join(sourceDir, trainFile);
if (!fs.existsSync(hotelPath)) throw new Error(`PDF introuvable : ${hotelPath}`);
if (!fs.existsSync(trainPath)) throw new Error(`PDF introuvable : ${trainPath}`);

const currentSnap = await getDoc(doc(db, "transports", s2ReturnTransportId));
if (!currentSnap.exists()) throw new Error(`Transport introuvable : ${s2ReturnTransportId}`);
const current = { id: currentSnap.id, ...currentSnap.data() };

const nextBranches = (current.branches || []).map((branch) => {
  if (branch.id !== "s2-retour-toulouse-lyon") return branch;
  return {
    ...branch,
    assignedStaffIds: unique([...(branch.assignedStaffIds || []), marc.id]),
    instructions: appendInstruction(
      branch.instructions,
      "Marc Prempain accompagne le trajet Toulouse > Lyon puis dort a Lyon avant son retour staff le 01/08.",
    ),
  };
});

const nextTickets = (current.tickets || []).map((ticket) => {
  if (ticket.id !== "s2-retour-r1dn3kh1" && ticket.segmentId !== "s2-retour-toulouse-lyon") return ticket;
  return {
    ...ticket,
    coveredStaffIds: unique([...(ticket.coveredStaffIds || []), marc.id]),
  };
});

const hotelStoragePath = `transports/${staffReturnTransportId}/documents/appartcity-lyon-part-dieu-villette.pdf`;
const trainStoragePath = `transports/${staffReturnTransportId}/billets/marc-prempain-lyon-paris-2026-08-01.pdf`;
let hotelUrl = "";
let trainUrl = "";

if (shouldApply) {
  const hotelUpload = await uploadBytes(ref(storage, hotelStoragePath), fs.readFileSync(hotelPath), {
    contentType: "application/pdf",
  });
  hotelUrl = await getDownloadURL(hotelUpload.ref);

  const trainUpload = await uploadBytes(ref(storage, trainStoragePath), fs.readFileSync(trainPath), {
    contentType: "application/pdf",
  });
  trainUrl = await getDownloadURL(trainUpload.ref);
}

const staffReturnTransport = {
  id: staffReturnTransportId,
  date: "2026-08-01",
  sejourName: "Retour staff S2 - Marc Prempain",
  week: "S2",
  direction: "retour",
  departureCity: "Lyon",
  arrivalCity: "Paris",
  departureTime: "10:54",
  arrivalTime: "12:46",
  status: "confirmé",
  staff: [marc],
  leadStaffId: marc.id,
  convoyeur: marc.name,
  convoyeurPhone: marc.phone,
  passengers: [],
  segments: [
    {
      id: "s2-marc-hotel-lyon",
      from: "Lyon",
      to: "Lyon",
      mode: "Hébergement",
      number: "Booking 5049.045.688",
      meetingPoint: "Appart'City Classic Lyon Part Dieu Villette, 6 Avenue Lacassagne, 69003 Lyon",
      meetingTime: "31/07 à partir de 16:00",
      departureTime: "",
      arrivalTime: "",
      stopType: "rdv",
      assignedStaffIds: [marc.id],
      instructions: "Nuit du 31/07 au 01/08. Départ jusqu'à 11:00. Téléphone hôtel : +33 4 37 91 99 21. Code confidentiel Booking : 7290.",
      bookingReference: "5049.045.688",
    },
    {
      id: "s2-marc-train-lyon-paris",
      from: "Lyon",
      to: "Paris",
      mode: "TGV INOUI",
      number: "6908",
      meetingPoint: "Gare de Lyon-Saint Exupéry TGV",
      meetingTime: "10:30",
      departureTime: "10:54",
      arrivalTime: "12:46",
      stopType: "rdv",
      assignedStaffIds: [marc.id],
      instructions: "Retour staff Marc Prempain vers Paris Gare de Lyon. Voiture 8 haut, place 858.",
    },
  ],
  branches: [],
  tickets: [
    {
      id: "s2-marc-booking-appartcity-lyon",
      name: "Booking.com - Appart'City Classic Lyon Part Dieu Villette",
      url: hotelUrl,
      storagePath: hotelStoragePath,
      uploadedFileName: hotelFile,
      segmentId: "s2-marc-hotel-lyon",
      segmentLabel: "Nuit Lyon - Appart'City Classic Lyon Part Dieu Villette",
      from: "Lyon",
      to: "Lyon",
      trainType: "Hébergement",
      trainNumber: "Booking 5049.045.688",
      departureTime: "31/07 16:00",
      arrivalTime: "01/08 11:00",
      seats: 1,
      price: 63.07,
      purchased: true,
      option: false,
      bookingReference: "5049.045.688",
      coveredStaffIds: [marc.id],
      notes: "Studio lits jumeaux 1 adulte. Code confidentiel 7290. Adresse : 6 Avenue Lacassagne, 69003 Lyon. Téléphone : +33 4 37 91 99 21.",
    },
    {
      id: "s2-marc-train-l8at6w",
      name: "TGV INOUI 6908 - Lyon Saint-Exupéry > Paris Gare de Lyon - Marc Prempain",
      url: trainUrl,
      storagePath: trainStoragePath,
      uploadedFileName: trainFile,
      segmentId: "s2-marc-train-lyon-paris",
      segmentLabel: "Lyon-Saint Exupéry TGV > Paris Gare de Lyon",
      from: "Lyon",
      to: "Paris",
      coverageFrom: "Lyon",
      coverageTo: "Paris",
      trainType: "TGV INOUI",
      trainNumber: "6908",
      departureTime: "10:54",
      arrivalTime: "12:46",
      seats: 1,
      price: 65,
      purchased: true,
      option: false,
      bookingReference: "L8AT6W",
      coveredStaffIds: [marc.id],
      eTicketNumber: "369705754",
      seat: "Voiture 8 Haut - Place 858",
      notes: "Billet staff Marc Prempain du 01/08/2026. 2e classe, voiture 8 haut place 858, e-billet 369705754.",
    },
  ],
  notes: "Trajet staff retour Marc Prempain après convoyage Lyon du 31/07.",
  updatedAt: serverTimestamp(),
  scheduleUpdatedAt: new Date().toISOString(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - Marc Prempain /convoyages Lyon`);
console.log("31/07 : Marc est confirme sur Toulouse > Lyon.");
console.log("01/08 : hotel Appart'City Lyon Part Dieu Villette + TGV 6908 Lyon 10:54 > Paris 12:46.");

if (shouldApply) {
  await updateDoc(doc(db, "transports", s2ReturnTransportId), {
    branches: nextBranches,
    tickets: nextTickets,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "transports", staffReturnTransportId), staffReturnTransport, { merge: true });
  console.log("Firestore mis a jour.");
} else {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

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
