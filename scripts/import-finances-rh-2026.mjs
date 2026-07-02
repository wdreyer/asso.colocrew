// import-finances-rh-2026.mjs
// Importe les contrats/salaires réels depuis "Finances 2026 - RH.csv" dans Firestore
// (staff_contracts), en les reliant aux fiches existantes dans staff_members.
//
// Dry-run par défaut (aucune écriture) :
//   node scripts/import-finances-rh-2026.mjs
//   node scripts/import-finances-rh-2026.mjs "C:/chemin/vers/Finances 2026 - RH.csv"
// Écriture réelle dans Firebase :
//   node scripts/import-finances-rh-2026.mjs --apply

import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  collection, doc, getDocs, getFirestore, writeBatch, addDoc,
} from "firebase/firestore";

const DEFAULT_CSV_PATH = "C:/Users/dreye/Downloads/Finances 2026 - RH.csv";
const csvPath = process.argv.find((a) => a.toLowerCase().endsWith(".csv")) || DEFAULT_CSV_PATH;
const shouldApply = process.argv.includes("--apply");

loadEnv(".env.local");

const WEEK_DATES = {
  S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
  S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
  S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
  S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
};

const STAY_NAMES = {
  MCSC: "My Creative Surf Camp",
  EVCC: "Eaux Vives Creative Camp",
};

const ROLE_KEY_BY_POSTE = {
  "bafa": "bafa",
  "ds": "ds",
  "dsa": "dsa",
  "as/sb": "as-sb",
  "stagiaire/ssdiplome": "stagiaire",
};

// Cas connus où le nom du fichier Finances diffère de la fiche staff_members existante
// (fautes de frappe, prénom raccourci, nom de famille pas encore complété...).
// Vide pour l'instant : le rapprochement direct (prénom+nom normalisés) suffit sur ce fichier.
const ALIASES = {};

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normPoste(s) {
  return norm(s).replace(/\s+/g, "");
}

