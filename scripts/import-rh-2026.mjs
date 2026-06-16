import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

loadEnv(".env.local");

const workbookPath = process.argv.find((arg) => arg.toLowerCase().endsWith(".xlsx"));
const shouldApply = process.argv.includes("--apply");

if (!workbookPath) {
  throw new Error("Chemin du fichier Finances 2026.xlsx manquant.");
}

const weekDates = {
  S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
  S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
  S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
  S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
};

const extraction = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["RH"]
rows = []
for row in range(2, ws.max_row + 1):
    values = [ws.cell(row, col).value for col in range(1, 11)]
    if not values[0] and not values[1]:
        continue
    rows.append({
        "excelRow": row,
        "lastName": str(values[0] or "").strip(),
        "firstName": str(values[1] or "").strip(),
        "stayCode": str(values[2] or "").strip(),
        "week": str(values[3] or "").strip(),
        "role": str(values[4] or "").strip(),
        "netSalary": float(values[5] or 0),
        "bonusCount": int(values[6] or 0),
        "grossSalary": float(values[7] or 0),
        "outstandingAmount": float(values[8] or 0),
        "paidAmount": float(values[9] or 0),
    })
print(json.dumps(rows, ensure_ascii=False))
`, workbookPath], {
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});

if (extraction.status !== 0) {
  throw new Error(extraction.stderr || "Impossible de lire l'onglet RH.");
}

const rows = JSON.parse(extraction.stdout);
const members = new Map();
const contracts = [];

for (const row of rows) {
  const memberId = slugify(`${row.firstName}-${row.lastName || "nom-a-completer"}`);
  const dates = weekDates[row.week] || { startDate: "", endDate: "" };
  const name = `${row.firstName} ${row.lastName}`.trim();

  if (!members.has(memberId)) {
    members.set(memberId, {
      firstName: row.firstName,
      lastName: row.lastName,
      name,
      normalizedName: normalizeText(name),
      phone: "",
      email: "",
      active: true,
      source: "Finances 2026.xlsx - RH",
      importedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  contracts.push({
    id: `rh-2026-row-${row.excelRow}`,
    memberId,
    memberName: name,
    stayCode: row.stayCode,
    stayName: row.stayCode === "MCSC"
      ? "My Creative Surf Camp"
      : row.stayCode === "EVCC"
        ? "Eaux Vives Creative Camp"
        : row.stayCode,
    week: row.week,
    startDate: dates.startDate,
    endDate: dates.endDate,
    role: row.role,
    netSalary: row.netSalary,
    bonusCount: row.bonusCount,
    bonusAmount: row.bonusCount * 60,
    grossSalary: row.grossSalary,
    outstandingAmount: row.outstandingAmount,
    paidAmount: row.paidAmount,
    status: row.paidAmount >= row.grossSalary && row.grossSalary > 0 ? "paid" : "active",
    source: "Finances 2026.xlsx - RH",
    sourceRow: row.excelRow,
    contractFileUrl: "",
    importedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

console.log(JSON.stringify({
  workbook: path.resolve(workbookPath),
  members: members.size,
  contracts: contracts.length,
  weeks: Object.fromEntries(
    Object.keys(weekDates).map((week) => [week, contracts.filter((contract) => contract.week === week).length]),
  ),
}, null, 2));

if (!shouldApply) {
  console.log("Prévisualisation uniquement. Ajoutez --apply pour écrire dans Firebase.");
  process.exit(0);
}

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
const existingMembers = await getDocs(collection(db, "staff_members"));
const writes = [
  ...[...members.entries()].map(([id, data]) => ({ collection: "staff_members", id, data })),
  ...contracts.map(({ id, ...data }) => ({ collection: "staff_contracts", id, data })),
];
const obsoleteMemberIds = existingMembers.docs
  .filter((item) => item.data().source === "Finances 2026.xlsx - RH" && !members.has(item.id))
  .map((item) => item.id);

for (let index = 0; index < writes.length; index += 450) {
  const batch = writeBatch(db);
  for (const item of writes.slice(index, index + 450)) {
    batch.set(doc(db, item.collection, item.id), item.data, { merge: true });
  }
  await batch.commit();
}

if (obsoleteMemberIds.length) {
  const batch = writeBatch(db);
  obsoleteMemberIds.forEach((id) => batch.delete(doc(db, "staff_members", id)));
  await batch.commit();
}

console.log(
  `Import Firebase terminé : ${members.size} animateurs, ${contracts.length} contrats, `
  + `${obsoleteMemberIds.length} anciennes fiches supprimées.`,
);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadEnv(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
