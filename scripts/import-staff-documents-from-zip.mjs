import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const ROOT_DIR = path.resolve(rootArg ? rootArg.slice("--root=".length) : path.join(".tmp_staff_docs_import", "Documents Anims"));
const DRY_RUN = !process.argv.includes("--apply");

const DOCUMENT_TYPES = new Set(["diploma", "identity", "health"]);
const MANUAL_TYPES = new Map([
  ["Lorette Kuc/7589-F-2024-03-06-71128.JPG", "identity"],
  ["Lorette Kuc/7590-F-2024-03-06-90938.jpg", "diploma"],
  ["Lorette Kuc/7595-F-2024-06-10-35683.jpeg", "health"],
  ["Lorette Kuc/7598-F-2024-06-10-47065.jpeg", "identity"],
  ["Lorette Kuc/7601-F-2024-06-10-30082.pdf", "diploma"],
  ["Marion Errard/IMG_20230604_195529.jpg", "identity"],
  ["Elisa Péau/6624239592328939047.pdf", "diploma"],
  ["Elisa Péau/Doctolib .pdf", "health"],
  ["Rhourbaly Sofian/7834-F-2024-03-24-14165.pdf", "identity"],
  ["Rhourbaly Sofian/7835-F-2024-03-24-65639.pdf", "diploma"],
  ["Rhourbaly Sofian/Diplôme bafa .pdf", "diploma"],
  ["Rhourbaly Sofian/WhatsApp Image 2026-07-08 at 20.14.34.jpeg", "health"],
  ["Rhourbaly Sofian/WhatsApp Image 2026-07-08 at 20.14.46.jpeg", "health"],
]);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

