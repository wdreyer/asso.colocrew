import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");
const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const TRANSPORT_ID = "GXvhfCTPBcKdnIFHHZIe";
const INTERCITES_SEGMENT_ID = "2be9e49e-38c2-4038-b9ac-4b152c636c3c";
const DAX_SEGMENT_ID = "9aac5f16-a2ee-4bcc-aa09-ae1ad9516527";
const snapshot = await getDoc(doc(db, "transports", TRANSPORT_ID));
if (!snapshot.exists()) throw new Error("Trajet S1 Sud/Ouest aller introuvable.");
const transport = snapshot.data();

const replacementStops = [
  { id: "s1-4764-beziers", city: "Béziers", arrivalTime: "17:42", departureTime: "17:45", stopType: "quai", meetingPoint: "Gare de Béziers", instructions: "Arrêt de 3 minutes." },
  { id: "s1-4764-narbonne", city: "Narbonne", arrivalTime: "17:59", departureTime: "18:03", stopType: "quai", meetingPoint: "Gare de Narbonne", instructions: "Arrêt de 4 minutes." },
  { id: "s1-4764-carcassonne", city: "Carcassonne", arrivalTime: "18:31", departureTime: "18:34", stopType: "quai", meetingPoint: "Gare de Carcassonne", instructions: "Arrêt de 3 minutes." },
  { id: "s1-4764-toulouse", city: "Toulouse", arrivalTime: "19:16", departureTime: "19:22", meetingTime: "18:50", stopType: "rdv", meetingPoint: "Gare de Toulouse Matabiau", instructions: "Prise en charge à Toulouse puis départ à 19h22." },
  { id: "s1-4764-montauban", city: "Montauban Ville Bourbon", arrivalTime: "19:56", departureTime: "19:58", stopType: "quai", meetingPoint: "Gare de Montauban Ville Bourbon", instructions: "Arrêt de 2 minutes." },
  { id: "s1-4764-marmande", city: "Marmande", arrivalTime: "21:02", departureTime: "21:04", stopType: "quai", meetingPoint: "Gare de Marmande", instructions: "Arrêt de 2 minutes." },
];

const segments = (transport.segments || []).map((segment) => {
  if (segment.id === INTERCITES_SEGMENT_ID) {
    return {
      ...segment,
      from: "Montpellier",
      to: "Bordeaux",
      mode: "INTERCITÉS",
      number: "4764",
      meetingPoint: "Gare de Montpellier Saint-Roch",
      meetingTime: "16:30",
      departureTime: "17:05",
      arrivalTime: "21:51",
      stops: replacementStops,
      scheduleStatus: "remplacement confirmé",
      instructions: "INTERCITÉS 4764 de remplacement après l'annulation du train de 15h05.",
    };
  }
  if (segment.id === DAX_SEGMENT_ID) {
    return {
      ...segment,
      from: "Bordeaux",
      to: "Messanges",
      mode: "Minibus",
      number: "",
      meetingPoint: "Gare de Bordeaux Saint-Jean – côté Belcier",
      meetingTime: "22:05",
      departureTime: "22:15",
      arrivalTime: "00:20",
      arrivalDateOffset: 1,
      stopType: "rdv",
      connectionStatus: "confirmé",
      instructions: "Transfert en minibus après l'arrivée de l'INTERCITÉS 4764 à 21h51. Départ à 22h15 et arrivée à Messanges le 7 juillet à 00h20.",
    };
  }
  return segment;
});

