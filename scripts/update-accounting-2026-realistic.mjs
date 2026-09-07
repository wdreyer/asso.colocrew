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

const forecast = {
  products: [
    { label: "Compte Qonto disponible suivi", account: "5", amount: 10530.32 },
    { label: "En cours Colo - encaissements familles", account: "70", amount: 38010.4 },
    { label: "Stains - participation groupe", account: "70", amount: 3028 },
    { label: "ALJEP - participation partenaire", account: "74", amount: 1500 },
    { label: "Remboursement SNCF", account: "79", amount: 2000 },
    { label: "Remboursement expulsion", account: "79", amount: 450 },
    { label: "Remboursement Farmed", account: "79", amount: 400 },
    { label: "Remboursement taxis", account: "79", amount: 200 },
  ],
  expenses: [
    { label: "Remboursement prêt Simon", account: "168", amount: 7000 },
    { label: "Remboursement prêt Coco", account: "168", amount: 4500 },
    { label: "Remboursement prêts Wiwi, Louis et Claire", account: "168", amount: 8326 },
    { label: "Remboursement prêt Marion", account: "168", amount: 4850 },
    { label: "Surf - prestations d'activités", account: "613", amount: 11118.75 },
    { label: "Mobilhome complémentaire", account: "613", amount: 2000 },
    { label: "Minibus", account: "625", amount: 2000 },
    { label: "URSSAF", account: "645", amount: 9750.75 },
  ],
  voluntaryExpenses: [
    { label: "Personnel bénévole", account: "864", amount: 30000 },
    { label: "Mise à disposition gratuite de biens", account: "861", amount: 0 },
    { label: "Secours en nature", account: "860", amount: 0 },
  ],
  voluntaryProducts: [
    { label: "Bénévolat", account: "875", amount: 30000 },
    { label: "Prestations en nature", account: "871", amount: 0 },
    { label: "Dons en nature", account: "870", amount: 0 },
  ],
  note: "Atterrissage 2026 repris depuis Qonto et le tableau de clôture transmis. Les remboursements de prêts sont isolés en compte 168 : ils pèsent sur la trésorerie, mais ne doivent pas être lus comme des charges d'exploitation classiques.",
};

const landing2026 = {
  bankMonthly: [
    { month: "Janvier", inflows: 7684.13, outflows: 3198.16, note: "Qonto réel" },
    { month: "Février", inflows: 26191.52, outflows: 30064.88, note: "Qonto réel" },
    { month: "Mars", inflows: 9563.22, outflows: 9889.77, note: "Qonto réel" },
    { month: "Avril", inflows: 10852.19, outflows: 9936.78, note: "Qonto réel" },
    { month: "Mai", inflows: 17404.7, outflows: 15195.65, note: "Qonto réel" },
    { month: "Juin", inflows: 67145.42, outflows: 65079.57, note: "Qonto réel" },
    { month: "Juillet", inflows: 86432.21, outflows: 80130.02, note: "Qonto réel" },
    { month: "Août", inflows: 73482.89, outflows: 72838.11, note: "Qonto réel" },
    { month: "Septembre", inflows: 17632.87, outflows: 15528.21, note: "Qonto réel au 03/09" },
    { month: "Octobre", inflows: 56118.72, outflows: 49545.5, note: "Reste 2026 - tableau de clôture transmis" },
    { month: "Novembre", inflows: 0, outflows: 0, note: "À compléter si nouveaux flux" },
    { month: "Décembre", inflows: 0, outflows: 0, note: "À compléter si nouveaux flux" },
  ],
  bankCategories: [
    { label: "Chiffre d'affaires", account: "70", amount: 154816.82 },
    { label: "Subventions et aides", account: "74", amount: 76604.46 },
    { label: "Encaissements non catégorisés Qonto à qualifier", account: "75/79", amount: 64307.75 },
    { label: "Encaissements administratifs et régularisations", account: "75/79", amount: 17220 },
    { label: "Ski And Music", account: "70", amount: 2672.29 },
    { label: "Remboursements transport et matériel", account: "79", amount: 767.83 },
    { label: "Reste à encaisser 2026 - tableau de clôture", account: "70/74/79", amount: 56118.72 },
  ],
  expenseCategories: [
    { label: "Frais de personnel", account: "64", amount: 36566.53 },
    { label: "Transports et déplacements Qonto", account: "625", amount: 39114.99 },
    { label: "Nourriture et boissons", account: "6061", amount: 13091.32 },
    { label: "Dépenses opérationnelles Qonto", account: "60/61", amount: 9555.86 },
    { label: "Marketing", account: "623", amount: 5801.33 },
    { label: "Administratif, assurance et frais bancaires", account: "616/627", amount: 4641.54 },
    { label: "Technologies et matériel", account: "618", amount: 2362.93 },
    { label: "Impôts et taxes", account: "63", amount: 1025.85 },
    { label: "Ski And Music", account: "60/61", amount: 3865.25 },
    { label: "MCSC S4", account: "60/61", amount: 3670.92 },
    { label: "Placements", account: "50", amount: 890 },
    { label: "Non catégorisé Qonto à ventiler", account: "60/62", amount: 181274.63 },
    { label: "Reste à payer 2026 - tableau de clôture", account: "60/64/168", amount: 49545.5 },
  ],
  note: "Atterrissage 2026 retravaillé depuis l'export Qonto au 03/09/2026 et le tableau de clôture transmis. Le budget de clôture retient 56 118,72 € de flux entrants et 49 545,50 € de flux sortants restant à traiter, soit un solde final attendu de 6 573,22 €. Les remboursements de prêts sont isolés : ils impactent la trésorerie mais ne doivent pas être confondus avec les charges d'exploitation.",
};

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast,
  landing2026,
  cashPlan2026: landing2026.bankMonthly,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Atterrissage et budget 2026 synchronises dans accounting_reports/colocrew-2026.");
process.exit(0);
