import fs from "node:fs";
import { spawnSync } from "node:child_process";
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

const shouldApply = process.argv.includes("--apply");
const rebuildTransports = process.argv.includes("--rebuild-transports");
const workbookPath = process.argv.find((arg) => /\.xlsx$/i.test(arg))
  || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées (12).xlsx";
const SOURCE_NAME = workbookPath.split(/[\\/]/).pop();

const S3_TRANSPORT_IDS = {
  allerNorth: "gYSCIzh4y1VbVojTAEzi",
  allerSouth: "ZE9pRIszXarAjRBoQqhz",
  allerBus: "s3-2026-bus-aller-autocar",
  retourNorth: "rvRWSjpmMcmht8Hka2gn",
  retourSouth: "MgRgEaP3Pv4riMtvpR3m",
  retourBus: "s3-2026-bus-retour-autocar",
};

const NORTH_CITIES = new Set(["paris", "lille", "nantes"]);
const SOUTH_CITIES = new Set(["lyon", "valence", "montpellier", "beziers", "bezier", "toulouse", "marseille"]);

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

const { validRows, cancelledRows } = readWorkbook(workbookPath);
const s3Rows = validRows.filter((row) => row.week === "S3" && row.childFirstName && row.childLastName);
const cancelledS3Rows = cancelledRows.filter((row) => row.week === "S3" && row.childFirstName && row.childLastName);

const reservationSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transportSnap = await getDocs(collection(db, "transports"));
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

const indexes = buildIndexes(reservations);
const matched = [];
const unmatchedExcel = [];
const ambiguousExcel = [];
for (const row of s3Rows) {
  const match = findReservation(row, indexes);
  if (match.status === "ok") matched.push({ row, reservation: match.reservation, method: match.method });
  else if (match.status === "ambiguous") ambiguousExcel.push({ row, ids: match.ids, reason: match.reason });
  else unmatchedExcel.push({ row, reason: match.reason });
}

const matchedByReservationId = groupBy(matched, (item) => item.reservation.id);
const reservationUpdates = [...matchedByReservationId.entries()].map(([id, items]) =>
  buildReservationPatch(items[0].reservation, items.map((item) => ({ ...item.row, matchMethod: item.method }))),
);

const s3ActiveReservations = reservations
  .filter((reservation) => weekFromReservation(reservation) === "S3")
  .filter((reservation) => !isDeletedStatus(reservation.status));
const s3ValidatedReservations = s3ActiveReservations.filter((reservation) => isValidatedStatus(reservation.status));
const matchedIds = new Set(matched.map((item) => item.reservation.id));
const firestoreOnly = s3ValidatedReservations
  .filter((reservation) => !matchedIds.has(reservation.id))
  .map(compactReservation);
const pendingFirestoreOnly = s3ActiveReservations
  .filter((reservation) => !isValidatedStatus(reservation.status))
  .filter((reservation) => !matchedIds.has(reservation.id))
  .map(compactReservation);

const cancelledMatches = cancelledS3Rows.map((row) => {
  const match = findReservation(row, indexes);
  return {
    excel: compactRow(row),
    match: match.status === "ok" ? compactReservation(match.reservation) : null,
    active: match.status === "ok" ? !isDeletedStatus(match.reservation.status) : false,
    reason: match.status,
  };
});

const expected = buildExpectedPassengerSets(matched);
const transportAudit = auditTransports(transports, expected);
const transportPatches = rebuildS3TransportPatches(transports, expected);

const reservationDiffs = reservationUpdates
  .filter((item) => Object.keys(item.changedFields).length > 0)
  .map(({ patch, ...item }) => item);

if (shouldApply) {
  for (const update of reservationUpdates) {
    if (!Object.keys(update.patch).length) continue;
    await updateDoc(doc(db, "reservations", update.id), {
      ...update.patch,
      updatedAt: serverTimestamp(),
      excelSync: {
        source: SOURCE_NAME,
        syncedAt: serverTimestamp(),
        rows: update.rows.map((row) => ({
          excelRow: row.excelRow,
          childFirstName: row.childFirstName,
          childLastName: row.childLastName,
          reference: row.reference,
          matchMethod: row.matchMethod,
        })),
      },
    });
  }
  if (rebuildTransports) {
    for (const patch of transportPatches) {
      await updateDoc(doc(db, "transports", patch.id), {
        passengers: patch.passengers,
        updatedAt: serverTimestamp(),
        excelSync: {
          source: SOURCE_NAME,
          syncedAt: serverTimestamp(),
          expectedPassengerCount: patch.passengers.length,
        },
      });
    }
  }
}

