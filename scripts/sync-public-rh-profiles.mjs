import fs from "node:fs";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";

loadEnv(".env.local");
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const [memberSnapshot, contractSnapshot] = await Promise.all([
  getDocs(collection(db, "staff_members")),
  getDocs(collection(db, "staff_contracts")),
]);
const contracts = contractSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
let synced = 0;
for (const snapshot of memberSnapshot.docs) {
  const member = { id: snapshot.id, ...snapshot.data() };
  const assignments = contracts.filter((contract) => contract.memberId === member.id).map((contract) => ({
    contractId: contract.id,
    week: contract.week || "",
    stay: contract.stayName || contract.stayCode || "",
    stayCode: contract.stayCode || "",
    role: contract.role || "Poste à confirmer",
    startDate: contract.startDate || "",
    endDate: contract.endDate || "",
  })).sort((left, right) => `${left.week}-${left.stay}`.localeCompare(`${right.week}-${right.stay}`, "fr"));
  const locks = Object.fromEntries(["diploma", "identity", "health"].map((type) => [type, Boolean(member.documentStatus?.[type]?.locked)]));
  await setDoc(doc(db, "staff_public_profiles", member.id), {
    name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
    firstName: member.firstName || "",
    lastName: member.lastName || "",
    staffType: member.staffType || "",
    active: member.active !== false,
    assignments,
    documentLocks: locks,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  synced += 1;
}
const publicSnapshot = await getDocs(collection(db, "staff_public_profiles"));
const forbiddenFields = publicSnapshot.docs.flatMap((item) => {
  const data = item.data();
  return ["email", "phone", "address", "documents", "socialSecurityNumber"].filter((field) => data[field] != null).map((field) => `${item.id}.${field}`);
});
if (forbiddenFields.length) throw new Error(`Champs privés détectés : ${forbiddenFields.join(", ")}`);
console.log(`${synced} profils RH publics synchronisés et ${publicSnapshot.size} profils relus sans champ privé.`);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
