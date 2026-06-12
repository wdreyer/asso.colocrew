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

const ROOT = process.cwd();
const CSV_PATH = "c:/Users/dreye/Downloads/8220274-6a1858c8957c32dc70bdfa05-rBIK1W.csv";
const TARGET_LIST = "colocrew news";
const EXISTING_LIST = "Offre juillet 2026 - tous";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";

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

function normalizeEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function parseCsvEmails(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
  const emailIndex = headers.findIndex(h => h === "email" || h === "mail" || h === "e-mail");
  if (emailIndex === -1) throw new Error("Colonne EMAIL introuvable.");

  const emails = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    const email = normalizeEmail(cells[emailIndex]);
    if (email) emails.push(email);
  }
  return emails;
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getEmailsForList(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  return new Set(snap.docs.map(d => normalizeEmail(d.data().email)).filter(Boolean));
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

async function createOrResetTargetList() {
  const matches = await findListByName(TARGET_LIST);
  if (matches[0]) {
    await deleteContactsForList(matches[0].id);
    await setDoc(doc(db, LISTS, matches[0].id), {
      name: TARGET_LIST,
      count: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return matches[0].id;
  }

  const ref = await addDoc(collection(db, LISTS), {
    name: TARGET_LIST,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function main() {
  const rawEmails = parseCsvEmails(CSV_PATH);
  const uniqueEmails = new Set(rawEmails);

  const unsubSnap = await getDocs(collection(db, UNSUB));
  const unsubscribed = new Set(unsubSnap.docs.map(d => normalizeEmail(d.data().email || d.id)).filter(Boolean));

  const existingLists = await findListByName(EXISTING_LIST);
  const existingEmails = new Set();
  for (const list of existingLists) {
    const listEmails = await getEmailsForList(list.id);
    listEmails.forEach(email => existingEmails.add(email));
  }

  const emailsToImport = [...uniqueEmails]
    .filter(email => !unsubscribed.has(email))
    .filter(email => !existingEmails.has(email))
    .sort();

  const targetListId = await createOrResetTargetList();

  for (let i = 0; i < emailsToImport.length; i += 450) {
    const batch = writeBatch(db);
    emailsToImport.slice(i, i + 450).forEach(email => {
      const ref = doc(collection(db, CONTACTS));
      batch.set(ref, {
        listId: targetListId,
        email,
        prenom: "",
        nom: "",
        source: path.basename(CSV_PATH),
      });
    });
    await batch.commit();
  }

  await setDoc(doc(db, LISTS, targetListId), {
    name: TARGET_LIST,
    count: emailsToImport.length,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log(`CSV rows: ${rawEmails.length}`);
  console.log(`Unique emails in CSV: ${uniqueEmails.size}`);
  console.log(`Already in ${EXISTING_LIST}: ${[...uniqueEmails].filter(email => existingEmails.has(email)).length}`);
  console.log(`Blacklisted skipped: ${[...uniqueEmails].filter(email => unsubscribed.has(email)).length}`);
  console.log(`${TARGET_LIST} created: ${emailsToImport.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
