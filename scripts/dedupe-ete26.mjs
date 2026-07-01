// dedupe-ete26.mjs
// Nettoie les doublons créés par sync-ete26-csv.mjs / sync-ete26-validated-workbook.mjs :
// - supprime les réservations "validated" en double (même enfant, même séjour)
// - fusionne les montants manquants sur les vraies réservations conservées
//
// Dry-run par défaut. node scripts/dedupe-ete26.mjs --apply pour exécuter.

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, deleteDoc, updateDoc, getDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });
const db = getFirestore(app);

const DELETE_IDS = [
  ["19Bfjuuzg00Zac4qo4Ky", "EVCC-S3-089-BOS", "Kyle Boscher (doublon workbook, vrai = RES-1006THO)"],
  ["XqFoma0VPjoyyxnkQdHX", "MCSC-S4-082-BER", "Keyla Berthe (doublon workbook)"],
  ["XumQTtpu9pLIMCs0206k", "MCSC-S1-073-RAU", "Océane Raude (doublon workbook)"],
  ["4qwmYnceEH4KF5OcQ6Aj", "EVCC-S3-066-DIN", "Jahyan Dindangila (doublon workbook)"],
  ["xHXjT1LWkrKJbYHD2SdB", "EVCC-S2-101-SOU", "Djibril Soumare (doublon workbook)"],
  ["6rLUtrZy1T3a4SVefnXE", "EVCC-S3-088-THO", "Maxime Thouard (doublon workbook, vrai = RES-1006THO)"],
  ["7MMJLwz7AbpcBjmo8lCM", "EVCC-S2-065-MAK", "El Gloria Makita (doublon workbook)"],
  ["eHhVHVfEwYzjDFuXvxot", "MCSC-S4-083-DRA", "Soumaila Drame (doublon workbook)"],
  ["E87o5lalk4ryRiNguDka", "EVCC-S2-099-MAC", "Samy Macaronus (doublon workbook)"],
  ["fkRrzyRq7Ikzbc9yX5gK", "EVCC-S2-100-SOU", "Mokhtar Soumare (doublon workbook)"],
  ["l0p8eSt1MhbpODGLzJB7", "EVCC-S2-096-KON", "Mohamed Kone (doublon workbook)"],
  ["Wd1aJBETu3IRMScWEcJ8", "MCSC-S2-104-KEH", "Mohamed Kehlaoui (doublon workbook)"],
  ["JkOOOG3AIY7GaCJogBjU", "EVCC-S2-102-CAM", "Goundo Camara (doublon workbook)"],
  ["K42jZRroFeYm5fhrV6CQ", "EVCC-S2-093-BOE", "Maodan Boete (doublon workbook)"],
  ["v5cEDZJL4r3tdZGEyyab", "EVCC-S2-090-BOE", "Timoe Boete (doublon workbook, vrai = RES-1606SOL)"],
  ["i6HiSYd4vQ3hyjKeKCzt", "EVCC-S2-091-BOE", "Iloan Boete (doublon workbook, vrai = RES-1606SOL)"],
  ["hRt7jPr5hMX0x3qQ6gMR", "MCSC-S3-049-RIP", "Typhaine Rippling (doublon workbook)"],
  ["x1q0UHQAL5v6ofM4vhkQ", "EVCC-S2-103-HAM", "Nazad Hamidou (doublon workbook)"],
  ["gbT6SzOpqMByYlXkZJIT", "EVCC-S2-097-DIA", "Diahouba Diawara (doublon workbook)"],
  ["6ehGfH1SI3Qlb02be7Fu", "MCSC-S1-146-LAN", "Haroun Lanseur (doublon créé aujourd'hui, vrai = RES-2906556)"],
  ["2hJZgIQ14E7JQY6AaQZ5", "MCSC-S1-144-COL", "Léa Colonette (doublon créé aujourd'hui, vrai = RES-2706MAR)"],
  ["vlBuJYnftG55CE8iEkg5", "EVCC-S3-105-SAM", "Samuel (déchet ancien xlsx, aucune donnée, absent du CSV actuel)"],
];

console.log(`\n${shouldApply ? "APPLY" : "DRY-RUN"} — suppression de ${DELETE_IDS.length} réservations en double\n`);
for (const [id, ref, reason] of DELETE_IDS) {
  console.log(`  - ${ref.padEnd(20)} ${reason}`);
  if (shouldApply) await deleteDoc(doc(db, "reservations", id));
}

// ── Corrections sur les réservations conservées ─────────────────────────────

