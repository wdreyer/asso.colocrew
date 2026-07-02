import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");
const app = getApps()[0] || initializeApp({
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
const directionMemberIds = new Set(
  contractSnapshot.docs
    .filter((item) => ["ds", "dsa"].includes(String(item.data().roleKey || "").toLowerCase()))
    .map((item) => item.data().memberId)
    .filter(Boolean),
);

const changes = memberSnapshot.docs
  .map((item) => {
    const member = item.data();
    const staffType = directionMemberIds.has(item.id) ? "directeur" : "animateur";
    return member.staffType === staffType ? null : {
      id: item.id,
      name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
      staffType,
    };
  })
  .filter(Boolean);

console.log(`${directionMemberIds.size} membre(s) classé(s) en direction à partir des postes DS/DSA.`);
changes.forEach((change) => console.log(`${change.name}: ${change.staffType}`));

if (shouldApply && changes.length) {
  const batch = writeBatch(db);
  changes.forEach((change) => batch.update(doc(db, "staff_members", change.id), { staffType: change.staffType }));
  await batch.commit();
  console.log(`${changes.length} fiche(s) mise(s) à jour.`);
} else if (!shouldApply) {
  console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");
}

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
