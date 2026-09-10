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
  ["Autres subventions à préciser", "74::autressubventionsapreciser"],
  ["Etat", "74::etat"],
  ["Fonds Social Europeen", "74::fondssocialeuropeen"],
  ["Subventions privees", "74::subventionsprivees"],
  ["Entreprises", "74::entreprises"],
  ["Autres à préciser - Dons", "74::autresapreciserdons"],
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
    { label: "Ventes et restes à encaisser - clôture 2026", account: "70", amount: 47680.68 },
    { label: "VACAF", account: "74", amount: 152804.75 },
    { label: "Département", account: "74", amount: 17500 },
    ...hiddenZeroSubsidyProductLines,
    { label: "Report de l'excédent 2026", account: "75", amount: 11276, _templateKey: "75::reportexcedent2026", _autoReportKey: "75::reportexcedent2026" },
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
    { label: "Mise à disposition gratuite de biens", account: "861", amount: 0 },
    { label: "Secours en nature", account: "860", amount: 0 },
  ],
  voluntaryProducts: [
    { label: "Benevolat", account: "875", amount: 52500 },
    { label: "Prestations en nature", account: "871", amount: 0 },
    { label: "Dons en nature", account: "870", amount: 0 },
  ],
  note: "Projection 2027 construite strictement à partir des mêmes postes que le budget 2026, avec un multiplicateur de 1,75 sur chaque ligne. Le report automatique de l'excédent 2026 reste calculé séparément.",
};

const cashPlan2027 = [
  { month: "Janvier", inflows: 20000, outflows: 41000, note: "Acomptes hébergements, trains et lancement. Le solde initial 2026 est repris séparément." },
  { month: "Février", inflows: 70000, outflows: 42000, note: "Encaissements forts pendant les séjours d'hiver et premiers soldes familles/partenaires." },
  { month: "Mars", inflows: 60000, outflows: 25000, note: "Grosses enveloppes post-séjours : soldes groupes, aides et paiements restants." },
  { month: "Avril", inflows: 18000, outflows: 32000, note: "Préparation été, frais courants et premiers acomptes fournisseurs." },
  { month: "Mai", inflows: 62000, outflows: 94000, note: "Forte avance de trésorerie : hébergements été, prestataires et transports, compensée par acomptes familles." },
  { month: "Juin", inflows: 88000, outflows: 96000, note: "Deuxième vague d'acomptes trains/hébergements avec encaissements été déjà engagés." },
  { month: "Juillet", inflows: 85000, outflows: 74000, note: "Pic d'encaissements été, avec dépenses de séjour encore élevées." },
  { month: "Août", inflows: 60000, outflows: 61000, note: "Encaissements lissés pendant les séjours et dépenses opérationnelles." },
  { month: "Septembre", inflows: 40000, outflows: 33000, note: "Soldes post-séjours, aides et régularisations après la saison." },
  { month: "Octobre", inflows: 4000, outflows: 3500, note: "Basse saison et frais de structure limités." },
  { month: "Novembre", inflows: 3000, outflows: 2000, note: "Frais fixes et suivi administratif hors saison." },
  { month: "Décembre", inflows: 10944.94, outflows: 803.54, note: "Clôture annuelle et derniers ajustements de trésorerie." },
];

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast2027,
  openingBalance2027: 11276,
  cashPlan2027,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Previsionnel 2027 synchronise dans accounting_reports/colocrew-2026.");
process.exit(0);
