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
  { month: "Janvier", inflows: 31276, outflows: 41000, note: "Solde initial 2026 de 11 276 EUR inclus, puis acomptes hebergements, trains et lancement." },
  { month: "Fevrier", inflows: 70000, outflows: 42000, note: "Encaissements forts pendant les sejours d'hiver et premiers soldes familles/partenaires." },
  { month: "Mars", inflows: 60000, outflows: 25000, note: "Grosses enveloppes post-sejours : soldes groupes, aides et paiements restants." },
  { month: "Avril", inflows: 18000, outflows: 32000, note: "Preparation ete, frais courants et premiers acomptes fournisseurs." },
  { month: "Mai", inflows: 62000, outflows: 94000, note: "Forte avance de tresorerie : hebergements ete, prestataires et transports, compensee par acomptes familles." },
  { month: "Juin", inflows: 88000, outflows: 96000, note: "Deuxieme vague d'acomptes trains/hebergements avec encaissements ete deja engages." },
  { month: "Juillet", inflows: 85000, outflows: 74000, note: "Pic d'encaissements ete, avec depenses de sejour encore elevees." },
  { month: "Aout", inflows: 60000, outflows: 61000, note: "Encaissements lisses pendant les sejours et depenses operationnelles." },
  { month: "Septembre", inflows: 40000, outflows: 33000, note: "Soldes post-sejours, aides et regularisations apres la saison." },
  { month: "Octobre", inflows: 4000, outflows: 3500, note: "Basse saison et frais de structure limites." },
  { month: "Novembre", inflows: 3000, outflows: 2000, note: "Frais fixes et suivi administratif hors saison." },
  { month: "Decembre", inflows: 10944.94, outflows: 803.54, note: "Cloture annuelle et derniers ajustements de tresorerie." },
];

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast2027,
  cashPlan2027,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Previsionnel 2027 synchronise dans accounting_reports/colocrew-2026.");
process.exit(0);
