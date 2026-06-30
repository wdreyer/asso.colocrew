// Inspecte la structure des passagers dans les transports S1
// node scripts/inspect-transport.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId: "colocrew-5edf9",
  authDomain: "colocrew-5edf9.firebaseapp.com",
  storageBucket: "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId: "1:74332244617:web:1947fe469b0ca4a103d458",
};

// Convoi Nord ALLER
const NORD_ALLER_ID = "ylEcqHnDCCneUQqejLis";

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const snap = await getDoc(doc(db, "transports", NORD_ALLER_ID));
  const t = snap.data();
  console.log("\n=== CONVOI NORD ALLER — Structure ===");
  console.log("sejourName:", t.sejourName);
  console.log("week:", t.week);
  console.log("segments:", JSON.stringify(t.segments?.map(s => ({ from: s.from, to: s.to, id: s.id })), null, 2));
  console.log("branches:", JSON.stringify(t.branches, null, 2));
  console.log("\n=== Premier passager ===");
  const p = (t.passengers || [])[0];
  console.log(JSON.stringify(p, null, 2));
  console.log("\n=== Premier ticket ===");
  const tk = (t.tickets || [])[0];
  console.log(JSON.stringify(tk, null, 2));
  console.log("\n=== Tous les passagers (résumé) ===");
  for (const p of t.passengers || []) {
    console.log(`  - ${p.nom || "?"} | enfant: ${p.childName || "?"} | ville: ${p.departureCity || p.city || "?"} | id: ${p.reservationId || "?"}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
