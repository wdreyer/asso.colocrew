import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";

loadEnv(".env.local");
const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const settingsRef = doc(db, "transport_settings", "onsite_configs");
const [settingsSnapshot, reservationsSnapshot] = await Promise.all([
  getDoc(settingsRef),
  getDocs(collection(db, "reservations")),
]);
const existing = settingsSnapshot.exists() ? settingsSnapshot.data() : {};
const stayNames = new Set();
reservationsSnapshot.docs.forEach((snapshot) => {
  const reservation = snapshot.data();
  if (reservation.status !== "validated") return;
  const name = String(reservation.sejour?.name || "").trim();
  if (addressForStay(name)) stayNames.add(name);
});

const patch = {};
for (const week of ["S1", "S2", "S3", "S4"]) {
  for (const stayName of stayNames) {
    const key = `${week}_${stayName}`;
    patch[key] = { ...(existing[key] || {}), lieu: addressForStay(stayName) };
  }
}
await setDoc(settingsRef, patch, { merge: true });
console.log(`Adresses sur place mises à jour : ${Object.keys(patch).length} configuration(s).`);
for (const stayName of stayNames) console.log(`- ${stayName} : ${addressForStay(stayName)}`);

function addressForStay(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("eaux vives") || normalized.includes("eaux-vives") || normalized.includes("evcc")) {
    return "1050 Plazako bidea, 64780 Bidarray";
  }
  if (normalized.includes("surf") || normalized.includes("my creative") || normalized.includes("mcsc")) {
    return "375 Rte de la Plage S, 40660 Messanges";
  }
  return "";
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
