import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, updateDoc } from "firebase/firestore";

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

const MECS_EMAILS = [
  "mecs75.gandhi@apprentis-auteuil.org",
  "justine.galy@apprentis-auteuil.org",
  "clemence.coutinho@apprentis-auteuil.org",
];

// Add MECS emails alongside the existing legal.email contact.
const ADD_ONLY = [
  { id: "wds1ZMGEo9q2liFyEavQ", child: "Issaga SY" },
  { id: "LxBme51mdSiSMztZjdnS", child: "Youssouf DOSSO" },
  { id: "wadthcOkPRCKnPrTYH0m", child: "Nathan ROCHEFORT" },
  { id: "eAxaCAcMg04gBvikxR4X", child: "Jessuy MVOU NDONDET" },
  { id: "b0O3fxnsdIdjPJhjrkux", child: "Siradio DIALLO" },
  { id: "WCfOQhkuBOEWTZVYOWjj", child: "Moussa DEMBELE" },
  { id: "942jNyQ0vR7LrmfH5uij", child: "Moïse SIDIMEH" },
  { id: "pNVw7GHptH85jMVO70u3", child: "Meriem Beizat" },
];

// Naima Beizat: replace jeunesse@mairie-brunoy.fr entirely with the MECS emails.
const REPLACE = [
  { id: "IIepAXN6TeKFYrxDTbu7", child: "Naima Beizat" },
];

for (const { id, child } of ADD_ONLY) {
  const ref = doc(db, "reservations", id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) { console.log(`SKIP (introuvable) ${child} ${id}`); continue; }
  await updateDoc(ref, { "legal.emails": MECS_EMAILS });
  console.log(`OK ${child} (${id}) — legal.emails = [${MECS_EMAILS.join(", ")}], legal.email conservé`);
}

for (const { id, child } of REPLACE) {
  const ref = doc(db, "reservations", id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) { console.log(`SKIP (introuvable) ${child} ${id}`); continue; }
  await updateDoc(ref, { "legal.email": MECS_EMAILS[0], "legal.emails": MECS_EMAILS });
  console.log(`OK ${child} (${id}) — jeunesse@mairie-brunoy.fr retiré, legal.email/emails = [${MECS_EMAILS.join(", ")}]`);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
