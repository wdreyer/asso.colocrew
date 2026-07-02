// update-s2-nantes-parisbdx-prices.mjs
// Complète les prix communiqués pour 2 billets déjà enregistrés (achat confirmé, prix
// manquant faute d'info dans l'e-mail de confirmation) : Nantes->Paris et Paris->Bordeaux.
//
// Dry-run par défaut : node scripts/update-s2-nantes-parisbdx-prices.mjs
// Écriture réelle    : node scripts/update-s2-nantes-parisbdx-prices.mjs --apply

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const LILLE_NANTES_ALLER = "UrYWvoqOWbzNcv53DyCS";
const NANTES_BRANCH_ID = "s2-aller-nantes-paris";
const PARIS_BORDEAUX_SEG_ID = "3218d8dd-4be3-4ce8-be85-6b07ce80797a";

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const snap = await getDoc(doc(db, "transports", LILLE_NANTES_ALLER));
if (!snap.exists()) throw new Error(`Transport introuvable: ${LILLE_NANTES_ALLER}`);
const transport = snap.data();

const nextTickets = (transport.tickets || []).map((ticket) => {
  if (ticket.segmentId === NANTES_BRANCH_ID) {
    return { ...ticket, price: 248, notes: "Réservation de groupe confirmée le 02/07/2026 (réf. R943Q9_DREYER_R5FDV6)." };
  }
  if (ticket.segmentId === PARIS_BORDEAUX_SEG_ID) {
    return { ...ticket, price: 1537, notes: "Réservation de groupe confirmée le 02/07/2026 (réf. R94MZA_DREYER_TTP2FU)." };
  }
  return ticket;
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} — prix Nantes->Paris & Paris->Bordeaux\n`);
nextTickets
  .filter((t) => t.segmentId === NANTES_BRANCH_ID || t.segmentId === PARIS_BORDEAUX_SEG_ID)
  .forEach((t) => console.log(`  ${t.name} — ${t.price}€ — ${t.purchased ? "acheté" : "à acheter"}`));

if (!shouldApply) {
  console.log("\nDry-run uniquement — relancez avec --apply pour appliquer.");
  process.exit(0);
}

await updateDoc(doc(db, "transports", LILLE_NANTES_ALLER), { tickets: nextTickets });
console.log("\nMise à jour Firebase terminée.");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const separator = value.indexOf("=");
    if (separator < 0) continue;
    const key = value.slice(0, separator).trim();
    const envValue = value.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = envValue;
  }
}
