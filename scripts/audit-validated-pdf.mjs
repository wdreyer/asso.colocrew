import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

loadEnv(".env.local");

const pdfArg = process.argv.find((arg) => /\.pdf$/i.test(arg));
const pdfPath = pdfArg || "C:/Users/dreye/Downloads/ETE 26 - Inscriptions validées - Suivi inscris (2).pdf";
const sourceName = path.basename(pdfPath);

const rows = readPdf(pdfPath);
const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const [reservationsSnap, transportsSnap] = await Promise.all([
  getDocs(collection(db, "reservations")),
  getDocs(collection(db, "transports")),
]);

const reservations = reservationsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transports = transportsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const indexes = buildIndexes(reservations);

const audited = rows.map((row) => {
  const match = findReservation(row, indexes);
  const reservation = match.reservation || null;
  const financeDiffs = reservation ? compareFinance(row, reservation) : [];
  const transportChecks = reservation ? checkTransport(row, reservation, transports) : [];
  return {
    rowNumber: row.rowNumber,
    child: row.child,
    reference: row.reference,
    email: row.email,
    phone: row.phone,
    birthDate: row.birthDate,
    stay: row.stayCode,
    week: row.week,
    transport: {
      aller: row.departureCity,
      retour: row.returnCity,
      amount: row.transportAmount,
    },
    amounts: {
      total: row.grossAmount,
      totalAfterCaf: row.netAmount,
      stay: row.stayAmount,
      transport: row.transportAmount,
      caf: row.cafAidAmount,
      paid: row.paidAmount,
      remaining: round(Math.max(row.netAmount - row.paidAmount, 0)),
    },
    match: reservation
      ? {
          status: "matched",
          method: match.method,
          reservationId: reservation.id,
          currentStatus: reservation.status || "",
          currentReference: reservation.numeroDeReservation || "",
        }
      : { status: match.status, reason: match.reason, ids: match.ids || [] },
    financeDiffs,
    transportChecks,
    proposedPatch: reservation ? buildPatchPreview(row) : buildCreatePreview(row),
  };
});

const totals = summarizeRows(rows);
const mismatches = audited.filter((item) =>
  item.match.status !== "matched" || item.financeDiffs.length || item.transportChecks.some((check) => check.level !== "ok"),
);
const output = {
  mode: "dry-run",
  source: sourceName,
  extractedRows: rows.length,
  matched: audited.filter((item) => item.match.status === "matched").length,
  missing: audited.filter((item) => item.match.status === "missing").length,
  ambiguous: audited.filter((item) => item.match.status === "ambiguous").length,
  rowsWithFinanceDiffs: audited.filter((item) => item.financeDiffs.length).length,
  rowsWithTransportIssues: audited.filter((item) => item.transportChecks.some((check) => check.level !== "ok")).length,
  totals,
  cities: groupCount(rows, (row) => `${row.departureCity || "-"} / ${row.returnCity || "-"}`),
  mismatchPreview: mismatches.slice(0, 120),
  allRows: audited,
};

const outPath = ".codex-validated-pdf-audit.json";
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
console.log(JSON.stringify({
  source: output.source,
  extractedRows: output.extractedRows,
  matched: output.matched,
  missing: output.missing,
  ambiguous: output.ambiguous,
  rowsWithFinanceDiffs: output.rowsWithFinanceDiffs,
  rowsWithTransportIssues: output.rowsWithTransportIssues,
  totals: output.totals,
  cities: output.cities,
  report: outPath,
}, null, 2));

process.exit(0);

