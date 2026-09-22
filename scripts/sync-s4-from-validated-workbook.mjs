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

const shouldApply = process.argv.includes("--apply");
const workbookPath = process.argv.find((arg) => /\.xlsx$/i.test(arg))
  || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées (14).xlsx";
const SOURCE_NAME = workbookPath.split(/[\\/]/).pop();

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

const workbookRows = readWorkbook(workbookPath).filter((row) => row.week === "S4");
const reservationsSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const indexes = buildIndexes(reservations);

const grouped = new Map();
const unmatched = [];
const ambiguous = [];

for (const row of workbookRows) {
  const match = findReservation(row, indexes);
  if (match.status === "missing") {
    unmatched.push({ reason: match.reason, row });
    continue;
  }
  if (match.status === "ambiguous") {
    ambiguous.push({ reason: match.reason, ids: match.ids, row });
    continue;
  }
  if (!grouped.has(match.reservation.id)) grouped.set(match.reservation.id, { reservation: match.reservation, rows: [] });
  grouped.get(match.reservation.id).rows.push({ ...row, matchMethod: match.method });
}

const updates = [...grouped.values()].map(({ reservation, rows }) => buildUpdate(reservation, rows));
const creates = unmatched.map((item) => buildCreate(item.row));
const currentS4Active = reservations
  .filter((reservation) => weekFromReservation(reservation) === "S4")
  .filter((reservation) => !isDeletedStatus(reservation.status));
const matchedIds = new Set(updates.map((item) => item.id));
const firestoreOnly = currentS4Active.filter((reservation) => !matchedIds.has(reservation.id)).map(compactReservation);
const diffs = updates.filter((item) => Object.keys(item.changedFields).length > 0);

if (shouldApply) {
  for (const update of updates) {
    if (!Object.keys(update.patch).length) continue;
    await updateDoc(doc(db, "reservations", update.id), {
      ...update.patch,
      updatedAt: serverTimestamp(),
      excelSync: {
        source: SOURCE_NAME,
        syncedAt: serverTimestamp(),
        rows: update.rows.map((row) => ({
          excelRow: row.excelRow,
          source: row.source,
          reference: row.reference,
          childFirstName: row.childFirstName,
          childLastName: row.childLastName,
          matchMethod: row.matchMethod,
        })),
      },
    });
  }
  for (const create of creates) {
    await addDoc(collection(db, "reservations"), create.doc);
  }
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  source: SOURCE_NAME,
  excelS4Rows: workbookRows.length,
  excelByDeparture: countBy(workbookRows, (row) => row.departureCity || "?"),
  excelByReturn: countBy(workbookRows, (row) => row.returnCity || "?"),
  matchedReservations: updates.length,
  matchedChildren: updates.reduce((sum, item) => sum + item.rows.length, 0),
  updatedReservations: shouldApply ? diffs.length : 0,
  createdReservations: shouldApply ? creates.length : 0,
  dryRunCreates: creates.map((item) => ({
    reference: item.reference,
    child: item.child,
    transport: item.transport,
    finance: item.finance,
  })),
  dryRunDiffs: diffs.map(({ patch, ...item }) => item),
  unmatchedExcel: unmatched.map((item) => ({ reason: item.reason, ...compactRow(item.row) })),
  ambiguousExcel: ambiguous.map((item) => ({ reason: item.reason, ids: item.ids, ...compactRow(item.row) })),
  firestoreOnlyS4Active: firestoreOnly,
}, null, 2));

