import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { addDoc, collection, getDocs, getFirestore, serverTimestamp } from "firebase/firestore";

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

const existing = await getDocs(collection(db, "reservations"));
const alreadyExists = existing.docs.some((item) => {
  const data = item.data();
  if (isDeletedStatus(data.status)) return false;
  if (String(data.sejour?.startDate || "").slice(0, 10) !== "2026-08-03") return false;
  return (data.minor?.children || []).some((child) => nameKey(child.firstName, child.lastName) === nameKey("Capucine", "Lagathu"));
});

const reservation = {
  numeroDeReservation: "EVCC-S3-167-LAG",
  status: "validated",
  validationSource: "manual_strict_s3_roster",
  validationWorkbook: "ETE 26 - Inscriptions validées (12).xlsx",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  validatedAt: serverTimestamp(),
  legal: {
    firstName: "",
    lastName: "",
    email: "plagathu69@gmail.com",
    phone: "",
    relation: "",
    address: "",
  },
  minor: {
    numberOfChildren: "1",
    children: [{
      firstName: "Capucine",
      lastName: "Lagathu",
      birthDate: "2011-04-08",
      gender: "F",
    }],
  },
  sejour: {
    name: "eaux-vives-creative-camp",
    startDate: "2026-08-03T00:00:00.000Z",
    endDate: "2026-08-14T00:00:00.000Z",
    ageGroup: "",
  },
  transport: {
    departureCity: "Nantes",
    returnCity: "Nantes",
    fee: 180,
  },
  payment: {
    totalPrice: 1121,
    validatedPrice: 1121,
    priceStatus: "validated",
    transportFee: 180,
    cafAmount: 0,
    cafEligible: false,
    resteACharge: 1121,
    alreadyPaid: 0,
    remainingValue: 1121,
    paymentStatus: "not_paid",
  },
  finance: {
    stayAmount: 941,
    transportAmount: 180,
    grossAmount: 1121,
    cafAidAmount: 0,
    netAmount: 1121,
    paidAmount: 0,
    remainingAmount: 1121,
    source: "ETE 26 - Inscriptions validées (12).xlsx",
    entries: [{
      excelRow: 167,
      childFirstName: "Capucine",
      childLastName: "Lagathu",
      birthDate: "2011-04-08",
      reference: "EVCC-S3-167-LAG",
      stayCode: "EVCC",
      week: "S3",
      departureCity: "Nantes",
      returnCity: "Nantes",
      grossAmount: 1121,
      netAmount: 1121,
      stayAmount: 941,
      transportAmount: 180,
      cafAidAmount: 0,
      paidAmount: 0,
      matchMethod: "created_from_strict_roster",
    }],
  },
  importedRegistration: {
    source: "ETE 26 - Inscriptions validées (12).xlsx",
    entries: [{
      excelRow: 167,
      reference: "EVCC-S3-167-LAG",
      childFirstName: "Capucine",
      childLastName: "Lagathu",
      matchMethod: "created_from_strict_roster",
    }],
  },
};

if (shouldApply && !alreadyExists) {
  const created = await addDoc(collection(db, "reservations"), reservation);
  console.log(JSON.stringify({ mode: "apply", created: true, id: created.id, reference: reservation.numeroDeReservation }, null, 2));
} else {
  console.log(JSON.stringify({ mode: shouldApply ? "apply" : "dry-run", created: false, alreadyExists, reference: reservation.numeroDeReservation }, null, 2));
}

process.exit(0);

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
}

function nameKey(firstName, lastName) {
  const a = normalizeKey(`${firstName || ""} ${lastName || ""}`);
  const b = normalizeKey(`${lastName || ""} ${firstName || ""}`);
  return a < b ? a : b;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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
