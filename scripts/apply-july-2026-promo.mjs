import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

loadEnv(".env.local");

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function applyDatePromo(dates, startDatePrefix) {
  return (Array.isArray(dates) ? dates : []).map((dateEntry) => {
    if (!String(dateEntry?.startDate || "").startsWith(startDatePrefix)) return dateEntry;
    return {
      ...dateEntry,
      priceMin: 350,
      priceMax: 950,
      tarifMin: 350,
      tarifMax: 950,
      promoLabel: "Offre exceptionnelle juillet",
    };
  });
}

const promos = [
  {
    id: "my-creative-surf-camp",
    start: "2026-07-06",
    headline: "My Creative Surf Camp du 6 au 17 juillet : tarif exceptionnel de 350 à 950 €.",
    body: "Offre mise en place pour aider les derniers jeunes à partir cet été. Montant final selon aides et situation familiale, hors transport.",
  },
  {
    id: "eaux-vives-creative-camp",
    start: "2026-07-20",
    headline: "Eaux Vives Creative Camp du 20 au 31 juillet : tarif exceptionnel de 350 à 950 €.",
    body: "Un tarif ajusté pour les dernières places de juillet, avec estimation personnalisée selon les aides, hors transport.",
  },
];

for (const promo of promos) {
  const ref = doc(db, "sejours", promo.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log(`${promo.id}: document introuvable`);
    continue;
  }

  const data = snap.data();
  const dates = applyDatePromo(data.dates, promo.start);
  await setDoc(ref, {
    dates,
    promotion: {
      active: true,
      startDate: promo.start,
      priceMin: 350,
      priceMax: 950,
      priceLabel: "350 - 950 €",
      label: "Offre exceptionnelle juillet",
      headline: promo.headline,
      body: promo.body,
    },
  }, { merge: true });

  const updated = dates.find((dateEntry) => String(dateEntry?.startDate || "").startsWith(promo.start));
  console.log(`${promo.id}: promo appliquee`, updated);
}
