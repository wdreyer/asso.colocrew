import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const workbookArg = process.argv.find((arg) => /\.xlsx$/i.test(arg));
const workbookPath = workbookArg || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées (2).xlsx";
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
const workbookRows = readWorkbook(workbookPath);
const reservationsSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const indexes = buildIndexes(reservations);
const grouped = new Map();
const unmatched = [];
const ambiguous = [];

for (const row of workbookRows) {
  const match = findReservation(row, indexes);
  if (match.status === "missing") {
    unmatched.push({ excelRow: row.excelRow, reason: match.reason, row });
    continue;
  }
  if (match.status === "ambiguous") {
    ambiguous.push({ excelRow: row.excelRow, reason: match.reason, ids: match.ids, row });
    continue;
  }
  if (!grouped.has(match.reservation.id)) grouped.set(match.reservation.id, { reservation: match.reservation, rows: [] });
  grouped.get(match.reservation.id).rows.push({ ...row, matchMethod: match.method });
}

const updates = [...grouped.values()].map(({ reservation, rows }) => buildUpdate(reservation, rows));
const creates = unmatched.map((item) => buildCreate(item.row));
const totals = summarizeFinance([...updates.map((item) => item.finance), ...creates.map((item) => item.finance)]);
const currentlyPending = updates.filter((item) => item.previousStatus === "pending").length;

