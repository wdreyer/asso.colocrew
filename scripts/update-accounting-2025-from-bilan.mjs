import { initializeApp, getApps } from "firebase/app";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);

const products2025 = [
  { label: "Vente de séjours", account: "70", amount: 108857.3 },
  { label: "CAF / VACAF", account: "74", amount: 17079.44 },
  { label: "SDJES 93", account: "74", amount: 9900 },
  { label: "Apport exercice 2024", account: "75", amount: 470 },
  { label: "Adhésions", account: "756", amount: 135 },
  { label: "Dons, mécénat et prêts requalifiés en dons", account: "758", amount: 7400 },
];

const expenses2025 = [
  { label: "Achats alimentation séjours", account: "60", amount: 18774.88 },
  { label: "Fournitures, matériel, pédagogie, santé et divers séjours", account: "60", amount: 5417.4 },
  { label: "Essence, entretien véhicule et péages séjours", account: "60", amount: 3308.4 },
  { label: "Abonnements banque, multimédia, stockage, téléphonie et publicité", account: "61", amount: 1189.09 },
  { label: "Hébergement, activités sportives, entretien et services prestataires", account: "61", amount: 63057.47 },
  { label: "Fournitures, investissements, courrier et matériel de fonctionnement", account: "61", amount: 2862.69 },
  { label: "Transports collectifs, fret, bus, essence et péages", account: "62", amount: 22834.63 },
  { label: "Marketing, emailing, textile, papier et campagne numérique", account: "62", amount: 2366.06 },
  { label: "Assurance, frais bancaires et amende", account: "62", amount: 203.51 },
  { label: "Frais de personnel, salaires et vie d'équipe", account: "64", amount: 22448.15 },
];

const financial2025 = {
  products: products2025,
  expenses: expenses2025,
  assets: [
    { label: "Immobilisations", account: "2", amount: 2700 },
    { label: "Trésorerie disponible", account: "5", amount: 1379.46 },
  ],
  liabilities: [
    { label: "Fonds associatif et résultat positif 2025", account: "1", amount: 1379.46 },
    { label: "Dons requalifiés - aucune dette financière liée aux anciens prêts", account: "75/758", amount: 0 },
  ],
  note: "Bilan 2025 repris depuis le fichier Excel transmis : les charges sont ventilées par postes détaillés de fonctionnement, séjours, transports, prestataires, marketing et personnel. Les prêts suivis dans l'Excel sont requalifiés en dons, ce qui maintient l'exercice en résultat positif.",
};

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  actual: {
    products: [
      { label: "Vente de séjours / participations familles", account: "70", amount: 108857.3 },
      { label: "CAF / VACAF", account: "74", amount: 17079.44 },
      { label: "SDJES 93", account: "74", amount: 9900 },
      { label: "Apport exercice 2024", account: "75", amount: 470 },
      { label: "Adhésions", account: "756", amount: 135 },
      { label: "Dons / mécénat", account: "758", amount: 1400 },
      { label: "Apports requalifiés en dons", account: "758", amount: 6000 },
    ],
    expenses: expenses2025,
  },
  financial2025,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Bilan 2025 detaille synchronise dans accounting_reports/colocrew-2026.");
process.exit(0);
