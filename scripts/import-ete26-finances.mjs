import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

loadEnv(".env.local");

const inputPath = process.argv.find((arg) => arg.endsWith(".json"));
const shouldApply = process.argv.includes("--apply");
if (!inputPath) throw new Error("Chemin du fichier JSON financier manquant.");

const sourceRows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const rowsByExcelRow = new Map(sourceRows.map((row) => [Number(row.excelRow), row]));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });

const db = getFirestore(app);
const snapshot = await getDocs(collection(db, "reservations"));
const reservations = snapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((item) => item.validationSource === "ete26_validated_workbook");

const updates = [];
const missingRows = [];

for (const reservation of reservations) {
  const importedEntries = reservation.importedRegistration?.entries || [];
  const financeEntries = [];

  for (const entry of importedEntries) {
    const source = rowsByExcelRow.get(Number(entry.excelRow));
    if (!source) {
      missingRows.push({ reservationId: reservation.id, excelRow: entry.excelRow });
      continue;
    }
    financeEntries.push(source);
  }

  if (!financeEntries.length) continue;
  const totals = financeEntries.reduce(
    (result, entry) => ({
      stayAmount: result.stayAmount + amount(entry.stayAmount),
      transportAmount: result.transportAmount + amount(entry.transportAmount),
      grossAmount: result.grossAmount + amount(entry.grossAmount),
      cafAidAmount: result.cafAidAmount + amount(entry.cafAidAmount),
      netAmount: result.netAmount + amount(entry.netAmount),
      paidAmount: result.paidAmount + amount(entry.paidAmount),
    }),
    {
      stayAmount: 0,
      transportAmount: 0,
      grossAmount: 0,
      cafAidAmount: 0,
      netAmount: 0,
      paidAmount: 0,
    },
  );

  updates.push({
    id: reservation.id,
    finance: {
      ...roundAmounts(totals),
      remainingAmount: round(Math.max(totals.netAmount - totals.paidAmount, 0)),
      source: "ETE 26 - Inscriptions validées (1).xlsx",
      entries: financeEntries,
    },
  });
}

const grandTotals = updates.reduce(
  (result, update) => {
    for (const key of [
      "stayAmount",
      "transportAmount",
      "grossAmount",
      "cafAidAmount",
      "netAmount",
      "paidAmount",
      "remainingAmount",
    ]) {
      result[key] += update.finance[key];
    }
    return result;
  },
  {
    stayAmount: 0,
    transportAmount: 0,
    grossAmount: 0,
    cafAidAmount: 0,
    netAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
  },
);

if (shouldApply) {
  for (const update of updates) {
    await updateDoc(doc(db, "reservations", update.id), {
      finance: update.finance,
      financeUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      reservations: updates.length,
      entries: updates.reduce((sum, update) => sum + update.finance.entries.length, 0),
      missingRows,
      totals: roundAmounts(grandTotals),
    },
    null,
    2,
  ),
);
process.exit(0);

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Number(Number(value).toFixed(2));
}

function roundAmounts(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round(value)]));
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
