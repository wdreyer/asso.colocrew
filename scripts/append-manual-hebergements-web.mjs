import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const CSV_PATH = process.argv[2] || "tmp_hebergements_web_manual_2026-05-29.csv";
const TARGET_LIST = "hébergements web atlantique";
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

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : "";
}

function parseSimpleCsv(path) {
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",");
  return lines.map(line => {
    const parts = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, parts[i] || ""]));
  });
}

const listSnap = await getDocs(query(collection(db, LISTS), where("name", "==", TARGET_LIST)));
if (listSnap.empty) throw new Error(`Liste introuvable: ${TARGET_LIST}`);
const listId = listSnap.docs[0].id;

const unsubSnap = await getDocs(collection(db, UNSUB));
const unsubscribed = new Set(unsubSnap.docs.map(d => cleanEmail(d.data().email || d.id)).filter(Boolean));
const allContactsSnap = await getDocs(collection(db, CONTACTS));
const existingEmails = new Set(allContactsSnap.docs.map(d => cleanEmail(d.data().email)).filter(Boolean));

const rows = parseSimpleCsv(CSV_PATH);
const toAdd = [];
for (const row of rows) {
  const email = cleanEmail(row.email);
  if (!email || unsubscribed.has(email) || existingEmails.has(email)) continue;
  existingEmails.add(email);
  toAdd.push({
    listId,
    email,
    prenom: "",
    nom: "",
    organisation: row.name || "",
    categorie: "hebergement",
    type: "hebergement",
    source: row.source || "recherche web",
  });
}

for (let i = 0; i < toAdd.length; i += 450) {
  const batch = writeBatch(db);
  toAdd.slice(i, i + 450).forEach(contact => {
    batch.set(doc(collection(db, CONTACTS)), contact);
  });
  await batch.commit();
}

if (toAdd.length) {
  await updateDoc(doc(db, LISTS, listId), {
    count: increment(toAdd.length),
    updatedAt: serverTimestamp(),
  });
}

console.log(`Manual candidates: ${rows.length}`);
console.log(`Added: ${toAdd.length}`);
