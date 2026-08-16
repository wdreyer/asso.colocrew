import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
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

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const memberId = "rayan-mohamed-hassan-fadl";
const memberData = {
  firstName: "Rayan",
  lastName: "Mohamed Hassan Fadl",
  name: "Rayan Mohamed Hassan Fadl",
  email: "rayanmhfn@gmail.com",
  phone: "",
  dateOfBirth: "14/02/2004",
  birthPlace: "Antony (92)",
  address: "172b Rue Henri Barbusse Argenteuil 95100",
  nationality: "Francaise",
  socialSecurityNumber: "",
  staffType: "animateur",
  active: true,
  source: "Codex S4 Rayan 2026-08-16",
};

const contracts = [
  {
    id: "MCSC-S4-rayan-mohamed-hassan-fadl-benevole-2026-08-17-22",
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
      source: "Codex S4 Rayan 2026-08-16",
      updatedAt: serverTimestamp(),
    },
  },
  {
    id: "MCSC-S4-rayan-mohamed-hassan-fadl-as-sb-2026-08-23-28",
    data: {
      memberId,
      memberName: memberData.name,
      stayCode: "MCSC",
      stayName: "My Creative Surf Camp",
      week: "S4",
      role: "AS/SB",
      roleKey: "as-sb",
      startDate: "2026-08-23",
      endDate: "2026-08-28",
      primeCount: 0,
      convoyagePrime: false,
      convoyagePrimeNet: 0,
      convoyagePrimeGross: 0,
      primeUnitNet: 60,
      primeUnitGross: 81,
      netSalary: 360,
      grossSalary: 486,
      paidAmount: 0,
      outstandingAmount: 360,
      paymentValidated: false,
      contractFileUrl: "",
      signedContractStoragePath: "",
      docusignEnvelopeId: "",
      docusignStatus: "",
      source: "Codex S4 Rayan 2026-08-16",
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

const memberSnap = await getDocs(collection(db, "staff_members"));
const existingMembers = memberSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const matchingMember = existingMembers.find((member) =>
  member.id === memberId
  || normalize(`${member.firstName || ""} ${member.lastName || ""}`) === normalize(memberData.name)
  || normalize(member.email) === normalize(memberData.email)
);
const finalMemberId = matchingMember?.id || memberId;

const existingContractsSnap = await getDocs(query(collection(db, "staff_contracts"), where("memberId", "==", finalMemberId)));
const existingContracts = existingContractsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  member: {
    id: finalMemberId,
    exists: Boolean(matchingMember),
    next: memberData,
  },
  contracts: contracts.map((item) => ({ id: item.id, next: { ...item.data, memberId: finalMemberId } })),
  existingContracts: existingContracts.map((item) => ({
    id: item.id,
    week: item.week,
    stayCode: item.stayCode,
    role: item.role,
    startDate: item.startDate,
    endDate: item.endDate,
  })),
}, null, 2));

if (!shouldApply) {
  console.log("Dry-run uniquement. Relancez avec --apply pour appliquer.");
  process.exit(0);
}

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
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log(`Termine: fiche ${finalMemberId}, ${contracts.length} contrats.`);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