function readPdf(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable: ${filePath}`);
  const result = spawnSync("python", ["-c", String.raw`
import json, re, sys
from pypdf import PdfReader
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
items = []
def visitor(text, cm, tm, font_dict, font_size):
    value = text.strip()
    if value:
        items.append({"x": round(tm[4], 1), "y": round(tm[5], 1), "text": value})
page = PdfReader(path).pages[0]
page.extract_text(visitor_text=visitor)
plain = page.extract_text() or ""
print(json.dumps({"items": items, "plain": plain}, ensure_ascii=False))
`, filePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) throw new Error(result.stderr || "Lecture PDF impossible");
  const { items, plain } = JSON.parse(result.stdout);
  const plainRows = splitPlainRows(plain);
  const dateItems = items
    .filter((item) => /^\d{2}\/\d{2}\/2026$/.test(item.text) && item.x > 30 && item.x < 80 && item.y > 20)
    .sort((a, b) => a.y - b.y);
  return dateItems.map((dateItem, index) => parsePdfRow(index + 1, dateItem, items, plainRows[index] || "")).filter(Boolean);
}

function splitPlainRows(plain) {
  const sources = "(?:résa site|anciens|totemia|juvigo|groupe|bouche à oreille|google|amis)";
  const text = String(plain || "");
  const starts = [...text.matchAll(new RegExp(`\\d{2}/\\d{2}/2026${sources}`, "g"))].map((match) => match.index);
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length).trim());
}

function parsePdfRow(rowNumber, dateItem, items, plainRow) {
  const nextY = items
    .filter((item) => /^\d{2}\/\d{2}\/\d{4}$/.test(item.text) && item.x < 80 && item.y < dateItem.y)
    .sort((a, b) => b.y - a.y)[0]?.y ?? -Infinity;
  const rowItems = items
    .filter((item) => item.y > 20 && item.y <= dateItem.y + 8 && item.y > nextY + 2)
    .sort((a, b) => a.x - b.x || b.y - a.y);

  const token = (min, max) => rowItems.filter((item) => item.x >= min && item.x < max).map((item) => item.text.trim()).filter(Boolean);
  const firstText = (min, max) => token(min, max)[0] || "";
  const joinedText = (min, max) => token(min, max).join(" ").replace(/\s+/g, " ").trim();
  const amountAt = (min, max) => {
    const value = token(min, max).map(amountFromText).find((item) => item !== null);
    return value ?? null;
  };
  const plain = parsePlainRow(plainRow);
  const stayCode = plain.stayCode || token(1980, 2075).find((value) => /^(MCSC|EVCC)$/i.test(value)) || "";
  const week = plain.week || token(2075, 2130).find((value) => /^S\d$/i.test(value)) || "";
  const reference = plain.reference || token(1820, 2010).find((value) => /-/.test(value)) || "";

  return {
    rowNumber,
    date: isoDate(dateItem.text),
    source: firstText(100, 240),
    childLastName: joinedText(240, 390),
    childFirstName: joinedText(390, 520),
    child: `${joinedText(390, 520)} ${joinedText(240, 390)}`.replace(/\s+/g, " ").trim(),
    birthDate: isoDate(firstText(520, 650)),
    gender: firstText(700, 750),
    responsibleLastName: joinedText(750, 940),
    responsibleFirstName: joinedText(940, 1080),
    phone: formatPhone(firstText(1150, 1275)),
    email: cleanEmail(plainRow) || cleanEmail(joinedText(1270, 1450)),
    cafNumber: joinedText(1650, 1815),
    reference,
    stayCode: stayCode.toUpperCase() || "MCSC",
    stayName: stayCode.toUpperCase() === "EVCC" ? "eaux-vives-creative-camp" : "my-creative-surf-camp",
    week: week || "S1",
    startDate: weekDates(week || "S1").startDate,
    endDate: weekDates(week || "S1").endDate,
    departureCity: normalizeCityLabel(plain.departureCity),
    returnCity: normalizeCityLabel(plain.returnCity),
    grossAmount: plain.amounts[0] || 0,
    netAmount: amountAt(2540, 2650) ?? plain.amounts[1] ?? 0,
    stayAmount: amountAt(2650, 2760) ?? plain.amounts[2] ?? 0,
    transportAmount: amountAt(2760, 2850) ?? plain.amounts[3] ?? 0,
    cafAidAmount: amountAt(2850, 2960) ?? plain.amounts[4] ?? 0,
    paidAmount: amountAt(2960, 3090) ?? (plain.isFullyPaid ? (amountAt(2540, 2650) ?? plain.amounts[1] ?? 0) : 0),
    notes: plain.notes || joinedText(3500, 4100),
    rawAmounts: plain.amounts,
  };
}

function parsePlainRow(row) {
  const text = String(row || "");
  const reference = text.match(/(?:MCSC|EVCC)-\d{6}-[A-Z0-9]{3}/)?.[0] || "";
  const stayWeek = text.match(/(MCSC|EVCC)(S\d)/);
  const stayCode = stayWeek?.[1] || (reference ? reference.slice(0, 4) : "MCSC");
  const week = stayWeek?.[2] || "S1";
  const afterWeek = stayWeek ? text.slice(stayWeek.index + stayWeek[0].length) : text;
  const firstAmount = afterWeek.search(/\d[\d\u2009\s]*(?:,\d+)?\s*€/);
  const transportPart = firstAmount >= 0 ? afterWeek.slice(0, firstAmount) : afterWeek.slice(0, 60);
  const cityPattern = /Sur Place|Montpellier|Bordeaux|Toulouse|Valence|Nantes|Paris|Lyon|Marseille|Rouen/gi;
  const cities = [...transportPart.matchAll(cityPattern)].map((match) => match[0]);
  const amountPart = firstAmount >= 0 ? afterWeek.slice(firstAmount) : "";
  const amounts = [...amountPart.matchAll(/\d[\d\u2009]*(?:,\d+)?(?:\s*€)?/g)]
    .map((match) => amountFromText(match[0]))
    .filter((value) => value !== null)
    .slice(0, 6);
  return {
    reference,
    stayCode,
    week,
    departureCity: cities[0] || "",
    returnCity: cities[1] || cities[0] || "",
    amounts,
    isFullyPaid: /TOUT PAYE/i.test(text),
    notes: text.slice(Math.max(0, text.search(/Envoyé|TOUT PAYE|reste|rappel|en 3x|virement|Groupe|taa|va payer|envoyé le RIB/i))),
  };
}

function buildIndexes(items) {
  const byReference = new Map();
  const byEmail = new Map();
  const byEmailChild = new Map();
  const byChildBirthStayWeek = new Map();
  const byChildStayWeek = new Map();
  for (const item of items) {
    addIndex(byReference, normalizeKey(item.numeroDeReservation), item);
    const email = cleanEmail(item.legal?.email || item.email);
    if (email) addIndex(byEmail, email, item);
    const children = Array.isArray(item.minor?.children) ? item.minor.children : [];
    const week = weekFromStartDate(item.sejour?.startDate);
    const stay = stayCodeFromName(item.sejour?.name || item.sejourName);
    for (const child of children.length ? children : [{}]) {
      const childKeys = childNameKeys(child.firstName, child.lastName);
      const childKey = childKeys[0];
      if (email && childKey) addIndex(byEmailChild, `${email}|${childKey}`, item);
      if (childKeys.length && child.birthDate && stay && week) {
        childKeys.forEach((key) => addIndex(byChildBirthStayWeek, `${key}|${cleanDate(child.birthDate)}|${stay}|${week}`, item));
      }
      if (childKeys.length && stay && week) {
        childKeys.forEach((key) => addIndex(byChildStayWeek, `${key}|${stay}|${week}`, item));
      }
    }
  }
  return { byReference, byEmail, byEmailChild, byChildBirthStayWeek, byChildStayWeek };
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
  for (const rowChildKey of childNameKeys(row.childFirstName, row.childLastName)) {
    const byBirthKey = rowChildKey && row.birthDate
      ? `${rowChildKey}|${row.birthDate}|${row.stayCode}|${row.week}`
      : "";
    if (byBirthKey) {
      const byBirth = unique(indexes.byChildBirthStayWeek.get(byBirthKey));
      if (byBirth.status === "one") return { status: "ok", method: "child_birth_stay_week", reservation: byBirth.value };
      if (byBirth.status === "many") return { status: "ambiguous", reason: "child_birth_stay_week", ids: byBirth.values.map((item) => item.id) };
    }
  }
  for (const rowChildKey of childNameKeys(row.childFirstName, row.childLastName)) {
    const childStayKey = rowChildKey && row.stayCode && row.week
      ? `${rowChildKey}|${row.stayCode}|${row.week}`
      : "";
    if (childStayKey) {
      const byChildStay = chooseExisting(indexes.byChildStayWeek.get(childStayKey));
      if (byChildStay.status === "one") return { status: "ok", method: "child_stay_week", reservation: byChildStay.value };
      if (byChildStay.status === "many") return { status: "ambiguous", reason: "child_stay_week", ids: byChildStay.values.map((item) => item.id) };
    }
  }
  if (row.email) {
    const byEmailOnly = chooseExisting(indexes.byEmail.get(row.email));
    if (byEmailOnly.status === "one") return { status: "ok", method: "email", reservation: byEmailOnly.value };
    if (byEmailOnly.status === "many") return { status: "ambiguous", reason: "email", ids: byEmailOnly.values.map((item) => item.id) };
  }
  return { status: "missing", reason: row.reference ? "reference_not_found" : "no_unique_match" };
}

function compareFinance(row, reservation) {
  const checks = [
    ["finance.grossAmount", row.grossAmount, reservation.finance?.grossAmount ?? reservation.payment?.validatedPrice ?? reservation.payment?.totalPrice],
    ["finance.netAmount", row.netAmount, reservation.finance?.netAmount ?? reservation.payment?.resteACharge],
    ["finance.stayAmount", row.stayAmount, reservation.finance?.stayAmount],
    ["finance.transportAmount", row.transportAmount, reservation.finance?.transportAmount ?? reservation.transport?.fee ?? reservation.payment?.transportFee],
    ["finance.cafAidAmount", row.cafAidAmount, reservation.finance?.cafAidAmount ?? reservation.payment?.cafAmount],
    ["finance.paidAmount", row.paidAmount, reservation.finance?.paidAmount ?? reservation.payment?.alreadyPaid],
  ];
  return checks
    .map(([field, next, current]) => ({ field, current: round(Number(current || 0)), next: round(next) }))
    .filter((item) => Math.abs(item.current - item.next) >= 0.01);
}

function checkTransport(row, reservation, transports) {
  const checks = [];
  for (const direction of ["aller", "retour"]) {
    const city = direction === "aller" ? row.departureCity : row.returnCity;
    if (normalizeKey(city) === "surplace" || !city) {
      checks.push({ direction, level: "ok", message: "Sur Place" });
      continue;
    }
    const candidates = transports.filter((transport) =>
      transport.week === row.week
      && String(transport.direction || "").toLowerCase() === direction
    );
    const passengerTransports = candidates.filter((transport) =>
      (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id),
    );
    if (!passengerTransports.length) {
      checks.push({ direction, level: "error", city, message: "Aucun convoi ne contient cette réservation" });
      continue;
    }
    const segmentOk = passengerTransports.some((transport) => cityCoveredByTransport(city, transport));
    checks.push({
      direction,
      level: segmentOk ? "ok" : "warning",
      city,
      transportIds: passengerTransports.map((transport) => transport.id),
      message: segmentOk ? "Convoi et segment/ville couverts" : "Convoi trouvé, mais ville absente des segments/branches",
    });
  }
  return checks;
}

function cityCoveredByTransport(city, transport) {
  const wanted = normalizeKey(city);
  const values = [
    transport.departureCity,
    transport.arrivalCity,
    ...(transport.segments || []).flatMap((segment) => [segment.from, segment.to]),
    ...(transport.branches || []).flatMap((branch) => [branch.from, branch.to, branch.joinsAt]),
    ...(transport.passengers || []).flatMap((passenger) => [passenger.departureCity, passenger.returnCity, passenger.city, passenger.pickupCity]),
  ];
  return values.some((value) => normalizeKey(value) === wanted);
}

function buildPatchPreview(row) {
  const finance = summarizeRows([row]);
  return {
    status: "validated",
    validationSource: "ete26_validated_pdf",
    validationWorkbook: sourceName,
    finance,
    transport: { departureCity: row.departureCity, returnCity: row.returnCity, fee: row.transportAmount },
    payment: {
      validatedPrice: row.grossAmount,
      transportFee: row.transportAmount,
      cafAmount: row.cafAidAmount,
      resteACharge: row.netAmount,
      alreadyPaid: row.paidAmount,
      remainingValue: finance.remainingAmount,
    },
  };
}

function buildCreatePreview(row) {
  return { createReservation: true, ...buildPatchPreview(row) };
}

function summarizeRows(items) {
  return roundAmounts(items.reduce((result, row) => {
    result.stayAmount += row.stayAmount;
    result.transportAmount += row.transportAmount;
    result.grossAmount += row.grossAmount;
    result.cafAidAmount += row.cafAidAmount;
    result.netAmount += row.netAmount;
    result.paidAmount += row.paidAmount;
    result.remainingAmount += Math.max(row.netAmount - row.paidAmount, 0);
    return result;
  }, { stayAmount: 0, transportAmount: 0, grossAmount: 0, cafAidAmount: 0, netAmount: 0, paidAmount: 0, remainingAmount: 0 }));
}

function groupCount(items, selector) {
  return Object.fromEntries([...items.reduce((map, item) => {
    const key = selector(item);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")));
}

function unique(values = []) {
  const uniqueValues = [...new Map(values.map((item) => [item.id, item])).values()];
  if (uniqueValues.length === 1) return { status: "one", value: uniqueValues[0] };
  if (uniqueValues.length > 1) return { status: "many", values: uniqueValues };
  return { status: "none" };
}

function chooseExisting(values = []) {
  const uniqueValues = [...new Map(values.map((item) => [item.id, item])).values()];
  if (uniqueValues.length <= 1) return unique(uniqueValues);
  const validated = uniqueValues.filter((item) => String(item.status || "").toLowerCase() === "validated");
  if (validated.length === 1) return { status: "one", value: validated[0] };
  return { status: "many", values: uniqueValues };
}

function addIndex(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function stayCodeFromName(value) {
  const key = normalizeKey(value);
  if (key.includes("evcc") || key.includes("eauxvives")) return "EVCC";
  if (key.includes("mcsc") || key.includes("surf")) return "MCSC";
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
  return {
    S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
    S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
    S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
    S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
  }[week] || { startDate: "", endDate: "" };
}

function normalizeCityLabel(value) {
  const text = String(value || "").trim();
  const key = normalizeKey(text);
  const labels = {
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
  return labels[key] || text;
}

function childNameKey(firstName, lastName) {
  return normalizeKey(`${firstName || ""} ${lastName || ""}`);
}

function childNameKeys(firstName, lastName) {
  return [
    childNameKey(firstName, lastName),
    childNameKey(lastName, firstName),
  ].filter(Boolean);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function amountFromText(value) {
  const cleaned = String(value || "").replace(/\u2009/g, "").replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value) {
  return isoDate(String(value || "").slice(0, 10));
}

function isoDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
}

function cleanEmail(value) {
  const matches = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  const cleaned = matches
    .map((item) => item.replace(/^[a-z]{1,5}\d{8,12}(?=[a-z])/i, ""))
    .filter((item) => /^[a-z][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(item));
  return cleaned[0] || "";
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 9 ? `0${digits}` : digits;
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
