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
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const ROOT = process.cwd();
const LIST_NAME = "colocrew news";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";
const KEYWORDS = [
  "finance",
  "finances",
  "douane",
  "douanes",
  "police",
  "gendarmerie",
  "gendarme",
  "chasse",
  "chasseur",
  "chasseurs",
];

loadEnv(path.join(ROOT, ".env.local"));

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

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function shouldRemove(contact) {
  const haystack = [
    contact.email,
    contact.organisation,
    contact.categorie,
    contact.type,
    contact.source,
  ].map(normalize).join(" ");
  return KEYWORDS.some(keyword => haystack.includes(keyword));
}

const listSnap = await getDocs(query(collection(db, LISTS), where("name", "==", LIST_NAME)));
if (listSnap.empty) {
  throw new Error(`Liste introuvable: ${LIST_NAME}`);
}

let totalDeleted = 0;
const removedEmails = new Set();

for (const listDoc of listSnap.docs) {
  const contactsSnap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listDoc.id)));
  const matches = contactsSnap.docs.filter(contactDoc => shouldRemove(contactDoc.data()));

  for (let i = 0; i < matches.length; i += 450) {
    const batch = writeBatch(db);
    matches.slice(i, i + 450).forEach(contactDoc => {
      removedEmails.add(normalize(contactDoc.data().email));
      batch.delete(contactDoc.ref);
    });
    await batch.commit();
  }

  totalDeleted += matches.length;
  if (matches.length) {
    await updateDoc(doc(db, LISTS, listDoc.id), { count: increment(-matches.length) });
  }
}

for (const email of removedEmails) {
  if (!email) continue;
  await setDoc(doc(db, UNSUB, email), {
    email,
    reason: "categorie_exclue:finances_douanes_police_gendarmerie_chasse",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

console.log(`Deleted from ${LIST_NAME}: ${totalDeleted}`);
console.log(`Blacklisted: ${removedEmails.size}`);