if (shouldApply) {
  for (const update of updates) {
    await updateDoc(doc(db, "reservations", update.id), update.patch);
  }
  for (const create of creates) {
    await addDoc(collection(db, "reservations"), create.doc);
  }
  await setDoc(doc(db, "finance_summaries", "ete-2026"), {
    ...totals,
    familyAmount: totals.netAmount,
    familyRemainingAmount: totals.remainingAmount,
    source: SOURCE_NAME,
    updatedAt: serverTimestamp(),
    entries: updates.reduce((sum, item) => sum + item.rows.length, 0) + creates.length,
    reservations: updates.length + creates.length,
    provisionalGrossAmount: 0,
    provisionalStayAmount: 0,
    provisionalTransportAmount: 0,
    provisionalCafAidAmount: 0,
    provisionalFamilyAmount: 0,
    provisionalEntries: 0,
  }, { merge: true });
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  source: SOURCE_NAME,
  workbookRows: workbookRows.length,
  matchedReservations: updates.length,
  matchedRows: updates.reduce((sum, item) => sum + item.rows.length, 0),
  createdReservations: creates.length,
  currentlyPending,
  unmatchedCount: unmatched.length,
  ambiguousCount: ambiguous.length,
  matchMethods: updates.flatMap((item) => item.rows.map((row) => row.matchMethod)).reduce((acc, method) => {
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {}),
  totals,
  unmatched: unmatched.slice(0, 40).map((item) => ({ ...item, row: compactRow(item.row) })),
  ambiguous: ambiguous.slice(0, 20).map((item) => ({ ...item, row: compactRow(item.row) })),
  sampleCreates: creates.slice(0, 12).map((item) => ({
    reference: item.reference,
    child: item.child,
    finance: item.finance,
    transport: item.transport,
  })),
  sampleUpdates: updates.slice(0, 12).map(({ patch, rows, ...item }) => ({
    ...item,
    rows: rows.map(compactRow),
    patchPreview: previewPatch(patch),
  })),
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
headers = [str(ws.cell(1, col).value or "").strip() or f"col{col}" for col in range(1, ws.max_column + 1)]
rows = []
for row_idx in range(2, ws.max_row + 1):
    item = {"excelRow": row_idx}
    empty = True
    for col, header in enumerate(headers, start=1):
        value = ws.cell(row_idx, col).value
        if value not in (None, ""):
            empty = False
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        item[header] = value
    if not empty:
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
  const week = cleanText(row["date séjour"]);
  const stayCode = cleanText(row["séjour"]).toUpperCase();
  return {
    excelRow: Number(row.excelRow),
    source: cleanText(row.source),
    childLastName: cleanText(row["nom enfant"]),
    childFirstName: cleanText(row["prénom enfant"]),
    birthDate: cleanDate(row["date de naissance"]),
    gender: cleanText(row.sexe),
    responsibleLastName: cleanText(row["nom responsable"]),
    responsibleFirstName: cleanText(row["prénom responsable"]),
    relation: cleanText(row.Relation),
    phone: formatPhone(row["tél"]),
    email: cleanEmail(row.mail),
    address: cleanText(row.adresse),
    cafNumber: cleanText(row["n° caf"]),
    qf: amountOrNull(row.qf),
    reference: cleanText(row["n° dossier"]),
    stayCode,
    stayName: stayCode === "MCSC" ? "my-creative-surf-camp" : stayCode === "EVCC" ? "eaux-vives-creative-camp" : stayCode,
    week,
    startDate: weekDates(week).startDate,
    endDate: weekDates(week).endDate,
    departureCity: normalizeCityLabel(row["transport aller"]),
    returnCity: normalizeCityLabel(row["transport retour"]),
    insuranceOpted: Boolean(row.assurance),
    grossAmount: amount(row["Montant total"]),
    netAmount: amount(row["Total-CAF"]),
    stayAmount: amount(row["montant séjour"]),
    transportAmount: amount(row["montant transport"]),
    cafAidAmount: amount(row["aide caf"]),
    paidAmount: amount(row["montant réglé"]),
    invoiceIssued: Boolean(row.facture),
    registrationConfirmed: Boolean(row["conf inscri"]),
    registrationFileStatus: cleanText(row["dossier inscri"]),
    vaccinesStatus: cleanText(row.vaccins),
    transportConvocationStatus: cleanText(row["conv transport"]),
    notes: cleanText(row.infos),
  };
}

function buildIndexes(reservations) {
  const byReference = new Map();
  const byEmailChild = new Map();
  const byChildBirthStayWeek = new Map();
  const byImportRow = new Map();
  for (const reservation of reservations) {
    const importEntries = Array.isArray(reservation.importedRegistration?.entries)
      ? reservation.importedRegistration.entries
      : [];
    for (const entry of importEntries) {
      if (entry.excelRow && reservation.importedRegistration?.source) {
        addIndex(byImportRow, `${reservation.importedRegistration.source}|${entry.excelRow}`, reservation);
      }
    }
    const ref = normalizeKey(reservation.numeroDeReservation);
    if (ref) addIndex(byReference, ref, reservation);
    const email = cleanEmail(reservation.legal?.email || reservation.email);
    const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
    const week = weekFromStartDate(reservation.sejour?.startDate);
    const stayName = stayCodeFromName(reservation.sejour?.name || reservation.sejourName);
    for (const child of children.length ? children : [{}]) {
      const childKey = childNameKey(child.firstName, child.lastName);
      const birthDate = cleanDate(child.birthDate);
      if (email && childKey) addIndex(byEmailChild, `${email}|${childKey}`, reservation);
      if (childKey && birthDate && stayName && week) {
        addIndex(byChildBirthStayWeek, `${childKey}|${birthDate}|${stayName}|${week}`, reservation);
      }
    }
  }
  return { byReference, byEmailChild, byChildBirthStayWeek, byImportRow };
}

function findReservation(row, indexes) {
  const byImport = unique(indexes.byImportRow.get(`${SOURCE_NAME}|${row.excelRow}`));
  if (byImport.status === "one") return { status: "ok", method: "import_row", reservation: byImport.value };
  if (byImport.status === "many") return { status: "ambiguous", reason: "import_row", ids: byImport.values.map((item) => item.id) };

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
  const childBirthKey = childNameKey(row.childFirstName, row.childLastName) && row.birthDate && row.stayCode && row.week
    ? `${childNameKey(row.childFirstName, row.childLastName)}|${row.birthDate}|${row.stayCode}|${row.week}`
    : "";
  if (childBirthKey) {
    const byBirth = unique(indexes.byChildBirthStayWeek.get(childBirthKey));
    if (byBirth.status === "one") return { status: "ok", method: "child_birth_stay_week", reservation: byBirth.value };
    if (byBirth.status === "many") return { status: "ambiguous", reason: "child_birth_stay_week", ids: byBirth.values.map((item) => item.id) };
  }
  return { status: "missing", reason: row.reference ? "reference_not_found" : "no_unique_fallback" };
}

function buildUpdate(reservation, rows) {
  const financeEntries = rows.map((row) => ({
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
    invoiceIssued: row.invoiceIssued,
    registrationConfirmed: row.registrationConfirmed,
    matchMethod: row.matchMethod,
  }));
  const finance = {
    ...summarizeEntries(financeEntries),
    source: SOURCE_NAME,
    entries: financeEntries,
  };
  const first = rows[0];
  const normalizedStatus = normalizeStatus(reservation.status);
  const patch = {
    status: "validated",
    validationSource: "ete26_validated_workbook",
    validationWorkbook: SOURCE_NAME,
    validatedAt: reservation.validatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    finance,
    financeUpdatedAt: serverTimestamp(),
    importedRegistration: {
      source: SOURCE_NAME,
      entries: rows.map((row) => ({
        excelRow: row.excelRow,
        reference: row.reference,
        childFirstName: row.childFirstName,
        childLastName: row.childLastName,
        matchMethod: row.matchMethod,
      })),
    },
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
  };
  if (first.startDate) {
    patch["sejour.name"] = first.stayName;
    patch["sejour.startDate"] = `${first.startDate}T00:00:00.000Z`;
    patch["sejour.endDate"] = `${first.endDate}T00:00:00.000Z`;
  }
  if (first.email) patch["legal.email"] = first.email;
  if (first.phone) patch["legal.phone"] = first.phone;
  if (first.cafNumber) patch["legal.cafOrSecu"] = first.cafNumber;
  if (first.qf !== null) patch["legal.qf"] = first.qf;
  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || first.reference || "",
    previousStatus: normalizedStatus,
    nextStatus: "validated",
    responsible: `${reservation.legal?.firstName || ""} ${reservation.legal?.lastName || ""}`.trim(),
    rows,
    finance,
    patch,
  };
}

