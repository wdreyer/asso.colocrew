import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const CSV_PATH = process.argv[2] || "C:/Users/dreye/Downloads/contacts_ASE_protection_enfance - contacts_ASE_protection_enfance.csv.csv";
const TARGET_LIST = "ASE";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";

loadEnv(".env.local");

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
      if (quoted && next === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (ch === "," || ch === ";")) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += ch;
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map(cells => Object.fromEntries(headers.map((h, i) => [h, (cells[i] || "").trim()])));
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name)));
  return snap.docs[0] || null;
}

async function deleteContactsForList(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(contactDoc => batch.delete(contactDoc.ref));
    await batch.commit();
  }
  return snap.size;
}

const existingListDoc = await findListByName(TARGET_LIST);
let listId;
let removedFromExistingTarget = 0;

if (existingListDoc) {
  listId = existingListDoc.id;
  removedFromExistingTarget = await deleteContactsForList(listId);
  await setDoc(doc(db, LISTS, listId), {
    name: TARGET_LIST,
    count: 0,
    updatedAt: serverTimestamp(),
  }, { merge: true });
} else {
  const ref = await addDoc(collection(db, LISTS), {
    name: TARGET_LIST,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  listId = ref.id;
}

const unsubSnap = await getDocs(collection(db, UNSUB));
const unsubscribed = new Set(unsubSnap.docs.map(d => cleanEmail(d.data().email || d.id)).filter(Boolean));

const allContactsSnap = await getDocs(collection(db, CONTACTS));
const existingEmails = new Set(
  allContactsSnap.docs
    .filter(d => d.data().listId !== listId)
    .map(d => cleanEmail(d.data().email))
    .filter(Boolean),
);

const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
const byEmail = new Map();
let invalid = 0;
let duplicateInCsv = 0;
let alreadyExisting = 0;
let blacklisted = 0;

for (const row of rows) {
  const email = cleanEmail(pick(row, ["email", "mail", "e_mail"]));
  if (!email) {
    invalid++;
    continue;
  }
  if (unsubscribed.has(email)) {
    blacklisted++;
    continue;
  }
  if (existingEmails.has(email)) {
    alreadyExisting++;
    continue;
  }
  if (byEmail.has(email)) {
    duplicateInCsv++;
    continue;
  }
  byEmail.set(email, {
    email,
    prenom: "",
    nom: "",
    organisation: pick(row, ["organisation", "structure", "etablissement"]),
    categorie: "ASE / Protection Enfance",
    type: pick(row, ["type"]) || "ASE / Protection Enfance",
    departement: pick(row, ["departement", "d_partement"]),
    commune: pick(row, ["commune", "ville"]),
    source: path.basename(CSV_PATH),
  });
}

const contacts = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));

for (let i = 0; i < contacts.length; i += 450) {
  const batch = writeBatch(db);
  contacts.slice(i, i + 450).forEach(contact => {
    batch.set(doc(collection(db, CONTACTS)), {
      ...contact,
      listId,
    });
  });
  await batch.commit();
}

await setDoc(doc(db, LISTS, listId), {
  name: TARGET_LIST,
  count: contacts.length,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log(`CSV rows: ${rows.length}`);
console.log(`Removed from existing ASE list before import: ${removedFromExistingTarget}`);
console.log(`Imported into ASE: ${contacts.length}`);
console.log(`Skipped already in other lists: ${alreadyExisting}`);
console.log(`Skipped blacklist/STOP: ${blacklisted}`);
console.log(`Skipped duplicates inside CSV: ${duplicateInCsv}`);
console.log(`Skipped invalid email rows: ${invalid}`);
