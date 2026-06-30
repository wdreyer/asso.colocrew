// IMPORT RÉEL — MCSC S1 v2
// 1. Update gender (4 docs)
// 2. Create 3 new reservations (Sofia, Arushni, Marwa)
// 3. Add new passengers to Convoi Nord aller + retour
// node scripts/update-mcsc-s1-v2.mjs

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc,
  getDoc, getDocs, updateDoc, setDoc,
  arrayUnion, Timestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId: "colocrew-5edf9",
  authDomain: "colocrew-5edf9.firebaseapp.com",
  storageBucket: "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId: "1:74332244617:web:1947fe469b0ca4a103d458",
};

const CONVOI_NORD_ALLER_ID  = "ylEcqHnDCCneUQqejLis";
const CONVOI_NORD_RETOUR_ID = "2lVN1Zxd05fzbm71WzBG";

// ── 1. Mises à jour genre ──
const GENDER_UPDATES = [
  { id: "MpCziw2toPDnBCgHdYpz", name: "Noam Ndoukobo Nyansi", gender: "M" },
  { id: "jrqNTPda8DCtENJBe0CA", name: "Audric Clain",          gender: "M" },
  { id: "c93BXlpnajNpyx0xVDZq", name: "Maëlle Subal",          gender: "F" },
  { id: "rFLVIF8ARfhfu6dFpNki", name: "Léane Stein",           gender: "F" },
];

// ── 2. Nouvelles réservations ──
function makeCreatedAt(dateStr) {
  const [d, m, y] = dateStr.split("/");
  return Timestamp.fromDate(new Date(`${y}-${m}-${d}T12:00:00Z`));
}

const NEW_RESERVATIONS = [
  {
    id: null, // généré automatiquement
    data: {
      status: "validated",
      numeroDeReservation: "",
      source: "amis",
      createdAt: makeCreatedAt("26/06/2026"),
      legal: {
        firstName: "",
        lastName: "autre",
        email: "Secretariat@mariedeluze.fr",
        phone: "33749161843",
        relation: "autre",
        address: "",
      },
      minor: {
        numberOfChildren: "1",
        children: [{ firstName: "Sofia", lastName: "Latrache", birthDate: "12/08/2010", gender: "F" }],
      },
      sejour: { name: "MCSC", startDate: "2026-07-06", endDate: "2026-07-19" },
      transport: { departureCity: "Bordeaux", returnCity: "Bordeaux" },
    },
    pickupCity: "Bordeaux",
    label: "Sofia Latrache",
  },
  {
    id: null,
    data: {
      status: "validated",
      numeroDeReservation: "",
      source: "amis",
      createdAt: makeCreatedAt("26/06/2026"),
      legal: {
        firstName: "",
        lastName: "autre",
        email: "Secretariat@mariedeluze.fr",
        phone: "33749161843",
        relation: "autre",
        address: "",
      },
      minor: {
        numberOfChildren: "1",
        children: [{ firstName: "Arushni", lastName: "Dharmenthira", birthDate: "27/08/2008", gender: "F" }],
      },
      sejour: { name: "MCSC", startDate: "2026-07-06", endDate: "2026-07-19" },
      transport: { departureCity: "Bordeaux", returnCity: "Bordeaux" },
    },
    pickupCity: "Bordeaux",
    label: "Arushni Dharmenthira",
  },
  {
    id: null,
    data: {
      status: "validated",
      numeroDeReservation: "",
      source: "groupe",
      createdAt: makeCreatedAt("24/06/2026"),
      legal: {
        firstName: "",
        lastName: "",
        email: "mimiahmed2ma@gmail.com",
        phone: "",
        relation: "mère",
        address: "",
      },
      minor: {
        numberOfChildren: "1",
        children: [{ firstName: "Marwa", lastName: "Ahmed Mamoune", birthDate: "03/12/2008", gender: "F" }],
      },
      sejour: { name: "MCSC", startDate: "2026-07-06", endDate: "2026-07-19" },
      transport: { departureCity: "Rouen", returnCity: "Rouen" },
    },
    pickupCity: "Rouen",
    label: "Marwa Ahmed Mamoune",
  },
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // ── Étape 1 : Mise à jour genre ──
  console.log("\n✏️  Mise à jour du genre...");
  for (const u of GENDER_UPDATES) {
    const ref = doc(db, "reservations", u.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) { console.log(`  ⚠️  ${u.name} introuvable`); continue; }
    const d = snap.data();
    const minor = d.minor || {};
    const children = minor.children || [];
    if (!children.length) { console.log(`  ⚠️  ${u.name} — pas d'enfant`); continue; }
    const updatedChildren = children.map((c, i) => i === 0 ? { ...c, gender: u.gender } : c);
    await updateDoc(ref, { "minor.children": updatedChildren });
    console.log(`  ✅  ${u.name} → genre: ${u.gender}`);
  }

  // ── Étape 2 : Créer les 3 nouvelles réservations ──
  console.log("\n🆕  Création des nouvelles réservations...");
  const createdIds = [];
  for (const entry of NEW_RESERVATIONS) {
    const newRef = doc(collection(db, "reservations"));
    await setDoc(newRef, entry.data);
    createdIds.push({ id: newRef.id, pickupCity: entry.pickupCity, label: entry.label });
    console.log(`  ✅  ${entry.label} → ID: ${newRef.id} (ville: ${entry.pickupCity})`);
  }

  // ── Étape 3 : Ajouter aux transports Convoi Nord ──
  console.log("\n🚆  Ajout aux transports Convoi Nord...");

  for (const { id, pickupCity, label } of createdIds) {
    const passengerObj = { reservationId: id, pickupCity };

    // Aller
    await updateDoc(doc(db, "transports", CONVOI_NORD_ALLER_ID), {
      passengers: arrayUnion(passengerObj),
    });
    console.log(`  ↑ ALLER — ${label} ajouté (pickupCity: ${pickupCity})`);

    // Retour
    await updateDoc(doc(db, "transports", CONVOI_NORD_RETOUR_ID), {
      passengers: arrayUnion(passengerObj),
    });
    console.log(`  ↓ RETOUR — ${label} ajouté`);
  }

  console.log("\n✅  Tout terminé !");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