process.exit(0);

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const result = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys
from datetime import datetime, date
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["Suivi inscris"]
rows = []
for row_idx in range(2, ws.max_row + 1):
    if not any(ws.cell(row_idx, col).value not in (None, "") for col in range(1, 35)):
        continue
    item = {"excelRow": row_idx}
    cols = {
        "source": 2, "childLastName": 3, "childFirstName": 4, "birthDate": 5, "gender": 7,
        "responsibleLastName": 8, "responsibleFirstName": 9, "relation": 10, "phone": 11,
        "email": 12, "address": 13, "cafNumber": 14, "qf": 15, "reference": 16,
        "stayCode": 17, "week": 18, "departureCity": 19, "returnCity": 20,
        "insuranceOpted": 21, "grossAmount": 22, "netAmount": 23, "stayAmount": 24,
        "transportAmount": 25, "cafAidAmount": 26, "invoiceIssued": 27,
        "registrationFileStatus": 28, "vaccinesStatus": 29, "transportConvocationStatus": 32,
        "paidAmount": 33, "notes": 34,
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
    stayName: stayCode === "MCSC" ? "my-creative-surf-camp" : stayCode === "EVCC" ? "eaux-vives-creative-camp" : stayCode,
    week,
    startDate: weekDates(week).startDate,
    endDate: weekDates(week).endDate,
    departureCity: normalizeCityLabel(row.departureCity),
    returnCity: normalizeCityLabel(row.returnCity),
    insuranceOpted: Boolean(row.insuranceOpted),
    grossAmount: amount(row.grossAmount),
    netAmount: amount(row.netAmount),
    stayAmount: amount(row.stayAmount),
    transportAmount: amount(row.transportAmount),
    cafAidAmount: amount(row.cafAidAmount),
    paidAmount: amount(row.paidAmount),
    invoiceIssued: Boolean(row.invoiceIssued),
    registrationFileStatus: cleanText(row.registrationFileStatus),
    vaccinesStatus: cleanText(row.vaccinesStatus),
    transportConvocationStatus: cleanText(row.transportConvocationStatus),
    notes: cleanText(row.notes),
  };
}

function buildIndexes(reservations) {
  const byReference = new Map();
  const byEmailChild = new Map();
  const byChildBirthStayWeek = new Map();
  const byChildStayWeek = new Map();
  for (const reservation of reservations) {
    const ref = normalizeKey(reservation.numeroDeReservation);
    if (ref) addIndex(byReference, ref, reservation);
    const email = cleanEmail(reservation.legal?.email || reservation.email);
    const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
    const week = weekFromReservation(reservation);
    const stayName = stayCodeFromName(reservation.sejour?.name || reservation.sejourName);
    for (const child of children.length ? children : [{}]) {
      const childKey = childNameKey(child.firstName, child.lastName);
      const birthDate = cleanDate(child.birthDate);
      if (email && childKey) addIndex(byEmailChild, `${email}|${childKey}`, reservation);
      if (childKey && birthDate && stayName && week) {
        addIndex(byChildBirthStayWeek, `${childKey}|${birthDate}|${stayName}|${week}`, reservation);
      }
      if (childKey && stayName && week) addIndex(byChildStayWeek, `${childKey}|${stayName}|${week}`, reservation);
    }
  }
  return { byReference, byEmailChild, byChildBirthStayWeek, byChildStayWeek };
}

function findReservation(row, indexes) {
  if (row.reference) {
    const exact = unique(indexes.byReference.get(normalizeKey(row.reference)));
    if (exact.status === "one") return { status: "ok", method: "reference", reservation: exact.value };
    if (exact.status === "many") return { status: "ambiguous", reason: "reference", ids: exact.values.map((item) => item.id) };
  }
  const emailChildKey = row.email && childNameKey(row.childFirstName, row.childLastName)
    ? `${row.email}|${childNameKey(row.childFirstName, row.childLastName)}`
    : "";
  if (emailChildKey) {
    const byEmail = unique(indexes.byEmailChild.get(emailChildKey));
    if (byEmail.status === "one") return { status: "ok", method: "email_child", reservation: byEmail.value };
    if (byEmail.status === "many") return { status: "ambiguous", reason: "email_child", ids: byEmail.values.map((item) => item.id) };
  }
  const birthKey = childNameKey(row.childFirstName, row.childLastName) && row.birthDate && row.stayCode && row.week
    ? `${childNameKey(row.childFirstName, row.childLastName)}|${row.birthDate}|${row.stayCode}|${row.week}`
    : "";
  if (birthKey) {
    const byBirth = unique(indexes.byChildBirthStayWeek.get(birthKey));
    if (byBirth.status === "one") return { status: "ok", method: "child_birth_stay_week", reservation: byBirth.value };
    if (byBirth.status === "many") return { status: "ambiguous", reason: "child_birth_stay_week", ids: byBirth.values.map((item) => item.id) };
  }
  const childStayWeekKey = childNameKey(row.childFirstName, row.childLastName) && row.stayCode && row.week
    ? `${childNameKey(row.childFirstName, row.childLastName)}|${row.stayCode}|${row.week}`
    : "";
  if (childStayWeekKey) {
    const byChildStayWeek = unique(indexes.byChildStayWeek.get(childStayWeekKey));
    if (byChildStayWeek.status === "one") return { status: "ok", method: "child_stay_week", reservation: byChildStayWeek.value };
    if (byChildStayWeek.status === "many") return { status: "ambiguous", reason: "child_stay_week", ids: byChildStayWeek.values.map((item) => item.id) };
  }
  return { status: "missing", reason: row.reference ? "reference_not_found" : "no_unique_fallback" };
}

