import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

loadEnv(".env.local");

const workbookPath = "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées (13).xlsx";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const excelRows = readWorkbook(workbookPath).filter((row) => row.week === "S3");
const reservationSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const index = buildIndex(reservations);

const matched = [];
const unmatched = [];
for (const row of excelRows) {
  const reservation = findReservation(row, index);
  if (reservation) matched.push({ row, reservation });
  else unmatched.push(row);
}

const contactDiffs = matched
  .map(({ row, reservation }) => {
    const currentEmail = cleanEmail(reservation.legal?.email || reservation.email || "");
    const currentPhone = phoneKey(reservation.legal?.phone || reservation.phone || "");
    return {
      id: reservation.id,
      child: childrenLabel(reservation) || `${row.firstName} ${row.lastName}`.trim(),
      excelRow: row.excelRow,
      excelEmail: row.email,
      currentEmail,
      excelPhone: row.phone,
      currentPhone,
      emailMissing: Boolean(row.email && !currentEmail),
      emailDifferent: Boolean(row.email && currentEmail && row.email !== currentEmail),
      phoneMissing: Boolean(row.phone && !currentPhone),
      phoneDifferent: Boolean(row.phone && currentPhone && row.phone !== currentPhone),
      excelAller: row.departureCity,
      currentAller: reservation.transport?.departureCity || reservation.departureCity || "",
      excelRetour: row.returnCity,
      currentRetour: reservation.transport?.returnCity || reservation.returnCity || "",
    };
  })
  .filter((item) => item.emailMissing || item.emailDifferent || item.phoneMissing || item.phoneDifferent);

const cityDiffs = matched
  .map(({ row, reservation }) => ({
    id: reservation.id,
    child: childrenLabel(reservation) || `${row.firstName} ${row.lastName}`.trim(),
    excelRow: row.excelRow,
    excelAller: row.departureCity,
    currentAller: reservation.transport?.departureCity || reservation.departureCity || "",
    excelRetour: row.returnCity,
    currentRetour: reservation.transport?.returnCity || reservation.returnCity || "",
  }))
  .filter((item) =>
    normalizeCity(item.excelAller) !== normalizeCity(item.currentAller)
    || normalizeCity(item.excelRetour) !== normalizeCity(item.currentRetour)
  );

const validS3Firestore = reservations
  .filter((reservation) => weekFromReservation(reservation) === "S3")
  .filter((reservation) => normalizeKey(reservation.status) === "validated");
const matchedIds = new Set(matched.map((item) => item.reservation.id));
const firestoreOnly = validS3Firestore
  .filter((reservation) => !matchedIds.has(reservation.id))
  .map((reservation) => ({
    id: reservation.id,
    child: childrenLabel(reservation),
    stay: stayCode(reservation.sejour?.name || reservation.sejourName),
    aller: reservation.transport?.departureCity || "",
    retour: reservation.transport?.returnCity || "",
  }));

console.log(JSON.stringify({
  excelS3Children: excelRows.length,
  matchedChildren: matched.length,
  unmatchedExcel: unmatched.map((row) => ({
    excelRow: row.excelRow,
    child: `${row.firstName} ${row.lastName}`.trim(),
    stay: row.stay,
    aller: row.departureCity,
    retour: row.returnCity,
    email: row.email,
    phone: row.phone,
  })),
  firestoreOnly,
  contactDiffs,
  cityDiffs,
}, null, 2));

process.exit(0);

