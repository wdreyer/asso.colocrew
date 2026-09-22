import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

loadEnv(".env.local");

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const ARMAN_ID = "ete26-mcscs3-arman-ahmadzai";
const KEHLAOUI_ID = "ete26-mcscs3095keh";

const armanReservation = {
  numeroDeReservation: "MCSC-S3-114-AHM",
  status: "validated",
  importedOnly: true,
  validationSource: "manual_excel_13",
  validationWorkbook: "ETE 26 - Inscriptions validées (13).xlsx",
  sejour: {
    name: "my-creative-surf-camp",
    startDate: "2026-08-03T00:00:00.000Z",
    endDate: "2026-08-14T00:00:00.000Z",
    ageGroup: "",
  },
  minor: {
    numberOfChildren: "1",
    children: [{
      firstName: "Arman",
      lastName: "Ahmadzai",
      birthDate: "2011-01-15",
      gender: "M",
    }],
  },
  legal: {
    firstName: "",
    lastName: "",
    relation: "",
    email: "",
    phone: "",
    address: "",
    cafOrSecu: "",
    qf: null,
  },
  transport: {
    departureCity: "Bordeaux",
    returnCity: "Bordeaux",
    fee: 60,
  },
  payment: {
    totalPrice: 1010,
    validatedPrice: 1010,
    priceStatus: "validated",
    transportFee: 60,
    cafAmount: 0,
    cafEligible: false,
    resteACharge: 1010,
    alreadyPaid: 0,
    remainingValue: 1010,
    paymentStatus: "not_paid",
  },
  finance: {
    stayAmount: 950,
    transportAmount: 60,
    grossAmount: 1010,
    cafAidAmount: 0,
    netAmount: 1010,
    paidAmount: 0,
    remainingAmount: 1010,
    source: "ETE 26 - Inscriptions validées (13).xlsx",
    entries: [{
      excelRow: 114,
      childFirstName: "Arman",
      childLastName: "Ahmadzai",
      birthDate: "2011-01-15",
      reference: "",
      stayCode: "MCSC",
      week: "S3",
      departureCity: "Bordeaux",
      returnCity: "Bordeaux",
      grossAmount: 1010,
      netAmount: 1010,
      stayAmount: 950,
      transportAmount: 60,
      cafAidAmount: 0,
      paidAmount: 0,
      matchMethod: "manual_add_from_excel_13",
    }],
  },
  importedRegistration: {
    source: "ETE 26 - Inscriptions validées (13).xlsx",
    entries: [{
      excelRow: 114,
      reference: "MCSC-S3-114-AHM",
      childFirstName: "Arman",
      childLastName: "Ahmadzai",
      matchMethod: "manual_add_from_excel_13",
    }],
  },
  notes: "",
  convocationSent: false,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  validatedAt: serverTimestamp(),
};

const armanPassenger = {
  reservationId: ARMAN_ID,
  nom: "Arman Ahmadzai",
  childName: "Arman Ahmadzai",
  sejourName: "MCSC",
  stayCode: "MCSC",
  pickupCity: "Bordeaux",
  dropoffCity: "Messanges",
  returnCity: "Bordeaux",
  convocationSent: false,
  children: [{
    firstName: "Arman",
    lastName: "Ahmadzai",
    birthDate: "2011-01-15",
    gender: "M",
  }],
};

await setDoc(doc(db, "reservations", ARMAN_ID), armanReservation, { merge: true });

const kehlaouiSnap = await getDoc(doc(db, "reservations", KEHLAOUI_ID));
if (kehlaouiSnap.exists()) {
  await deleteDoc(doc(db, "reservations", KEHLAOUI_ID));
}

const transportSnap = await getDocs(collection(db, "transports"));
const touchedTransports = [];
for (const item of transportSnap.docs) {
  const transport = { id: item.id, ...item.data() };
  if (transport.week !== "S3") continue;

  let passengers = (transport.passengers || []).filter((passenger) => passenger.reservationId !== KEHLAOUI_ID);
  const hadKehlaoui = passengers.length !== (transport.passengers || []).length;
  let shouldAddArman = false;
  let armanPickup = "Bordeaux";
  let armanDropoff = "Messanges";

  if (transport.id === "s3-2026-bus-aller-autocar") shouldAddArman = true;
  if (transport.id === "s3-2026-bus-retour-autocar") shouldAddArman = true;

  if (transport.id === "s3-2026-bus-retour-autocar") {
    armanPickup = "Messanges";
    armanDropoff = "Bordeaux";
  }

  if (shouldAddArman && !passengers.some((passenger) => passenger.reservationId === ARMAN_ID)) {
    passengers = [...passengers, { ...armanPassenger, pickupCity: armanPickup, dropoffCity: armanDropoff }];
  }

  const tickets = (transport.tickets || []).map((ticket) => ({
    ...ticket,
    coveredReservationIds: (ticket.coveredReservationIds || []).filter((id) => id !== KEHLAOUI_ID),
  }));

  const changed = hadKehlaoui || shouldAddArman || JSON.stringify(tickets) !== JSON.stringify(transport.tickets || []);
  if (!changed) continue;

  await updateDoc(doc(db, "transports", transport.id), {
    passengers,
    tickets,
    updatedAt: serverTimestamp(),
  });
  touchedTransports.push({
    id: transport.id,
    name: transport.sejourName || transport.id,
    removedKehlaoui: hadKehlaoui,
    addedArman: shouldAddArman,
  });
}

console.log(JSON.stringify({
  addedReservation: ARMAN_ID,
  deletedReservation: kehlaouiSnap.exists() ? KEHLAOUI_ID : null,
  touchedTransports,
}, null, 2));
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