function buildUpdate(reservation, rows) {
  const finance = {
    ...summarizeEntries(rows),
    source: SOURCE_NAME,
    entries: rows.map((row) => financeEntry(row, row.matchMethod)),
  };
  const first = rows[0];
  const children = mergeChildren(reservation.minor?.children || [], rows);
  const expected = {
    status: "validated",
    validationSource: "ete26_validated_workbook_s4",
    validationWorkbook: SOURCE_NAME,
    finance,
    "minor.numberOfChildren": String(children.length),
    "minor.children": children,
    "sejour.name": first.stayName,
    "sejour.startDate": `${first.startDate}T00:00:00.000Z`,
    "sejour.endDate": `${first.endDate}T00:00:00.000Z`,
    "transport.departureCity": first.departureCity,
    "transport.returnCity": first.returnCity,
    "transport.fee": finance.transportAmount,
    "payment.totalPrice": finance.grossAmount,
    "payment.validatedPrice": finance.grossAmount,
    "payment.priceStatus": "validated",
    "payment.transportFee": finance.transportAmount,
    "payment.cafAmount": finance.cafAidAmount,
    "payment.cafEligible": finance.cafAidAmount > 0,
    "payment.resteACharge": finance.netAmount,
    "payment.alreadyPaid": finance.paidAmount,
    "payment.remainingValue": finance.remainingAmount,
    "payment.paymentStatus": finance.remainingAmount <= 0 ? "paid" : finance.paidAmount > 0 ? "in_progress" : "not_paid",
    registrationSource: sourceSummary(rows),
    registrationSourceIsTotemia: rows.some((row) => isTotemiaSource(row.source)),
    convocationSentChannel: rows.some((row) => isTotemiaSource(row.source)) ? "totemia" : "",
    importedRegistration: {
      source: SOURCE_NAME,
      entries: rows.map((row) => ({
        excelRow: row.excelRow,
        source: row.source,
        reference: row.reference,
        childFirstName: row.childFirstName,
        childLastName: row.childLastName,
        matchMethod: row.matchMethod,
      })),
    },
  };
  if (first.email) expected["legal.email"] = first.email;
  if (first.phone) expected["legal.phone"] = first.phone;
  if (first.cafNumber) expected["legal.cafOrSecu"] = first.cafNumber;
  if (first.qf !== null) expected["legal.qf"] = first.qf;

  const patch = {};
  const changedFields = {};
  for (const [path, value] of Object.entries(expected)) {
    const current = path.includes(".") ? getPath(reservation, path) : reservation[path];
    if (!sameValue(current, value)) {
      patch[path] = value;
      changedFields[path] = { from: printable(current), to: printable(value) };
    }
  }
  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || first.reference || "",
    child: children.map((child) => `${child.firstName} ${child.lastName}`.trim()).join(", "),
    rows,
    changedFields,
    patch,
  };
}

function buildCreate(row) {
  const reference = row.reference || makeImportedReference(row);
  const finance = {
    ...summarizeEntries([row]),
    source: SOURCE_NAME,
    entries: [financeEntry({ ...row, reference }, "created_from_workbook")],
  };
  const paymentStatus = finance.remainingAmount <= 0 ? "paid" : finance.paidAmount > 0 ? "in_progress" : "not_paid";
  const docData = {
    numeroDeReservation: reference,
    status: "validated",
    validationSource: "ete26_validated_workbook_s4",
    validationWorkbook: SOURCE_NAME,
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
      source: SOURCE_NAME,
      entries: [{ excelRow: row.excelRow, source: row.source, reference, childFirstName: row.childFirstName, childLastName: row.childLastName, matchMethod: "created_from_workbook" }],
    },
    notes: row.notes,
  };
  return {
    reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    finance,
    transport: { departureCity: row.departureCity, returnCity: row.returnCity, fee: finance.transportAmount },
    doc: docData,
  };
}

