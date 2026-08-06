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
const UNSUB = "campagne_unsubscribes";
const TARGET_NAME = "Offre aout 2026 - 5000 fiables";
const TARGET_SIZE = Number(process.env.TARGET_SIZE || 5000);
const APPLY = process.argv.includes("--apply");

loadEnv(path.join(ROOT, ".env.local"));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId:
        process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "",
    });

const db = getFirestore(app);

const [contactsSnap, listsSnap, unsubSnap] = await Promise.all([
  getDocs(collection(db, CONTACTS)),
  getDocs(collection(db, LISTS)),
  getDocs(collection(db, UNSUB)),
]);

const listNames = new Map(listsSnap.docs.map((item) => [item.id, item.data().name || item.id]));
const unsubscribed = new Set(unsubSnap.docs.map((item) => cleanEmail(item.data().email || item.id)).filter(Boolean));
const byEmail = new Map();
const stats = {
  totalDocs: contactsSnap.size,
  invalidEmail: 0,
  unsubscribed: 0,
  excludedMairie: 0,
  excludedIrrelevant: 0,
  excludedLowScore: 0,
  deduped: 0,
};

for (const contactDoc of contactsSnap.docs) {
  const raw = contactDoc.data() || {};
  const email = cleanEmail(raw.email);
  if (!email) {
    stats.invalidEmail += 1;
    continue;
  }
  if (unsubscribed.has(email)) {
    stats.unsubscribed += 1;
    continue;
  }

  const contact = {
    ...raw,
    id: contactDoc.id,
    email,
    listName: listNames.get(raw.listId) || "",
  };
  const profile = profileContact(contact);

  if (profile.exclude === "mairie") {
    stats.excludedMairie += 1;
    continue;
  }
  if (profile.exclude === "irrelevant") {
    stats.excludedIrrelevant += 1;
    continue;
  }
  if (profile.score < 28) {
    stats.excludedLowScore += 1;
    continue;
  }

  const candidate = {
    ...contact,
    score: profile.score,
    reliableTags: profile.tags,
    selectionReason: profile.tags.join(", "),
  };
  const existing = byEmail.get(email);
  if (!existing || candidate.score > existing.score) {
    if (existing) stats.deduped += 1;
    byEmail.set(email, candidate);
  } else {
    stats.deduped += 1;
  }
}

const selected = [...byEmail.values()]
  .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
  .slice(0, TARGET_SIZE);

