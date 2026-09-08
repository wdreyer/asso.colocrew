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
  { label: "Alimentation des séjours", account: "6061", amount: 18774.88 },
  { label: "Fournitures, matériel, pédagogie, santé, investissements et fonctionnement", account: "6063", amount: 8280.09 },
  { label: "Carburant, entretien véhicule et péages séjours", account: "6068", amount: 3308.4 },
  { label: "Hébergement, activités et prestataires séjours", account: "613", amount: 63057.47 },
  { label: "Assurance", account: "616", amount: 81.68 },
  { label: "Multimédia, stockage, vie d'équipe et formation", account: "618", amount: 1318.02 },
  { label: "Marketing, publicité, emailing, textile et papier", account: "623", amount: 2406.76 },
  { label: "Transports collectifs, fret et bus séjours", account: "625", amount: 22834.63 },
  { label: "Déplacements du personnel", account: "6251", amount: 2175.69 },
  { label: "Repas et hébergement du personnel", account: "6256", amount: 4071.22 },
  { label: "Téléphonie", account: "626", amount: 204.99 },
  { label: "Frais bancaires et abonnements banque", account: "627", amount: 400.83 },
  { label: "Salaires bruts", account: "64", amount: 11461.2 },
  { label: "Charges sociales de l'employeur", account: "64", amount: 4011.42 },
  { label: "Amende", account: "671", amount: 75 },
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
