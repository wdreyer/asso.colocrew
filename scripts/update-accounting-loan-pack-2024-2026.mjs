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

const accountingPatch = {
  financial2024: {
    products: [
      { label: "Participation des adhérents, cotisations, dons manuels ou legs", account: "75", amount: 370 },
      { label: "Dons", account: "74", amount: 100 },
    ],
    expenses: [
      { label: "Assurance", account: "61", amount: 29.7 },
      { label: "Frais postaux, téléphone et services bancaires", account: "62", amount: 53.13 },
    ],
    voluntary: [],
    assets: [
      { label: "Trésorerie reportée sur l'exercice suivant", account: "5", amount: 387.17 },
    ],
    liabilities: [
      { label: "Résultat associatif 2024", account: "12", amount: 387.17 },
    ],
    note: "L'exercice 2024 correspond à une première année légère de structuration administrative. Les charges restent limitées et les ressources proviennent principalement des cotisations et dons, avec un excédent reportable de 387,17 €.",
  },
  financial2025: {
    products: [
      { label: "Vente de séjours", account: "70", amount: 108857.3 },
      { label: "CAF / VACAF", account: "74", amount: 17079.44 },
      { label: "SDJES 93", account: "74", amount: 9900 },
      { label: "Apport exercice 2024", account: "75", amount: 470 },
      { label: "Adhésions", account: "756", amount: 135 },
      { label: "Dons, mécénat et prêts requalifiés en dons", account: "758", amount: 7400 },
    ],
    expenses: [
      { label: "Achats alimentation sejours", account: "60", amount: 18774.88 },
      { label: "Fournitures, materiel, pedagogie, sante et divers sejours", account: "60", amount: 5417.4 },
      { label: "Essence, entretien vehicule et peages sejours", account: "60", amount: 3308.4 },
      { label: "Abonnements banque, multimedia, stockage, telephonie et publicite", account: "61", amount: 1189.09 },
      { label: "Hebergement, activites sportives, entretien et services prestataires", account: "61", amount: 63057.47 },
      { label: "Fournitures, investissements, courrier et materiel de fonctionnement", account: "61", amount: 2862.69 },
      { label: "Transports collectifs, fret, bus, essence et peages", account: "62", amount: 22834.63 },
      { label: "Marketing, emailing, textile, papier et campagne numerique", account: "62", amount: 2366.06 },
      { label: "Assurance, frais bancaires et amende", account: "62", amount: 203.51 },
      { label: "Frais de personnel, salaires et vie d'equipe", account: "64", amount: 22448.15 },
    ],
    assets: [
      { label: "Immobilisations", account: "2", amount: 2700 },
      { label: "Trésorerie disponible", account: "5", amount: 1379.46 },
    ],
    liabilities: [
      { label: "Fonds associatif et résultat positif 2025", account: "1", amount: 1379.46 },
      { label: "Dons requalifiés - aucune dette financière liée aux anciens prêts", account: "75/758", amount: 0 },
    ],
    note: "L'exercice 2025 se clôture sur une trésorerie positive. Les avances initialement suivies comme prêts sont requalifiées en dons, ce qui clarifie la situation financière et fait ressortir un exercice équilibré, sans dette financière associée à ces apports.",
  },
  landing2026: {
    bankMonthly: [
      { month: "Janvier", inflows: 7684.13, outflows: 3198.16, note: "Préparation et premiers encaissements" },
      { month: "Février", inflows: 26191.52, outflows: 30064.88, note: "Première forte période d'activité" },
      { month: "Mars", inflows: 9563.22, outflows: 9889.77, note: "Suivi inscriptions et dépenses courantes" },
      { month: "Avril", inflows: 10852.19, outflows: 9936.78, note: "Préparation opérationnelle" },
      { month: "Mai", inflows: 17404.7, outflows: 15195.65, note: "Montée en charge" },
      { month: "Juin", inflows: 67145.42, outflows: 65079.57, note: "Lancement saison été" },
      { month: "Juillet", inflows: 86432.21, outflows: 80130.02, note: "Pic séjours été" },
      { month: "Août", inflows: 73482.89, outflows: 72838.11, note: "Pic séjours été" },
      { month: "Septembre", inflows: 17632.87, outflows: 15528.21, note: "Encaissements résiduels au 03/09" },
    ],
    bankCategories: [
      { label: "Chiffre d'affaires", account: "70", amount: 154816.82 },
      { label: "Subventions et aides", account: "74", amount: 76604.46 },
      { label: "Autres encaissements, apports et régularisations", account: "75/79", amount: 84969.87 },
    ],
    expenseCategories: [
      { label: "Frais de personnel", account: "64", amount: 36566.53 },
      { label: "Travel expenses / transports", account: "625", amount: 39114.99 },
      { label: "Nourriture et boissons", account: "60", amount: 13091.32 },
      { label: "Dépenses opérationnelles et séjours", account: "60-62", amount: 136226.1 },
      { label: "Marketing, technologies, administratif, banque et taxes", account: "62-66", amount: 76862.21 },
      { label: "Charges de clôture estimées restant à engager", account: "60-68", amount: 4530 },
    ],
    note: "Au 3 septembre 2026, les extraits Qonto montrent déjà plus de 316 k€ d'encaissements. Après intégration des charges de clôture estimées restant à engager, l'atterrissage 2026 vise un excédent d'environ 10 000 €. L'activité est fortement saisonnière, avec une première tension en février puis une concentration majeure des flux sur juin, juillet et août.",
  },
  forecast: {
    products: [
      { label: "Participation des usagers / ventes de séjours", account: "70", amount: 320000 },
      { label: "État / SDJES", account: "74", amount: 20000 },
      { label: "Conseil régional", account: "74", amount: 40000 },
      { label: "Conseil départemental", account: "74", amount: 16000 },
      { label: "Communes / intercommunalités", account: "74", amount: 12000 },
      { label: "Organismes sociaux CAF / VACAF", account: "74", amount: 40000 },
      { label: "Cotisations", account: "756", amount: 2000 },
      { label: "Dons manuels / mécénat", account: "758", amount: 5000 },
      { label: "Produits financiers", account: "76", amount: 1000 },
      { label: "Refacturations / remboursements", account: "79", amount: 4000 },
    ],
    expenses: [
      { label: "Achats matières et fournitures", account: "60", amount: 95000 },
      { label: "Autres fournitures", account: "60", amount: 40000 },
      { label: "Locations centres, salles, matériel", account: "61", amount: 110000 },
      { label: "Entretien et réparation", account: "61", amount: 6000 },
      { label: "Assurance", account: "61", amount: 8000 },
      { label: "Documentation", account: "61", amount: 6000 },
      { label: "Honoraires / intervenants", account: "62", amount: 64000 },
      { label: "Publicité, publication, relations publiques", account: "62", amount: 8000 },
      { label: "Impôts et taxes", account: "63", amount: 5000 },
      { label: "Rémunération des personnels", account: "64", amount: 55000 },
      { label: "Charges sociales", account: "64", amount: 22000 },
      { label: "Autres charges de personnel", account: "64", amount: 5000 },
      { label: "Autres charges de gestion courante", account: "65", amount: 10000 },
      { label: "Charges financières", account: "66", amount: 2000 },
      { label: "Charges exceptionnelles", account: "67", amount: 4000 },
      { label: "Dotations amortissements / provisions", account: "68", amount: 10000 },
    ],
    voluntary: [
      { label: "Personnel bénévole", account: "864 / 875", amount: 30000 },
    ],
  },
  updatedAt: serverTimestamp(),
};

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), accountingPatch, { merge: true });

console.log("Document accounting_reports/colocrew-2026 mis à jour pour le pack prêt 2024-2026.");
process.exit(0);
