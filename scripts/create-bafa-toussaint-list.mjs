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
const RESERVATIONS = "reservations";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUBSCRIBES = "campagne_unsubscribes";
const LIST_NAME = "BAFA Toussaint 2026 - reservations + Cantal AURA";
const MIN_TARGET_COUNT = 3000;

const AURA_AND_CANTAL_NEARBY_DEPARTMENTS = new Set([
  "01", "03", "07", "12", "15", "19", "26", "38", "42", "43", "46", "48", "63", "69", "71", "73", "74",
]);

const BAFA_CITY_HINTS = [
  "aurillac", "saint-flour", "mauriac", "clermont", "clermont-ferrand", "lyon", "saint-etienne",
  "grenoble", "valence", "le puy", "moulins", "vichy", "montlucon", "rodez", "brive", "tulle",
  "mende", "figeac", "cahors", "villefranche", "bourg-en-bresse", "annecy", "chambery",
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function cleanPhone(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function scoreContact(contact) {
  return Number(contact.scorePertinence || contact.relevanceScore || contact.originalScore || contact.score || 0);
}

function firstPostalCode(value) {
  const match = String(value || "").match(/\b\d{5}\b/);
  return match?.[0] || "";
}

function departmentFromPostal(postalCode) {
  if (!postalCode) return "";
  if (postalCode.startsWith("20")) return postalCode.slice(0, 3);
  return postalCode.slice(0, 2);
}

function contactBlob(contact) {
  return normalizeText([
    contact.prenom,
    contact.nom,
    contact.organisation,
    contact.categorie,
    contact.type,
    contact.departement,
    contact.commune,
    contact.ville,
    contact.city,
    contact.adresse,
    contact.address,
    contact.source,
    contact.pertinence,
  ].filter(Boolean).join(" "));
}

function regionalMatch(contact) {
  const postal = firstPostalCode([
    contact.codePostal,
    contact.postalCode,
    contact.zipCode,
    contact.adresse,
    contact.address,
  ].filter(Boolean).join(" "));
  const department = String(contact.departement || departmentFromPostal(postal) || "").padStart(2, "0").slice(0, 2);
  if (AURA_AND_CANTAL_NEARBY_DEPARTMENTS.has(department)) return true;
  const blob = contactBlob(contact);
  return BAFA_CITY_HINTS.some((city) => blob.includes(city));
}

function reservationChildrenNames(reservation) {
  const children = Array.isArray(reservation?.minor?.children) ? reservation.minor.children : [];
  return children
    .map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function reservationToContact(reservation) {
  const legal = reservation.legal || {};
  const transport = reservation.transport || {};
  const email = cleanEmail(legal.email);
  if (!email || reservation.status === "deleted") return null;
  const postal = firstPostalCode([
    legal.postalCode,
    legal.zipCode,
    legal.address,
    reservation.postalCode,
  ].filter(Boolean).join(" "));
  const contact = {
    email,
    prenom: legal.firstName || "",
    nom: legal.lastName || "",
    telephone: cleanPhone(legal.phone || legal.telephone || reservation.phone),
    commune: legal.city || legal.commune || "",
    departement: departmentFromPostal(postal),
    source: "reservations_colocrew",
    categorie: "famille_colocrew",
    type: "ancien_participant_colocrew",
    pertinence: "Reservation ColoCrew - reduction BAFA 50 EUR",
    scorePertinence: 100,
    reservationStatus: reservation.status || "",
    reservationNumber: reservation.numeroDeReservation || "",
    sejour: reservation.sejour?.name || "",
    enfants: reservationChildrenNames(reservation),
    transportVilleDepart: transport.departureCity || "",
    transportVilleRetour: transport.returnCity || "",
    reductionColoCrew: "50 EUR",
  };
  return { ...contact, regionalBafa: regionalMatch(contact) ? "oui" : "non" };
}

function campaignContactToBafa(contact, listName = "") {
  const email = cleanEmail(contact.email);
  if (!email) return null;
  const normalized = {
    email,
    prenom: contact.prenom || contact.firstName || "",
    nom: contact.nom || contact.lastName || "",
    telephone: cleanPhone(contact.telephone || contact.phone),
    organisation: contact.organisation || "",
    commune: contact.commune || contact.ville || contact.city || "",
    departement: contact.departement || "",
    source: contact.source || "campagne_contacts",
    categorie: contact.categorie || contact.category || "",
    type: contact.type || "",
    pertinence: contact.pertinence || "",
    scorePertinence: scoreContact(contact),
    sourceListId: contact.listId || "",
    sourceListName: listName,
    indivImported: /indiv|individuel/i.test(`${listName} ${contact.source || ""} ${contact.categorie || ""}`) ? "oui" : "non",
  };
  return { ...normalized, regionalBafa: regionalMatch(normalized) ? "oui" : "non" };
}

async function getUnsubscribedEmails() {
  const snap = await getDocs(collection(db, UNSUBSCRIBES));
  return new Set(snap.docs.map((item) => cleanEmail(item.data().email || item.id)).filter(Boolean));
}

async function findListByName(name) {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", name), limit(1)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function deleteContactsForList(listId) {
  const snap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)));
  for (let index = 0; index < snap.docs.length; index += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(index, index + 450).forEach((contactDoc) => batch.delete(contactDoc.ref));
    await batch.commit();
  }
  return snap.size;
}

