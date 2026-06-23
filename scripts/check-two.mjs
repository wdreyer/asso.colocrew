import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId: "colocrew-5edf9",
  authDomain: "colocrew-5edf9.firebaseapp.com",
});
const db = getFirestore(app);

function norm(s) {
  return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
}

const snap = await getDocs(collection(db, "reservations"));

for (const doc of snap.docs) {
  const d = doc.data();
  const minor = d.minor || {};
  const child = (minor.children||[])[0] || d.child || {};
  const legal = d.legal || {};
  const sejour = d.sejour || {};

  const firstName = norm(child.firstName || child.prenom || "");
  const lastName  = norm(child.lastName  || child.nom   || "");
  const email     = norm(legal.email || d.email || "");

  const isNdoukobo = lastName.includes("ndoukobo") || firstName === "noam";
  const isMiaLina  = (lastName === "mia" && firstName === "lina") ||
                     email.includes("jiuchun");

  if (isNdoukobo || isMiaLina) {
    console.log("\n──────────────────────────────────────────────");
    console.log(`ID      : ${doc.id}`);
    console.log(`Ref     : ${d.numeroDeReservation || "—"}`);
    console.log(`Status  : ${d.status}`);
    console.log(`Enfant  : ${child.firstName} ${child.lastName} (dob: ${child.birthDate||"?"})`);
    console.log(`Légal   : ${legal.firstName} ${legal.lastName} — ${legal.email||"pas d'email"} — ${legal.phone||"pas de tel"}`);
    console.log(`Séjour  : ${sejour.name||d.sejourName||"?"} — start: ${sejour.startDate||"?"}`);
    console.log(`Transport: ${(d.transport||{}).departureCity||"?"} → ${(d.transport||{}).returnCity||"?"}`);
  }
}

process.exit(0);