function slugify(value) {
  return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseAmount(raw) {
  const cleaned = String(raw || "")
    .replace(/[€\s  ]/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(value); value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") continue;
      row.push(value); value = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      value += ch;
    }
  }
  if (value !== "" || row.length) { row.push(value); rows.push(row); }
  return rows;
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

// ── Lecture du CSV ────────────────────────────────────────────────────────────

if (!fs.existsSync(csvPath)) {
  throw new Error(`Fichier introuvable : ${csvPath}`);
}

const raw = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const [header, ...dataRows] = parseCsv(raw);
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

const rows = dataRows.map((r, index) => {
  const posteRaw = r[col["Poste"]] || "";
  return {
    csvLine: index + 2,
    lastName: (r[col["Nom"]] || "").trim(),
    firstName: (r[col["Prenom"]] || "").trim(),
    stayCode: (r[col["Séjour"]] || "").trim(),
    week: (r[col["Semaine"]] || "").trim(),
    posteRaw: posteRaw.trim(),
    roleKey: ROLE_KEY_BY_POSTE[normPoste(posteRaw)] || "",
    netSalary: parseAmount(r[col["Salaire Net"]]),
    primeCount: parseInt(r[col["Prime ?"]], 10) || 0,
    grossSalary: parseAmount(r[col["Salaire Brut"]]),
    paidAmount: parseAmount(r[col["Payé"]]),
  };
});

// ── Firebase ───────────────────────────────────────────────────────────────────

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const membersSnap = await getDocs(collection(db, "staff_members"));
const existingMembers = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const contractsSnap = await getDocs(collection(db, "staff_contracts"));
const existingContractIdByKey = new Map();
contractsSnap.docs.forEach((d) => {
  const c = d.data() || {};
  if (c.memberId && c.stayCode && c.week) {
    existingContractIdByKey.set(`${c.memberId}__${c.stayCode}__${c.week}`, d.id);
  }
});

function matchMember(row) {
  const normFirst = norm(row.firstName);
  const normLast  = norm(row.lastName);
  const key = `${normFirst}|${normLast}`;
  const aliasKey = ALIASES[key];
  const [searchFirst, searchLast] = aliasKey ? aliasKey.split("|") : [normFirst, normLast];

  return existingMembers.find((m) => norm(m.firstName) === searchFirst && norm(m.lastName) === searchLast) || null;
}

// ── Traitement ─────────────────────────────────────────────────────────────────

const matched = [];
const unmatched = [];
const badPoste = [];

for (const row of rows) {
  if (!row.roleKey) { badPoste.push(row); continue; }
  const member = matchMember(row);
  if (!member) { unmatched.push(row); continue; }
  matched.push({ row, member });
}

console.log(`\n📄  ${rows.length} lignes lues dans ${path.resolve(csvPath)}\n`);

if (badPoste.length) {
  console.log(`⚠️  Poste non reconnu (${badPoste.length}) :`);
  badPoste.forEach((r) => console.log(`   L${r.csvLine} — ${r.firstName} ${r.lastName} : poste "${r.posteRaw}"`));
  console.log("");
}

if (unmatched.length) {
  console.log(`❓  Membre non trouvé dans staff_members (${unmatched.length}) — sera créé lors de l'--apply :`);
  unmatched.forEach((r) => console.log(`   L${r.csvLine} — "${r.firstName} ${r.lastName}" (${r.stayCode} ${r.week}, ${r.posteRaw})`));
  console.log("");
}

console.log(`✅  ${matched.length} ligne(s) associée(s) à un membre existant :`);
for (const { row, member } of matched) {
  const name = `${member.firstName || row.firstName} ${member.lastName || row.lastName}`.trim();
  console.log(`   ${row.stayCode} ${row.week} — ${name.padEnd(28)} ${row.posteRaw.padEnd(22)} net ${row.netSalary}€ / brut ${row.grossSalary}€ / prime x${row.primeCount} / payé ${row.paidAmount}€`);
}

console.log(`\n══════════════════════════════════════════════`);

if (!shouldApply) {
  console.log("\n▶  Dry-run uniquement — aucune écriture. Relancez avec --apply pour appliquer.\n");
  process.exit(0);
}

console.log("\n🚀  APPLY — écriture Firestore...\n");

const writes = [];
let createdMembersCount = 0;

for (const row of unmatched) {
  const memberData = {
    firstName: row.firstName,
    lastName: row.lastName,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: "", phone: "", staffType: "", active: true,
    source: "Finances 2026 - RH.csv",
  };
  const memberRef = await addDoc(collection(db, "staff_members"), memberData);
  createdMembersCount++;
  matched.push({ row, member: { id: memberRef.id, ...memberData } });
}

let updatedCount = 0;
let insertedCount = 0;

for (const { row, member } of matched) {
  if (!row.roleKey) continue;
  const dates = WEEK_DATES[row.week] || {};
  const existingId = existingContractIdByKey.get(`${member.id}__${row.stayCode}__${row.week}`);
  const contractId = existingId || `${row.stayCode}-${row.week}-${slugify(`${member.firstName || row.firstName}-${member.lastName || row.lastName}`)}`;
  if (existingId) updatedCount++; else insertedCount++;
  const memberName = `${member.firstName || row.firstName} ${member.lastName || row.lastName}`.trim();
  writes.push({
    id: contractId,
    data: {
      memberId: member.id,
      memberName,
      stayCode: row.stayCode,
      stayName: STAY_NAMES[row.stayCode] || row.stayCode,
      week: row.week,
      role: row.posteRaw,
      roleKey: row.roleKey,
      startDate: dates.startDate || "",
      endDate: dates.endDate || "",
      primeCount: row.primeCount,
      netSalary: row.netSalary,
      grossSalary: row.grossSalary,
      paidAmount: row.paidAmount,
      outstandingAmount: Math.max(row.grossSalary - row.paidAmount, 0),
      contractFileUrl: "",
      source: "Finances 2026 - RH.csv",
    },
  });
}

for (let i = 0; i < writes.length; i += 450) {
  const batch = writeBatch(db);
  for (const w of writes.slice(i, i + 450)) {
    batch.set(doc(db, "staff_contracts", w.id), w.data, { merge: true });
  }
  await batch.commit();
}

console.log(`🎉  Terminé : ${updatedCount} contrat(s) existant(s) mis à jour, ${insertedCount} nouveau(x) contrat(s) créé(s), ${createdMembersCount} nouvelle(s) fiche(s) membre créée(s).\n`);
