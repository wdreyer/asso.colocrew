// sync-ete26-csv.mjs
// Synchronise les réservations Firestore avec l'export CSV "Suivi inscris" de
// "ETE 26 - Inscriptions validées". Variante CSV de sync-ete26-validated-workbook.mjs
// (celui-ci lit un .xlsx via python/openpyxl ; celui-ci lit directement le .csv).
//
// Dry-run par défaut — n'écrit rien, affiche un résumé JSON.
// node scripts/sync-ete26-csv.mjs "chemin/vers.csv"          → dry-run
// node scripts/sync-ete26-csv.mjs "chemin/vers.csv" --apply  → applique en Firestore

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const csvArg = process.argv.find((arg) => /\.csv$/i.test(arg));
const csvPath = csvArg || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées - Suivi inscris (1).csv";
const SOURCE_NAME = csvPath.split(/[\\/]/).pop();

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
const csvRows = readCsv(csvPath);
const reservationsSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const indexes = buildIndexes(reservations);
const grouped = new Map();
const unmatched = [];
const ambiguous = [];

for (const row of csvRows) {
  const match = findReservation(row, indexes);
  if (match.status === "missing") {
    unmatched.push({ csvRow: row.csvRow, reason: match.reason, row });
    continue;
  }
  if (match.status === "ambiguous") {
    ambiguous.push({ csvRow: row.csvRow, reason: match.reason, ids: match.ids, row });
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
  }, { merge: true });
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  source: SOURCE_NAME,
  csvRows: csvRows.length,
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
  unmatched: unmatched.map((item) => ({ ...item, row: compactRow(item.row) })),
  ambiguous: ambiguous.map((item) => ({ ...item, row: compactRow(item.row) })),
  allCreates: creates.map((item) => ({
    reference: item.reference,
    child: item.child,
    responsible: item.responsible,
    finance: item.finance,
    transport: item.transport,
  })),
  allUpdates: updates.map(({ patch, rows, ...item }) => ({
    ...item,
    rows: rows.map(compactRow),
  })),
}, null, 2));

process.exit(0);

// ── Lecture CSV ────────────────────────────────────────────────────────────

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const text = fs.readFileSync(filePath, "utf8");
  const table = parseCsvText(text);
  const headers = table[0].map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const cols = table[i];
    if (!cols.some((v) => String(v || "").trim() !== "")) continue;
    const item = { csvRow: i + 1 };
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c] || `col${c}`;
      item[header] = cols[c] ?? "";
    }
    rows.push(item);
  }
  return rows.map(normalizeCsvRow).filter((row) => row.childFirstName || row.childLastName);
}

function parseCsvText(str) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inQuotes) {
      if (c === '"') {
        if (str[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalizeCsvRow(row) {
  const week = cleanText(row["date séjour"]).toUpperCase();
  const stayCode = cleanText(row["séjour"]).toUpperCase();
  const paiementNote = cleanText(row.paiement);
  const infosNote = cleanText(row.Infos);
  return {
    csvRow: row.csvRow,
    source: cleanText(row.source),
    childLastName: cleanText(row["nom enfant"]),
    childFirstName: cleanText(row["prénom enfant"]),
    birthDate: parseAnyDate(row["date de naissance"]),
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
    insuranceOpted: parseBool(row.assurance),
    grossAmount: amount(row["Montant total"]),
    netAmount: amount(row["Total-CAF"]),
    stayAmount: amount(row["montant séjour"]),
    transportAmount: amount(row["montant transport"]),
    cafAidAmount: amount(row["aide caf"]),
    paidAmount: amount(row["montant réglé"]),
    invoiceIssued: parseBool(row.facture),
    registrationFileStatus: parseBool(row["dossier inscri"]),
    vaccinesStatus: parseBool(row.vaccins),
    taaStatus: parseBool(row.TAA),
    ciStatus: parseBool(row.CI),
    transportConvocationStatus: parseBool(row["conv transport"]),
    notes: [paiementNote, infosNote].filter(Boolean).join(" / "),
  };
}

function parseBool(value) {
  return String(value || "").trim().toUpperCase() === "TRUE";
}

function parseAnyDate(value) {
  const FR_MONTHS = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  };
  const s = cleanText(value);
  if (!s) return "";
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\s+([a-zÀ-ÿ]+)\s+(\d{4})$/i);
  if (m) {
    const [, d, monthName, y] = m;
    const key = monthName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const mo = FR_MONTHS[key];
    if (mo) return `${y}-${String(mo).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

// ── Correspondance avec les réservations existantes ─────────────────────────
// (logique identique à sync-ete26-validated-workbook.mjs)

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
      if (entry.csvRow && reservation.importedRegistration?.source) {
        addIndex(byImportRow, `${reservation.importedRegistration.source}|${entry.csvRow}`, reservation);
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
  const byImport = unique(indexes.byImportRow.get(`${SOURCE_NAME}|${row.csvRow}`));
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
    csvRow: row.csvRow,
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
    validationSource: "ete26_csv_sync",
    validationWorkbook: SOURCE_NAME,
    validatedAt: reservation.validatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    finance,
    financeUpdatedAt: serverTimestamp(),
    importedRegistration: {
      source: SOURCE_NAME,
      entries: rows.map((row) => ({
        csvRow: row.csvRow,
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
  const entry = {
    csvRow: row.csvRow,
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
    matchMethod: "created_from_csv",
  };
  const finance = {
    ...summarizeEntries([entry]),
    source: SOURCE_NAME,
    entries: [entry],
  };
  const paymentStatus = finance.remainingAmount <= 0 ? "paid" : finance.paidAmount > 0 ? "in_progress" : "not_paid";
  const docData = {
    numeroDeReservation: reference,
    status: "validated",
    validationSource: "ete26_csv_sync",
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
      entries: [entry],
    },
    notes: row.notes,
  };
  return {
    reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    responsible: `${row.responsibleFirstName || ""} ${row.responsibleLastName || ""}`.trim(),
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
  return `${row.stayCode || "ETE"}-${row.week || "SX"}-${String(row.csvRow).padStart(3, "0")}-${letters}`;
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
    csvRow: row.csvRow,
    reference: row.reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    responsible: `${row.responsibleFirstName || ""} ${row.responsibleLastName || ""}`.trim(),
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
  const raw = String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (raw.includes("valid")) return "validated";
  if (raw.includes("delete") || raw.includes("annul") || raw.includes("passe")) return "deleted";
  return "pending";
}

function stayCodeFromName(value) {
  const raw = String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
    .replace(/[̀-ͯ]/g, "")
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
  if (key === "bezier" || key === "beziers") return "Béziers";
  if (key === "lille") return "Lille";
  if (key === "valence") return "Valence";
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
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/[€\s  ]/g, "");
  s = s.replace(",", ".");
  const parsed = Number(s);
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
