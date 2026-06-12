import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const ROOT = process.cwd();
const RUNS = "campagne_runs";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";

loadEnv(path.join(ROOT, ".env.local"));

const runId = process.argv[2];
if (!runId) throw new Error("Usage: node scripts/remove-sent-from-run.mjs <runId>");

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

function norm(email) {
  return String(email || "").toLowerCase().trim();
}

const runRef = doc(db, RUNS, runId);
const runSnap = await getDoc(runRef);
if (!runSnap.exists()) throw new Error(`Run introuvable: ${runId}`);

const run = runSnap.data();
const eventsSnap = await getDocs(collection(runRef, "events"));
const sentEmails = new Set(
  eventsSnap.docs
    .map(d => d.data())
    .filter(ev => ev.type === "sent")
    .map(ev => norm(ev.email))
    .filter(Boolean)
);

if (!sentEmails.size) {
  console.log("Aucun email sent trouve.");
  process.exit(0);
}

let targetListIds = [];
if (run.listId) {
  targetListIds = [run.listId];
} else {
  const listSnap = await getDocs(query(collection(db, LISTS), where("name", "==", "Offre juillet 2026 - priorite 1")));
  targetListIds = listSnap.docs.map(d => d.id);
}

if (!targetListIds.length) {
  throw new Error("Liste cible introuvable.");
}

let deleted = 0;
const perList = new Map();

for (const email of sentEmails) {
  for (const listId of targetListIds) {
    const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId), where("email", "==", email)));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach(contactDoc => {
        batch.delete(contactDoc.ref);
        deleted++;
        perList.set(listId, (perList.get(listId) || 0) + 1);
      });
      await batch.commit();
    }
  }

  await setDoc(doc(db, UNSUB, email), {
    email,
    reason: `already_sent:${runId}`,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

for (const [listId, count] of perList.entries()) {
  await updateDoc(doc(db, LISTS, listId), { count: increment(-count) });
}

console.log(`Run: ${runId}`);
console.log(`Sent emails found: ${sentEmails.size}`);
console.log(`Deleted from priority list: ${deleted}`);
console.log(`Blacklisted: ${sentEmails.size}`);
