import fs from "node:fs";
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

const CSV_PATH = "tmp_overpass_atlantique_merged_enriched.csv";
const TARGET_LIST = "hébergements web atlantique";
const MAX_COAST_KM = 20;
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";

const ATLANTIC_COAST = [
  [43.37, -1.78],
  [43.48, -1.56],
  [43.66, -1.44],
  [44.20, -1.30],
  [44.65, -1.25],
  [44.98, -1.20],
  [45.51, -1.13],
  [45.75, -1.13],
];

loadEnv(".env.local");

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
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
      continue;
    }
    if (!quoted && ch === ",") { row.push(value.trim()); value = ""; continue; }
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
  const headers = rows.shift() || [];
  return rows.map(cells => Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""])));
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function toNumber(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const phi1 = aLat * Math.PI / 180;
  const phi2 = bLat * Math.PI / 180;
  const dPhi = (bLat - aLat) * Math.PI / 180;
  const dLambda = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function distanceToAtlanticKm(lat, lon) {
  let best = Infinity;
  for (let i = 0; i < ATLANTIC_COAST.length - 1; i++) {
    const [aLat, aLon] = ATLANTIC_COAST[i];
    const [bLat, bLon] = ATLANTIC_COAST[i + 1];
    for (let step = 0; step <= 40; step++) {
      const t = step / 40;
      best = Math.min(best, haversineKm(lat, lon, aLat + (bLat - aLat) * t, aLon + (bLon - aLon) * t));
    }
  }
  return best;
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function deleteContactsForList(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(contactDoc => batch.delete(contactDoc.ref));
    await batch.commit();
  }
}

async function createOrResetTargetList() {
  const existing = await findListByName(TARGET_LIST);
  if (existing[0]) {
    await deleteContactsForList(existing[0].id);
    await setDoc(doc(db, LISTS, existing[0].id), { name: TARGET_LIST, count: 0, updatedAt: serverTimestamp() }, { merge: true });
    return existing[0].id;
  }
  const ref = await addDoc(collection(db, LISTS), { name: TARGET_LIST, count: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
const unsubSnap = await getDocs(collection(db, UNSUB));
const unsubscribed = new Set(unsubSnap.docs.map(d => cleanEmail(d.data().email || d.id)).filter(Boolean));
const allContactsSnap = await getDocs(collection(db, CONTACTS));
const existingEmails = new Set(allContactsSnap.docs.map(d => cleanEmail(d.data().email)).filter(Boolean));

const byEmail = new Map();
let withEmail = 0;
let near = 0;
let alreadyKnown = 0;
let blacklisted = 0;

for (const row of rows) {
  const email = cleanEmail(row.email);
  if (!email) continue;
  withEmail++;
  if (unsubscribed.has(email)) { blacklisted++; continue; }
  if (existingEmails.has(email)) { alreadyKnown++; continue; }
  const lat = toNumber(row.lat);
  const lon = toNumber(row.lon);
  if (lat === null || lon === null) continue;
  const distanceCoteKm = Math.round(distanceToAtlanticKm(lat, lon) * 10) / 10;
  if (distanceCoteKm > MAX_COAST_KM) continue;
  near++;
  const contact = {
    email,
    prenom: "",
    nom: "",
    organisation: row.name || "",
    categorie: row.type || "hebergement",
    type: row.type || "hebergement",
    phone: row.phone || "",
    website: row.website || "",
    contactPage: row.contact_page || "",
    address: row.address || "",
    postalCode: row.postal_code || "",
    commune: row.city || "",
    departement: row.department || "",
    lat,
    lon,
    distanceCoteKm,
    source: row.source || "OSM/Overpass + site web",
  };
  const existing = byEmail.get(email);
  if (!existing || distanceCoteKm < existing.distanceCoteKm) byEmail.set(email, contact);
}

const contacts = [...byEmail.values()].sort((a, b) => a.distanceCoteKm - b.distanceCoteKm || a.email.localeCompare(b.email));
const listId = await createOrResetTargetList();

for (let i = 0; i < contacts.length; i += 450) {
  const batch = writeBatch(db);
  contacts.slice(i, i + 450).forEach(contact => {
    const ref = doc(collection(db, CONTACTS));
    batch.set(ref, { ...contact, listId });
  });
  await batch.commit();
}

await setDoc(doc(db, LISTS, listId), { name: TARGET_LIST, count: contacts.length, updatedAt: serverTimestamp() }, { merge: true });

console.log(`Rows from OSM/web: ${rows.length}`);
console.log(`Rows with email after enrichment: ${withEmail}`);
console.log(`Skipped already in existing lists: ${alreadyKnown}`);
console.log(`Skipped blacklist: ${blacklisted}`);
console.log(`New near coast candidates: ${near}`);
console.log(`Imported into ${TARGET_LIST}: ${contacts.length}`);