const tagCounts = {};
const sourceCounts = {};
for (const item of selected) {
  for (const tag of item.reliableTags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  sourceCounts[item.listName] = (sourceCounts[item.listName] || 0) + 1;
}

if (APPLY) {
  const listId = await upsertList(TARGET_NAME);
  await replaceListContacts(listId, selected);
}

const report = {
  mode: APPLY ? "apply" : "dry-run",
  listName: TARGET_NAME,
  selected: selected.length,
  targetSize: TARGET_SIZE,
  stats,
  tagCounts: sortObject(tagCounts),
  sourceCounts: sortObject(sourceCounts),
  sample: selected.slice(0, 30).map(reportRow),
};

fs.writeFileSync("tmp_reliable_5000_aout_2026.json", JSON.stringify({ ...report, contacts: selected.map(reportRow) }, null, 2));
fs.writeFileSync("tmp_reliable_5000_aout_2026.csv", toCsv(selected.map(reportRow)));
console.log(JSON.stringify(report, null, 2));
process.exit(0);

function profileContact(contact) {
  const haystack = normalizeText([
    contact.email,
    contact.prenom,
    contact.nom,
    contact.organisation,
    contact.categorie,
    contact.category,
    contact.type,
    contact.commune,
    contact.departement,
    contact.source,
    contact.listName,
  ].join(" "));

  const tags = [];
  let score = Number(contact.scorePertinence || 0) / 8;
  const add = (tag, points, regex) => {
    if (regex.test(haystack)) {
      tags.push(tag);
      score += points;
    }
  };

  const mairie =
    /\b(mairie|hotel de ville|commune de|commune d |commune |municipal|municipale|municipaux|ville de|ville d |conseil municipal|maire\b|etat civil)\b/.test(haystack)
    || /(^mairie[.@_-]|[.@_-]mairie@|@mairie-|@ville-|@commune-|@.*mairie\.|@.*ville\.)/.test(contact.email);
  if (mairie) return { score: 0, tags, exclude: "mairie" };

  const irrelevant =
    /\b(hebergement|camping|hotel|gite|chambre d hote|reservation|tourisme|office de tourisme|restaurant|traiteur|immobilier|finance|finances|douane|douanes|police|gendarmerie|chasse|chasseur|presse|media|communication|urbanisme|voirie|dechets|assainissement|eau potable|marches publics)\b/.test(haystack)
    || /\b(no-?reply|noreply|nepasrepondre|mailer-daemon|postmaster|webmaster)\b/.test(haystack);
  if (irrelevant) return { score: 0, tags, exclude: "irrelevant" };

  add("ase-protection-enfance", 100, /\b(ase|aide sociale a l enfance|protection enfance|protection de l enfance|mecs|aemo|aed|sauvegarde de l enfance|foyer de l enfance|maison d enfants|village d enfants|pjj|protection judiciaire jeunesse|prevention specialisee|mineurs non accompagnes|mna|adpep|pep)\b/);
  add("centre-social", 90, /\b(centre social|centres sociaux|csc|csx|espace social|maison de quartier|maison des habitants|regie de quartier)\b/);
  add("mjc-education-populaire", 85, /\b(mjc|maison des jeunes|maison des jeunes et de la culture|mpt|maison pour tous|francas|ligue de l enseignement|cemea|leo lagrange|ufcv|familles rurales|foyer rural)\b/);
  add("jeunesse-animation-loisirs", 70, /\b(service jeunesse|jeunesse|animation jeunesse|espace jeunes|accueil jeunes|club jeunes|loisirs jeunes|accueil de loisirs|alsh|centre de loisirs|sejour jeunesse|vacances enfants|colonie|colos)\b/);
  add("info-jeunes-mission-locale", 55, /\b(info jeunes|bij|pij|crij|mission locale|mlj|insertion professionnelle et sociale des jeunes|garantie jeunes)\b/);
  add("social-familles", 45, /\b(social|solidarite|famille|familial|parentalite|ccas|cias|udaf|association familiale|maison des solidarites|centre medico social|cms|mds|mda|caf|caisse allocations familiales)\b/);
  add("education-handicap", 32, /\b(ime|itep|sessad|institut medico educatif|handicap|inclusion|education specialisee)\b/);

  if (/^(direction|jeunesse|animation|contact|accueil|secretariat|servicejeunesse|enfance|famille|social|vacances|loisirs|pij|bij)[.@_-]/.test(contact.email)) {
    score += 10;
  }
  if (!tags.length) score -= 80;

  return { score: Math.round(score), tags, exclude: "" };
}

async function upsertList(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name), limit(1)));
  if (!snap.empty) {
    const listId = snap.docs[0].id;
    await deleteContactsForList(listId);
    await setDoc(doc(db, LISTS, listId), { name, count: 0, updatedAt: serverTimestamp() }, { merge: true });
    return listId;
  }
  const ref = await addDoc(collection(db, LISTS), {
    name,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function deleteContactsForList(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  for (let index = 0; index < snap.docs.length; index += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(index, index + 450).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

async function replaceListContacts(listId, contacts) {
  for (let index = 0; index < contacts.length; index += 450) {
    const batch = writeBatch(db);
    contacts.slice(index, index + 450).forEach((contact) => {
      const ref = doc(collection(db, CONTACTS));
      batch.set(ref, {
        listId,
        email: contact.email,
        prenom: contact.prenom || "",
        nom: contact.nom || "",
        organisation: contact.organisation || "",
        categorie: contact.categorie || contact.category || "",
        type: contact.type || "",
        departement: contact.departement || "",
        commune: contact.commune || "",
        pertinence: "fiable-aout-2026",
        scorePertinence: contact.score,
        reliableTags: contact.reliableTags,
        selectionReason: contact.selectionReason,
        source: contact.source || "",
        sourceList: contact.listName || "",
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`Ecriture: ${Math.min(index + 450, contacts.length)}/${contacts.length}`);
  }
  await setDoc(doc(db, LISTS, listId), { count: contacts.length, updatedAt: serverTimestamp() }, { merge: true });
}

function reportRow(contact) {
  return {
    email: contact.email,
    organisation: contact.organisation || "",
    nom: contact.nom || "",
    prenom: contact.prenom || "",
    categorie: contact.categorie || contact.category || "",
    type: contact.type || "",
    commune: contact.commune || "",
    departement: contact.departement || "",
    score: contact.score,
    reliableTags: contact.reliableTags.join("|"),
    sourceList: contact.listName || "",
    source: contact.source || "",
  };
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replaceAll("\"", "\"\"")}"`).join(";")),
  ].join("\r\n");
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
