import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

loadEnv(".env.local");

const workbookPath = "C:\\Users\\dreye\\Downloads\\ETE 26 - Inscriptions validées (16).xlsx";
const sourceName = "ETE 26 - Inscriptions validées (16).xlsx";
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
const rows = readWorkbook(workbookPath).filter((row) => row.week === "S4");
const wantedRows = rows.filter((row) =>
  ["lilamimoune", "haronetemine"].includes(childNameKey(row.childFirstName, row.childLastName))
);
const yahiaRow = rows.find((row) => childNameKey(row.childFirstName, row.childLastName) === "yahiameroual");

if (wantedRows.length !== 2) {
  throw new Error(`Lila/Harone introuvables dans l'Excel: ${wantedRows.map((row) => `${row.childFirstName} ${row.childLastName}`).join(", ")}`);
}

const [reservationSnap, transportSnap] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);
const reservations = reservationSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

const created = [];
const reused = [];
const targetReservations = [];

for (const row of wantedRows) {
  const existing = reservations.find((reservation) =>
    isS4(reservation) && (reservation.minor?.children || []).some((child) =>
      childNameKey(child.firstName, child.lastName) === childNameKey(row.childFirstName, row.childLastName)
        && cleanDate(child.birthDate) === row.birthDate
    )
  );
  if (existing) {
    reused.push({ id: existing.id, child: `${row.childFirstName} ${row.childLastName}` });
    targetReservations.push(existing);
    continue;
  }
  const payload = buildCreate(row);
  if (shouldApply) {
    const ref = await addDoc(collection(db, "reservations"), payload);
    targetReservations.push({ id: ref.id, ...payload });
    created.push({ id: ref.id, reference: payload.numeroDeReservation, child: `${row.childFirstName} ${row.childLastName}` });
  } else {
    created.push({ id: "(dry-run)", reference: payload.numeroDeReservation, child: `${row.childFirstName} ${row.childLastName}` });
  }
}

const meroual = reservations.find((reservation) => reservation.numeroDeReservation === "MCSC-S4-MEROUAL");
if (meroual && yahiaRow && shouldApply) {
  const children = (meroual.minor?.children || []).map((child) => {
    if (childNameKey(child.firstName, child.lastName) !== "yahyameroual") return child;
    return { ...child, firstName: "Yahia", lastName: "MEROUAL", birthDate: yahiaRow.birthDate };
  });
  await updateDoc(doc(db, "reservations", meroual.id), {
    "minor.children": children,
    "minor.numberOfChildren": String(children.length),
    "transport.departureCity": "Libourne",
    "transport.returnCity": "Saint-Pierre-des-Corps",
    updatedAt: serverTimestamp(),
  });
}

const targetIds = targetReservations.map((reservation) => reservation.id);
const updatedTransports = [];
const parisAllerId = "a3nfZsgZQRhGxPEFvmAn";
const parisRetourId = "SN9Uc6i88JNkkScxLzcE";

for (const transport of transports.filter((item) => [parisAllerId, parisRetourId].includes(item.id))) {
  const direction = transport.direction;
  const segmentId = direction === "aller" ? "s4-aller-paris-dax-rc9h849i" : "s4-retour-dax-paris";
  const passengerTemplate = direction === "aller"
    ? { departureCity: "Paris", pickupCity: "Paris", dropoffCity: "Dax", returnCity: "Paris" }
    : { departureCity: "Paris", pickupCity: "Dax", dropoffCity: "Paris", returnCity: "Paris" };

  const passengers = [...(transport.passengers || [])];
  for (const reservation of targetReservations) {
    if (!passengers.some((passenger) => passenger.reservationId === reservation.id)) {
      passengers.push({ reservationId: reservation.id, ...passengerTemplate });
    }
  }

  const segments = (transport.segments || []).map((segment) => {
    if (segment.id !== segmentId) return segment;
    const ids = [...new Set([...(segment.passengerReservationIds || []), ...targetIds])];
    return {
      ...segment,
      passengerReservationIds: ids,
      sharedPickupChildren: sumChildren(ids, reservations, targetReservations),
    };
  });

  if (shouldApply) {
    await updateDoc(doc(db, "transports", transport.id), {
      passengers,
      segments,
      updatedAt: serverTimestamp(),
    });
  }
  updatedTransports.push({
    id: transport.id,
    direction,
    segmentId,
    addedReservationIds: targetIds,
    nextPassengerCount: passengers.length,
  });
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  created,
  reused,
  meroualUpdated: Boolean(meroual && yahiaRow),
  updatedTransports,
}, null, 2));

