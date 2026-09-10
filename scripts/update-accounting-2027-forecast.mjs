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

const hiddenZeroSubsidyProductLines = [
  ["Collectivites territoriales", "74::collectivitesterritoriales"],
  ["Pantin", "74::pantin"],
  ["Pantin Contrat de ville", "74::pantincontratdeville"],
  ["Aubervilliers", "74::aubervilliers"],
  ["Region", "74::region"],
  ["Autres subventions a preciser", "74::autressubventionsapreciser"],
  ["Etat", "74::etat"],
  ["Fonds Social Europeen", "74::fondssocialeuropeen"],
  ["Subventions privees", "74::subventionsprivees"],
  ["Entreprises", "74::entreprises"],
  ["Autres a preciser - Dons", "74::autresapreciserdons"],
].map(([label, templateKey]) => ({
  label,
  account: "74",
  _templateKey: templateKey,
  amount: 0,
  deleted: true,
}));

const forecast2027 = {
  products: [
    { label: "Ventes Qonto - Stripe, Totemia, familles et groupes", account: "70", amount: 299307.26 },
    { label: "Ventes et restes a encaisser - cloture 2026", account: "70", amount: 47680.68 },
    { label: "VACAF", account: "74", amount: 152804.75 },
    { label: "Departement", account: "74", amount: 17500 },
    ...hiddenZeroSubsidyProductLines,
    { label: "Report de l'excedent 2026", account: "75", amount: 11276, _templateKey: "75::reportexcedent2026", _autoReportKey: "75::reportexcedent2026" },
    { label: "Remboursements SNCF et autres", account: "79", amount: 3652.25 },
  ],
  expenses: [
    { label: "Achats, alimentation, fournitures et operations", account: "60", amount: 43117.11 },
    { label: "Hebergements, locations, activites et prestataires", account: "61", amount: 247068.66 },
    { label: "Transports, communication, administratif, banque et technologies", account: "62", amount: 115334.42 },
    { label: "Impots et taxes", account: "63", amount: 3951.5 },
    { label: "Salaires bruts", account: "64", amount: 70245.82 },
    { label: "Charges sociales de l'employeur", account: "64", amount: 24586.03 },
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
  note: "Projection 2027 construite strictement a partir des memes postes que le budget 2026, avec un multiplicateur de 1,75 sur chaque ligne. Le report automatique de l'excedent 2026 reste calcule separement.",
};

const cashPlan2027 = [
  { month: "Janvier", inflows: 13447.23, outflows: 5304.53, note: "Base 2026 x1,75" },
  { month: "Fevrier", inflows: 45835.16, outflows: 52496.12, note: "Base 2026 x1,75" },
  { month: "Mars", inflows: 16735.64, outflows: 17649.63, note: "Base 2026 x1,75" },
  { month: "Avril", inflows: 18991.33, outflows: 17456.51, note: "Base 2026 x1,75" },
  { month: "Mai", inflows: 30458.23, outflows: 25928.88, note: "Base 2026 x1,75" },
  { month: "Juin", inflows: 117504.49, outflows: 114132.69, note: "Base 2026 x1,75" },
  { month: "Juillet", inflows: 136293.87, outflows: 127052.33, note: "Base 2026 x1,75" },
  { month: "Aout", inflows: 101759.96, outflows: 101499.88, note: "Base 2026 x1,75" },
  { month: "Septembre", inflows: 41291.53, outflows: 42782.99, note: "Base 2026 x1,75" },
  { month: "Rapprochement", inflows: 1719.11, outflows: 0, note: "Base 2026 x1,75" },
  { month: "Novembre", inflows: 0, outflows: 0, note: "A completer si nouveaux flux" },
  { month: "Decembre", inflows: 0, outflows: 0, note: "A completer si nouveaux flux" },
];

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast2027,
  cashPlan2027,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Previsionnel 2027 synchronise dans accounting_reports/colocrew-2026.");
process.exit(0);