function readWorkbook(filePath) {
  const result = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys, unicodedata
from datetime import date, datetime
sys.stdout.reconfigure(encoding="utf-8")
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb["Suivi inscris"]
def norm(v):
    text = str(v or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    return "".join(ch if ch.isalnum() else "_" for ch in text).strip("_")
def clean(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v
headers = [norm(ws.cell(1, col).value or f"col{col}") for col in range(1, ws.max_column + 1)]
rows = []
for row_idx in range(2, ws.max_row + 1):
    item = {"excelRow": row_idx}
    empty = True
    for col, key in enumerate(headers, 1):
        value = clean(ws.cell(row_idx, col).value)
        if value not in (None, ""):
            empty = False
        item[key] = value
    if not empty:
        rows.append(item)
print(json.dumps(rows, ensure_ascii=False))
`, filePath], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (result.status !== 0) throw new Error(result.stderr || "Lecture Excel impossible");
  return JSON.parse(result.stdout).map((row) => ({
    excelRow: Number(row.excelRow),
    lastName: cleanText(row.nom_enfant),
    firstName: cleanText(row.prenom_enfant),
    birthDate: cleanDate(row.date_de_naissance),
    stay: cleanText(row.sejour).toUpperCase(),
    week: cleanText(row.date_sejour).toUpperCase(),
    email: cleanEmail(row.mail),
    phone: formatPhone(row.tel),
    departureCity: normalizeCityLabel(row.transport_aller),
    returnCity: normalizeCityLabel(row.transport_retour),
  })).filter((row) => row.firstName || row.lastName);
}

function buildIndex(reservations) {
  const map = new Map();
  for (const reservation of reservations) {
    const week = weekFromReservation(reservation);
    const stay = stayCode(reservation.sejour?.name || reservation.sejourName);
    for (const child of reservation.minor?.children || reservation.children || []) {
      const names = [
        childNameKey(child.firstName, child.lastName),
        childNameKey(child.lastName, child.firstName),
      ];
      for (const name of names) {
        add(map, `${name}|${cleanDate(child.birthDate)}|${stay}|${week}`, reservation);
        add(map, `${name}||${stay}|${week}`, reservation);
      }
    }
  }
  return map;
}

function findReservation(row, index) {
  const keys = [
    `${childNameKey(row.firstName, row.lastName)}|${row.birthDate}|${row.stay}|${row.week}`,
    `${childNameKey(row.lastName, row.firstName)}|${row.birthDate}|${row.stay}|${row.week}`,
    `${childNameKey(row.firstName, row.lastName)}||${row.stay}|${row.week}`,
    `${childNameKey(row.lastName, row.firstName)}||${row.stay}|${row.week}`,
  ];
  for (const key of keys) {
    const matches = [...new Set(index.get(key) || [])];
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function add(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""}${lastName || ""}`);
}

function childrenLabel(reservation) {
  return (reservation.minor?.children || reservation.children || [])
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function weekFromReservation(reservation) {
  const start = String(reservation.sejour?.startDate || reservation.startDate || "").slice(0, 10);
  return reservation.week || reservation.sejour?.week || {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[start] || "";
}

function stayCode(value) {
  const key = normalizeKey(value);
  if (key.includes("eauxvives") || key.includes("evcc")) return "EVCC";
  if (key.includes("surf") || key.includes("creative") || key.includes("mcsc")) return "MCSC";
  return String(value || "").trim().toUpperCase();
}

function normalizeCityLabel(value) {
  const key = normalizeKey(value);
  if (!key) return "";
  const labels = {
    surplace: "Sur Place",
    bordeaux: "Bordeaux",
    paris: "Paris",
    lille: "Lille",
    nantes: "Nantes",
    lyon: "Lyon",
    valence: "Valence",
    montpellier: "Montpellier",
    beziers: "Béziers",
    beziers: "Béziers",
    bezier: "Béziers",
    toulouse: "Toulouse",
    marseille: "Marseille",
    carcassonne: "Carcassonne",
    carcassone: "Carcassonne",
  };
  return labels[key] || cleanText(value);
}

function normalizeCity(value) {
  return normalizeKey(normalizeCityLabel(value));
}

function formatPhone(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const digits = text.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `0${digits}`;
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function phoneKey(value) {
  return formatPhone(value);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanDate(value) {
  return String(value || "").slice(0, 10);
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