const report = {
  mode: shouldApply ? "apply" : "dry-run",
  transportsRebuilt: shouldApply && rebuildTransports,
  source: SOURCE_NAME,
  excel: {
    validS3Children: s3Rows.length,
    cancelledS3Children: cancelledS3Rows.length,
    byStay: countBy(s3Rows, (row) => row.stayCode || "?"),
    byDeparture: countBy(s3Rows, (row) => row.departureCity || "?"),
    byReturn: countBy(s3Rows, (row) => row.returnCity || "?"),
  },
  matching: {
    matchedChildren: matched.length,
    matchedReservations: matchedByReservationId.size,
    unmatchedExcel: unmatchedExcel.length,
    ambiguousExcel: ambiguousExcel.length,
    firestoreOnlyS3Validated: firestoreOnly.length,
    firestoreOnlyS3PendingOrOther: pendingFirestoreOnly.length,
  },
  updates: {
    reservationPatchesApplied: shouldApply ? reservationUpdates.filter((item) => Object.keys(item.patch).length > 0).length : 0,
    reservationDiffsPreview: reservationDiffs,
    transportPatchesApplied: shouldApply && rebuildTransports ? transportPatches.length : 0,
  },
  differences: {
    excelValidMissingInFirestore: unmatchedExcel.map((item) => ({ reason: item.reason, ...compactRow(item.row) })),
    ambiguousExcelMatches: ambiguousExcel.map((item) => ({ reason: item.reason, ids: item.ids, ...compactRow(item.row) })),
    firestoreS3ValidatedMissingFromExcel: firestoreOnly,
    firestoreS3PendingOrOtherMissingFromExcel: pendingFirestoreOnly,
    excelCancelledButActiveInFirestore: cancelledMatches.filter((item) => item.active),
    transportAudit,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(0);

function buildReservationPatch(reservation, rows) {
  const first = rows[0];
  const finance = summarizeEntries(rows);
  const expected = {
    status: "validated",
    "sejour.name": first.stayName,
    "sejour.startDate": "2026-08-03T00:00:00.000Z",
    "sejour.endDate": "2026-08-14T00:00:00.000Z",
    "transport.departureCity": first.departureCity,
    "transport.returnCity": first.returnCity,
    "transport.fee": finance.transportAmount,
    finance: {
      ...finance,
      source: SOURCE_NAME,
      entries: rows.map((row) => ({
        excelRow: row.excelRow,
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
        matchMethod: row.matchMethod,
      })),
    },
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
  if (first.email) expected["legal.email"] = first.email;
  if (first.phone) expected["legal.phone"] = first.phone;
  if (first.cafNumber) expected["legal.cafOrSecu"] = first.cafNumber;
  if (first.qf !== null) expected["legal.qf"] = first.qf;

  const patch = {};
  const changedFields = {};
  for (const [path, value] of Object.entries(expected)) {
    const current = getPath(reservation, path);
    if (!sameValue(current, value)) {
      patch[path] = value;
      changedFields[path] = { from: printable(current), to: printable(value) };
    }
  }

  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || first.reference,
    child: reservationChildrenLabel(reservation),
    rows,
    changedFields,
    patch,
  };
}

function buildExpectedPassengerSets(matches) {
  const result = {
    allerNorth: [],
    allerSouth: [],
    allerBus: [],
    retourNorth: [],
    retourSouth: [],
    retourBus: [],
  };
  for (const { row, reservation } of matches) {
    const passenger = passengerFrom(row, reservation);
    if (!isSurPlace(row.departureCity)) {
      const key = convoiKey(row.departureCity, "aller");
      if (key) result[key].push({ ...passenger, pickupCity: row.departureCity });
      result.allerBus.push({ ...passenger, pickupCity: row.stayCode === "EVCC" ? "Bidarray" : "Messanges" });
    }
    if (!isSurPlace(row.returnCity)) {
      const key = convoiKey(row.returnCity, "retour");
      if (key) result[key].push({ ...passenger, pickupCity: row.returnCity });
      result.retourBus.push({ ...passenger, pickupCity: row.stayCode === "EVCC" ? "Bidarray" : "Messanges" });
    }
  }
  return Object.fromEntries(Object.entries(result).map(([key, list]) => [key, dedupePassengers(list)]));
}

function convoiKey(city, direction) {
  const key = normalizeKey(city);
  if (NORTH_CITIES.has(key)) return `${direction}North`;
  if (SOUTH_CITIES.has(key)) return `${direction}South`;
  return null;
}

function auditTransports(transports, expected) {
  return Object.entries(S3_TRANSPORT_IDS).map(([key, id]) => {
    const transport = transports.find((item) => item.id === id);
    const actual = dedupePassengers((transport?.passengers || []).map(hydratePassenger));
    const expectedList = expected[key] || [];
    const actualKeys = new Set(actual.map(passengerStableKey));
    const expectedKeys = new Set(expectedList.map(passengerStableKey));
    return {
      key,
      id,
      name: transport?.sejourName || transport?.routeLabel || "",
      actualChildren: countPassengerChildren(actual),
      expectedChildren: countPassengerChildren(expectedList),
      missingInTransport: expectedList.filter((item) => !actualKeys.has(passengerStableKey(item))).map((item) => compactPassenger(item)),
      extraInTransport: actual.filter((item) => !expectedKeys.has(passengerStableKey(item))).map((item) => compactPassenger(hydratePassenger(item))),
    };
  });
}

function rebuildS3TransportPatches(transports, expected) {
  return Object.entries(S3_TRANSPORT_IDS).map(([key, id]) => {
    const transport = transports.find((item) => item.id === id);
    const currentById = new Map((transport?.passengers || []).map((passenger) => [passenger.reservationId, passenger]));
    return {
      id,
      key,
      passengers: (expected[key] || []).map((passenger) => ({
        ...currentById.get(passenger.reservationId),
        ...passenger,
        reservationId: passenger.reservationId,
        pickupCity: passenger.pickupCity,
        convocationSent: currentById.get(passenger.reservationId)?.convocationSent || false,
      })),
    };
  });
}

function passengerFrom(row, reservation) {
  return {
    reservationId: reservation.id,
    pickupCity: "",
    nom: `${row.childFirstName} ${row.childLastName}`.trim(),
    childName: `${row.childFirstName} ${row.childLastName}`.trim(),
    sejourName: row.stayCode,
    children: [{
      firstName: row.childFirstName,
      lastName: row.childLastName,
      birthDate: row.birthDate,
      gender: row.gender,
    }],
  };
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const result = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys, unicodedata
from datetime import datetime, date
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
def norm(value):
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    return "".join(ch if ch.isalnum() else "_" for ch in text).strip("_")
def clean_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value
def read_sheet(name):
    ws = wb[name]
    headers = [str(ws.cell(1, col).value or "").strip() or f"col{col}" for col in range(1, ws.max_column + 1)]
    keys = [norm(header) for header in headers]
    rows = []
    for row_idx in range(2, ws.max_row + 1):
        item = {"excelRow": row_idx}
        empty = True
        for col, key in enumerate(keys, start=1):
            value = clean_value(ws.cell(row_idx, col).value)
            if value not in (None, ""):
                empty = False
            item[key] = value
        if not empty:
            rows.append(item)
    return rows
print(json.dumps({"validRows": read_sheet("Suivi inscris"), "cancelledRows": read_sheet("annul")}, ensure_ascii=False))
`, filePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) throw new Error(result.stderr || "Lecture Excel impossible");
  const parsed = JSON.parse(result.stdout);
  return {
    validRows: parsed.validRows.map(normalizeWorkbookRow).filter((row) => row.childFirstName || row.childLastName),
    cancelledRows: parsed.cancelledRows.map(normalizeWorkbookRow).filter((row) => row.childFirstName || row.childLastName),
  };
}

function normalizeWorkbookRow(row) {
  const week = cleanText(row.date_sejour).toUpperCase();
  const stayCode = cleanText(row.sejour).toUpperCase();
  return {
    excelRow: Number(row.excelRow),
    childLastName: cleanText(row.nom_enfant),
    childFirstName: cleanText(row.prenom_enfant),
    birthDate: cleanDate(row.date_de_naissance),
    gender: cleanText(row.sexe),
    responsibleLastName: cleanText(row.nom_responsable),
    responsibleFirstName: cleanText(row.prenom_responsable),
    relation: cleanText(row.relation),
    phone: formatPhone(row.tel),
    email: cleanEmail(row.mail),
    address: cleanText(row.adresse),
    cafNumber: cleanText(row.n_caf),
    qf: amountOrNull(row.qf),
    reference: cleanText(row.n_dossier),
    stayCode,
    stayName: stayCode === "MCSC" ? "my-creative-surf-camp" : stayCode === "EVCC" ? "eaux-vives-creative-camp" : stayCode,
    week,
    departureCity: normalizeCityLabel(row.transport_aller),
    returnCity: normalizeCityLabel(row.transport_retour),
    grossAmount: amount(row.montant_total),
    netAmount: amount(row.total_caf),
    stayAmount: amount(row.montant_sejour),
    transportAmount: amount(row.montant_transport),
    cafAidAmount: amount(row.aide_caf),
    paidAmount: amount(row.montant_regle),
  };
}

function buildIndexes(reservations) {
  const byReference = new Map();
  const byChildBirthStayWeek = new Map();
  const byNameStayWeek = new Map();
  for (const reservation of reservations) {
    addIndex(byReference, normalizeKey(reservation.numeroDeReservation), reservation);
    const week = weekFromReservation(reservation);
    const stay = stayCodeFromName(reservation.sejour?.name || reservation.sejourName);
    const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
    for (const child of children) {
      const childKey = childNameKey(child.firstName, child.lastName);
      const reverseChildKey = childNameKey(child.lastName, child.firstName);
      const birthDate = cleanDate(child.birthDate);
      addIndex(byNameStayWeek, `${childKey}|${stay}|${week}`, reservation);
      addIndex(byNameStayWeek, `${reverseChildKey}|${stay}|${week}`, reservation);
      addIndex(byChildBirthStayWeek, `${childKey}|${birthDate}|${stay}|${week}`, reservation);
      addIndex(byChildBirthStayWeek, `${reverseChildKey}|${birthDate}|${stay}|${week}`, reservation);
    }
  }
  return { byReference, byChildBirthStayWeek, byNameStayWeek };
}

function findReservation(row, indexes) {
  if (row.reference) {
    const exact = unique(indexes.byReference.get(normalizeKey(row.reference)));
    if (exact.status === "one") return { status: "ok", method: "reference", reservation: exact.value };
    if (exact.status === "many") return { status: "ambiguous", reason: "reference", ids: exact.values.map((item) => item.id) };
  }
  const childBirthKey = `${childNameKey(row.childFirstName, row.childLastName)}|${row.birthDate}|${row.stayCode}|${row.week}`;
  const byBirth = unique(indexes.byChildBirthStayWeek.get(childBirthKey));
  if (byBirth.status === "one") return { status: "ok", method: "child_birth_stay_week", reservation: byBirth.value };
  if (byBirth.status === "many") return { status: "ambiguous", reason: "child_birth_stay_week", ids: byBirth.values.map((item) => item.id) };
  const nameKey = `${childNameKey(row.childFirstName, row.childLastName)}|${row.stayCode}|${row.week}`;
  const byName = unique(indexes.byNameStayWeek.get(nameKey));
  if (byName.status === "one") return { status: "ok", method: "child_stay_week", reservation: byName.value };
  if (byName.status === "many") return { status: "ambiguous", reason: "child_stay_week", ids: byName.values.map((item) => item.id) };
  return { status: "missing", reason: row.reference ? "reference_not_found" : "no_unique_fallback" };
}

function summarizeEntries(rows) {
  const totals = rows.reduce((result, row) => {
    result.stayAmount += amount(row.stayAmount);
    result.transportAmount += amount(row.transportAmount);
    result.grossAmount += amount(row.grossAmount);
    result.cafAidAmount += amount(row.cafAidAmount);
    result.netAmount += amount(row.netAmount);
    result.paidAmount += amount(row.paidAmount);
    return result;
  }, { stayAmount: 0, transportAmount: 0, grossAmount: 0, cafAidAmount: 0, netAmount: 0, paidAmount: 0 });
  return {
    ...roundAmounts(totals),
    remainingAmount: round(Math.max(totals.netAmount - totals.paidAmount, 0)),
  };
}

function compactRow(row) {
  return {
    excelRow: row.excelRow,
    reference: row.reference,
    child: `${row.childFirstName} ${row.childLastName}`.trim(),
    stay: row.stayCode,
    aller: row.departureCity || "-",
    retour: row.returnCity || "-",
    birthDate: row.birthDate,
  };
}

function compactReservation(reservation) {
  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || "",
    child: reservationChildrenLabel(reservation),
    status: reservation.status || "",
    stay: stayCodeFromName(reservation.sejour?.name || reservation.sejourName),
    aller: reservation.transport?.departureCity || "",
    retour: reservation.transport?.returnCity || "",
  };
}

function compactPassenger(passenger) {
  return {
    reservationId: passenger.reservationId || "",
    child: passenger.childName || passenger.nom || passenger.children?.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).join(", ") || "",
    pickupCity: passenger.pickupCity || "",
  };
}

function reservationChildrenLabel(reservation) {
  return (reservation.minor?.children || [])
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function groupBy(items, keyFn) {
  const result = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
  }
  return result;
}

function countBy(items, keyFn) {
  return items.reduce((result, item) => {
    const key = keyFn(item);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function dedupePassengers(passengers) {
  const grouped = new Map();
  for (const passenger of passengers) {
    const key = passengerStableKey(passenger);
    if (!grouped.has(key)) {
      grouped.set(key, { ...passenger, children: [] });
    }
    const target = grouped.get(key);
    const existingChildren = target.children || [];
    for (const child of passenger.children || []) {
      const childKey = childNameKey(child.firstName, child.lastName);
      if (!existingChildren.some((item) => childNameKey(item.firstName, item.lastName) === childKey)) {
        existingChildren.push(child);
      }
    }
    target.children = existingChildren;
    target.childName = target.children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", ") || target.childName || target.nom || "";
    target.nom = target.childName;
  }
  return [...grouped.values()]
    .sort((a, b) => compactPassenger(a).child.localeCompare(compactPassenger(b).child, "fr", { sensitivity: "base" }));
}

function passengerStableKey(passenger) {
  return passenger.reservationId || normalizeKey(compactPassenger(passenger).child);
}

function countPassengerChildren(passengers) {
  return (passengers || []).reduce((total, passenger) => total + Math.max(passenger.children?.length || 0, 1), 0);
}

function hydratePassenger(passenger) {
  const reservation = reservations.find((item) => item.id === passenger.reservationId);
  if (!reservation) return passenger;
  const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
  const childName = children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", ");
  return {
    ...passenger,
    children: passenger.children?.length ? passenger.children : children,
    childName: passenger.childName || passenger.nom || childName,
    nom: passenger.nom || passenger.childName || childName,
  };
}

function addIndex(map, key, reservation) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(reservation);
}

function unique(values = []) {
  const deduped = [...new Map(values.map((item) => [item.id, item])).values()];
  if (deduped.length === 1) return { status: "one", value: deduped[0] };
  const validated = deduped.filter((item) => isValidatedStatus(item.status));
  if (validated.length === 1) return { status: "one", value: validated[0] };
  if (deduped.length > 1) return { status: "many", values: deduped };
  return { status: "none" };
}

function weekFromReservation(reservation) {
  return {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[String(reservation.sejour?.startDate || reservation.startDate || "").slice(0, 10)] || "";
}

function stayCodeFromName(value) {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (raw.includes("surf") || raw.includes("mcsc")) return "MCSC";
  if (raw.includes("eaux") || raw.includes("evcc") || raw.includes("creative-camp")) return "EVCC";
  return "";
}

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
}

function isValidatedStatus(value) {
  return normalizeKey(value) === "validated";
}

function isSurPlace(value) {
  return normalizeKey(value) === "surplace";
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
  const cities = {
    surplace: "Sur Place",
    paris: "Paris",
    lille: "Lille",
    lyon: "Lyon",
    marseille: "Marseille",
    montpellier: "Montpellier",
    bordeaux: "Bordeaux",
    toulouse: "Toulouse",
    nantes: "Nantes",
    valence: "Valence",
    beziers: "Béziers",
    bezier: "Béziers",
  };
  return cities[key] || text;
}

function getPath(object, path) {
  if (!path.includes(".")) return object?.[path];
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function sameValue(a, b) {
  return JSON.stringify(printable(a)) === JSON.stringify(printable(b));
}

function printable(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value === undefined) return "";
  return value;
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
