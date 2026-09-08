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

const products2026 = [
  { label: "Ventes de sejours et participations", account: "70", amount: 198527.51 },
  { label: "Subventions et aides", account: "74", amount: 78104.46 },
  { label: "Autres produits et apports", account: "75", amount: 81527.75 },
  { label: "Remboursements et transferts de charges", account: "79", amount: 3817.83 },
];

const expenses2026 = [
  { label: "Achats, alimentation, fournitures et operations", account: "60", amount: 30183.35 },
  { label: "Hebergements, locations, activites et prestataires", account: "61", amount: 194393.38 },
  { label: "Transports, communication, administratif, banque et technologies", account: "62", amount: 54810.79 },
  { label: "Impots et taxes", account: "63", amount: 1025.85 },
  { label: "Personnel, salaires et URSSAF", account: "64", amount: 46317.28 },
  { label: "Autres regularisations de cloture", account: "65", amount: 24676 },
];

const note2026 = "Atterrissage 2026 repris depuis l'export Qonto au 03/09/2026 et le tableau de cloture transmis. Les flux Qonto exacts representent 316 389,15 EUR d'encaissements et 301 861,15 EUR de decaissements ; le tableau ajoute 45 588,40 EUR a encaisser et 49 545,50 EUR a payer apres retrait du solde bancaire deja disponible. Les remboursements de prets sont integres en regularisations de cloture et devront etre neutralises dans la lecture de bilan, sans creer de categories visibles par personne.";

const forecast = {
  products: products2026,
  expenses: expenses2026,
  voluntaryExpenses: [
    { label: "Personnel benevole", account: "864", amount: 30000 },
    { label: "Mise a disposition gratuite de biens", account: "861", amount: 0 },
    { label: "Secours en nature", account: "860", amount: 0 },
  ],
  voluntaryProducts: [
    { label: "Benevolat", account: "875", amount: 30000 },
    { label: "Prestations en nature", account: "871", amount: 0 },
    { label: "Dons en nature", account: "870", amount: 0 },
  ],
  note: "Budget 2026 repris depuis l'export Qonto complet transmis et le tableau de cloture. Le solde bancaire deja disponible n'est pas compte comme un produit supplementaire ; seuls les encaissements restants hors solde sont ajoutes. Les postes restent ranges dans les categories du bilan comptable ; les remboursements de prets sont integres en regularisations de cloture afin de ne pas creer de categories visibles par personne.",
};

const landing2026 = {
  bankMonthly: [
    { month: "Janvier", inflows: 7684.13, outflows: 3198.16, note: "Qonto reel" },
    { month: "Fevrier", inflows: 26191.52, outflows: 30064.88, note: "Qonto reel" },
    { month: "Mars", inflows: 9563.22, outflows: 9889.77, note: "Qonto reel" },
    { month: "Avril", inflows: 10852.19, outflows: 9936.78, note: "Qonto reel" },
    { month: "Mai", inflows: 17404.7, outflows: 15195.65, note: "Qonto reel" },
    { month: "Juin", inflows: 67145.42, outflows: 65079.57, note: "Qonto reel" },
    { month: "Juillet", inflows: 86432.21, outflows: 80130.02, note: "Qonto reel" },
    { month: "Aout", inflows: 73482.89, outflows: 72838.11, note: "Qonto reel" },
    { month: "Septembre", inflows: 17632.87, outflows: 15528.21, note: "Qonto reel au 03/09" },
    { month: "Octobre", inflows: 45588.4, outflows: 49545.5, note: "Reste 2026 hors solde bancaire deja disponible" },
    { month: "Novembre", inflows: 0, outflows: 0, note: "A completer si nouveaux flux" },
    { month: "Decembre", inflows: 0, outflows: 0, note: "A completer si nouveaux flux" },
  ],
  bankCategories: products2026,
  expenseCategories: expenses2026,
  note: note2026,
};

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast,
  landing2026,
  cashPlan2026: landing2026.bankMonthly,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Atterrissage et budget 2026 synchronises dans accounting_reports/colocrew-2026.");
process.exit(0);
