import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
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
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";
const SOURCE_LISTS = [
  "Offre juillet 2026 - priorite 1",
  "Offre juillet 2026 - priorite 2",
  "Offre juillet 2026 - priorite 3",
];
const TARGET_LIST = "News";

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
  return String(value || "").toLowerCase().trim();
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
  return snap.size;
}

async function createOrResetTargetList() {
  const existing = await findListByName(TARGET_LIST);
  if (existing[0]) {
    const target = existing[0];
    await deleteContactsForList(target.id);
    await setDoc(doc(db, LISTS, target.id), {
      name: TARGET_LIST,
      count: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return target.id;
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
  const sourceLists = [];
  for (const name of SOURCE_LISTS) {
    const matches = await findListByName(name);
    sourceLists.push(...matches);
  }

  if (!sourceLists.length) {
    throw new Error("Aucune liste source trouvee.");
  }

  const unsubSnap = await getDocs(collection(db, UNSUB));
  const unsubscribed = new Set(unsubSnap.docs.map(d => normalizeEmail(d.data().email || d.id)));

  const byEmail = new Map();
  let sourceContacts = 0;

  for (const list of sourceLists) {
    const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", list.id)));
    sourceContacts += snap.size;
    for (const contactDoc of snap.docs) {
      const contact = contactDoc.data();
      const email = normalizeEmail(contact.email);
      if (!email || unsubscribed.has(email)) continue;
      const existing = byEmail.get(email);
      const existingScore = Number(existing?.scorePertinence || 0);
      const score = Number(contact.scorePertinence || 0);
      if (!existing || score > existingScore) {
        byEmail.set(email, { ...contact, email });
      }
    }
  }

  const targetListId = await createOrResetTargetList();
  const contacts = [...byEmail.values()].sort((a, b) => {
    return (Number(b.scorePertinence) || 0) - (Number(a.scorePertinence) || 0)
      || a.email.localeCompare(b.email);
  });

  for (let i = 0; i < contacts.length; i += 450) {
    const batch = writeBatch(db);
    contacts.slice(i, i + 450).forEach(contact => {
      const ref = doc(collection(db, CONTACTS));
      batch.set(ref, {
        ...contact,
        listId: targetListId,
      });
    });
    await batch.commit();
  }

  await setDoc(doc(db, LISTS, targetListId), {
    name: TARGET_LIST,
    count: contacts.length,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  let deletedContacts = 0;
  for (const list of sourceLists) {
    deletedContacts += await deleteContactsForList(list.id);
    await deleteDoc(doc(db, LISTS, list.id));
  }

  console.log(`Source lists: ${sourceLists.length}`);
  console.log(`Source contacts scanned: ${sourceContacts}`);
  console.log(`News contacts created: ${contacts.length}`);
  console.log(`Source contacts deleted: ${deletedContacts}`);
  console.log(`Source lists deleted: ${sourceLists.map(l => l.name).join(", ")}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