function buildCreate(row) {
  const reference = row.reference || makeImportedReference(row);
  const finance = {
    ...summarizeEntries([{
      excelRow: row.excelRow,
      source: row.source,
      childFirstName: row.childFirstName,
      childLastName: row.childLastName,
      birthDate: row.birthDate,
      reference,
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
      invoiceIssued: row.invoiceIssued,
      registrationConfirmed: row.registrationConfirmed,
      matchMethod: "created_from_workbook",
    }]),
    source: SOURCE_NAME,
    entries: [{
      excelRow: row.excelRow,
      source: row.source,
      childFirstName: row.childFirstName,
      childLastName: row.childLastName,
      birthDate: row.birthDate,
      reference,
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
      invoiceIssued: row.invoiceIssued,
      registrationConfirmed: row.registrationConfirmed,
      matchMethod: "created_from_workbook",
    }],
  };
  const paymentStatus = finance.remainingAmount <= 0 ? "paid" : finance.paidAmount > 0 ? "in_progress" : "not_paid";
  const docData = {
    numeroDeReservation: reference,
    status: "validated",
    validationSource: "ete26_validated_workbook",
    validationWorkbook: SOURCE_NAME,
    importedOnly: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    validatedAt: serverTimestamp(),
    finance,
    financeUpdatedAt: serverTimestamp(),
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
      children: [{
        firstName: row.childFirstName,
        lastName: row.childLastName,
        birthDate: row.birthDate,
        gender: row.gender,
      }],
    },
    sejour: {
      name: row.stayName,
      startDate: row.startDate ? `${row.startDate}T00:00:00.000Z` : "",
      endDate: row.endDate ? `${row.endDate}T00:00:00.000Z` : "",
      ageGroup: "",
    },
    transport: {
      departureCity: row.departureCity,
      returnCity: row.returnCity,
      fee: finance.transportAmount,
    },
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
    importedRegistration: {
      source: SOURCE_NAME,
      entries: [{
        excelRow: row.excelRow,
        reference,
        childFirstName: row.childFirstName,
        childLastName: row.childLastName,
        matchMethod: "created_from_workbook",
      }],
    },
    notes: row.notes,
  };
  return {
    reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    finance,
    transport: {
      departureCity: row.departureCity,
      returnCity: row.returnCity,
      fee: finance.transportAmount,
    },
    doc: docData,
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
  return {
    ...roundAmounts(totals),
    remainingAmount: round(Math.max(totals.netAmount - totals.paidAmount, 0)),
  };
}

