import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const targets = [
  { id: "marion-errard", role: "Benevole", roleKey: "benevole", startDate: "2026-08-17", endDate: "2026-08-28", netSalary: 0, grossSalary: 0 },
  { id: "william-dreyer", role: "Benevole", roleKey: "benevole", startDate: "2026-08-17", endDate: "2026-08-28", netSalary: 0, grossSalary: 0 },
  { id: "tessa-ramette", role: "Stagiaire/SS Diplome", roleKey: "stagiaire", startDate: "2026-08-17", endDate: "2026-08-22", netSalary: 300, grossSalary: 405 },
  { id: "lilou-joyeux", role: "Stagiaire/SS Diplome", roleKey: "stagiaire", startDate: "2026-08-17", endDate: "2026-08-22", netSalary: 300, grossSalary: 405 },
];

const [memberSnap, contractSnap] = await Promise.all([
  getDocs(collection(db, "staff_members")),
  getDocs(query(collection(db, "staff_contracts"), where("week", "==", "S4"))),
]);

const members = Object.fromEntries(memberSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
const s4Contracts = contractSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const missingMembers = targets.filter((target) => !members[target.id]).map((target) => target.id);
if (missingMembers.length) {
  throw new Error(`Fiches RH manquantes, aucune creation membre effectuee : ${missingMembers.join(", ")}`);
}

const existingByMember = Object.fromEntries(
  s4Contracts
    .filter((contract) => contract.stayCode === "MCSC" && contract.memberId)
    .map((contract) => [contract.memberId, contract]),
);
const axelleContracts = s4Contracts.filter((contract) => (
  contract.stayCode === "MCSC"
  && (contract.memberId === "axelle-mousset" || /axelle/i.test(contract.memberName || ""))
));

const writes = targets.map((target) => {
  const member = members[target.id];
  const existing = existingByMember[target.id];
  const memberName = member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
  return {
    id: existing?.id || `MCSC-S4-${target.id}`,
    data: {
      memberId: member.id,
      memberName,
      stayCode: "MCSC",
      stayName: "My Creative Surf Camp",
      week: "S4",
      role: target.role,
      roleKey: target.roleKey,
      startDate: target.startDate,
      endDate: target.endDate,
      primeCount: 0,
      convoyagePrime: false,
      convoyagePrimeNet: 0,
      convoyagePrimeGross: 0,
      primeUnitNet: 60,
      primeUnitGross: 81,
      netSalary: target.netSalary,
      grossSalary: target.grossSalary,
      paidAmount: 0,
      outstandingAmount: target.netSalary,
      paymentValidated: target.netSalary === 0,
      contractFileUrl: existing?.contractFileUrl || "",
      signedContractStoragePath: existing?.signedContractStoragePath || "",
      docusignEnvelopeId: existing?.docusignEnvelopeId || "",
      docusignStatus: existing?.docusignStatus || "",
      source: "Codex S4 RH update 2026-08-16",
      updatedAt: serverTimestamp(),
    },
    previous: existing ? {
      id: existing.id,
      memberName: existing.memberName,
      role: existing.role,
      roleKey: existing.roleKey,
      startDate: existing.startDate,
      endDate: existing.endDate,
      netSalary: existing.netSalary,
      grossSalary: existing.grossSalary,
    } : null,
  };
});

const preview = {
  mode: shouldApply ? "apply" : "dry-run",
  deleteContracts: axelleContracts.map((contract) => ({
    id: contract.id,
    memberId: contract.memberId,
    memberName: contract.memberName,
    role: contract.role,
    startDate: contract.startDate,
    endDate: contract.endDate,
  })),
  upsertContracts: writes.map((write) => ({ id: write.id, previous: write.previous, next: write.data })),
};

console.log(JSON.stringify(preview, null, 2));

if (!shouldApply) {
  console.log("Dry-run uniquement. Relancez avec --apply pour appliquer.");
  process.exit(0);
}

await Promise.all([
  ...axelleContracts.map((contract) => deleteDoc(doc(db, "staff_contracts", contract.id))),
  ...writes.map((write) => setDoc(doc(db, "staff_contracts", write.id), write.data, { merge: true })),
]);

console.log(`S4 RH mis a jour : ${axelleContracts.length} contrat(s) Axelle supprime(s), ${writes.length} contrat(s) crees/mis a jour.`);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
