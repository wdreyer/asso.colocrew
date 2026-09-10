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

const products2026Visible = [
  { label: "Ventes Qonto - Stripe, Totemia, familles et groupes", account: "70", amount: 171032.72 },
  { label: "Ventes et restes à encaisser - clôture 2026", account: "70", amount: 27246.1 },
  { label: "VACAF", account: "74", amount: 87317 },
  { label: "Département", account: "74", amount: 10000 },
  { label: "Report de l'excédent 2025", account: "75", amount: 1766.63, _templateKey: "75::reportexcedent2025", _autoReportKey: "75::reportexcedent2025" },
  { label: "Remboursements SNCF et autres", account: "79", amount: 2087 },
];

const products2026 = [...products2026Visible, ...hiddenZeroSubsidyProductLines];

const expenses2026 = [
  { label: "Achats, alimentation, fournitures et operations", account: "60", amount: 24638.35 },
  { label: "Hebergements, locations, activites et prestataires", account: "61", amount: 141182.09 },
  { label: "Transports, communication, administratif, banque et technologies", account: "62", amount: 65905.38 },
  { label: "Impots et taxes", account: "63", amount: 2258 },
  { label: "Salaires bruts", account: "64", amount: 40140.47 },
  { label: "Charges sociales de l'employeur", account: "64", amount: 14049.16 },
];

const neutralizedFlows2026 = [
  { label: "Avances et prets recus", account: "16", amount: 33720 },
  { label: "Virements internes entre comptes COLOCREW", account: "58", amount: 24590 },
  { label: "Remboursements de prets et avances", account: "16", amount: -24676 },
];

const fundingBreakdown = [
  { label: "Clients individuels", type: "Individuels", amount: 96134.88, children: 150, comment: "Stripe, Totemia, Mollie, Juvigo et virements familles/directs. Inclut une ventilation proportionnelle des restes à encaisser 2026." },
  { label: "Groupes, mairies et centres sociaux", type: "Groupes", amount: 102143.94, children: 120, comment: "Centres sociaux, ASE/MECS, mairies, associations partenaires et gros virements assimilés aux groupes." },
  { label: "CAF / VACAF", type: "Aide sociale", amount: 87317, children: 103, comment: "Montant VACAF 2026 repris depuis les vrais chiffres transmis." },
  { label: "Département", type: "Subvention", amount: 10000, children: 0, comment: "Subvention départementale 2026." },
  { label: "Remboursements SNCF et autres", type: "Remboursement", amount: 2087, children: 0, comment: "Remboursements classés hors ventes de séjours." },
  { label: "Report excédent 2025", type: "Report", amount: 1766.63, children: 0, comment: "Report automatique de l'excédent 2025 dans le budget 2026." },
];

const fundingDetails = {
  individuals: [
    { label: "TOTEMIA", type: "Plateforme individuelle", amount: 29369.36, children: 38, comment: "Encaissements familles via Totemia." },
    { label: "Stripe", type: "Paiement CB individuel", amount: 10923.82, children: 23, comment: "Stripe Technology Europe + libellés Stripe." },
    { label: "Stichting Mollie Payments", type: "Paiement en ligne individuel", amount: 4043.93, children: 7, comment: "Paiements individuels Mollie." },
    { label: "Virements familles <= 1 000 €", type: "Vente directe individuelle", amount: 24794.13, children: 52, comment: "Virements familles et paiements directs sous le seuil groupe." },
    { label: "Virements familles 1 000-1 500 €", type: "Vente directe individuelle", amount: 13793.26, children: 17, comment: "Familles identifiées entre 1 000 € et 1 500 €." },
    { label: "Restes à encaisser individuels", type: "Régularisation budget 2026", amount: 13210.38, children: 13, comment: "Part proportionnelle des restes à encaisser rattachée aux individuels." },
  ],
  groups: [
    { label: "Centre Animation Sociale Boilly", type: "Centre social", amount: 24887, children: 26, comment: "Groupe / centre social." },
    { label: "Fondation Apprentis d'Auteuil", type: "ASE / partenaire social", amount: 9150, children: 10, comment: "Séjours financés par structure partenaire." },
    { label: "Maison des Jeunes La Clé", type: "Structure jeunesse", amount: 6500, children: 8, comment: "Groupe jeunesse." },
    { label: "Maison pour Tous Centre Social Abbeville", type: "Centre social", amount: 4550, children: 5, comment: "Centre social." },
    { label: "FAE", type: "Protection de l'enfance", amount: 4500, children: 5, comment: "Groupe / aide sociale à l'enfance." },
    { label: "SGC Noisy-le-Grand", type: "Collectivité", amount: 3700, children: 4, comment: "Règlement public / mairie." },
    { label: "Aquarelle", type: "Structure partenaire", amount: 3250, children: 4, comment: "Groupe." },
    { label: "Relais Ménilmontant", type: "Structure partenaire", amount: 3200, children: 4, comment: "Groupe." },
    { label: "ASS des CSC 3 Cités", type: "Centre social", amount: 3132, children: 4, comment: "Centre social." },
    { label: "Autres groupes et virements > 1 500 €", type: "Groupes / mairies / ASE", amount: 25239.03, children: 28, comment: "Aubygéoise, Action Enfance, AMAPE, Colosolidaire, structures et gros virements." },
    { label: "Restes à encaisser groupes", type: "Régularisation budget 2026", amount: 14035.91, children: 22, comment: "Part proportionnelle des restes à encaisser rattachée aux groupes." },
  ],
};