function makeImportedReference(row) {
  const letters = normalizeKey(row.childLastName || row.childFirstName || "ETE").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${row.stayCode || "ETE"}-${row.week || "SX"}-${String(row.excelRow).padStart(3, "0")}-${letters}`;
}

function summarizeFinance(finances) {
  return roundAmounts(finances.reduce((result, finance) => {
    for (const key of ["stayAmount", "transportAmount", "grossAmount", "cafAidAmount", "netAmount", "paidAmount", "remainingAmount"]) {
      result[key] += amount(finance[key]);
    }
    return result;
  }, { stayAmount: 0, transportAmount: 0, grossAmount: 0, cafAidAmount: 0, netAmount: 0, paidAmount: 0, remainingAmount: 0 }));
}

function compactRow(row) {
  return {
    excelRow: row.excelRow,
    reference: row.reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    email: row.email,
    stay: row.stayCode,
    week: row.week,
    transport: `${row.departureCity || "-"} / ${row.returnCity || "-"}`,
    grossAmount: row.grossAmount,
    transportAmount: row.transportAmount,
    netAmount: row.netAmount,
    paidAmount: row.paidAmount,
    matchMethod: row.matchMethod,
  };
}

function previewPatch(patch) {
  return {
    status: patch.status,
    validationSource: patch.validationSource,
    transport: {
      departureCity: patch["transport.departureCity"],
      returnCity: patch["transport.returnCity"],
      fee: patch["transport.fee"],
    },
    finance: patch.finance,
  };
}

function unique(values = []) {
  const uniqueValues = [...new Map(values.map((item) => [item.id, item])).values()];
  if (uniqueValues.length === 1) return { status: "one", value: uniqueValues[0] };
  if (uniqueValues.length > 1) return { status: "many", values: uniqueValues };
  return { status: "none" };
}

function addIndex(map, key, reservation) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(reservation);
}

function normalizeStatus(value) {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (raw.includes("valid")) return "validated";
  if (raw.includes("delete") || raw.includes("annul") || raw.includes("passe")) return "deleted";
  return "pending";
}

function stayCodeFromName(value) {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (raw.includes("surf") || raw.includes("mcsc")) return "MCSC";
  if (raw.includes("eaux") || raw.includes("creative-camp") || raw.includes("evcc")) return "EVCC";
  return "";
}

function weekFromStartDate(value) {
  return {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[String(value || "").slice(0, 10)] || "";
}

function weekDates(week) {
  const map = {
    S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
    S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
    S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
    S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
  };
  return map[cleanText(week).toUpperCase()] || { startDate: "", endDate: "" };
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCityLabel(value) {
  const text = cleanText(value);
  if (!text) return "";
  const key = normalizeKey(text);
  if (key === "surplace") return "Sur Place";
  if (key === "paris") return "Paris";
  if (key === "lyon") return "Lyon";
  if (key === "marseille") return "Marseille";
  if (key === "montpellier") return "Montpellier";
  if (key === "bordeaux") return "Bordeaux";
  if (key === "toulouse") return "Toulouse";
  if (key === "nantes") return "Nantes";
  return text;
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
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