// 1) RES-1006THO : fusionner la ligne Kyle Boscher (ambiguë au sync, jamais appliquée)
const thouardPatch = {
  finance: {
    stayAmount: 1718.4,
    transportAmount: 120,
    grossAmount: 1838.4,
    cafAidAmount: 288,
    netAmount: 1550.4,
    paidAmount: 100,
    remainingAmount: 1450.4,
    source: "ETE 26 - Inscriptions validées - Suivi inscris (1).csv",
    entries: [
      {
        csvRow: 87, childFirstName: "Maxime", childLastName: "Thouard", reference: "", stayCode: "EVCC", week: "S3",
        departureCity: "Bordeaux", returnCity: "Bordeaux", grossAmount: 919.2, netAmount: 775.2, stayAmount: 859.2,
        transportAmount: 60, cafAidAmount: 144, paidAmount: 0, invoiceIssued: false, matchMethod: "email_child",
      },
      {
        csvRow: 88, childFirstName: "Kyle", childLastName: "Boscher", reference: "", stayCode: "EVCC", week: "S3",
        departureCity: "Bordeaux", returnCity: "Bordeaux", grossAmount: 919.2, netAmount: 775.2, stayAmount: 859.2,
        transportAmount: 60, cafAidAmount: 144, paidAmount: 100, invoiceIssued: false, matchMethod: "manual_merge_ambiguous",
      },
    ],
  },
  "transport.departureCity": "Bordeaux",
  "transport.returnCity": "Bordeaux",
  "transport.fee": 120,
  "payment.totalPrice": 1838.4,
  "payment.validatedPrice": 1838.4,
  "payment.transportFee": 120,
  "payment.cafAmount": 288,
  "payment.cafEligible": true,
  "payment.resteACharge": 1550.4,
  "payment.alreadyPaid": 100,
  "payment.remainingValue": 1450.4,
  "payment.paymentStatus": "in_progress",
};

// 2) RES-2906556 : corriger l'inversion prénom/nom + ajouter la finance (vide jusqu'ici)
const lanseurPatch = {
  "minor.children": [{
    firstName: "Haroun", lastName: "Lanseur", birthDate: "2011-01-17", city: "", birthPlace: "",
  }],
  finance: {
    stayAmount: 950, transportAmount: 150, grossAmount: 1100, cafAidAmount: 150, netAmount: 500,
    paidAmount: 0, remainingAmount: 500,
    source: "ETE 26 - Inscriptions validées - Suivi inscris (1).csv",
    entries: [{
      csvRow: 146, childFirstName: "Haroun", childLastName: "Lanseur", reference: "", stayCode: "MCSC", week: "S1",
      departureCity: "Paris", returnCity: "Paris", grossAmount: 1100, netAmount: 500, stayAmount: 950,
      transportAmount: 150, cafAidAmount: 150, paidAmount: 0, invoiceIssued: false, matchMethod: "manual_merge_swap",
    }],
  },
  "transport.departureCity": "Paris",
  "transport.returnCity": "Paris",
  "transport.fee": 150,
  "payment.totalPrice": 1100,
  "payment.validatedPrice": 1100,
  "payment.transportFee": 150,
  "payment.cafAmount": 150,
  "payment.cafEligible": true,
  "payment.resteACharge": 500,
  "payment.alreadyPaid": 0,
  "payment.remainingValue": 500,
  "payment.paymentStatus": "not_paid",
};

// 3) RES-2706MAR : ajouter la finance (vide jusqu'ici)
const colonnettePatch = {
  finance: {
    stayAmount: 950, transportAmount: 150, grossAmount: 1100, cafAidAmount: 150, netAmount: 1100,
    paidAmount: 0, remainingAmount: 1100,
    source: "ETE 26 - Inscriptions validées - Suivi inscris (1).csv",
    entries: [{
      csvRow: 144, childFirstName: "Léa", childLastName: "Colonnette", reference: "", stayCode: "MCSC", week: "S1",
      departureCity: "Paris", returnCity: "Paris", grossAmount: 1100, netAmount: 1100, stayAmount: 950,
      transportAmount: 150, cafAidAmount: 0, paidAmount: 0, invoiceIssued: false, matchMethod: "manual_merge_typo",
    }],
  },
  "transport.departureCity": "Paris",
  "transport.returnCity": "Paris",
  "transport.fee": 150,
  "payment.totalPrice": 1100,
  "payment.validatedPrice": 1100,
  "payment.transportFee": 150,
  "payment.cafAmount": 0,
  "payment.cafEligible": false,
  "payment.resteACharge": 1100,
  "payment.alreadyPaid": 0,
  "payment.remainingValue": 1100,
  "payment.paymentStatus": "not_paid",
};

console.log("\nCorrections sur réservations conservées :");
console.log("  - RES-1006THO (fusion Maxime + Kyle)");
console.log("  - RES-2906556 (fix inversion prénom/nom Lanseur + finance)");
console.log("  - RES-2706MAR (ajout finance Colonnette)");

if (shouldApply) {
  await updateDoc(doc(db, "reservations", "iSwoNNCxgWl0vGi3yiWq"), thouardPatch);
  await updateDoc(doc(db, "reservations", "DdXIUp5j9leKd8ZvDJfq"), lanseurPatch);
  await updateDoc(doc(db, "reservations", "TcGzrg2KDB60kS6qvrAa"), colonnettePatch);
  console.log("\n✅ Terminé.");
} else {
  console.log("\n▶ Relance avec --apply pour exécuter.");
}
process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
