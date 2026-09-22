import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "E032d8KCH3OVHdgy5bA5";
const segmentId = "s2-retour-toulouse-marseille";
const sourceDir = "i:\\Shared drives\\ColoCrew\\S\u00e9jours\\Et\u00e9 26\\MCSC 2026\\JUILLET\\S2\\Convoyages\\31Juillet";

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

const files = [
  {
    fileName: "TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_31-07-26_BALLESTER_MILA_EK4L4M_MIZNgBBvvAWNMhqtprE3.pdf",
    id: "s2-retour-ek4l4m-ballester-mila",
    child: "Mila Ballester",
    reservationId: "O7NPishqqs4jIww2cdcj",
    to: "Marseille",
    arrivalTime: "20:36",
    seat: "Voiture 10 Place 58",
    eTicketNumber: "290324790",
    price: 70,
  },
  {
    fileName: "TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_31-07-26_BENGHINE_LUDMILLA_EK4L4M_kznfbdmXDJksgD8TEh3o.pdf",
    id: "s2-retour-ek4l4m-benghine-ludmilla",
    child: "Ludmila Benghine Van Stpidonk",
    reservationId: "Lv24HZMaOrlgXpDxFXeN",
    to: "Marseille",
    arrivalTime: "20:36",
    seat: "Voiture 10 Place 56",
    eTicketNumber: "879084302",
    price: 70,
  },
  {
    fileName: "TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_31-07-26_PROCACCI_LOLA_EK4L4M_YeIQHgBhlc6leDB9Tt3y.pdf",
    id: "s2-retour-ek4l4m-procacci-lola",
    child: "Lola Procacci",
    reservationId: "IzdVaR1NKBCiY2295Enw",
    to: "Marseille",
    arrivalTime: "20:36",
    seat: "Voiture 10 Place 51",
    eTicketNumber: "570039133",
    price: 70,
  },
  {
    fileName: "TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_31-07-26_HAMICHE_LUCAS_EK4L4M_pvnHTBJoqnAlGf0iBj3P.pdf",
    id: "s2-retour-ek4l4m-hamiche-lucas",
    child: "Lucas Hamiche",
    reservationId: "wPsE7oUcD0HMnaLKoiXr",
    to: "Montpellier",
    arrivalTime: "18:54",
    seat: "Voiture 10 Place 57",
    eTicketNumber: "926844900",
    price: 70,
    note: "Billet nominatif Toulouse > Marseille, descente prevue a Montpellier Saint-Roch.",
  },
  {
    fileName: "TOULOUSE_MATABIAU-MARSEILLE_SAINT-CHARLES_31-07-26_RICHARD_LOUIS_EK4L4M_BXI4eTKUh90wKcc1HaKF.pdf",
    id: "s2-retour-ek4l4m-richard-louis",
    child: "Louis Richard",
    reservationId: "",
    to: "Marseille",
    arrivalTime: "20:36",
    seat: "Voiture 10 Place 52",
    eTicketNumber: "300732241",
    price: 49,
    note: "Billet accompagnateur.",
  },
];

const snap = await getDoc(doc(db, "transports", transportId));
if (!snap.exists()) throw new Error(`Transport introuvable : ${transportId}`);

const transport = { id: snap.id, ...snap.data() };
const uploaded = [];

for (const item of files) {
  const fullPath = path.join(sourceDir, item.fileName);
  if (!fs.existsSync(fullPath)) throw new Error(`PDF introuvable : ${fullPath}`);
  let storagePath = `transports/${transportId}/billets/2026-07-31-${item.id}.pdf`;
  let url = "";
  if (shouldApply) {
    const snapshot = await uploadBytes(ref(storage, storagePath), fs.readFileSync(fullPath), {
      contentType: "application/pdf",
    });
    url = await getDownloadURL(snapshot.ref);
  }
  uploaded.push({
    id: item.id,
    name: `INTERCITES 4663 - Toulouse > ${item.to} - ${item.child}`,
    url,
    storagePath,
    uploadedFileName: item.fileName,
    segmentId,
    segmentLabel: item.to === "Montpellier"
      ? "Toulouse Matabiau > Montpellier Saint-Roch"
      : "Toulouse Matabiau > Marseille Saint-Charles",
    from: "Toulouse",
    to: item.to,
    coverageFrom: "Toulouse",
    coverageTo: item.to,
    trainType: "INTERCITES",
    trainNumber: "4663",
    departureTime: "16:44",
    arrivalTime: item.arrivalTime,
    seats: 1,
    price: item.price,
    purchased: true,
    option: false,
    bookingReference: "EK4L4M",
    coveredReservationIds: item.reservationId ? [item.reservationId] : [],
    eTicketNumber: item.eTicketNumber,
    seat: item.seat,
    notes: [
      `Billet individuel EK4L4M du 31/07/2026. ${item.seat}. E-billet ${item.eTicketNumber}.`,
      item.note || "",
    ].filter(Boolean).join(" "),
    updatedAt: new Date().toISOString(),
  });
}

const nextBranches = (transport.branches || []).map((branch) => {
  if (branch.id !== segmentId) return branch;
  return {
    ...branch,
    scheduleStatus: "billet achete",
    instructions: "Train INTERCITES 4663. Descente Montpellier Saint-Roch a 18h54 pour les enfants concernes, arrivee Marseille Saint-Charles a 20h36. Christina Fernandez-Cano reste a verifier si aucun billet separe n'est ajoute.",
    departureTime: "16:44",
    arrivalTime: "20:36",
    number: "4663",
    meetingTime: "16:10",
    stops: [
      ...(branch.stops || []).filter((stop) => String(stop.city || "").toLowerCase() !== "montpellier"),
      {
        id: "s2-retour-4663-montpellier",
        city: "Montpellier",
        arrivalTime: "18:54",
        departureTime: "",
        stopType: "quai",
        meetingPoint: "Gare de Montpellier Saint-Roch",
        meetingTime: "18:54",
        instructions: "Descente a Montpellier Saint-Roch. L'animateur contacte la famille a l'approche.",
        sharedDropoffChildren: 1,
      },
    ],
  };
});

const existingTickets = (transport.tickets || []).filter((ticket) =>
  ticket.id !== "s2-retour-marseille-missing"
    && !files.some((item) => item.id === ticket.id)
);
const nextTickets = [...existingTickets, ...uploaded];

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - billets EK4L4M Toulouse > Marseille/Montpellier`);
console.log(`Billets ajoutes : ${uploaded.length}`);
for (const ticket of uploaded) {
  console.log(`- ${ticket.name} | ${ticket.departureTime} -> ${ticket.arrivalTime} | ${ticket.seat}`);
}

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
