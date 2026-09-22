import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanDate(value) {
  return cleanText(value).slice(0, 10);
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function weekFromReservation(reservation) {
  return reservation.week || {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[String(reservation.sejour?.startDate || "").slice(0, 10)] || "";
}

function stayCodeFromName(value) {
  const key = normalizeKey(value);
  if (key.includes("surf") || key.includes("mcsc")) return "MCSC";
  if (key.includes("eaux") || key.includes("evcc")) return "EVCC";
  return "";
}

function isTotemiaSource(value) {
  return normalizeKey(value).includes("totemia");
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const result = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys
from datetime import datetime, date
sys.stdout.reconfigure(encoding="utf-8")
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb["Suivi inscris"]
rows = []
for row_idx in range(2, ws.max_row + 1):
    if not any(ws.cell(row_idx, col).value not in (None, "") for col in range(1, 35)):
        continue
    item = {"excelRow": row_idx}
    cols = {
        "source": 2, "childLastName": 3, "childFirstName": 4, "birthDate": 5,
        "reference": 16, "stayCode": 17, "week": 18,
    }
    for key, col in cols.items():
        value = ws.cell(row_idx, col).value
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        item[key] = value
    rows.append(item)
print(json.dumps(rows, ensure_ascii=False))
`, filePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) throw new Error(result.stderr || "Lecture Excel impossible");
  return JSON.parse(result.stdout)
    .map((row) => ({
      excelRow: Number(row.excelRow),
      source: cleanText(row.source),
      childFirstName: cleanText(row.childFirstName),
      childLastName: cleanText(row.childLastName),
      birthDate: cleanDate(row.birthDate),
      reference: cleanText(row.reference),
      stayCode: cleanText(row.stayCode).toUpperCase(),
      week: cleanText(row.week).toUpperCase(),
    }))
    .filter((row) => row.week === "S4" && (row.childFirstName || row.childLastName));
}

function buildIndexes(reservations) {
  const byReference = new Map();
  const byChildBirthStayWeek = new Map();
  const byChildStayWeek = new Map();
  const add = (map, key, reservation) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(reservation);
  };
  for (const reservation of reservations) {
    add(byReference, normalizeKey(reservation.numeroDeReservation), reservation);
    const week = weekFromReservation(reservation);
    const stay = stayCodeFromName(reservation.sejour?.name || reservation.sejourName);
    const children = reservation.minor?.children?.length ? reservation.minor.children : [{}];
    for (const child of children) {
      const childKey = childNameKey(child.firstName, child.lastName);
      const birthDate = cleanDate(child.birthDate);
      if (childKey && birthDate && stay && week) add(byChildBirthStayWeek, `${childKey}|${birthDate}|${stay}|${week}`, reservation);
      if (childKey && stay && week) add(byChildStayWeek, `${childKey}|${stay}|${week}`, reservation);
    }
  }
  return { byReference, byChildBirthStayWeek, byChildStayWeek };
}

function unique(values = []) {
  const rows = [...new Map(values.map((item) => [item.id, item])).values()];
  return rows.length === 1 ? rows[0] : null;
}

function findReservation(row, indexes) {
  if (row.reference) {
    const byRef = unique(indexes.byReference.get(normalizeKey(row.reference)) || []);
    if (byRef) return byRef;
  }
  const childKey = childNameKey(row.childFirstName, row.childLastName);
  if (childKey && row.birthDate && row.stayCode && row.week) {
    const byBirth = unique(indexes.byChildBirthStayWeek.get(`${childKey}|${row.birthDate}|${row.stayCode}|${row.week}`) || []);
    if (byBirth) return byBirth;
  }
  if (childKey && row.stayCode && row.week) {
    const byChild = unique(indexes.byChildStayWeek.get(`${childKey}|${row.stayCode}|${row.week}`) || []);
    if (byChild) return byChild;
  }
  return null;
}

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const workbookPath = process.argv.find((arg) => /\.xlsx$/i.test(arg))
  || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées (14).xlsx";
const sourceName = workbookPath.split(/[\\/]/).pop();

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const [reservationSnap, workbookRows] = await Promise.all([
  getDocs(collection(db, "reservations")),
  Promise.resolve(readWorkbook(workbookPath)),
]);
const reservations = reservationSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const indexes = buildIndexes(reservations);
const grouped = new Map();
const unmatched = [];

for (const row of workbookRows) {
  const reservation = findReservation(row, indexes);
  if (!reservation) {
    unmatched.push(row);
    continue;
  }
  if (!grouped.has(reservation.id)) grouped.set(reservation.id, { reservation, rows: [] });
  grouped.get(reservation.id).rows.push(row);
}

const updates = [...grouped.values()].map(({ reservation, rows }) => {
  const sources = [...new Set(rows.map((row) => row.source).filter(Boolean))];
  const source = sources.join(" / ");
  const isTotemia = sources.some(isTotemiaSource);
  const previousEntries = reservation.importedRegistration?.entries || [];
  const previousByRow = new Map(previousEntries.map((entry) => [Number(entry.excelRow), entry]));
  const entries = rows.map((row) => ({
    ...(previousByRow.get(row.excelRow) || {}),
    excelRow: row.excelRow,
    source: row.source,
    reference: row.reference,
    childFirstName: row.childFirstName,
    childLastName: row.childLastName,
  }));
  return {
    id: reservation.id,
    ref: reservation.numeroDeReservation || "",
    children: rows.map((row) => `${row.childFirstName} ${row.childLastName}`.trim()),
    source,
    isTotemia,
    patch: {
      registrationSource: source,
      registrationSourceIsTotemia: isTotemia,
      convocationSentChannel: isTotemia ? "totemia" : "",
      importedRegistration: {
        ...(reservation.importedRegistration || {}),
        source: reservation.importedRegistration?.source || sourceName,
        entries,
      },
      updatedAt: serverTimestamp(),
    },
  };
});

if (shouldApply) {
  for (const update of updates) {
    await updateDoc(doc(db, "reservations", update.id), update.patch);
  }
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  source: sourceName,
  excelRows: workbookRows.length,
  matchedReservations: updates.length,
  totemiaReservations: updates.filter((update) => update.isTotemia).length,
  nonTotemiaReservations: updates.filter((update) => !update.isTotemia).length,
  updates: updates.map(({ patch, ...update }) => update),
  unmatched: unmatched.map((row) => ({ excelRow: row.excelRow, child: `${row.childFirstName} ${row.childLastName}`.trim(), source: row.source })),
}, null, 2));