const tickets = (transport.tickets || []).map((ticket) => {
  if (ticket.segmentId === INTERCITES_SEGMENT_ID) {
    return {
      ...ticket,
      name: "INTERCITÉS 4764 – Montpellier Saint-Roch > Bordeaux Saint-Jean – remplacement",
      trainType: "INTERCITÉS",
      trainNumber: "4764",
      departureTime: "17:05",
      arrivalTime: "21:51",
      segmentLabel: "Montpellier Saint-Roch > Bordeaux Saint-Jean",
      scheduleStatus: "remplacement confirmé",
      notes: "Remplace l'INTERCITÉS 4762 de 15h05 annulé. Horaires mis à jour le 03/07/2026 ; vérifier que le PDF du billet correspond bien au train 4764.",
    };
  }
  if (ticket.segmentId === DAX_SEGMENT_ID) {
    return {
      ...ticket,
      previousTicketUrl: ticket.previousTicketUrl || ticket.url || "",
      previousTicketName: ticket.previousTicketName || ticket.name || "",
      previousBookingReference: ticket.previousBookingReference || ticket.bookingReference || "",
      url: "",
      storagePath: "",
      sourceFile: "",
      name: "Minibus – Bordeaux Saint-Jean > Messanges (9 places)",
      trainType: "Minibus",
      trainNumber: "",
      departureTime: "22:15",
      arrivalTime: "00:20",
      segmentLabel: "Bordeaux Saint-Jean > Messanges",
      from: "Bordeaux",
      to: "Messanges",
      coverageFrom: "Bordeaux",
      coverageTo: "Messanges",
      seats: 9,
      price: 0,
      purchased: true,
      bookingReference: "",
      connectionInvalid: false,
      notes: "Transfert minibus confirmé le 03/07/2026. L'ancien TGV 8551 Bordeaux → Dax n'est plus utilisé ; ses références sont conservées dans les champs d'archive.",
    };
  }
  return ticket;
});

const note = "Modification du 03/07/2026 : INTERCITÉS 4762 de 15h05 annulé, remplacé par l'INTERCITÉS 4764 Montpellier 17h05 → Bordeaux 21h51, puis minibus Bordeaux 22h15 → Messanges 00h20.";
const baseNotes = String(transport.notes || "").split("\n\nModification du 03/07/2026")[0];
const patch = {
  segments,
  tickets,
  passengers: (transport.passengers || []).map((passenger) => ({
    ...passenger,
    dropoffCity: "Messanges",
  })),
  arrivalCity: "Messanges",
  arrivalTime: "00:20",
  arrivalDateOffset: 1,
  status: "confirmé",
  notes: [baseNotes, note].filter(Boolean).join("\n\n"),
  scheduleAlert: "",
  scheduleUpdatedAt: new Date().toISOString(),
  updatedAt: serverTimestamp(),
};

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} – mise à jour S1 Montpellier → Bordeaux`);
console.log("INTERCITÉS 4764 : Montpellier 17:05 → Toulouse 19:16/19:22 → Bordeaux 21:51");
console.log("Étapes : Béziers, Narbonne, Carcassonne, Toulouse, Montauban Ville Bourbon, Marmande");
console.log("Minibus : Bordeaux Saint-Jean 22:15 → Messanges 00:20 (arrivée le lendemain).");

if (shouldApply) {
  await updateDoc(doc(db, "transports", TRANSPORT_ID), patch);
  const verification = (await getDoc(doc(db, "transports", TRANSPORT_ID))).data();
  const finalSegment = (verification.segments || []).find((segment) => segment.id === DAX_SEGMENT_ID);
  const messangesPassengers = (verification.passengers || []).filter((passenger) => passenger.dropoffCity === "Messanges").length;
  if (
    verification.status !== "confirmé"
    || verification.arrivalCity !== "Messanges"
    || finalSegment?.mode !== "Minibus"
    || finalSegment?.departureTime !== "22:15"
    || finalSegment?.arrivalTime !== "00:20"
    || messangesPassengers !== (verification.passengers || []).length
  ) {
    throw new Error("La vérification Firebase du trajet minibus a échoué.");
  }
  console.log(`Mise à jour Firebase vérifiée : ${messangesPassengers} enfant(s) rattaché(s) à Messanges.`);
  console.log("Les prochaines convocations générées utiliseront ces horaires.");
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
