import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const memberId = "cherihene-kameche";
const memberData = {
  firstName: "Chérihène",
  lastName: "Kameche",
  name: "Chérihène Kameche",
  email: "Kameche.cherihene@gmail.com",
  phone: "",
  dateOfBirth: "11/12/2001",
  birthPlace: "Le Blanc-Mesnil 93150",
  address: "19 /21 RUE JACQUES DUCLOS 93600 AULNAY SOUS BOIS",
  nationality: "Française",
  socialSecurityNumber: "",
  staffType: "animateur",
  active: true,
  source: "Codex S4 Kameche 2026-08-16",
};

const sourceDir = "C:/Users/dreye/Downloads/WhatsApp Unknown 2026-08-16 at 20.19.46";
const documents = [
  {
    documentType: "diploma",
    originalName: "Attestation baccalaureat - Cherihene Kameche.jpeg",
    filePath: path.join(sourceDir, "WhatsApp Image 2026-08-16 at 20.15.09 (1).jpeg"),
  },
  {
    documentType: "health",
    originalName: "PSC - Cherihene Kameche.jpeg",
    filePath: path.join(sourceDir, "WhatsApp Image 2026-08-16 at 20.15.09 (2).jpeg"),
  },
  {
    documentType: "diploma",
    originalName: "BAFA - Cherihene Kameche.jpeg",
    filePath: path.join(sourceDir, "WhatsApp Image 2026-08-16 at 20.15.09.jpeg"),
  },
];

const contracts = [
  {
    id: "MCSC-S4-cherihene-kameche-benevole-2026-08-17-22",
    data: {
      memberId,
      memberName: memberData.name,
      stayCode: "MCSC",
      stayName: "My Creative Surf Camp",
      week: "S4",
      role: "Benevole",
      roleKey: "benevole",
      startDate: "2026-08-17",
      endDate: "2026-08-22",
      primeCount: 0,
      convoyagePrime: false,
      convoyagePrimeNet: 0,
      convoyagePrimeGross: 0,
      primeUnitNet: 60,
      primeUnitGross: 81,
      netSalary: 0,
      grossSalary: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      paymentValidated: true,
      contractFileUrl: "",
      signedContractStoragePath: "",
      docusignEnvelopeId: "",
      docusignStatus: "",
      source: "Codex S4 Kameche 2026-08-16",
      updatedAt: serverTimestamp(),
    },
  },
  {
    id: "MCSC-S4-cherihene-kameche-bafa-2026-08-23-28",
    data: {
      memberId,
      memberName: memberData.name,
      stayCode: "MCSC",
      stayName: "My Creative Surf Camp",
      week: "S4",
      role: "BAFA",
      roleKey: "bafa",
      startDate: "2026-08-23",
      endDate: "2026-08-28",
      primeCount: 0,
      convoyagePrime: false,
      convoyagePrimeNet: 0,
      convoyagePrimeGross: 0,
      primeUnitNet: 60,
      primeUnitGross: 81,
      netSalary: 330,
      grossSalary: 445.5,
      paidAmount: 0,
      outstandingAmount: 330,
      paymentValidated: false,
      contractFileUrl: "",
      signedContractStoragePath: "",
      docusignEnvelopeId: "",
      docusignStatus: "",
      source: "Codex S4 Kameche 2026-08-16",
      updatedAt: serverTimestamp(),
    },
  },
];

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const storage = getStorage(app);

for (const item of documents) {
  if (!fs.existsSync(item.filePath)) throw new Error(`Document introuvable: ${item.filePath}`);
}

const [memberSnap, existingDocsSnap] = await Promise.all([
  getDocs(collection(db, "staff_members")),
  getDocs(query(collection(db, "staff_documents"), where("memberId", "==", memberId))),
]);
const existingMembers = memberSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const matchingMember = existingMembers.find((member) =>
  member.id === memberId
  || normalize(`${member.firstName || ""} ${member.lastName || ""}`) === normalize(memberData.name)
);
const existingDocs = existingDocsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const documentWrites = documents.filter((item) => !existingDocs.some((existing) => existing.originalName === item.originalName));

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  member: {
    id: matchingMember?.id || memberId,
    exists: Boolean(matchingMember),
    next: memberData,
  },
  contracts: contracts.map((item) => ({ id: item.id, next: item.data })),
  documents: documentWrites.map((item) => ({ documentType: item.documentType, originalName: item.originalName, filePath: item.filePath })),
  skippedExistingDocuments: documents.length - documentWrites.length,
}, null, 2));

if (!shouldApply) {
  console.log("Dry-run uniquement. Relancez avec --apply pour appliquer.");
  process.exit(0);
}

const finalMemberId = matchingMember?.id || memberId;
const finalMemberData = { ...memberData, updatedAt: serverTimestamp() };
if (matchingMember) {
  await updateDoc(doc(db, "staff_members", finalMemberId), finalMemberData);
} else {
  await setDoc(doc(db, "staff_members", finalMemberId), {
    ...finalMemberData,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

for (const contract of contracts) {
  await setDoc(doc(db, "staff_contracts", contract.id), {
    ...contract.data,
    memberId: finalMemberId,
  }, { merge: true });
}

for (const item of documentWrites) {
  const stat = fs.statSync(item.filePath);
  const storagePath = `staff-documents/${finalMemberId}/${item.documentType}/${crypto.randomUUID()}-${safeFileName(item.originalName)}`;
  const bytes = new Uint8Array(fs.readFileSync(item.filePath));
  await uploadBytes(ref(storage, storagePath), bytes, {
    contentType: "image/jpeg",
    customMetadata: {
      memberId: finalMemberId,
      memberName: memberData.name,
      documentType: item.documentType,
      source: "admin-whatsapp",
      status: "pending",
    },
  });
  await addDoc(collection(db, "staff_documents"), {
    memberId: finalMemberId,
    memberName: memberData.name,
    documentType: item.documentType,
    originalName: item.originalName,
    storagePath,
    contentType: "image/jpeg",
    size: stat.size,
    status: "pending",
    locked: false,
    source: "admin-whatsapp",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "staff_members", finalMemberId), {
    documentStatus: {
      [item.documentType]: { status: "pending", locked: false, updatedAt: new Date().toISOString() },
    },
  }, { merge: true });
}

await setDoc(doc(db, "staff_public_profiles", finalMemberId), {
  name: memberData.name,
  firstName: memberData.firstName,
  lastName: memberData.lastName,
  staffType: memberData.staffType,
  active: true,
  assignments: contracts.map((contract) => ({
    contractId: contract.id,
    week: contract.data.week,
    stay: contract.data.stayName,
    stayCode: contract.data.stayCode,
    role: contract.data.role,
    startDate: contract.data.startDate,
    endDate: contract.data.endDate,
  })),
  documentLocks: { diploma: false, health: false },
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log(`Termine: fiche ${finalMemberId}, ${contracts.length} contrats, ${documentWrites.length} document(s) ajoute(s).`);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeFileName(value) {
  return String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "document";
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