const note2026 = "Atterrissage 2026 repris depuis l'export Qonto au 10/09/2026 et les arbitrages transmis. Les ventes Qonto sont ventilées en vente de séjours quand la contrepartie correspond à Totemia, Stripe, familles, groupes ou partenaires de séjour. Les aides sont classées en 74, les remboursements SNCF/autres en 79, et le rapprochement bancaire permet de faire ressortir un excédent final de 11 276 €. Les avances, prêts et virements internes sont isolés hors résultat dans les flux neutralisés.";

const forecast = {
  products: products2026,
  expenses: expenses2026,
  voluntaryExpenses: [
    { label: "Personnel benevole", account: "864", amount: 30000 },
    { label: "Mise à disposition gratuite de biens", account: "861", amount: 0 },
    { label: "Secours en nature", account: "860", amount: 0 },
  ],
  voluntaryProducts: [
    { label: "Benevolat", account: "875", amount: 30000 },
    { label: "Prestations en nature", account: "871", amount: 0 },
    { label: "Dons en nature", account: "870", amount: 0 },
  ],
  note: "Budget 2026 repris depuis l'export Qonto du 10/09/2026, les aides VACAF réelles transmises et le solde bancaire final visé à 11 276 €. Les postes restent rangés dans les catégories du bilan comptable ; les remboursements de prêts sont intégrés en régularisations de clôture afin de ne pas créer de catégories visibles par personne.",
};

const landing2026 = {
  bankMonthly: [
    { month: "Janvier", inflows: 7684.13, outflows: 3198.16, note: "Qonto reel" },
    { month: "Février", inflows: 26191.52, outflows: 30064.88, note: "Qonto réel" },
    { month: "Mars", inflows: 9563.22, outflows: 9889.77, note: "Qonto reel" },
    { month: "Avril", inflows: 10852.19, outflows: 9936.78, note: "Qonto reel" },
    { month: "Mai", inflows: 17404.7, outflows: 15195.65, note: "Qonto reel" },
    { month: "Juin", inflows: 67145.42, outflows: 65079.57, note: "Qonto reel" },
    { month: "Juillet", inflows: 77882.21, outflows: 72601.33, note: "Qonto reel" },
    { month: "Août", inflows: 58148.55, outflows: 57999.93, note: "Qonto réel" },
    { month: "Septembre", inflows: 23595.16, outflows: 24447.42, note: "Qonto reel au 10/09" },
    { month: "Rapprochement", inflows: 982.35, outflows: 0, note: "Rapprochement avec le solde bancaire final vise" },
    { month: "Novembre", inflows: 0, outflows: 0, note: "A completer si nouveaux flux" },
    { month: "Décembre", inflows: 0, outflows: 0, note: "À compléter si nouveaux flux" },
  ],
  bankCategories: products2026Visible,
  expenseCategories: expenses2026,
  neutralizedFlows: neutralizedFlows2026,
  note: note2026,
};

await setDoc(doc(db, "accounting_reports", "colocrew-2026"), {
  forecast,
  landing2026,
  cashPlan2026: landing2026.bankMonthly,
  fundingBreakdown,
  fundingDetails,
  updatedAt: serverTimestamp(),
}, { merge: true });

console.log("Atterrissage et budget 2026 synchronises dans accounting_reports/colocrew-2026.");
process.exit(0);