async function upsertList(name) {
  const existing = await findListByName(name);
  if (existing) {
    const removed = await deleteContactsForList(existing.id);
    await setDoc(doc(db, LISTS, existing.id), {
      name,
      count: 0,
      updatedAt: serverTimestamp(),
      targetCount: MIN_TARGET_COUNT,
      description: "Campagne BAFA Toussaint 2026 : reservations confirmees/non confirmees + tous contacts importes, dont Cantal/AURA et indiv.",
    }, { merge: true });
    return { listId: existing.id, removed };
  }

  const ref = await addDoc(collection(db, LISTS), {
    name,
    count: 0,
    targetCount: MIN_TARGET_COUNT,
    description: "Campagne BAFA Toussaint 2026 : reservations confirmees/non confirmees + tous contacts importes, dont Cantal/AURA et indiv.",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { listId: ref.id, removed: 0 };
}

function mergeContacts({ reservationContacts, campaignContacts, unsubscribed }) {
  const byEmail = new Map();
  let skippedUnsubscribed = 0;
  const add = (contact, priority) => {
    if (!contact?.email) return;
    if (unsubscribed.has(contact.email)) {
      skippedUnsubscribed++;
      return;
    }
    const previous = byEmail.get(contact.email);
    const candidate = {
      ...contact,
      bafaPriority: priority,
      scorePertinence: Number(contact.scorePertinence || 0) + priority,
    };
    if (!previous || Number(candidate.scorePertinence || 0) > Number(previous.scorePertinence || 0)) {
      byEmail.set(contact.email, candidate);
    }
  };

  reservationContacts.forEach((contact) => add(contact, 1000));
  campaignContacts.filter((contact) => contact.indivImported === "oui").forEach((contact) => add(contact, 700));
  campaignContacts.filter((contact) => contact.regionalBafa === "oui").forEach((contact) => add(contact, 500));
  campaignContacts.forEach((contact) => add(contact, 100));

  return {
    contacts: [...byEmail.values()]
      .sort((a, b) => Number(b.scorePertinence || 0) - Number(a.scorePertinence || 0) || a.email.localeCompare(b.email)),
    skippedUnsubscribed,
  };
}

async function writeContacts(listId, contacts) {
  for (let index = 0; index < contacts.length; index += 450) {
    const batch = writeBatch(db);
    contacts.slice(index, index + 450).forEach((contact) => {
      const ref = doc(collection(db, CONTACTS));
      batch.set(ref, {
        ...contact,
        listId,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`Ecriture: ${Math.min(index + 450, contacts.length)}/${contacts.length}`);
  }

  await setDoc(doc(db, LISTS, listId), {
    count: contacts.length,
    updatedAt: serverTimestamp(),
    regionalCount: contacts.filter((contact) => contact.regionalBafa === "oui").length,
    reservationCount: contacts.filter((contact) => contact.source === "reservations_colocrew").length,
    confirmedReservationCount: contacts.filter((contact) => contact.source === "reservations_colocrew" && contact.reservationStatus === "validated").length,
    pendingReservationCount: contacts.filter((contact) => contact.source === "reservations_colocrew" && contact.reservationStatus !== "validated").length,
    indivImportedCount: contacts.filter((contact) => contact.indivImported === "oui").length,
  }, { merge: true });
}

async function main() {
  const [reservationSnap, contactsSnap, listsSnap, unsubscribed] = await Promise.all([
    getDocs(collection(db, RESERVATIONS)),
    getDocs(collection(db, CONTACTS)),
    getDocs(collection(db, LISTS)),
    getUnsubscribedEmails(),
  ]);

  const listNames = new Map(listsSnap.docs.map((listDoc) => [listDoc.id, String(listDoc.data().name || "")]));
  const existingTargetList = listsSnap.docs.find((listDoc) => String(listDoc.data().name || "") === LIST_NAME);
  const existingTargetListId = existingTargetList?.id || "";

  const reservationContacts = reservationSnap.docs
    .map((reservationDoc) => reservationToContact({ id: reservationDoc.id, ...reservationDoc.data() }))
    .filter(Boolean);
  const campaignContacts = contactsSnap.docs
    .map((contactDoc) => ({ id: contactDoc.id, ...contactDoc.data() }))
    .filter((contact) => !existingTargetListId || contact.listId !== existingTargetListId)
    .map((contact) => campaignContactToBafa(contact, listNames.get(contact.listId) || ""))
    .filter(Boolean);

  const { contacts, skippedUnsubscribed } = mergeContacts({ reservationContacts, campaignContacts, unsubscribed });
  const { listId, removed } = await upsertList(LIST_NAME);
  await writeContacts(listId, contacts);

  const reservationCount = contacts.filter((contact) => contact.source === "reservations_colocrew").length;
  const confirmedReservationCount = contacts.filter((contact) => contact.source === "reservations_colocrew" && contact.reservationStatus === "validated").length;
  const pendingReservationCount = contacts.filter((contact) => contact.source === "reservations_colocrew" && contact.reservationStatus !== "validated").length;
  const regionalCount = contacts.filter((contact) => contact.regionalBafa === "oui").length;
  const indivImportedCount = contacts.filter((contact) => contact.indivImported === "oui").length;

  console.log(`Liste creee/mise a jour: ${LIST_NAME}`);
  console.log(`ID liste: ${listId}`);
  console.log(`Anciens contacts supprimes: ${removed}`);
  console.log(`Reservations scannees: ${reservationSnap.size}`);
  console.log(`Contacts campagne scannes: ${contactsSnap.size}`);
  console.log(`Contacts BAFA ajoutes: ${contacts.length}`);
  console.log(`Dont reservations ColoCrew: ${reservationCount}`);
  console.log(` - confirmees: ${confirmedReservationCount}`);
  console.log(` - non confirmees / autres statuts: ${pendingReservationCount}`);
  console.log(`Dont Cantal/AURA/proches: ${regionalCount}`);
  console.log(`Dont liste indiv importee: ${indivImportedCount}`);
  console.log(`Desinscrits ignores: ${skippedUnsubscribed}`);
  console.log(`Objectif minimum: ${MIN_TARGET_COUNT}`);
  console.log(`Reste pour atteindre objectif: ${Math.max(MIN_TARGET_COUNT - contacts.length, 0)}`);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
