import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const ROOT = process.cwd();
const CONTACTS_COLL = "campagne_contacts";
const LISTS_COLL = "campagne_listes";
const UNSUB_COLL = "campagne_unsubscribes";

loadEnv(path.join(ROOT, ".env.local"));

const target = String(process.argv[2] || "").trim();
if (!target) {
  throw new Error("Usage: node scripts/remove-campagne-email.mjs email@example.com|file.csv");
}

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
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const emails = readTargets(target);
const snap = await getDocs(query(collection(db, CONTACTS_COLL)));
const perList = new Map();
const domain = target.toLowerCase().trim().replace(/^@/, "");
const removeByDomain = isDomainTarget(target);
const matches = snap.docs.filter((contactDoc) => {
  const email = normalizeEmail(contactDoc.data().email);
  return removeByDomain ? email.endsWith(`@${domain}`) : emails.has(email);
});

for (let i = 0; i < matches.length; i += 450) {
  const batch = writeBatch(db);
  matches.slice(i, i + 450).forEach((contactDoc) => {
    const listId = contactDoc.data().listId;
    if (listId) perList.set(listId, (perList.get(listId) || 0) + 1);
    batch.delete(contactDoc.ref);
  });
  await batch.commit();
}

for (const [listId, count] of perList.entries()) {
  await updateDoc(doc(db, LISTS_COLL, listId), { count: increment(-count) });
}

const blacklistEmails = new Set(emails);
if (removeByDomain) {
  matches.forEach((contactDoc) => blacklistEmails.add(normalizeEmail(contactDoc.data().email)));
}

for (const email of blacklistEmails) {
  await setDoc(doc(db, UNSUB_COLL, email), {
    email,
    reason: removeByDomain ? `STOP/domain:${domain}` : "STOP/logs",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

console.log(`Targets: ${removeByDomain ? `domain ${domain}` : `${emails.size} email(s)`}`);
console.log(`Deleted ${matches.length} occurrence(s) from ${CONTACTS_COLL}`);
console.log(`Added ${blacklistEmails.size} email(s) to ${UNSUB_COLL}`);

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function readTargets(value) {
  if (isDomainTarget(value)) return new Set();

  const resolved = path.resolve(value);
  if (fs.existsSync(resolved)) {
    const content = fs.readFileSync(resolved, "utf8");
    const matches = content.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    const colocrewSenders = new Set([
      "contact@colocrew.com",
      "equipe@colocrew.com",
      "sejours@colocrew.com",
      "bonjour@colocrew.com",
      "inscription@colocrew.com",
      "inscriptions@colocrew.com",
      "famille@colocrew.com",
      "aventure@colocrew.com",
      "vacances@colocrew.com",
      "info@colocrew.com",
      "animation@colocrew.com",
      "w.dreyer@colocrew.com",
      "partenaires@colocrew.com",
    ]);
    return new Set(matches.map(normalizeEmail).filter((email) => !colocrewSenders.has(email)));
  }

  const email = normalizeEmail(value);
  if (!email.includes("@")) throw new Error(`Email ou fichier invalide: ${value}`);
  return new Set([email]);
}

function isDomainTarget(value) {
  const normalized = String(value || "").toLowerCase().trim().replace(/^@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized) && !normalized.includes("/");
}
