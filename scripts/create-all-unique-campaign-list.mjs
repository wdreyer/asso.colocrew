import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
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
const UNSUBSCRIBES = "campagne_unsubscribes";
const LIST_NAME = "Tous les mails uniques";

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

if (!firebaseConfig.projectId) {
  throw new Error("Configuration Firebase manquante. Verifiez .env.local.");
}

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

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function scoreContact(contact) {
  return Number(contact.scorePertinence || contact.relevanceScore || contact.originalScore || 0);
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name), limit(1)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function upsertList(name) {
  const existing = await findListByName(name);
  if (existing) {
    await deleteListContacts(existing.id);
    await setDoc(doc(db, LISTS, existing.id), {
      name,
      count: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return existing.id;
  }

  const ref = await addDoc(collection(db, LISTS), {
    name,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function deleteListContacts(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((contactDoc) => batch.delete(contactDoc.ref));
    await batch.commit();
  }
}

async function getUnsubscribedEmails() {
  const snap = await getDocs(collection(db, UNSUBSCRIBES));
  return new Set(snap.docs.map((d) => cleanEmail(d.data().email || d.id)).filter(Boolean));
}

async function getUniqueContacts() {
  const [contactsSnap, unsubscribed] = await Promise.all([
    getDocs(collection(db, CONTACTS)),
    getUnsubscribedEmails(),
  ]);
  const byEmail = new Map();
  let invalid = 0;
  let skippedUnsubscribed = 0;

  contactsSnap.docs.forEach((contactDoc) => {
    const data = contactDoc.data();
    const email = cleanEmail(data.email);
    if (!email) {
      invalid++;
      return;
    }
    if (unsubscribed.has(email)) {
      skippedUnsubscribed++;
      return;
    }

    const contact = {
      email,
      prenom: data.prenom || "",
      nom: data.nom || "",
      organisation: data.organisation || "",
      categorie: data.categorie || data.category || "",
      type: data.type || "",
      departement: data.departement || "",
      commune: data.commune || "",
      pertinence: data.pertinence || "",
      scorePertinence: scoreContact(data),
      source: data.source || "",
    };

    const existing = byEmail.get(email);
    if (!existing || scoreContact(contact) > scoreContact(existing)) {
      byEmail.set(email, contact);
    }
  });

  return {
    contacts: [...byEmail.values()].sort((a, b) => scoreContact(b) - scoreContact(a) || a.email.localeCompare(b.email)),
    scanned: contactsSnap.size,
    invalid,
    skippedUnsubscribed,
  };
}

async function writeContacts(listId, contacts) {
  for (let i = 0; i < contacts.length; i += 450) {
    const batch = writeBatch(db);
    contacts.slice(i, i + 450).forEach((contact) => {
      const ref = doc(collection(db, CONTACTS));
      batch.set(ref, {
        ...contact,
        listId,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`Ecriture: ${Math.min(i + 450, contacts.length)}/${contacts.length}`);
  }

  await setDoc(doc(db, LISTS, listId), {
    count: contacts.length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function main() {
  const { contacts, scanned, invalid, skippedUnsubscribed } = await getUniqueContacts();
  const listId = await upsertList(LIST_NAME);
  await writeContacts(listId, contacts);

  console.log(`Liste creee/mise a jour: ${LIST_NAME}`);
  console.log(`ID liste: ${listId}`);
  console.log(`Contacts scannes: ${scanned}`);
  console.log(`Emails uniques ajoutes: ${contacts.length}`);
  console.log(`Emails invalides ignores: ${invalid}`);
  console.log(`Desinscrits ignores: ${skippedUnsubscribed}`);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
