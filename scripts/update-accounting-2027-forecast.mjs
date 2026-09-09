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

const forecast2027 = {
  products: [
    { label: "Ventes de sejours et participations familles", account: "70", amount: 364297.98 },
    { label: "Subventions, aides CAF/VACAF et partenaires publics", account: "74", amount: 131215.49 },
    { label: "Dons, apports et réserves de développement", account: "75", amount: 132074.96 },
    { label: "Remboursements et transferts de charges", account: "79", amount: 5872.2 },
  ],
  expenses: [
    { label: "Achats, alimentation, fournitures et operations", account: "60", amount: 54933.7 },
    { label: "Hebergements, locations, activites et prestataires", account: "61", amount: 346020.22 },
    { label: "Transports, communication, administratif, banque et technologies", account: "62", amount: 93414.03 },
    { label: "Impots et taxes", account: "63", amount: 1590.07 },
    { label: "Salaires bruts", account: "64", amount: 77154.74 },
    { label: "Charges sociales de l'employeur", account: "64", amount: 27004.15 },
    { label: "Regularisations de cloture et marge de securite", account: "65", amount: 29611.2 },
  ],
  voluntaryExpenses: [
    { label: "Personnel benevole", account: "864", amount: 52500 },
    { label: "Mise a disposition gratuite de biens", account: "861", amount: 0 },
    { label: "Secours en nature", account: "860", amount: 0 },
  ],
  voluntaryProducts: [
    { label: "Benevolat", account: "875", amount: 52500 },
    { label: "Prestations en nature", account: "871", amount: 0 },
    { label: "Dons en nature", account: "870", amount: 0 },
  ],
  note: "Projection 2027 construite a partir de l'atterrissage 2026 avec un multiplicateur moyen de 1,75. Les coefficients varient legerement par poste pour tenir compte d'une hausse plus forte des sejours, hebergements et personnels, et plus mesuree sur les regularisations.",
};

const cashPlan2027 = [
  { month: "Janvier", inflows: 12500, outflows: 6030.55, note: "Preparation administrative, premiers acomptes et 0,5 ETP" },
  { month: "Fevrier", inflows: 48500, outflows: 57230.55, note: "Premiere tension de tresorerie : acomptes, transports, inscriptions et 0,5 ETP" },
  { month: "Mars", inflows: 15500, outflows: 16630.55, note: "Suivi inscriptions, depenses courantes et 0,5 ETP" },
  { month: "Avril", inflows: 17500, outflows: 17230.55, note: "Preparation operationnelle et 0,5 ETP" },
  { month: "Mai", inflows: 30000, outflows: 27230.55, note: "Acomptes fournisseurs, montee en charge et 0,5 ETP" },
  { month: "Juin", inflows: 122000, outflows: 117230.55, note: "Lancement saison ete et 0,5 ETP" },
  { month: "Juillet", inflows: 160500, outflows: 151730.55, note: "Pic sejours ete et 0,5 ETP" },
  { month: "Aout", inflows: 135800, outflows: 130230.55, note: "Pic sejours ete, retours et 0,5 ETP" },
  { month: "Septembre", inflows: 28500, outflows: 26230.55, note: "Encaissements residuels, cloture ete et 0,5 ETP" },
  { month: "Octobre", inflows: 55000, outflows: 62230.55, note: "Formations, regularisations, Toussaint et 0,5 ETP" },
  { month: "Novembre", inflows: 6500, outflows: 7230.55, note: "Basse saison et 0,5 ETP" },
  { month: "Decembre", inflows: 1160.63, outflows: 10492.06, note: "Cloture annuelle, frais de structure et 0,5 ETP" },
];

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast2027,
  cashPlan2027,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Previsionnel 2027 synchronise dans accounting_reports/colocrew-2026.");
process.exit(0);
