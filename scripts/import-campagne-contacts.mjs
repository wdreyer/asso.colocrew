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
const DOWNLOADS = "c:/Users/dreye/Downloads";

const FILES = [
  "3000_contacts_qualite.csv",
  "contacts_prenomnom.csv",
  "contacts_ASE_protection_enfance.csv",
  "Mail propres Sans doublon liste final.  - Contacts.csv",
].map((name) => path.join(DOWNLOADS, name));

const LIST_PREFIX = "Offre juillet 2026";
const CONTACTS_COLL = "campagne_contacts";
const LISTS_COLL = "campagne_listes";

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
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (cells[index] || "").trim();
    });
    return obj;
  });
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (!match) return "";
  return match[0].replace(/[),.;:]+$/g, "");
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function getRawEmail(row) {
  return pick(row, ["email", "e_mail", "mail", "mail_", "mail"]);
}

function computeRelevance(contact) {
  const haystack = [
    contact.organisation,
    contact.category,
    contact.type,
    contact.commune,
    contact.source,
  ].join(" ").toLowerCase();

  let score = Number(contact.originalScore || 0);

  const rules = [
    [/ase|protection enfance|crip|adoption|mineurs isoles|mecs|aemo|foyer|enfance/, 40],
    [/mission locale|insertion|jeune|jeunesse|pij|bij|information jeunesse/, 30],
    [/ccas|social|famille|solidarite|prevention|centre social|maison des jeunes/, 22],
    [/mairie|communaute de communes|departement|conseil departemental|metropole/, 12],
    [/sport|education|association|animation|vacances|loisirs/, 8],
  ];

  for (const [regex, points] of rules) {
    if (regex.test(haystack)) score += points;
  }

  if (contact.email.includes("noreply") || contact.email.includes("no-reply")) score -= 100;
  if (contact.email.startsWith("contact@") || contact.email.startsWith("accueil@")) score += 3;
  if (contact.email.startsWith("direction@") || contact.email.startsWith("jeunesse@")) score += 5;

  return score;
}

function relevanceLabel(score) {
  if (score >= 40) return "priorite-1";
  if (score >= 22) return "priorite-2";
  return "priorite-3";
}

function readContacts() {
  const byEmail = new Map();

  for (const file of FILES) {
    if (!fs.existsSync(file)) throw new Error(`Fichier introuvable: ${file}`);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    const source = path.basename(file);

    for (const row of rows) {
      const email = cleanEmail(getRawEmail(row));
      if (!email) continue;

      const contact = {
        email,
        prenom: pick(row, ["prenom", "firstname", "first_name"]),
        nom: pick(row, ["nom", "lastname", "last_name", "who"]),
        organisation: pick(row, ["organisation", "structure", "etablissement", "who"]),
        category: pick(row, ["categorie", "category"]),
        type: pick(row, ["type"]),
        departement: pick(row, ["departement"]),
        commune: pick(row, ["commune", "ville"]),
        source,
        originalScore: pick(row, ["score"]),
      };
      contact.relevanceScore = computeRelevance(contact);
      contact.relevance = relevanceLabel(contact.relevanceScore);

      const existing = byEmail.get(email);
      if (!existing || contact.relevanceScore > existing.relevanceScore) {
        byEmail.set(email, contact);
      } else if (existing.source && !existing.source.includes(source)) {
        existing.source = `${existing.source}; ${source}`;
      }
    }
  }

  return [...byEmail.values()].sort((a, b) => b.relevanceScore - a.relevanceScore || a.email.localeCompare(b.email));
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS_COLL), where("name", "==", name), limit(1)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function upsertList(name) {
  const existing = await findListByName(name);
  if (existing) {
    await deleteListContacts(existing.id);
    await setDoc(doc(db, LISTS_COLL, existing.id), { name, count: 0, updatedAt: serverTimestamp() }, { merge: true });
    return existing.id;
  }

  const ref = await addDoc(collection(db, LISTS_COLL), {
    name,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function deleteListContacts(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS_COLL), where("listId", "==", listId)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((contactDoc) => batch.delete(contactDoc.ref));
    await batch.commit();
  }
}

async function writeContacts(listId, contacts) {
  for (let i = 0; i < contacts.length; i += 450) {
    const batch = writeBatch(db);
    contacts.slice(i, i + 450).forEach((contact) => {
      const ref = doc(collection(db, CONTACTS_COLL));
      batch.set(ref, {
        listId,
        email: contact.email,
        prenom: contact.prenom || "",
        nom: contact.nom || "",
        organisation: contact.organisation || "",
        categorie: contact.category || "",
        type: contact.type || "",
        departement: contact.departement || "",
        commune: contact.commune || "",
        pertinence: contact.relevance,
        scorePertinence: contact.relevanceScore,
        source: contact.source,
      });
    });
    await batch.commit();
  }

  await setDoc(doc(db, LISTS_COLL, listId), { count: contacts.length, updatedAt: serverTimestamp() }, { merge: true });
}

async function main() {
  const contacts = readContacts();
  const groups = [
    { name: `${LIST_PREFIX} - priorite 1`, contacts: contacts.filter((c) => c.relevance === "priorite-1") },
    { name: `${LIST_PREFIX} - priorite 2`, contacts: contacts.filter((c) => c.relevance === "priorite-2") },
    { name: `${LIST_PREFIX} - priorite 3`, contacts: contacts.filter((c) => c.relevance === "priorite-3") },
    { name: `${LIST_PREFIX} - tous`, contacts },
  ];

  for (const group of groups) {
    const listId = await upsertList(group.name);
    await writeContacts(listId, group.contacts);
    console.log(`${group.name}: ${group.contacts.length} contacts`);
  }

  console.log(`Total dedoublonne: ${contacts.length} contacts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