function mergeChildren(existingChildren, rows) {
  const used = new Set();
  return rows.map((row) => {
    const rowName = childNameKey(row.childFirstName, row.childLastName);
    const rowBirth = cleanDate(row.birthDate);
    let bestIndex = -1;
    for (let index = 0; index < existingChildren.length; index += 1) {
      if (used.has(index)) continue;
      const child = existingChildren[index] || {};
      const sameName = childNameKey(child.firstName, child.lastName) === rowName;
      const sameBirth = rowBirth && cleanDate(child.birthDate) === rowBirth;
      if (sameName || sameBirth) {
        bestIndex = index;
        break;
      }
    }
    const base = bestIndex >= 0 ? { ...(existingChildren[bestIndex] || {}) } : {};
    if (bestIndex >= 0) used.add(bestIndex);
    return {
      ...base,
      firstName: row.childFirstName,
      lastName: row.childLastName,
      birthDate: row.birthDate,
      ...(row.gender ? { gender: row.gender } : {}),
    };
  });
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

function compactRow(row) {
  return {
    excelRow: row.excelRow,
    reference: row.reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    stay: row.stayCode,
    week: row.week,
    transport: `${row.departureCity || "-"} / ${row.returnCity || "-"}`,
    grossAmount: row.grossAmount,
    transportAmount: row.transportAmount,
  };
}

function compactReservation(reservation) {
  const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || "",
    status: reservation.status || "",
    children: children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).join(", "),
    transport: `${reservation.transport?.departureCity || "-"} / ${reservation.transport?.returnCity || "-"}`,
  };
}

function addIndex(map, key, reservation) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(reservation);
}

function unique(values = []) {
  const uniqueValues = [...new Map(values.map((item) => [item.id, item])).values()];
  if (uniqueValues.length === 1) return { status: "one", value: uniqueValues[0] };
  if (uniqueValues.length > 1) return { status: "many", values: uniqueValues };
  return { status: "none" };
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isTotemiaSource(value) {
  return normalizeKey(value).includes("totemia");
}

function sourceSummary(rows) {
  return [...new Set(rows.map((row) => cleanText(row.source)).filter(Boolean))].join(" / ");
}

function normalizeCityLabel(value) {
  const text = cleanText(value);
  if (!text) return "";
  const key = normalizeKey(text);
  const map = {
    surplace: "Sur Place",
    paris: "Paris",
    lyon: "Lyon",
    marseille: "Marseille",
    montpellier: "Montpellier",
    bordeaux: "Bordeaux",
    toulouse: "Toulouse",
    nantes: "Nantes",
    valence: "Valence",
  };
  return map[key] || text;
}

function stayCodeFromName(value) {
  const raw = normalizeKey(value);
  if (raw.includes("surf") || raw.includes("mcsc")) return "MCSC";
  if (raw.includes("eaux") || raw.includes("evcc")) return "EVCC";
  return "";
}

function weekFromReservation(reservation) {
  return reservation.week || {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[String(reservation.sejour?.startDate || reservation.startDate || "").slice(0, 10)] || "";
}

function weekDates(week) {
  return {
    S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
  }[cleanText(week).toUpperCase()] || { startDate: "", endDate: "" };
}

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
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

function makeImportedReference(row) {
  const letters = normalizeKey(row.childLastName || row.childFirstName || "ETE").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${row.stayCode || "ETE"}-${row.week || "SX"}-${String(row.excelRow).padStart(3, "0")}-${letters}`;
}

function countBy(items, getter) {
  return items.reduce((result, item) => {
    const key = getter(item);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function getPath(obj, path) {
  return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function sameValue(a, b) {
  return JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b));
}

function normalizeComparable(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, normalizeComparable(val)]));
  }
  return value ?? "";
}

function printable(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  return value ?? "";
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