if (!fs.existsSync(ROOT_DIR)) {
  throw new Error(`Dossier extrait introuvable: ${ROOT_DIR}`);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const [memberSnapshot, documentSnapshot] = await Promise.all([
  getDocs(collection(db, "staff_members")),
  getDocs(collection(db, "staff_documents")),
]);

const members = memberSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const existingDocuments = documentSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const files = listFiles(ROOT_DIR);

const planned = [];
const unmatchedFolders = new Map();
const skipped = [];

for (const filePath of files) {
  const relative = path.relative(ROOT_DIR, filePath);
  if (/\.page\d+\.png$/i.test(relative)) continue;
  const parts = relative.split(path.sep);
  if (parts.length < 2) {
    skipped.push({ relative, reason: "chemin inattendu" });
    continue;
  }

  const folderName = parts.length >= 3 ? parts[1] : parts[0];
  const originalName = parts.slice(parts.length >= 3 ? 2 : 1).join(path.sep);
  const member = findMember(folderName, members);
  if (!member) {
    addMapItem(unmatchedFolders, folderName, relative);
    continue;
  }

  const documentType = classifyDocument(folderName, originalName);
  if (!DOCUMENT_TYPES.has(documentType)) {
    skipped.push({ relative, member, reason: "type non reconnu ou hors dossier RH" });
    continue;
  }

  const stat = fs.statSync(filePath);
  const duplicate = existingDocuments.some((document) =>
    document.memberId === member.id
    && document.documentType === documentType
    && document.originalName === originalName
    && Number(document.size || 0) === stat.size
  );
  if (duplicate) {
    skipped.push({ relative, member, documentType, reason: "doublon deja present" });
    continue;
  }

  planned.push({ filePath, relative, folderName, member, documentType, originalName, size: stat.size });
}

console.log(DRY_RUN ? "\nDRY RUN - aucune ecriture\n" : "\nAPPLY - import Firestore/Storage\n");
console.log(`${files.length} fichier(s) trouves dans l'archive extraite.`);
console.log(`${planned.length} fichier(s) pret(s) a importer.`);

for (const item of planned) {
  console.log(`  + ${displayName(item.member)} -> ${item.documentType} -> ${item.originalName}`);
}

if (unmatchedFolders.size) {
  console.log("\nDossiers sans fiche RH existante, ignores:");
  for (const [folderName, items] of [...unmatchedFolders.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"))) {
    console.log(`  - ${folderName} (${items.length} fichier(s))`);
  }
}

if (skipped.length) {
  console.log("\nFichiers ignores:");
  for (const item of skipped) {
    const prefix = item.member ? `${displayName(item.member)} - ` : "";
    console.log(`  - ${prefix}${item.relative}: ${item.reason}`);
  }
}

if (DRY_RUN) {
  console.log("\nRelance avec --apply pour appliquer.");
  process.exit(0);
}

let uploaded = 0;
for (const item of planned) {
  const uploadId = crypto.randomUUID();
  const storagePath = `staff-documents/${item.member.id}/${item.documentType}/${uploadId}-${safeStaffFileName(item.originalName)}`;
  const contentType = contentTypeFor(item.originalName);
  const bytes = new Uint8Array(fs.readFileSync(item.filePath));

  await uploadBytes(ref(storage, storagePath), bytes, {
    contentType,
    customMetadata: {
      memberId: item.member.id,
      memberName: displayName(item.member),
      documentType: item.documentType,
      source: "admin-zip-import",
      status: "pending",
    },
  });

  await addDoc(collection(db, "staff_documents"), {
    memberId: item.member.id,
    memberName: displayName(item.member),
    documentType: item.documentType,
    originalName: item.originalName,
    storagePath,
    contentType,
    size: item.size,
    status: "pending",
    locked: false,
    source: "admin-zip-import",
    importedFrom: item.relative.replaceAll(path.sep, "/"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await syncPendingStatus(item.member, item.documentType);
  uploaded += 1;
  console.log(`Importe: ${displayName(item.member)} / ${item.documentType} / ${item.originalName}`);
}

console.log(`\nTermine: ${uploaded} fichier(s) importe(s).`);

async function syncPendingStatus(member, documentType) {
  const currentStatus = member.documentStatus?.[documentType];
  if (currentStatus?.status === "validated" && currentStatus?.locked) return;

  const statusValue = { status: "pending", locked: false, updatedAt: new Date().toISOString() };
  member.documentStatus = { ...(member.documentStatus || {}), [documentType]: statusValue };
  await Promise.all([
    setDoc(doc(db, "staff_members", member.id), {
      documentStatus: { [documentType]: statusValue },
    }, { merge: true }),
    setDoc(doc(db, "staff_public_profiles", member.id), {
      documentLocks: { [documentType]: false },
      documentStatus: { [documentType]: statusValue },
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);
}

function findMember(folderName, existingMembers) {
  const target = nameKey(folderName);
  return existingMembers.find((member) => {
    const candidates = [
      member.name,
      `${member.firstName || ""} ${member.lastName || ""}`,
      `${member.lastName || ""} ${member.firstName || ""}`,
    ];
    return candidates.some((candidate) => nameKey(candidate) === target);
  }) || null;
}

function classifyDocument(folderName, originalName) {
  const manualKey = `${folderName}/${originalName}`;
  if (MANUAL_TYPES.has(manualKey)) return MANUAL_TYPES.get(manualKey);

  const value = normalize(`${folderName} ${originalName}`);
  if (/(vaccin|vaccination|carnet|medical|sante)/.test(value)) return "health";
  if (/(passeport|identite|cni|carte nationale|permis)/.test(value)) return "identity";
  if (/(bafa|bafd|diplome|psc1|certif|brevet|sb|surveillant)/.test(value)) return "diploma";
  return "";
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

function addMapItem(map, key, value) {
  map.set(key, [...(map.get(key) || []), value]);
}

function displayName(member) {
  return member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
}

function nameKey(value) {
  return normalize(value).split(/\s+/).filter(Boolean).sort().join(" ");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeStaffFileName(value) {
  const cleaned = String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "document";
}

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