process.exit(0);

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const result = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys
from datetime import datetime, date
sys.stdout.reconfigure(encoding="utf-8")
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb["Suivi inscris"]
cols = {
  "source": 2, "childLastName": 3, "childFirstName": 4, "birthDate": 5, "gender": 7,
  "responsibleLastName": 8, "responsibleFirstName": 9, "relation": 10, "phone": 11,
  "email": 12, "address": 13, "cafNumber": 14, "qf": 15, "reference": 16,
  "stayCode": 17, "week": 18, "departureCity": 19, "returnCity": 20,
  "grossAmount": 22, "netAmount": 23, "stayAmount": 24, "transportAmount": 25,
  "cafAidAmount": 26, "paidAmount": 33, "notes": 34,
}
rows = []
for row_idx in range(2, ws.max_row + 1):
    item = {"excelRow": row_idx}
    for key, col in cols.items():
        value = ws.cell(row_idx, col).value
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        item[key] = value
    rows.append(item)
print(json.dumps(rows, ensure_ascii=False))
`, filePath], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (result.status !== 0) throw new Error(result.stderr || "Lecture Excel impossible");
  return JSON.parse(result.stdout).map(normalizeWorkbookRow).filter((row) => row.childFirstName || row.childLastName);
}

function normalizeWorkbookRow(row) {
  const stayCode = cleanText(row.stayCode).toUpperCase();
  const week = cleanText(row.week).toUpperCase();
  return {
    excelRow: Number(row.excelRow),
    source: cleanText(row.source),
    childLastName: cleanText(row.childLastName),
    childFirstName: cleanText(row.childFirstName),
    birthDate: cleanDate(row.birthDate),
    gender: cleanText(row.gender),
    responsibleLastName: cleanText(row.responsibleLastName),
    responsibleFirstName: cleanText(row.responsibleFirstName),
    relation: cleanText(row.relation),
    phone: formatPhone(row.phone),
    email: cleanEmail(row.email),
    address: cleanText(row.address),
    cafNumber: cleanText(row.cafNumber),
    qf: amountOrNull(row.qf),
    reference: cleanText(row.reference),
    stayCode,
    stayName: stayCode === "MCSC" ? "my-creative-surf-camp" : stayCode,
    week,
    startDate: "2026-08-17",
    endDate: "2026-08-28",
    departureCity: normalizeCityLabel(row.departureCity),
    returnCity: normalizeCityLabel(row.returnCity),
    grossAmount: amount(row.grossAmount),
    netAmount: amount(row.netAmount),
    stayAmount: amount(row.stayAmount),
    transportAmount: amount(row.transportAmount),
    cafAidAmount: amount(row.cafAidAmount),
    paidAmount: amount(row.paidAmount),
    notes: cleanText(row.notes),
  };
}

function buildCreate(row) {
  const reference = row.reference || makeImportedReference(row);
  const finance = {
    ...summarizeEntries([row]),
    source: sourceName,
    entries: [financeEntry({ ...row, reference }, "created_from_workbook")],
  };
  const paymentStatus = finance.remainingAmount <= 0 ? "paid" : finance.paidAmount > 0 ? "in_progress" : "not_paid";
  return {
    numeroDeReservation: reference,
    status: "validated",
    validationSource: "ete26_validated_workbook_s4",
    validationWorkbook: sourceName,
    importedOnly: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    validatedAt: serverTimestamp(),
    finance,
    legal: {
      firstName: row.responsibleFirstName,
      lastName: row.responsibleLastName,
      email: row.email,
      phone: row.phone,
      relation: row.relation,
      address: row.address,
      cafOrSecu: row.cafNumber,
      qf: row.qf,
    },
    minor: {
      numberOfChildren: "1",
      children: [{ firstName: row.childFirstName, lastName: row.childLastName, birthDate: row.birthDate, gender: row.gender }],
    },
    sejour: {
      name: row.stayName,
      startDate: `${row.startDate}T00:00:00.000Z`,
      endDate: `${row.endDate}T00:00:00.000Z`,
      ageGroup: "",
    },
    transport: { departureCity: row.departureCity, returnCity: row.returnCity, fee: finance.transportAmount },
    payment: {
      totalPrice: finance.grossAmount,
      validatedPrice: finance.grossAmount,
      priceStatus: "validated",
      transportFee: finance.transportAmount,
      cafAmount: finance.cafAidAmount,
      cafEligible: finance.cafAidAmount > 0,
      resteACharge: finance.netAmount,
      alreadyPaid: finance.paidAmount,
      remainingValue: finance.remainingAmount,
      paymentStatus,
    },
    registrationSource: row.source,
    registrationSourceIsTotemia: isTotemiaSource(row.source),
    convocationSentChannel: isTotemiaSource(row.source) ? "totemia" : "",
    importedRegistration: {
      source: sourceName,
      entries: [{ excelRow: row.excelRow, source: row.source, reference, childFirstName: row.childFirstName, childLastName: row.childLastName, matchMethod: "created_from_workbook" }],
    },
    notes: row.notes,
  };
}

function financeEntry(row, matchMethod) {
  return {
    excelRow: row.excelRow,
    source: row.source,
    childFirstName: row.childFirstName,
    childLastName: row.childLastName,
    birthDate: row.birthDate,
    reference: row.reference,
    stayCode: row.stayCode,
    week: row.week,
    departureCity: row.departureCity,
    returnCity: row.returnCity,
    grossAmount: row.grossAmount,
    netAmount: row.netAmount,
    stayAmount: row.stayAmount,
    transportAmount: row.transportAmount,
    cafAidAmount: row.cafAidAmount,
    paidAmount: row.paidAmount,
    matchMethod,
  };
}

function summarizeEntries(entries) {
  const totals = entries.reduce((result, entry) => {
    result.stayAmount += amount(entry.stayAmount);
    result.transportAmount += amount(entry.transportAmount);
    result.grossAmount += amount(entry.grossAmount);
    result.cafAidAmount += amount(entry.cafAidAmount);
    result.netAmount += amount(entry.netAmount);
    result.paidAmount += amount(entry.paidAmount);
    return result;
  }, { stayAmount: 0, transportAmount: 0, grossAmount: 0, cafAidAmount: 0, netAmount: 0, paidAmount: 0 });
  return { ...roundAmounts(totals), remainingAmount: round(Math.max(totals.netAmount - totals.paidAmount, 0)) };
}

function sumChildren(ids, existingReservations, newReservations) {
  const map = new Map([...existingReservations, ...newReservations].map((reservation) => [reservation.id, reservation]));
  return ids.reduce((sum, id) => {
    const children = map.get(id)?.minor?.children;
    return sum + (Array.isArray(children) ? children.length : 1);
  }, 0);
}

function isS4(reservation) {
  return String(reservation.sejour?.startDate || "").startsWith("2026-08-17");
}

function normalizeCityLabel(value) {
  const text = cleanText(value);
  if (!text) return "";
  const map = { surplace: "Sur Place", paris: "Paris", lyon: "Lyon", marseille: "Marseille", bordeaux: "Bordeaux", toulouse: "Toulouse", valence: "Valence" };
  return map[normalizeKey(text)] || text;
}

function isTotemiaSource(value) {
  return normalizeKey(value).includes("totemia");
}

function makeImportedReference(row) {
  const letters = normalizeKey(row.childLastName || row.childFirstName || "ETE").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${row.stayCode || "ETE"}-${row.week || "SX"}-${String(row.excelRow).padStart(3, "0")}-${letters}`;
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanDate(value) {
  return cleanText(value).slice(0, 10);
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : "";
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function cleanText(value) {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function amountOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function amount(value) {
  return amountOrNull(value) ?? 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundAmounts(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round(value)]));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
