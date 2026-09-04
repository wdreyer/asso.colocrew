"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const ACCOUNTING_DOC_ID = "colocrew-2026";

const STAY_LABELS = {
  "my-creative-surf-camp": "MCSC",
  "eaux-vives-creative-camp": "EVCC",
};

const WEEK_LABELS = {
  "2026-07-06": "S1",
  "2026-07-20": "S2",
  "2026-08-03": "S3",
  "2026-08-17": "S4",
};

const ACCOUNTING_TABS = [
  { key: "balances", label: "Bilans" },
  { key: "cashPlan", label: "Trésorerie 12 mois" },
  { key: "fundingSplit", label: "Financeurs" },
  { key: "landing2026", label: "Atterrissage 2026" },
  { key: "forecast2027", label: "Prévisionnel 2027" },
  { key: "request", label: "Financement" },
  { key: "settings", label: "Paramètres" },
];

const BALANCE_YEARS = ["2024", "2025", "2026", "2027"];

const BUDGET_EXPENSE_LINES = [
  { account: "60", label: "Fournitures d'atelier ou d'activités" },
  { account: "60", label: "Eau - Gaz - Électricité" },
  { account: "60", label: "Fournitures d'entretien et de bureau" },
  { account: "60", label: "Autres achats à préciser" },
  { account: "61", label: "Formation des bénévoles" },
  { account: "61", label: "Locations" },
  { account: "61", label: "Assurance" },
  { account: "61", label: "Autres services extérieurs à préciser" },
  { account: "62", label: "Transports d'activités et d'animations" },
  { account: "62", label: "Frais postaux - Téléphone - Services bancaires" },
  { account: "62", label: "Autres services extérieurs à préciser" },
  { account: "63", label: "Taxes sur salaires" },
  { account: "63", label: "Autres impôts et taxes" },
  { account: "64", label: "Salaires bruts" },
  { account: "64", label: "Charges sociales de l'employeur" },
  { account: "64", label: "Autres charges de personnel à préciser" },
  { account: "65", label: "Autres charges de gestion courante" },
  { account: "66", label: "Charges financières" },
  { account: "67", label: "Charges exceptionnelles" },
  { account: "68", label: "Dotations aux amortissements et provisions" },
];

const BUDGET_PRODUCT_LINES = [
  { account: "70", label: "Participation des usagers" },
  { account: "70", label: "Prestation de services" },
  { account: "70", label: "Autres rémunérations des services" },
  { account: "74", label: "Collectivités territoriales" },
  { account: "74", label: "Pantin" },
  { account: "74", label: "Pantin Contrat de ville" },
  { account: "74", label: "Aubervilliers" },
  { account: "74", label: "Département" },
  { account: "74", label: "Région" },
  { account: "74", label: "Autres subventions à préciser" },
  { account: "74", label: "État" },
  { account: "74", label: "Fonds Social Européen" },
  { account: "74", label: "Subventions privées" },
  { account: "74", label: "Entreprises" },
  { account: "74", label: "Autres à préciser - Dons" },
  { account: "75", label: "Participation des adhérents, cotisations, dons manuels ou legs" },
  { account: "76", label: "Produits financiers" },
  { account: "77", label: "Produits exceptionnels" },
  { account: "78", label: "Reprises sur amortissements et provisions" },
  { account: "79", label: "Transferts de charges" },
];

const VOLUNTARY_EXPENSE_LINES = [
  { account: "86", label: "Secours en nature" },
  { account: "86", label: "Mise à disposition gratuite de biens et prestations" },
  { account: "86", label: "Personnel bénévole" },
];

const VOLUNTARY_PRODUCT_LINES = [
  { account: "87", label: "Bénévolat" },
  { account: "87", label: "Prestations en nature" },
  { account: "87", label: "Dons en nature" },
];

const FINANCE_SECTIONS = [
  { key: "dashboard", label: "Dashboard", detail: "CA, encaissements, restes à payer" },
  { key: "stays", label: "Séjours & transports", detail: "Synthèses par séjour, semaine et billets" },
  { key: "documents", label: "Documents comptables", detail: "Bilans, prévisionnels et financement" },
];

const PIE_COLORS = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c", "#475569", "#15803d", "#c2410c"];

const DEFAULT_ACCOUNTING = {
  association: {
    name: "ColoCrew",
    baseline: "Réinventons les colos",
    email: "info@colocrew.com",
    phone: "01 84 21 02 30",
    website: "colocrew.com",
    siret: "93217143200010",
  },
  exercise: {
    year: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    preparedFor: "Dépôt DCA / partenaires",
    closingCash: 1379.46,
  },
  moralReport: {
    objectives: "Développer des séjours sportifs, artistiques et inclusifs, accessibles aux familles grâce aux aides et aux partenariats.",
    activity: "Organisation des séjours My Creative Surf Camp et Eaux Vives Creative Camp, gestion des inscriptions, transports, équipes d'animation et partenariats.",
    partners: "CAF, SDJES, collectivités, familles, bénévoles et partenaires opérationnels.",
    difficulties: "Maîtrise des coûts de transport, hébergement, masse salariale et trésorerie pendant la saison.",
    nextSteps: "Consolider le modèle économique, améliorer le suivi des paiements, préparer les dossiers de subvention et structurer les bilans annuels.",
  },
  financingRequest: {
    requestedAmount: 50000,
    purpose: "Financer le changement d'échelle 2027 : doublement des séjours, sécurisation de la trésorerie avant les périodes de forte activité, structuration administrative et maintien de l'accessibilité familles.",
    development: "L'association veut doubler son chiffre d'affaires et son volume de séjours en conservant la même saisonnalité : montée en charge en février, puis pic opérationnel sur l'été.",
    useOfFunds: "Le financement demandé couvre principalement l'avance de trésorerie avant encaissement complet des familles/aides, les acomptes fournisseurs, les transports, la masse salariale et les coûts de structuration.",
    repaymentView: "La capacité de remboursement dépend de l'encaissement des inscriptions et subventions, concentré autour des périodes février et été.",
  },
  actual: {
    products: [
      { label: "Vente de séjours / participations familles", account: "70", amount: 108857.3 },
      { label: "CAF / VACAF", account: "74", amount: 17079.44 },
      { label: "SDJES 93", account: "74", amount: 9900 },
      { label: "Adhésions", account: "756", amount: 135 },
      { label: "Dons / mécénat", account: "758", amount: 1400 },
      { label: "Apports requalifiés en dons", account: "758", amount: 6000 },
    ],
    expenses: [
      { label: "Fonctionnement", account: "60-62", amount: 10866.6 },
      { label: "Séjours", account: "60-64", amount: 131595.68 },
    ],
  },
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
      { label: "Fonctionnement", account: "60-62", amount: 10866.6 },
      { label: "Séjours", account: "60-64", amount: 131595.68 },
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
  cashPlan2026: [
    { month: "Janvier", inflows: 7684.13, outflows: 3198.16, note: "Préparation et premiers encaissements" },
    { month: "Février", inflows: 26191.52, outflows: 30064.88, note: "Première forte période d'activité" },
    { month: "Mars", inflows: 9563.22, outflows: 9889.77, note: "Suivi inscriptions et dépenses courantes" },
    { month: "Avril", inflows: 10852.19, outflows: 9936.78, note: "Préparation opérationnelle" },
    { month: "Mai", inflows: 17404.7, outflows: 15195.65, note: "Montée en charge" },
    { month: "Juin", inflows: 67145.42, outflows: 65079.57, note: "Lancement saison été" },
    { month: "Juillet", inflows: 86432.21, outflows: 80130.02, note: "Pic séjours été" },
    { month: "Août", inflows: 73482.89, outflows: 72838.11, note: "Pic séjours été" },
    { month: "Septembre", inflows: 17632.87, outflows: 15528.21, note: "Encaissements résiduels au 03/09" },
    { month: "Octobre", inflows: 12000, outflows: 9500, note: "Basse saison, encaissements résiduels" },
    { month: "Novembre", inflows: 9000, outflows: 8500, note: "Basse saison et préparation administrative" },
    { month: "Décembre", inflows: 11000, outflows: 10000, note: "Clôture et préparation de l'exercice suivant" },
  ],
  fundingBreakdown: [
    { label: "Clients individuels (Stripe, site, Totemia, Juvigo)", type: "Client individuel", amount: 104245.2, children: 147, comment: "Stripe, Totemia, réservations site, Juvigo, bouche-à-oreille, anciens, mailing et inscriptions individuelles." },
    { label: "Groupes, mairies et centres sociaux", type: "Groupe", amount: 75825, children: 119, comment: "Lignes groupe des fichiers d'inscriptions et gros virements assimilables à des partenaires collectifs." },
    { label: "Financement CAF / VACAF", type: "Aide sociale", amount: 64023.6, children: 103, comment: "Aides CAF/VACAF repérées dans les colonnes CAF et VACAF." },
    { label: "Subventions publiques / SDJES", type: "Subvention", amount: 9900, children: 194, comment: "Subventions publiques identifiées, notamment SDJES, rattachées au public accueilli." },
    { label: "Dons, mécénat et prêts requalifiés", type: "Dons", amount: 7400, children: 0, comment: "Apports et anciens prêts reclassés en dons selon la lecture comptable retenue." },
  ],
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
  balance: {
    assets: [
      { label: "Immobilisations", account: "2", amount: 2700 },
      { label: "Trésorerie disponible", account: "5", amount: 1379.46 },
      { label: "Créances", account: "4", amount: 0 },
    ],
    liabilities: [
      { label: "Résultat de l'exercice après reclassement des dons", account: "12", amount: 1379.46 },
      { label: "Emprunt / dette", account: "16", amount: 0 },
      { label: "Dettes d'exploitation", account: "4", amount: 0 },
    ],
  },
  forecast2027: {
    products: [
      { label: "Vente de séjours / participations familles", account: "70", amount: 640000 },
      { label: "CAF / VACAF et organismes sociaux", account: "74", amount: 80000 },
      { label: "Subventions publiques", account: "74", amount: 176000 },
      { label: "Cotisations, dons, mécénat", account: "75", amount: 14000 },
      { label: "Refacturations / remboursements", account: "79", amount: 8000 },
    ],
    expenses: [
      { label: "Achats, fournitures et alimentation", account: "60", amount: 270000 },
      { label: "Locations, hébergements, salles, matériel", account: "61", amount: 220000 },
      { label: "Transport, assurances, communication, services extérieurs", account: "62", amount: 155000 },
      { label: "Rémunérations", account: "64", amount: 110000 },
      { label: "Charges sociales", account: "64", amount: 40000 },
      { label: "Autres charges, amortissements, imprévus", account: "65-68", amount: 65000 },
    ],
  },
  cashPlan2027: [
    { month: "Janvier", inflows: 20000, outflows: 18000, note: "Préparation administrative et acomptes" },
    { month: "Février", inflows: 52000, outflows: 60000, note: "Première grosse période d'inscriptions / dépenses" },
    { month: "Mars", inflows: 19000, outflows: 20000, note: "Suivi des inscriptions" },
    { month: "Avril", inflows: 22000, outflows: 20000, note: "Préparation des séjours" },
    { month: "Mai", inflows: 35000, outflows: 30000, note: "Acomptes fournisseurs et familles" },
    { month: "Juin", inflows: 134000, outflows: 125000, note: "Montée en charge été" },
    { month: "Juillet", inflows: 173000, outflows: 155000, note: "Pic séjours été" },
    { month: "Août", inflows: 147000, outflows: 142000, note: "Pic séjours été" },
    { month: "Septembre", inflows: 35000, outflows: 28000, note: "Encaissements résiduels et clôture été" },
    { month: "Octobre", inflows: 18000, outflows: 16000, note: "Basse saison" },
    { month: "Novembre", inflows: 18000, outflows: 16000, note: "Basse saison" },
    { month: "Décembre", inflows: 22000, outflows: 18000, note: "Préparation N+1" },
  ],
};

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount(value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sumLines(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((total, line) => total + amount(line.amount), 0);
}

function resultFrom(section) {
  return sumLines(section?.products) - sumLines(section?.expenses);
}

function mergeAccountingDraft(saved) {
  if (!saved) return deepClone(DEFAULT_ACCOUNTING);
  return {
    ...deepClone(DEFAULT_ACCOUNTING),
    ...saved,
    association: { ...DEFAULT_ACCOUNTING.association, ...(saved.association || {}) },
    exercise: { ...DEFAULT_ACCOUNTING.exercise, ...(saved.exercise || {}) },
    moralReport: { ...DEFAULT_ACCOUNTING.moralReport, ...(saved.moralReport || {}) },
    financingRequest: { ...DEFAULT_ACCOUNTING.financingRequest, ...(saved.financingRequest || {}) },
    actual: {
      products: saved.actual?.products || DEFAULT_ACCOUNTING.actual.products,
      expenses: saved.actual?.expenses || DEFAULT_ACCOUNTING.actual.expenses,
    },
    financial2024: {
      products: saved.financial2024?.products || DEFAULT_ACCOUNTING.financial2024.products,
      expenses: saved.financial2024?.expenses || DEFAULT_ACCOUNTING.financial2024.expenses,
      voluntary: saved.financial2024?.voluntary || DEFAULT_ACCOUNTING.financial2024.voluntary,
      assets: saved.financial2024?.assets || DEFAULT_ACCOUNTING.financial2024.assets,
      liabilities: saved.financial2024?.liabilities || DEFAULT_ACCOUNTING.financial2024.liabilities,
      note: saved.financial2024?.note || DEFAULT_ACCOUNTING.financial2024.note,
    },
    financial2025: {
      products: saved.financial2025?.products || DEFAULT_ACCOUNTING.financial2025.products,
      expenses: saved.financial2025?.expenses || DEFAULT_ACCOUNTING.financial2025.expenses,
      assets: saved.financial2025?.assets || DEFAULT_ACCOUNTING.financial2025.assets,
      liabilities: saved.financial2025?.liabilities || DEFAULT_ACCOUNTING.financial2025.liabilities,
      note: saved.financial2025?.note || DEFAULT_ACCOUNTING.financial2025.note,
    },
    landing2026: {
      bankMonthly: saved.landing2026?.bankMonthly || DEFAULT_ACCOUNTING.landing2026.bankMonthly,
      bankCategories: saved.landing2026?.bankCategories || DEFAULT_ACCOUNTING.landing2026.bankCategories,
      expenseCategories: saved.landing2026?.expenseCategories || DEFAULT_ACCOUNTING.landing2026.expenseCategories,
      note: saved.landing2026?.note || DEFAULT_ACCOUNTING.landing2026.note,
    },
    forecast: {
      products: saved.forecast?.products || DEFAULT_ACCOUNTING.forecast.products,
      expenses: saved.forecast?.expenses || DEFAULT_ACCOUNTING.forecast.expenses,
      voluntary: saved.forecast?.voluntary || DEFAULT_ACCOUNTING.forecast.voluntary,
    },
    balance: {
      assets: saved.balance?.assets || DEFAULT_ACCOUNTING.balance.assets,
      liabilities: saved.balance?.liabilities || DEFAULT_ACCOUNTING.balance.liabilities,
    },
    forecast2027: {
      products: saved.forecast2027?.products || DEFAULT_ACCOUNTING.forecast2027.products,
      expenses: saved.forecast2027?.expenses || DEFAULT_ACCOUNTING.forecast2027.expenses,
    },
    cashPlan2026: saved.cashPlan2026 || DEFAULT_ACCOUNTING.cashPlan2026,
    fundingBreakdown: saved.fundingBreakdown || DEFAULT_ACCOUNTING.fundingBreakdown,
    cashPlan2027: saved.cashPlan2027 || DEFAULT_ACCOUNTING.cashPlan2027,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lineTable(title, lines) {
  const total = sumLines(lines);
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr><th>Compte</th><th>Poste</th><th>Montant</th></tr></thead>
        <tbody>
          ${(lines || []).map((line) => `
            <tr>
              <td>${escapeHtml(line.account)}</td>
              <td>${escapeHtml(line.label)}</td>
              <td class="num">${escapeHtml(currency(line.amount))}</td>
            </tr>`).join("")}
          <tr class="total"><td colspan="2">Total</td><td class="num">${escapeHtml(currency(total))}</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function cashPlanTable(title, rows) {
  let running = 0;
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr><th>Mois</th><th>Encaissements</th><th>Décaissements</th><th>Solde mensuel</th><th>Solde cumulé</th><th>Commentaire</th></tr></thead>
        <tbody>
          ${(rows || []).map((row) => {
            const monthly = amount(row.inflows) - amount(row.outflows);
            running += monthly;
            return `
              <tr>
                <td>${escapeHtml(row.month)}</td>
                <td class="num">${escapeHtml(currency(row.inflows))}</td>
                <td class="num">${escapeHtml(currency(row.outflows))}</td>
                <td class="num">${escapeHtml(currency(monthly))}</td>
                <td class="num">${escapeHtml(currency(running))}</td>
                <td>${escapeHtml(row.note)}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function fundingRowsFrom(accounting) {
  const rows = accounting.fundingBreakdown || [];
  const total = sumLines(rows);
  return rows.map((line) => ({
    ...line,
    share: total > 0 ? (amount(line.amount) / total) * 100 : 0,
  }));
}

function pieGradient(rows) {
  let cursor = 0;
  const segments = rows
    .filter((row) => amount(row.amount) > 0)
    .map((row, index) => {
      const start = cursor;
      cursor += row.share;
      return `${PIE_COLORS[index % PIE_COLORS.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
  return segments.length ? `background: conic-gradient(${segments.join(", ")})` : "background:#e5e7eb";
}

function fundingSplitTable(accounting) {
  const rows = fundingRowsFrom(accounting);
  const total = sumLines(rows);
  const chart = `
      <div class="pie-wrap">
        <div class="pie-chart" style="${escapeHtml(pieGradient(rows))}"></div>
        <div class="pie-legend">
          ${rows.map((row, index) => `
            <p><span style="background:${PIE_COLORS[index % PIE_COLORS.length]}"></span><strong>${escapeHtml(row.label)}</strong><em>${escapeHtml(row.share.toFixed(1))} % - ${escapeHtml(currency(row.amount))}</em></p>
          `).join("")}
        </div>
      </div>`;
  return `
    <section>
      ${chart}
      <h2>Décomposition du budget par financeurs</h2>
      <table>
        <thead><tr><th>Financeur</th><th>Type</th><th>Montant</th><th>% du budget</th><th>Enfants</th><th>Commentaire</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.type)}</td>
              <td class="num">${escapeHtml(currency(row.amount))}</td>
              <td class="num">${escapeHtml(row.share.toFixed(1))} %</td>
              <td class="num">${escapeHtml(row.children || 0)}</td>
              <td>${escapeHtml(row.comment)}</td>
            </tr>`).join("")}
          <tr class="total"><td colspan="2">Total</td><td class="num">${escapeHtml(currency(total))}</td><td class="num">${total > 0 ? "100 %" : "0 %"}</td><td class="num">${escapeHtml(rows.reduce((sum, row) => sum + amount(row.children), 0))}</td><td></td></tr>
        </tbody>
      </table>
      <p>Lecture : cette table permet d'identifier le poids relatif des familles, aides publiques, subventions et autres ressources dans le budget prévisionnel.</p>
    </section>
  `;
}

function normalizeLineKey(line) {
  return `${String(line.account || "").trim()}::${String(line.label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")}`;
}

function completeBudgetLines(lines, template) {
  const source = Array.isArray(lines) ? lines : [];
  const byKey = new Map(source.map((line) => [normalizeLineKey(line), line]));
  const templateKeys = new Set(template.map(normalizeLineKey));
  const completed = template.map((line) => {
    const saved = byKey.get(normalizeLineKey(line));
    return {
      ...line,
      amount: amount(saved?.amount),
    };
  });
  const customLines = source.filter((line) => !templateKeys.has(normalizeLineKey(line)));
  return [...completed, ...customLines];
}

function accountingSectionForYear(accounting, year) {
  if (year === "2024") return accounting.financial2024;
  if (year === "2025") return accounting.financial2025;
  if (year === "2027") return accounting.forecast2027;
  return accounting.forecast;
}

function accountingSectionKeyForYear(year) {
  if (year === "2024") return "financial2024";
  if (year === "2025") return "financial2025";
  if (year === "2027") return "forecast2027";
  return "forecast";
}

function budgetProductsFor(section) {
  return completeBudgetLines(section?.products, BUDGET_PRODUCT_LINES);
}

function budgetExpensesFor(section) {
  return completeBudgetLines(section?.expenses, BUDGET_EXPENSE_LINES);
}

function budgetVoluntaryExpensesFor(section) {
  return completeBudgetLines(section?.voluntaryExpenses || section?.voluntary, VOLUNTARY_EXPENSE_LINES);
}

function budgetVoluntaryProductsFor(section) {
  return completeBudgetLines(section?.voluntaryProducts || section?.voluntary, VOLUNTARY_PRODUCT_LINES);
}

function budgetStatementTable(title, products, expenses, voluntary = []) {
  const expenseRows = completeBudgetLines(expenses, BUDGET_EXPENSE_LINES);
  const productRows = completeBudgetLines(products, BUDGET_PRODUCT_LINES);
  const maxRows = Math.max(expenseRows.length, productRows.length);
  const rows = Array.from({ length: maxRows }, (_, index) => {
    const expense = expenseRows[index] || {};
    const product = productRows[index] || {};
    return `
      <tr>
        <td>${escapeHtml(expense.account)}</td>
        <td>${escapeHtml(expense.label)}</td>
        <td class="num">${expenseRows[index] ? escapeHtml(currency(expense.amount)) : ""}</td>
        <td>${escapeHtml(product.account)}</td>
        <td>${escapeHtml(product.label)}</td>
        <td class="num">${productRows[index] ? escapeHtml(currency(product.amount)) : ""}</td>
      </tr>
    `;
  }).join("");
  const productsTotal = sumLines(productRows);
  const expensesTotal = sumLines(expenseRows);
  const result = productsTotal - expensesTotal;
  const voluntaryExpenseRows = completeBudgetLines(voluntary?.expenses || voluntary, VOLUNTARY_EXPENSE_LINES);
  const voluntaryProductRows = completeBudgetLines(voluntary?.products || voluntary, VOLUNTARY_PRODUCT_LINES);
  const voluntaryMaxRows = Math.max(voluntaryExpenseRows.length, voluntaryProductRows.length);
  const voluntaryBlock = `
    <h3>Contributions volontaires</h3>
    <table class="budget-table">
      <thead><tr><th colspan="3">86 Emploi des contributions volontaires en nature</th><th colspan="3">87 Contributions volontaires en nature</th></tr></thead>
      <tbody>
        ${Array.from({ length: voluntaryMaxRows }, (_, index) => {
          const expense = voluntaryExpenseRows[index] || {};
          const product = voluntaryProductRows[index] || {};
          return `
          <tr>
            <td>${escapeHtml(expense.account)}</td>
            <td>${escapeHtml(expense.label)}</td>
            <td class="num">${escapeHtml(currency(expense.amount))}</td>
            <td>${escapeHtml(product.account)}</td>
            <td>${escapeHtml(product.label)}</td>
            <td class="num">${escapeHtml(currency(product.amount))}</td>
          </tr>
          `;
        }).join("")}
        <tr class="total"><td colspan="2">Total</td><td class="num">${escapeHtml(currency(sumLines(voluntaryExpenseRows)))}</td><td colspan="2">Total</td><td class="num">${escapeHtml(currency(sumLines(voluntaryProductRows)))}</td></tr>
      </tbody>
    </table>
  `;

  return `
    <section class="budget-sheet">
      <h2>${escapeHtml(title)}</h2>
      <table class="budget-table">
        <thead>
          <tr><th colspan="3">Dépenses</th><th colspan="3">Recettes</th></tr>
          <tr><th>Compte</th><th>Poste</th><th>Montant</th><th>Compte</th><th>Poste</th><th>Montant</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total">
            <td colspan="2">Total dépenses</td>
            <td class="num">${escapeHtml(currency(expensesTotal))}</td>
            <td colspan="2">Total recettes</td>
            <td class="num">${escapeHtml(currency(productsTotal))}</td>
          </tr>
          <tr class="result">
            <td colspan="5">Résultat ${result >= 0 ? "excédentaire" : "déficitaire"}</td>
            <td class="num">${escapeHtml(currency(result))}</td>
          </tr>
        </tbody>
      </table>
      ${voluntaryBlock}
    </section>
  `;
}

function compactBalanceTable(title, assets, liabilities) {
  const assetRows = (assets || []);
  const liabilityRows = (liabilities || []);
  const maxRows = Math.max(assetRows.length, liabilityRows.length);
  const rows = Array.from({ length: maxRows }, (_, index) => {
    const asset = assetRows[index] || {};
    const liability = liabilityRows[index] || {};
    return `
      <tr>
        <td>${escapeHtml(asset.account)}</td>
        <td>${escapeHtml(asset.label)}</td>
        <td class="num">${assetRows[index] ? escapeHtml(currency(asset.amount)) : ""}</td>
        <td>${escapeHtml(liability.account)}</td>
        <td>${escapeHtml(liability.label)}</td>
        <td class="num">${liabilityRows[index] ? escapeHtml(currency(liability.amount)) : ""}</td>
      </tr>
    `;
  }).join("");
  return `
    <section class="budget-sheet">
      <h2>${escapeHtml(title)}</h2>
      <table class="budget-table">
        <thead>
          <tr><th colspan="3">Actif</th><th colspan="3">Passif</th></tr>
          <tr><th>Compte</th><th>Poste</th><th>Montant</th><th>Compte</th><th>Poste</th><th>Montant</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total">
            <td colspan="2">Total actif</td>
            <td class="num">${escapeHtml(currency(sumLines(assetRows)))}</td>
            <td colspan="2">Total passif</td>
            <td class="num">${escapeHtml(currency(sumLines(liabilityRows)))}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function annualBudgetDocument(year, section, options = {}) {
  const products = options.products || section.products;
  const expenses = options.expenses || section.expenses;
  const voluntary = options.voluntary || section.voluntary;
  return budgetStatementTable(`Bilan comptable ${year}`, products, expenses, voluntary);
}

function financialNarrative2025(accounting) {
  const products = sumLines(accounting.financial2025.products);
  const expenses = sumLines(accounting.financial2025.expenses);
  const result = products - expenses;
  return `
    <section>
      <h2>Lecture de l'exercice</h2>
      <p>L'année 2025 constitue une année de structuration et de validation du modèle ColoCrew. L'association a démontré sa capacité à générer des recettes propres significatives grâce à la vente de séjours, tout en mobilisant des aides publiques et des soutiens associatifs.</p>
      <p>Les apports initialement suivis comme prêts sont désormais requalifiés en dons. Cette clarification renforce la lisibilité du bilan : l'association ne porte pas de dette financière liée à ces apports et clôture l'exercice avec une situation assainie.</p>
      <p>Avec ${escapeHtml(currency(products))} de produits et ${escapeHtml(currency(expenses))} de charges, le résultat ressort à ${escapeHtml(currency(result))}. Les dépenses sont très majoritairement affectées aux séjours et donc directement à l'objet social de l'association.</p>
      <p>${escapeHtml(accounting.financial2025.note)}</p>
    </section>
  `;
}

function landingNarrative2026(accounting, dashboardSnapshot) {
  const qontoProducts = sumLines(accounting.landing2026.bankCategories);
  const qontoExpenses = sumLines(accounting.landing2026.expenseCategories);
  const qontoResult = qontoProducts - qontoExpenses;
  return `
    <section>
      <h2>Atterrissage 2026</h2>
      <p>L'exercice 2026 confirme une nette accélération de l'activité. Les flux Qonto disponibles au 3 septembre 2026 font ressortir ${escapeHtml(currency(qontoProducts))} d'encaissements catégorisés et ${escapeHtml(currency(qontoExpenses))} de décaissements catégorisés, soit un solde opérationnel suivi de ${escapeHtml(currency(qontoResult))}.</p>
      <p>Le dashboard inscriptions complète cette lecture avec ${escapeHtml(currency(dashboardSnapshot.grossAmount))} de chiffre d'affaires inscriptions, ${escapeHtml(currency(dashboardSnapshot.ticketCost))} de billets transport suivis et ${escapeHtml(currency(dashboardSnapshot.grossSalary))} de masse salariale brute RH.</p>
      <p>La saisonnalité est claire : février mobilise déjà beaucoup de trésorerie, puis juin, juillet et août concentrent la majeure partie de l'activité. C'est une contrainte normale pour un modèle de séjours, mais elle rend utile un financement de développement pour absorber les acomptes et sécuriser la montée en charge.</p>
      <p>${escapeHtml(accounting.landing2026.note)}</p>
    </section>
  `;
}

function openAccountingPrint(accounting, kind, dashboardSnapshot, options = {}) {
  const actualProducts = sumLines(accounting.actual.products);
  const actualExpenses = sumLines(accounting.actual.expenses);
  const forecastProducts = sumLines(accounting.forecast.products);
  const forecastExpenses = sumLines(accounting.forecast.expenses);
  const actualResult = actualProducts - actualExpenses;
  const forecastResult = forecastProducts - forecastExpenses;
  const budgetYear = options.year || "2026";
  const budgetSection = accountingSectionForYear(accounting, budgetYear);
  const titles = {
    annual: "Comptes annuels",
    financial: "Bilan financier",
    forecast: "Budget prévisionnel",
    moral: "Bilan moral et financier",
    dca: "Synthèse de dépôt DCA",
    funderPack: "Dossier financeur",
    forecast2027: "Prévisionnel financier 2027",
    cashPlan2026: "Plan de trésorerie 2026",
    cashPlan2027: "Plan de trésorerie 12 mois",
    fundingSplit: "Répartition des financeurs",
    financingRequest: "Demande de financement",
    financial2024: "Bilan comptable 2024",
    financial2025: "Bilan comptable 2025",
    budgetYear: `Bilan comptable ${budgetYear}`,
    landing2026: "Atterrissage comptable 2026",
    loanPack2024To2026: "Bilans 2024, 2025 et prévisionnel 2026",
  };
  const blocks = {
    annual: `
      ${lineTable("Recettes", accounting.actual.products)}
      ${lineTable("Dépenses", accounting.actual.expenses)}
      <section class="note"><strong>Résultat d'exploitation :</strong> ${escapeHtml(currency(actualResult))}</section>
      ${lineTable("Bilan actif", accounting.balance.assets)}
      ${lineTable("Bilan passif", accounting.balance.liabilities)}
    `,
    financial: `
      ${lineTable("Recettes de l'exercice", accounting.actual.products)}
      ${lineTable("Dépenses de l'exercice", accounting.actual.expenses)}
      <section class="grid">
        <p><span>Produits comptables</span><strong>${escapeHtml(currency(actualProducts))}</strong></p>
        <p><span>Dépenses</span><strong>${escapeHtml(currency(actualExpenses))}</strong></p>
        <p><span>Résultat</span><strong>${escapeHtml(currency(actualResult))}</strong></p>
        <p><span>Trésorerie de clôture</span><strong>${escapeHtml(currency(accounting.exercise.closingCash))}</strong></p>
      </section>
    `,
    forecast: `
      ${budgetStatementTable("Budget prévisionnel 2026", accounting.forecast.products, accounting.forecast.expenses, accounting.forecast.voluntary)}
      <section class="note"><strong>Résultat prévisionnel :</strong> ${escapeHtml(currency(forecastResult))}</section>
    `,
    moral: `
      <section><h2>Bilan moral</h2>
        <h3>Objectifs</h3><p>${escapeHtml(accounting.moralReport.objectives)}</p>
        <h3>Activité</h3><p>${escapeHtml(accounting.moralReport.activity)}</p>
        <h3>Partenaires</h3><p>${escapeHtml(accounting.moralReport.partners)}</p>
        <h3>Difficultés</h3><p>${escapeHtml(accounting.moralReport.difficulties)}</p>
        <h3>Perspectives</h3><p>${escapeHtml(accounting.moralReport.nextSteps)}</p>
      </section>
      ${lineTable("Rapport financier - recettes", accounting.actual.products)}
      ${lineTable("Rapport financier - dépenses", accounting.actual.expenses)}
    `,
    dca: `
      <section class="grid">
        <p><span>Exercice clos le</span><strong>${escapeHtml(accounting.exercise.endDate)}</strong></p>
        <p><span>Produits</span><strong>${escapeHtml(currency(actualProducts))}</strong></p>
        <p><span>Charges</span><strong>${escapeHtml(currency(actualExpenses))}</strong></p>
        <p><span>Résultat</span><strong>${escapeHtml(currency(actualResult))}</strong></p>
      </section>
      <section><h2>Contrôle avant dépôt</h2>
        <p>Préparer un fichier PDF unique, sans pièce jointe, sans mot de passe, sans protection, compatible PDF 1.7 et inférieur à 50 Mo.</p>
        <p>Vérifier qu'aucune donnée personnelle inutile ne figure dans le document publié.</p>
      </section>
      ${lineTable("Recettes à publier", accounting.actual.products)}
      ${lineTable("Dépenses à publier", accounting.actual.expenses)}
    `,
    funderPack: `
      <section class="note"><strong>Demande :</strong> ${escapeHtml(currency(accounting.financingRequest.requestedAmount))} - ${escapeHtml(accounting.financingRequest.purpose)}</section>
      ${lineTable("Atterrissage 2026 - produits", accounting.actual.products)}
      ${lineTable("Atterrissage 2026 - charges", accounting.actual.expenses)}
      ${cashPlanTable("Plan de trésorerie 2026", accounting.cashPlan2026)}
      ${fundingSplitTable(accounting)}
      ${lineTable("Prévisionnel 2027 - produits", accounting.forecast2027.products)}
      ${lineTable("Prévisionnel 2027 - charges", accounting.forecast2027.expenses)}
      ${cashPlanTable("Plan de trésorerie 2027", accounting.cashPlan2027)}
    `,
    forecast2027: `
      ${lineTable("Produits 2027", accounting.forecast2027.products)}
      ${lineTable("Charges 2027", accounting.forecast2027.expenses)}
      <section class="note"><strong>Résultat prévisionnel 2027 :</strong> ${escapeHtml(currency(resultFrom(accounting.forecast2027)))}</section>
    `,
    cashPlan2026: cashPlanTable("Plan de trésorerie 2026 - mois par mois", accounting.cashPlan2026),
    cashPlan2027: cashPlanTable("Plan de trésorerie 2027 - saisonnalité sur 12 mois", accounting.cashPlan2027),
    fundingSplit: fundingSplitTable(accounting),
    financingRequest: `
      <section><h2>Objet de la demande</h2><p>${escapeHtml(accounting.financingRequest.purpose)}</p></section>
      <section><h2>Développement envisagé</h2><p>${escapeHtml(accounting.financingRequest.development)}</p></section>
      <section><h2>Utilisation du financement</h2><p>${escapeHtml(accounting.financingRequest.useOfFunds)}</p></section>
      <section><h2>Lecture de remboursement / sécurisation</h2><p>${escapeHtml(accounting.financingRequest.repaymentView)}</p></section>
      <section class="note"><strong>Montant demandé :</strong> ${escapeHtml(currency(accounting.financingRequest.requestedAmount))}</section>
    `,
    budgetYear: annualBudgetDocument(budgetYear, budgetSection),
    financial2024: annualBudgetDocument("2024", accounting.financial2024),
    financial2025: `
      ${financialNarrative2025(accounting)}
      ${budgetStatementTable("Bilan comptable 2025", accounting.financial2025.products, accounting.financial2025.expenses, accounting.financial2025.voluntary)}
      <section class="grid">
        <p><span>Produits 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.products)))}</strong></p>
        <p><span>Charges 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.expenses)))}</strong></p>
        <p><span>Résultat 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.products) - sumLines(accounting.financial2025.expenses)))}</strong></p>
        <p><span>Dette financière reclassée</span><strong>0,00 €</strong></p>
      </section>
      ${compactBalanceTable("Bilan simplifié 2025", accounting.financial2025.assets, accounting.financial2025.liabilities)}
    `,
    landing2026: `
      ${landingNarrative2026(accounting, dashboardSnapshot)}
      ${cashPlanTable("Flux Qonto 2026 disponibles", accounting.landing2026.bankMonthly)}
      ${lineTable("Encaissements catégorisés Qonto 2026", accounting.landing2026.bankCategories)}
      ${lineTable("Décaissements catégorisés Qonto 2026", accounting.landing2026.expenseCategories)}
      <section class="grid">
        <p><span>Encaissements Qonto</span><strong>${escapeHtml(currency(sumLines(accounting.landing2026.bankCategories)))}</strong></p>
        <p><span>Décaissements Qonto</span><strong>${escapeHtml(currency(sumLines(accounting.landing2026.expenseCategories)))}</strong></p>
        <p><span>Solde suivi</span><strong>${escapeHtml(currency(sumLines(accounting.landing2026.bankCategories) - sumLines(accounting.landing2026.expenseCategories)))}</strong></p>
        <p><span>Trésorerie Qonto 03/09/2026</span><strong>14 186,20 €</strong></p>
      </section>
    `,
    loanPack2024To2026: `
      <section class="note"><strong>Dossier de demande de prêt :</strong> présentation homogène des bilans 2024, 2025 et du prévisionnel 2026. Les prêts 2025 sont présentés en dons conformément au reclassement indiqué, ce qui fait ressortir un exercice positif.</section>
      ${annualBudgetDocument("2024", accounting.financial2024)}
      <div class="page-break"></div>
      ${annualBudgetDocument("2025", accounting.financial2025)}
      <div class="page-break"></div>
      ${budgetStatementTable("Budget prévisionnel 2026", accounting.forecast.products, accounting.forecast.expenses, accounting.forecast.voluntary)}
      <section class="grid">
        <p><span>Produits prévisionnels 2026</span><strong>${escapeHtml(currency(forecastProducts))}</strong></p>
        <p><span>Charges prévisionnelles 2026</span><strong>${escapeHtml(currency(forecastExpenses))}</strong></p>
        <p><span>Excédent visé 2026</span><strong>${escapeHtml(currency(forecastResult))}</strong></p>
        <p><span>Lecture financeur</span><strong>Développement maîtrisé</strong></p>
      </section>
    `,
  };
  const html = `<!doctype html>
    <html><head><meta charset="utf-8" /><title>${escapeHtml(titles[kind])} ${escapeHtml(accounting.association.name)}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:32px;color:#1f172f}
      h2{font-size:17px;margin:0 0 8px;text-transform:uppercase} h3{font-size:13px;margin:14px 0 5px}
      p{line-height:1.45} small{color:#6b5f78}
      table{width:100%;border-collapse:collapse;margin-bottom:14px} th,td{border:1px solid #ddd5e7;padding:8px;text-align:left;font-size:12px}
      th{background:#f7f2fa;color:#5f506f;text-transform:uppercase;font-size:10px}.num{text-align:right}.total td{font-weight:700;background:#faf8fc}
      .budget-table th:nth-child(1),.budget-table th:nth-child(2),.budget-table th:nth-child(3){background:#f3f5f8;color:#3d4656}
      .budget-table th:nth-child(4),.budget-table th:nth-child(5),.budget-table th:nth-child(6){background:#f6f0f4;color:#6f2846}
      .budget-table .result td{font-weight:800;background:#fff7ed}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.grid p,.note{border:1px solid #ddd5e7;padding:12px;background:#faf8fc}
      .grid span{display:block;color:#6b5f78;font-size:10px;text-transform:uppercase}.grid strong{display:block;margin-top:4px}
      .pie-wrap{display:grid;grid-template-columns:180px 1fr;gap:18px;align-items:center;margin:10px 0 18px}.pie-chart{width:170px;height:170px;border-radius:50%;border:1px solid #ddd5e7}.pie-legend{display:grid;gap:7px}.pie-legend p{display:grid;grid-template-columns:14px 1fr auto;gap:8px;align-items:center;margin:0;font-size:11px}.pie-legend span{width:12px;height:12px;border-radius:3px}.pie-legend em{color:#6b5f78;font-style:normal}
      .page-break{break-before:page;page-break-before:always}
      @media print{body{margin:18mm}.no-print{display:none}}
    </style></head><body>
      <button class="no-print" onclick="window.print()">Exporter en PDF</button>
      ${blocks[kind] || blocks.annual}
      <script>setTimeout(()=>window.print(),250)</script>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", "width=1000,height=800");
  if (!popup) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-${accounting.association.name || "colocrew"}.html`;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function canonicalStayName(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized === "mycreativesurfcamp" ? "my-creative-surf-camp" : value;
}

function mapFinance(snapshot) {
  const data = snapshot.data() || {};
  const finance = data.finance || {};
  const legal = data.legal || {};
  const children = Array.isArray(data.minor?.children) ? data.minor.children : [];
  const startDate = String(data.sejour?.startDate || "").slice(0, 10);
  const netAmount = amount(finance.netAmount);
  const paidAmount = amount(finance.paidAmount);
  const declaredChildren = Number(data.minor?.numberOfChildren);
  const childCount = children.length || (Number.isFinite(declaredChildren) && declaredChildren > 0 ? declaredChildren : 1);

  return {
    id: snapshot.id,
    status: data.status || "",
    validationSource: data.validationSource || "",
    reference: data.numeroDeReservation || snapshot.id,
    responsible: `${legal.firstName || ""} ${legal.lastName || ""}`.trim() || "Non renseigné",
    children: children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", "),
    childCount,
    stay: STAY_LABELS[canonicalStayName(data.sejour?.name)] || canonicalStayName(data.sejour?.name) || "Non renseigné",
    week: WEEK_LABELS[startDate] || startDate || "Non renseignée",
    departureCity: data.transport?.departureCity || "",
    returnCity: data.transport?.returnCity || "",
    stayAmount: amount(finance.stayAmount),
    transportAmount: amount(finance.transportAmount),
    grossAmount: amount(finance.grossAmount),
    cafAidAmount: amount(finance.cafAidAmount),
    netAmount,
    paidAmount,
    remainingAmount: Math.max(amount(finance.remainingAmount ?? netAmount - paidAmount), 0),
    paymentProgress: netAmount > 0 ? Math.min(Math.round((paidAmount / netAmount) * 100), 100) : 0,
    hasFinance: Boolean(data.finance),
  };
}

function mapTransportFinance(snapshot) {
  const data = snapshot.data() || {};
  const tickets = Array.isArray(data.tickets) ? data.tickets : [];
  return {
    id: snapshot.id,
    week: data.week || WEEK_LABELS[String(data.date || "").slice(0, 10)] || "Non renseignée",
    direction: data.direction || "",
    ticketCost: tickets.reduce((sum, ticket) => sum + amount(ticket.price), 0),
    purchasedTicketCost: tickets.filter((ticket) => ticket.purchased).reduce((sum, ticket) => sum + amount(ticket.price), 0),
    tickets: tickets.length,
    purchasedTickets: tickets.filter((ticket) => ticket.purchased).length,
  };
}

function Metric({ label, value, tone, detail }) {
  return (
    <article className={`finance-metric finance-metric-${tone}`}>
      <span>{label}</span>
      <strong>{currency(value)}</strong>
      <small>{detail}</small>
    </article>
  );
}

function summarize(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = row[key] || "Non renseigné";
    const current = groups.get(label) || {
      label,
      children: 0,
      stayAmount: 0,
      transportAmount: 0,
      grossAmount: 0,
      cafAidAmount: 0,
      netAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
    };
    current.children += row.childCount;
    current.stayAmount += row.stayAmount;
    current.transportAmount += row.transportAmount;
    current.grossAmount += row.grossAmount;
    current.cafAidAmount += row.cafAidAmount;
    current.netAmount += row.netAmount;
    current.paidAmount += row.paidAmount;
    current.remainingAmount += row.remainingAmount;
    groups.set(label, current);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

function SummaryTable({ title, firstColumn, rows }) {
  return (
    <section className="finance-summary">
      <div className="finance-summary-head"><h2>{title}</h2></div>
      <div className="finance-summary-scroll">
        <table>
          <thead>
            <tr>
              <th>{firstColumn}</th>
              <th>Enfants</th>
              <th>CA séjour</th>
              <th>CA transport</th>
              <th>CA total</th>
              <th>CAF</th>
              <th>Part familles</th>
              <th>Encaissé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td><strong>{row.label}</strong></td>
                <td>{row.children}</td>
                <td>{currency(row.stayAmount)}</td>
                <td>{currency(row.transportAmount)}</td>
                <td><strong>{currency(row.grossAmount)}</strong></td>
                <td>{currency(row.cafAidAmount)}</td>
                <td>{currency(row.netAmount)}</td>
                <td className="finance-paid">{currency(row.paidAmount)}</td>
                <td className={row.remainingAmount > 0 ? "finance-due" : "finance-paid"}>
                  {currency(row.remainingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function citySummary(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const city = row[key] || "Non renseigné";
    if (normalizePlace(city) === "sur place") continue;
    counts.set(city, (counts.get(city) || 0) + row.childCount);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([city, count]) => `${city} ${count}`)
    .join(" · ");
}

function TransportFinanceTable({ rows, transports }) {
  const byWeek = new Map();
  for (const row of rows) {
    const label = row.week || "Non renseignée";
    const current = byWeek.get(label) || {
      label,
      children: 0,
      transportAmount: 0,
      reservationRows: [],
      ticketCost: 0,
      purchasedTicketCost: 0,
      tickets: 0,
      purchasedTickets: 0,
    };
    current.children += row.childCount;
    current.transportAmount += row.transportAmount;
    current.reservationRows.push(row);
    byWeek.set(label, current);
  }
  for (const transport of transports) {
    const label = transport.week || "Non renseignée";
    const current = byWeek.get(label) || {
      label,
      children: 0,
      transportAmount: 0,
      reservationRows: [],
      ticketCost: 0,
      purchasedTicketCost: 0,
      tickets: 0,
      purchasedTickets: 0,
    };
    current.ticketCost += transport.ticketCost;
    current.purchasedTicketCost += transport.purchasedTicketCost;
    current.tickets += transport.tickets;
    current.purchasedTickets += transport.purchasedTickets;
    byWeek.set(label, current);
  }
  const data = [...byWeek.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <section className="finance-summary">
      <div className="finance-summary-head"><h2>CA transport par semaine</h2></div>
      <div className="finance-summary-scroll">
        <table>
          <thead>
            <tr>
              <th>Semaine</th>
              <th>Enfants</th>
              <th>Villes aller</th>
              <th>Villes retour</th>
              <th>CA transport</th>
              <th>Billets ajoutés</th>
              <th>Coût billets</th>
              <th>Marge transport</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const margin = row.transportAmount - row.ticketCost;
              return (
                <tr key={row.label}>
                  <td><strong>{row.label}</strong></td>
                  <td>{row.children}</td>
                  <td>{citySummary(row.reservationRows, "departureCity") || "—"}</td>
                  <td>{citySummary(row.reservationRows, "returnCity") || "—"}</td>
                  <td><strong>{currency(row.transportAmount)}</strong></td>
                  <td>{row.purchasedTickets}/{row.tickets}</td>
                  <td className={row.ticketCost > 0 ? "finance-due" : ""}>{currency(row.ticketCost)}</td>
                  <td className={margin >= 0 ? "finance-paid" : "finance-due"}>{currency(margin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountingLinesEditor({ title, lines, onChange, totalLabel = "Total" }) {
  const updateLine = (index, key, value) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, [key]: key === "amount" ? amount(value) : value } : line)));
  };
  const removeLine = (index) => {
    onChange(lines.filter((_, i) => i !== index));
  };
  const addLine = () => {
    onChange([...(lines || []), { account: "", label: "Nouveau poste", amount: 0 }]);
  };

  return (
    <section className="accounting-editor-block">
      <div className="accounting-editor-head">
        <h3>{title}</h3>
        <strong>{currency(sumLines(lines))}</strong>
      </div>
      <div className="accounting-lines">
        {(lines || []).map((line, index) => (
          <div className="accounting-line" key={`${title}-${index}`}>
            <input aria-label="Compte" value={line.account || ""} onChange={(e) => updateLine(index, "account", e.target.value)} />
            <input aria-label="Libellé" value={line.label || ""} onChange={(e) => updateLine(index, "label", e.target.value)} />
            <input aria-label="Montant" type="number" step="0.01" value={line.amount ?? 0} onChange={(e) => updateLine(index, "amount", e.target.value)} />
            <button type="button" onClick={() => removeLine(index)} aria-label="Supprimer la ligne">×</button>
          </div>
        ))}
      </div>
      <div className="accounting-editor-actions">
        <button type="button" className="dash-btn dash-btn-secondary" onClick={addLine}>Ajouter une ligne</button>
        <span>{totalLabel} : <strong>{currency(sumLines(lines))}</strong></span>
      </div>
    </section>
  );
}

function BudgetStatementEditor({ year, section, onChange, onExport }) {
  const products = budgetProductsFor(section);
  const expenses = budgetExpensesFor(section);
  const voluntaryExpenses = budgetVoluntaryExpensesFor(section);
  const voluntaryProducts = budgetVoluntaryProductsFor(section);
  const productTotal = sumLines(products);
  const expenseTotal = sumLines(expenses);
  const result = productTotal - expenseTotal;

  const updateSide = (side, index, value) => {
    const source = side === "expenses" ? expenses : products;
    const next = source.map((line, lineIndex) => (
      lineIndex === index ? { ...line, amount: amount(value) } : line
    ));
    onChange({ ...section, [side]: next });
  };

  const updateVoluntarySide = (side, index, value) => {
    const source = side === "voluntaryExpenses" ? voluntaryExpenses : voluntaryProducts;
    const next = source.map((line, lineIndex) => (
      lineIndex === index ? { ...line, amount: amount(value) } : line
    ));
    onChange({ ...section, [side]: next });
  };

  const maxRows = Math.max(expenses.length, products.length);
  const maxVoluntaryRows = Math.max(voluntaryExpenses.length, voluntaryProducts.length);

  return (
    <section className="budget-editor">
      <div className="budget-editor-head">
        <div>
          <h3>Bilan comptable {year}</h3>
          <p>Formulaire dépenses / recettes. Les totaux et le résultat sont recalculés automatiquement.</p>
        </div>
        <button type="button" className="dash-btn" onClick={onExport}>Exporter ce bilan</button>
      </div>
      <div className="budget-result-strip">
        <div><span>Total dépenses</span><strong>{currency(expenseTotal)}</strong></div>
        <div><span>Total recettes</span><strong>{currency(productTotal)}</strong></div>
        <div><span>Résultat</span><strong className={result >= 0 ? "finance-paid" : "finance-due"}>{currency(result)}</strong></div>
      </div>
      <div className="budget-editor-table-wrap">
        <table className="budget-editor-table">
          <thead>
            <tr><th colSpan="3">Dépenses</th><th colSpan="3">Recettes</th></tr>
            <tr><th>Compte</th><th>Poste</th><th>Montant</th><th>Compte</th><th>Poste</th><th>Montant</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, index) => {
              const expense = expenses[index] || {};
              const product = products[index] || {};
              return (
                <tr key={`budget-${year}-${index}`}>
                  <td>{expense.account || ""}</td>
                  <td>{expense.label || ""}</td>
                  <td><input type="number" step="0.01" value={expense.amount ?? 0} onChange={(event) => updateSide("expenses", index, event.target.value)} /></td>
                  <td>{product.account || ""}</td>
                  <td>{product.label || ""}</td>
                  <td><input type="number" step="0.01" value={product.amount ?? 0} onChange={(event) => updateSide("products", index, event.target.value)} /></td>
                </tr>
              );
            })}
            <tr className="total">
              <td colSpan="2">Total</td>
              <td>{currency(expenseTotal)}</td>
              <td colSpan="2">Total</td>
              <td>{currency(productTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="budget-editor-table-wrap">
        <table className="budget-editor-table">
          <thead>
            <tr><th colSpan="3">86 Emploi des contributions volontaires en nature</th><th colSpan="3">87 Contributions volontaires en nature</th></tr>
            <tr><th>Compte</th><th>Poste</th><th>Montant</th><th>Compte</th><th>Poste</th><th>Montant</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: maxVoluntaryRows }, (_, index) => {
              const expense = voluntaryExpenses[index] || {};
              const product = voluntaryProducts[index] || {};
              return (
                <tr key={`budget-voluntary-${year}-${index}`}>
                  <td>{expense.account || ""}</td>
                  <td>{expense.label || ""}</td>
                  <td><input type="number" step="0.01" value={expense.amount ?? 0} onChange={(event) => updateVoluntarySide("voluntaryExpenses", index, event.target.value)} /></td>
                  <td>{product.account || ""}</td>
                  <td>{product.label || ""}</td>
                  <td><input type="number" step="0.01" value={product.amount ?? 0} onChange={(event) => updateVoluntarySide("voluntaryProducts", index, event.target.value)} /></td>
                </tr>
              );
            })}
            <tr className="total">
              <td colSpan="2">Total</td>
              <td>{currency(sumLines(voluntaryExpenses))}</td>
              <td colSpan="2">Total</td>
              <td>{currency(sumLines(voluntaryProducts))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountingTextEditor({ accounting, setAccounting }) {
  const setText = (key, value) => {
    setAccounting((previous) => ({
      ...previous,
      moralReport: { ...previous.moralReport, [key]: value },
    }));
  };
  return (
    <section className="accounting-text-grid">
      {[
        ["objectives", "Objectifs"],
        ["activity", "Activité"],
        ["partners", "Partenaires"],
        ["difficulties", "Difficultés"],
        ["nextSteps", "Perspectives"],
      ].map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <textarea value={accounting.moralReport[key] || ""} onChange={(e) => setText(key, e.target.value)} />
        </label>
      ))}
    </section>
  );
}

function FinancingRequestEditor({ request, onChange }) {
  const update = (key, value) => onChange({ ...request, [key]: value });
  return (
    <section className="accounting-text-grid">
      {[
        ["purpose", "Objet de la demande"],
        ["development", "Développement"],
        ["useOfFunds", "Utilisation des fonds"],
        ["repaymentView", "Remboursement / sécurisation"],
      ].map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <textarea value={request[key] || ""} onChange={(event) => update(key, event.target.value)} />
        </label>
      ))}
    </section>
  );
}

function parseMoney(value) {
  const cleaned = String(value || "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function importQontoCashPlan(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const dateIndex = headers.indexOf("Date de l'opération (local)");
  const debitIndex = headers.indexOf("Débit");
  const creditIndex = headers.indexOf("Crédit");
  if (dateIndex < 0 || debitIndex < 0 || creditIndex < 0) return null;
  const byMonth = new Map();
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const rawDate = cells[dateIndex] || "";
    const match = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (!match) continue;
    const month = Number(match[2]);
    const key = `${match[3]}-${match[2]}`;
    const current = byMonth.get(key) || {
      month: monthNames[month - 1] || key,
      inflows: 0,
      outflows: 0,
      note: "Import Qonto",
    };
    current.inflows += parseMoney(cells[creditIndex]);
    current.outflows += parseMoney(cells[debitIndex]);
    byMonth.set(key, current);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => ({
      ...row,
      inflows: Math.round(row.inflows * 100) / 100,
      outflows: Math.round(row.outflows * 100) / 100,
    }));
}

function CashPlanEditor({ rows, onChange, title = "Plan de trésorerie 2027" }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const updateRow = (index, key, value) => {
    onChange(safeRows.map((row, i) => (i === index ? { ...row, [key]: key === "inflows" || key === "outflows" ? amount(value) : value } : row)));
  };
  const addRow = () => onChange([...safeRows, { month: "Nouveau mois", inflows: 0, outflows: 0, note: "" }]);
  const removeRow = (index) => onChange(safeRows.filter((_, i) => i !== index));
  let running = 0;
  const total = safeRows.reduce((sum, row) => sum + amount(row.inflows) - amount(row.outflows), 0);
  return (
    <section className="accounting-editor-block accounting-cash-block">
      <div className="accounting-editor-head">
        <div>
          <h3>{title}</h3>
          <p>Revenus/crédits, dépenses, solde mensuel et solde cumulé se recalculent automatiquement.</p>
        </div>
        <strong>{currency(total)}</strong>
      </div>
      <div className="accounting-mini-actions">
        <button type="button" className="dash-btn dash-btn-secondary" onClick={addRow}>Ajouter un mois</button>
      </div>
      <div className="accounting-cash-table">
        <table>
          <thead>
            <tr>
              <th>Mois</th>
              <th>Revenus / crédits</th>
              <th>Dépenses</th>
              <th>Solde mensuel</th>
              <th>Solde total</th>
              <th>Commentaire</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, index) => {
              const monthly = amount(row.inflows) - amount(row.outflows);
              running += monthly;
              return (
                <tr key={`${row.month}-${index}`}>
                  <td><input value={row.month || ""} onChange={(event) => updateRow(index, "month", event.target.value)} /></td>
                  <td><input type="number" step="0.01" value={row.inflows ?? 0} onChange={(event) => updateRow(index, "inflows", event.target.value)} /></td>
                  <td><input type="number" step="0.01" value={row.outflows ?? 0} onChange={(event) => updateRow(index, "outflows", event.target.value)} /></td>
                  <td className={monthly >= 0 ? "finance-paid" : "finance-due"}>{currency(monthly)}</td>
                  <td>{currency(running)}</td>
                  <td><input value={row.note || ""} onChange={(event) => updateRow(index, "note", event.target.value)} /></td>
                  <td><button type="button" className="accounting-table-remove" onClick={() => removeRow(index)}>Supprimer</button></td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Total</td>
              <td>{currency(safeRows.reduce((sum, row) => sum + amount(row.inflows), 0))}</td>
              <td>{currency(safeRows.reduce((sum, row) => sum + amount(row.outflows), 0))}</td>
              <td className={total >= 0 ? "finance-paid" : "finance-due"}>{currency(total)}</td>
              <td>{currency(total)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FundingBreakdownEditor({ rows, onChange, onExport }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const total = sumLines(safeRows);
  const children = safeRows.reduce((sum, row) => sum + amount(row.children), 0);
  const updateRow = (index, key, value) => {
    const numericKeys = ["amount", "children"];
    onChange(safeRows.map((row, i) => (i === index ? { ...row, [key]: numericKeys.includes(key) ? amount(value) : value } : row)));
  };
  const addRow = () => onChange([...safeRows, { label: "Nouveau financeur", type: "À préciser", amount: 0, children: 0, comment: "" }]);
  const removeRow = (index) => onChange(safeRows.filter((_, i) => i !== index));
  const previewRows = fundingRowsFrom({ fundingBreakdown: safeRows });

  return (
    <section className="accounting-editor-block accounting-funding-block">
      <div className="accounting-editor-head">
        <div>
          <h3>Décomposition du budget par financeurs</h3>
          <p>Prérempli depuis les fichiers d'inscriptions 2026. Chaque ligne reste modifiable et les pourcentages se mettent à jour automatiquement.</p>
        </div>
        <strong>{currency(total)}</strong>
      </div>
      <div className="funding-summary-strip">
        <div><span>Budget ventilé</span><strong>{currency(total)}</strong></div>
        <div><span>Enfants concernés</span><strong>{children}</strong></div>
        <div><span>Financeurs</span><strong>{safeRows.length}</strong></div>
      </div>
      <div className="accounting-mini-actions">
        <button type="button" className="dash-btn dash-btn-secondary" onClick={addRow}>Ajouter un financeur</button>
        <button type="button" className="dash-btn" onClick={onExport}>Exporter tableau + camembert</button>
      </div>
      <div className="funding-editor-layout">
        <div className="funding-pie-preview" style={{ background: pieGradient(previewRows).replace("background:", "") }} />
        <div className="funding-editor-table-wrap">
          <table className="funding-editor-table">
            <thead>
              <tr>
                <th>Financeur</th>
                <th>Type</th>
                <th>Montant</th>
                <th>% budget</th>
                <th>Enfants</th>
                <th>Commentaire</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, index) => {
                const share = total > 0 ? (amount(row.amount) / total) * 100 : 0;
                return (
                  <tr key={`${row.label}-${index}`}>
                    <td><input value={row.label || ""} onChange={(event) => updateRow(index, "label", event.target.value)} /></td>
                    <td><input value={row.type || ""} onChange={(event) => updateRow(index, "type", event.target.value)} /></td>
                    <td><input type="number" step="0.01" value={row.amount ?? 0} onChange={(event) => updateRow(index, "amount", event.target.value)} /></td>
                    <td>{share.toFixed(1)} %</td>
                    <td><input type="number" step="1" value={row.children ?? 0} onChange={(event) => updateRow(index, "children", event.target.value)} /></td>
                    <td><input value={row.comment || ""} onChange={(event) => updateRow(index, "comment", event.target.value)} /></td>
                    <td><button type="button" className="accounting-table-remove" onClick={() => removeRow(index)}>Supprimer</button></td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan="2">Total</td>
                <td>{currency(total)}</td>
                <td>{total > 0 ? "100 %" : "0 %"}</td>
                <td>{children}</td>
                <td colSpan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function Finances() {
  const [rows, setRows] = useState([]);
  const [transportFinance, setTransportFinance] = useState([]);
  const [staffContracts, setStaffContracts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accounting, setAccounting] = useState(() => deepClone(DEFAULT_ACCOUNTING));
  const [accountingStatus, setAccountingStatus] = useState("");
  const [activeFinanceSection, setActiveFinanceSection] = useState("dashboard");
  const [activeAccountingTab, setActiveAccountingTab] = useState("balances");
  const [selectedBalanceYear, setSelectedBalanceYear] = useState("2026");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [snapshot, summarySnapshot, transportsSnapshot, contractsSnapshot, accountingSnapshot] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
          getDoc(doc(db, COLLECTIONS.FINANCE_SUMMARIES, "ete-2026")),
          getDocs(collection(db, COLLECTIONS.TRANSPORTS)),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
          getDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID)),
        ]);
        setRows(snapshot.docs.map(mapFinance).filter((row) =>
          row.hasFinance
          && row.status === "validated"
          && row.validationSource === "ete26_validated_workbook",
        ));
        setTransportFinance(transportsSnapshot.docs.map(mapTransportFinance));
        setStaffContracts(contractsSnapshot.docs.map((contract) => ({ id: contract.id, ...contract.data() })));
        setAccounting(mergeAccountingDraft(accountingSnapshot.exists() ? accountingSnapshot.data() : null));
        setSummary(summarySnapshot.exists() ? summarySnapshot.data() : null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totals = useMemo(
    () =>
      rows.reduce(
        (result, row) => ({
          stay: result.stay + row.stayAmount,
          transport: result.transport + row.transportAmount,
          gross: result.gross + row.grossAmount,
          caf: result.caf + row.cafAidAmount,
          stayNet: result.stayNet + Math.max(row.stayAmount - row.cafAidAmount, 0),
          net: result.net + row.netAmount,
          paid: result.paid + row.paidAmount,
          remaining: result.remaining + row.remainingAmount,
        }),
        { stay: 0, transport: 0, gross: 0, caf: 0, stayNet: 0, net: 0, paid: 0, remaining: 0 },
      ),
    [rows],
  );
  const displayed = summary || {
    stayAmount: totals.stay,
    transportAmount: totals.transport,
    grossAmount: totals.gross,
    cafAidAmount: totals.caf,
    familyAmount: totals.net,
    paidAmount: totals.paid,
    familyRemainingAmount: totals.remaining,
    provisionalGrossAmount: 0,
    provisionalEntries: 0,
  };
  const staySummaries = useMemo(() => summarize(rows, "stay"), [rows]);
  const weekSummaries = useMemo(() => summarize(rows, "week"), [rows]);
  const totalChildren = useMemo(
    () => rows.reduce((total, row) => total + row.childCount, 0),
    [rows],
  );
  const ticketTotals = useMemo(
    () => transportFinance.reduce(
      (total, row) => ({
        cost: total.cost + row.ticketCost,
        purchasedCost: total.purchasedCost + row.purchasedTicketCost,
        tickets: total.tickets + row.tickets,
        purchasedTickets: total.purchasedTickets + row.purchasedTickets,
      }),
      { cost: 0, purchasedCost: 0, tickets: 0, purchasedTickets: 0 },
    ),
    [transportFinance],
  );
  const transportMargin = amount(displayed.transportAmount) - ticketTotals.cost;
  const staffTotals = useMemo(() => staffContracts.reduce(
    (total, contract) => {
      const net = amount(contract.netSalary);
      const gross = amount(contract.grossSalary);
      const paid = contract.paymentValidated ? net : Math.min(amount(contract.paidAmount), net);
      total.net += net;
      total.gross += gross;
      total.paid += paid;
      total.remaining += Math.max(net - paid, 0);
      total.estimatedCharges += Math.max(gross - net, 0);
      return total;
    },
    { net: 0, gross: 0, paid: 0, remaining: 0, estimatedCharges: 0 },
  ), [staffContracts]);
  const accountingForecastProducts = sumLines(accounting.forecast.products);
  const accountingForecastExpenses = sumLines(accounting.forecast.expenses);
  const accounting2027Products = sumLines(accounting.forecast2027.products);
  const accounting2027Expenses = sumLines(accounting.forecast2027.expenses);
  const accountingLandingProducts = sumLines(accounting.landing2026.bankCategories);
  const accountingLandingExpenses = sumLines(accounting.landing2026.expenseCategories);
  const accountingFundingTotal = sumLines(accounting.fundingBreakdown);
  const topFundingShare = Math.max(0, ...fundingRowsFrom(accounting).map((line) => line.share));
  const dashboardSnapshot = {
    reservations: rows.length,
    grossAmount: amount(displayed.grossAmount),
    ticketCost: ticketTotals.cost,
    grossSalary: staffTotals.gross,
  };
  const selectedBalanceSection = accountingSectionForYear(accounting, selectedBalanceYear);
  const selectedBalanceSectionKey = accountingSectionKeyForYear(selectedBalanceYear);

  const updateAccountingSection = (section, key, value) => {
    setAccounting((previous) => ({
      ...previous,
      [section]: { ...previous[section], [key]: value },
    }));
  };

  const saveAccounting = async () => {
    setAccountingStatus("Enregistrement...");
    await setDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID), {
      ...accounting,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setAccountingStatus("Brouillon comptable enregistré.");
  };

  const prefillAccountingFromDashboard = () => {
    setAccounting((previous) => ({
      ...previous,
      actual: {
        products: [
          { account: "70", label: "Part familles facturée", amount: amount(displayed.familyAmount) },
          { account: "74", label: "Aides CAF / VACAF", amount: amount(displayed.cafAidAmount) },
        ],
        expenses: [
          { account: "625", label: "Billets et frais de transport", amount: ticketTotals.cost },
          { account: "641", label: "Salaires bruts RH", amount: staffTotals.gross },
          { account: "645", label: "Charges sociales estimées", amount: staffTotals.estimatedCharges },
        ],
      },
      balance: {
        ...previous.balance,
        assets: [
          { account: "5", label: "Trésorerie disponible", amount: amount(previous.exercise.closingCash) },
          { account: "411", label: "Créances familles à encaisser", amount: amount(displayed.familyRemainingAmount) },
        ],
        liabilities: [
          { account: "12", label: "Résultat issu du dashboard", amount: amount(displayed.grossAmount) - ticketTotals.cost - staffTotals.gross - staffTotals.estimatedCharges },
          { account: "43", label: "Charges sociales à verser", amount: staffTotals.estimatedCharges },
        ],
      },
    }));
    setAccountingStatus("Données préremplies depuis réservations, transports et RH.");
  };

  const build2027From2026 = () => {
    setAccounting((previous) => ({
      ...previous,
      forecast2027: {
        products: previous.forecast.products.map((line) => ({
          ...line,
          amount: Math.round(amount(line.amount) * 2 * 100) / 100,
        })),
        expenses: previous.forecast.expenses.map((line) => ({
          ...line,
          amount: Math.round(amount(line.amount) * 1.75 * 100) / 100,
        })),
      },
      cashPlan2027: previous.cashPlan2027.map((row) => ({
        ...row,
        inflows: Math.round(amount(row.inflows) * 100) / 100,
        outflows: Math.round(amount(row.outflows) * 100) / 100,
      })),
    }));
    setAccountingStatus("Prévisionnel 2027 recalculé : produits x2, charges x1,75, saisonnalité conservée.");
  };

  const reclassLoansAsDonations = () => {
    const reclassProducts = (lines) => (lines || []).map((line) => {
      const label = String(line.label || "").toLowerCase();
      const account = String(line.account || "");
      if (account.startsWith("16") || label.includes("prêt") || label.includes("pret")) {
        return { ...line, account: "758", label: "Apports requalifiés en dons" };
      }
      return line;
    });
    const reclassLiabilities = (lines) => (lines || []).map((line) => {
      const label = String(line.label || "").toLowerCase();
      const account = String(line.account || "");
      if (account.startsWith("16") || label.includes("emprunt") || label.includes("dette")) {
        return { ...line, amount: 0, label: "Aucune dette financière liée aux apports requalifiés" };
      }
      return line;
    });
    setAccounting((previous) => ({
      ...previous,
      actual: { ...previous.actual, products: reclassProducts(previous.actual.products) },
      financial2025: {
        ...previous.financial2025,
        products: reclassProducts(previous.financial2025.products),
        liabilities: reclassLiabilities(previous.financial2025.liabilities),
      },
      balance: {
        ...previous.balance,
        liabilities: reclassLiabilities(previous.balance.liabilities),
      },
    }));
    setAccountingStatus("Les anciens prêts ont été reclassés en dons et les dettes associées mises à zéro.");
  };

  const importQontoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = importQontoCashPlan(text);
    if (!imported?.length) {
      setAccountingStatus("Import Qonto impossible : colonnes attendues non trouvées.");
      event.target.value = "";
      return;
    }
    setAccounting((previous) => {
      const importedByMonth = new Map(imported.map((row) => [row.month, row]));
      const projected = previous.cashPlan2027.map((existing) => {
        const row = importedByMonth.get(existing.month);
        if (!row) return existing;
        return {
          ...existing,
          inflows: Math.round(amount(row.inflows) * 2 * 100) / 100,
          outflows: Math.round(amount(row.outflows) * 1.75 * 100) / 100,
          note: `${row.note} 2026, projection 2027`,
        };
      });
      const cashPlan2026 = previous.cashPlan2026.map((existing) => {
        const row = importedByMonth.get(existing.month);
        return row ? { ...existing, ...row } : existing;
      });
      return {
        ...previous,
        cashPlan2026,
        cashPlan2027: projected,
        landing2026: {
          ...previous.landing2026,
          bankMonthly: imported,
        },
      };
    });
    setAccountingStatus(`${imported.length} mois importés depuis Qonto, les autres mois restent prévisionnels.`);
    event.target.value = "";
  };

  const exportCsv = () => {
    const headers = [
      "Référence", "Responsable", "Enfants", "Séjour", "Semaine",
      "Séjour (€)", "Transport (€)", "Total brut (€)", "Aide CAF (€)",
      "CA net (€)", "Réglé (€)", "Reste (€)",
    ];
    const lines = rows.map((row) => [
      row.reference, row.responsible, row.children, row.stay, row.week,
      row.stayAmount, row.transportAmount, row.grossAmount, row.cafAidAmount,
      row.netAmount, row.paidAmount, row.remainingAmount,
    ]);
    const csv = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `suivi-finances-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { key: "reference", label: "Dossier" },
    { key: "responsible", label: "Responsable" },
    { key: "children", label: "Enfant(s)" },
    { key: "stay", label: "Séjour", filterable: true, filterLabel: "Tous les séjours" },
    { key: "week", label: "Semaine", filterable: true, filterLabel: "Toutes les semaines" },
    { key: "stayAmount", label: "Séjour", render: (row) => currency(row.stayAmount), sortValue: (row) => row.stayAmount },
    { key: "transportAmount", label: "Transport", render: (row) => currency(row.transportAmount), sortValue: (row) => row.transportAmount },
    { key: "grossAmount", label: "Brut", render: (row) => currency(row.grossAmount), sortValue: (row) => row.grossAmount },
    { key: "cafAidAmount", label: "CAF", render: (row) => currency(row.cafAidAmount), sortValue: (row) => row.cafAidAmount },
    { key: "netAmount", label: "CA net", render: (row) => <strong>{currency(row.netAmount)}</strong>, sortValue: (row) => row.netAmount },
    { key: "paidAmount", label: "Réglé", render: (row) => currency(row.paidAmount), sortValue: (row) => row.paidAmount },
    {
      key: "remainingAmount",
      label: "Reste",
      render: (row) => <span className={row.remainingAmount > 0 ? "finance-due" : "finance-paid"}>{currency(row.remainingAmount)}</span>,
      sortValue: (row) => row.remainingAmount,
    },
  ];

  return (
    <div className="dash-page finance-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Suivi financier</h1>
          <p>Chiffre d’affaires, aides, encaissements et reste à percevoir.</p>
        </div>
        {activeFinanceSection === "dashboard" && (
          <button type="button" className="dash-btn" onClick={exportCsv} disabled={!rows.length}>
            Exporter les lignes CSV
          </button>
        )}
      </header>

      <nav className="finance-section-tabs" aria-label="Sections finances">
        {FINANCE_SECTIONS.map((section) => (
          <button
            type="button"
            key={section.key}
            className={activeFinanceSection === section.key ? "is-active" : ""}
            onClick={() => setActiveFinanceSection(section.key)}
          >
            <strong>{section.label}</strong>
            <span>{section.detail}</span>
          </button>
        ))}
      </nav>

      {activeFinanceSection === "dashboard" && (
        <>
      <section className="finance-metrics">
        <Metric label="CA séjours" value={displayed.stayAmount} tone="stay" detail="Prestations séjours, aides comprises" />
        <Metric label="CA transport" value={displayed.transportAmount} tone="transport" detail="Transports facturés" />
        <Metric label="Billets transport" value={ticketTotals.cost} tone="warning" detail={`${ticketTotals.purchasedTickets}/${ticketTotals.tickets} billet(s) ajoutés`} />
        <Metric label="Marge transport" value={transportMargin} tone={transportMargin >= 0 ? "success" : "warning"} detail="CA transport - billets ajoutés" />
        <Metric label="CA total inscriptions" value={displayed.grossAmount} tone="primary" detail="CA séjours + CA transport" />
        <Metric label="Montant encaissé" value={displayed.paidAmount} tone="success" detail={`${displayed.familyAmount ? Math.round((displayed.paidAmount / displayed.familyAmount) * 100) : 0}% de la part familles`} />
        <Metric label="Reste familles" value={displayed.familyRemainingAmount} tone="warning" detail="Après déduction des aides CAF" />
        <Metric label="Aides CAF" value={displayed.cafAidAmount} tone="info" detail="Part du CA prise en charge par la CAF" />
      </section>

      <section className="finance-breakdown">
        <div><span>Part familles</span><strong>{currency(displayed.familyAmount)}</strong></div>
        <div><span>Inscriptions provisoires</span><strong>{currency(displayed.provisionalGrossAmount)}</strong></div>
        <div><span>Lignes provisoires</span><strong>{displayed.provisionalEntries}</strong></div>
        <div><span>Enfants rapprochés</span><strong>{totalChildren}</strong></div>
      </section>

          {loading ? (
            <section className="dash-section"><p className="dash-muted">Chargement des finances...</p></section>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchableKeys={["reference", "responsible", "children", "stay", "week"]}
              defaultSortKey="remainingAmount"
              defaultSortDirection="desc"
              emptyLabel="Aucune donnée financière importée."
              toolsInline
            />
          )}
        </>
      )}

      {activeFinanceSection === "documents" && (
      <section className="accounting-panel">
        <div className="accounting-panel-head">
          <div>
            <h2>Comptabilité et bilans</h2>
            <p>Prépare les comptes annuels, bilans financiers, budget prévisionnel et dépôt DCA depuis des données éditables.</p>
          </div>
          <div className="accounting-actions">
            <button type="button" className="dash-btn dash-btn-secondary" onClick={prefillAccountingFromDashboard}>
              Préremplir depuis le dashboard
            </button>
            <button type="button" className="dash-btn" onClick={saveAccounting}>Enregistrer</button>
          </div>
        </div>
        {accountingStatus && <p className="accounting-status">{accountingStatus}</p>}

        <div className="accounting-kpis">
          <div><span>Bilan 2024</span><strong className={resultFrom(accounting.financial2024) >= 0 ? "finance-paid" : "finance-due"}>{currency(resultFrom(accounting.financial2024))}</strong></div>
          <div><span>Bilan 2025</span><strong className={resultFrom(accounting.financial2025) >= 0 ? "finance-paid" : "finance-due"}>{currency(resultFrom(accounting.financial2025))}</strong></div>
          <div><span>Atterrissage 2026</span><strong className={accountingLandingProducts - accountingLandingExpenses >= 0 ? "finance-paid" : "finance-due"}>{currency(accountingLandingProducts - accountingLandingExpenses)}</strong></div>
          <div><span>Prévisionnel 2026</span><strong className={accountingForecastProducts - accountingForecastExpenses >= 0 ? "finance-paid" : "finance-due"}>{currency(accountingForecastProducts - accountingForecastExpenses)}</strong></div>
          <div><span>Prévisionnel 2027</span><strong className={resultFrom(accounting.forecast2027) >= 0 ? "finance-paid" : "finance-due"}>{currency(resultFrom(accounting.forecast2027))}</strong></div>
          <div><span>Financement</span><strong>{currency(accounting.financingRequest.requestedAmount)}</strong></div>
          <div><span>1er financeur</span><strong>{topFundingShare.toFixed(1)} %</strong></div>
          <div><span>Budget ventilé</span><strong>{currency(accountingFundingTotal)}</strong></div>
          <div><span>Plan tréso 2026</span><strong>{accounting.cashPlan2026.length} mois</strong></div>
        </div>

        <nav className="accounting-tabs" aria-label="Sections comptables">
          {ACCOUNTING_TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={activeAccountingTab === tab.key ? "is-active" : ""}
              onClick={() => setActiveAccountingTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeAccountingTab === "balances" && (
          <>
            <section className="accounting-document-toolbar">
              <label>
                <span>Année du bilan</span>
                <select value={selectedBalanceYear} onChange={(event) => setSelectedBalanceYear(event.target.value)}>
                  {BALANCE_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={reclassLoansAsDonations}>
                Reclasser prêts en dons
              </button>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={build2027From2026}>
                Recalculer 2027 depuis 2026
              </button>
              <button type="button" className="dash-btn" onClick={() => openAccountingPrint(accounting, "budgetYear", dashboardSnapshot, { year: selectedBalanceYear })}>
                Exporter en PDF
              </button>
            </section>
            <section className="accounting-request-box">
              <h3>Commentaire interne {selectedBalanceYear}</h3>
              <textarea
                className="accounting-wide-textarea"
                value={selectedBalanceSection.note || ""}
                onChange={(event) => updateAccountingSection(selectedBalanceSectionKey, "note", event.target.value)}
              />
            </section>
            <BudgetStatementEditor
              year={selectedBalanceYear}
              section={selectedBalanceSection}
              onChange={(section) => setAccounting((previous) => ({ ...previous, [selectedBalanceSectionKey]: section }))}
              onExport={() => openAccountingPrint(accounting, "budgetYear", dashboardSnapshot, { year: selectedBalanceYear })}
            />
          </>
        )}

        {activeAccountingTab === "cashPlan" && (
          <>
            <section className="accounting-document-toolbar">
              <div>
                <strong>Plan de trésorerie 2026</strong>
                <p>Vue mois par mois : revenus/crédits, dépenses, solde mensuel, solde total et commentaire.</p>
              </div>
              <button type="button" className="dash-btn" onClick={() => openAccountingPrint(accounting, "cashPlan2026", dashboardSnapshot)}>
                Exporter le plan 2026
              </button>
            </section>
            <CashPlanEditor
              title="Plan de trésorerie 2026"
              rows={accounting.cashPlan2026}
              onChange={(lines) => setAccounting((previous) => ({ ...previous, cashPlan2026: lines }))}
            />
          </>
        )}

        {activeAccountingTab === "fundingSplit" && (
          <FundingBreakdownEditor
            rows={accounting.fundingBreakdown}
            onChange={(lines) => setAccounting((previous) => ({ ...previous, fundingBreakdown: lines }))}
            onExport={() => openAccountingPrint(accounting, "fundingSplit", dashboardSnapshot)}
          />
        )}

        {activeAccountingTab === "landing2026" && (
          <>
            <section className="accounting-document-toolbar">
              <button type="button" className="dash-btn" onClick={() => openAccountingPrint(accounting, "landing2026", dashboardSnapshot)}>
                Exporter l'atterrissage
              </button>
              <label className="accounting-file-btn">
                <input type="file" accept=".csv,text/csv" onChange={importQontoFile} />
                <span>Importer un export Qonto CSV</span>
              </label>
            </section>
            <section className="accounting-request-box">
              <h3>Note d’atterrissage 2026</h3>
              <textarea
                className="accounting-wide-textarea"
                value={accounting.landing2026.note || ""}
                onChange={(event) => updateAccountingSection("landing2026", "note", event.target.value)}
              />
            </section>
            <div className="accounting-editor-grid">
              <AccountingLinesEditor title="Encaissements Qonto 2026" lines={accounting.landing2026.bankCategories} onChange={(lines) => updateAccountingSection("landing2026", "bankCategories", lines)} />
              <AccountingLinesEditor title="Décaissements Qonto 2026" lines={accounting.landing2026.expenseCategories} onChange={(lines) => updateAccountingSection("landing2026", "expenseCategories", lines)} />
              <AccountingLinesEditor title="Produits réalisés dashboard" lines={accounting.actual.products} onChange={(lines) => updateAccountingSection("actual", "products", lines)} />
              <AccountingLinesEditor title="Charges réalisées dashboard" lines={accounting.actual.expenses} onChange={(lines) => updateAccountingSection("actual", "expenses", lines)} />
              <CashPlanEditor title="Flux mensuels Qonto 2026" rows={accounting.landing2026.bankMonthly} onChange={(lines) => updateAccountingSection("landing2026", "bankMonthly", lines)} />
            </div>
          </>
        )}

        {activeAccountingTab === "forecast2027" && (
          <>
            <section className="accounting-document-toolbar">
              <button type="button" className="dash-btn dash-btn-secondary" onClick={build2027From2026}>
                Recalculer depuis 2026
              </button>
              <button type="button" className="dash-btn" onClick={() => openAccountingPrint(accounting, "forecast2027", dashboardSnapshot)}>
                Exporter le prévisionnel
              </button>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={() => openAccountingPrint(accounting, "cashPlan2027", dashboardSnapshot)}>
                Exporter la trésorerie
              </button>
            </section>
            <div className="accounting-editor-grid">
              <AccountingLinesEditor title="Produits prévisionnels 2027" lines={accounting.forecast2027.products} onChange={(lines) => updateAccountingSection("forecast2027", "products", lines)} />
              <AccountingLinesEditor title="Charges prévisionnelles 2027" lines={accounting.forecast2027.expenses} onChange={(lines) => updateAccountingSection("forecast2027", "expenses", lines)} />
              <CashPlanEditor rows={accounting.cashPlan2027} onChange={(lines) => setAccounting((previous) => ({ ...previous, cashPlan2027: lines }))} />
            </div>
            <div className="accounting-forecast-result">
              <span>Prévisionnel : produits {currency(accounting2027Products)} · charges {currency(accounting2027Expenses)}</span>
              <strong className={resultFrom(accounting.forecast2027) >= 0 ? "finance-paid" : "finance-due"}>
                Résultat {currency(resultFrom(accounting.forecast2027))}
              </strong>
            </div>
          </>
        )}

        {activeAccountingTab === "request" && (
          <section className="accounting-request-box">
            <div className="accounting-document-title-row">
              <h3>Demande de financement</h3>
              <button type="button" className="dash-btn" onClick={() => openAccountingPrint(accounting, "financingRequest", dashboardSnapshot)}>
                Exporter la demande
              </button>
            </div>
            <div className="accounting-form-grid">
              <label>
                <span>Montant demandé</span>
                <input
                  type="number"
                  step="0.01"
                  value={accounting.financingRequest.requestedAmount ?? 0}
                  onChange={(event) => updateAccountingSection("financingRequest", "requestedAmount", amount(event.target.value))}
                />
              </label>
            </div>
            <FinancingRequestEditor request={accounting.financingRequest} onChange={(request) => setAccounting((previous) => ({ ...previous, financingRequest: request }))} />
          </section>
        )}

        {activeAccountingTab === "settings" && (
          <>
            <div className="accounting-form-grid">
              <label><span>Association</span><input value={accounting.association.name || ""} onChange={(event) => updateAccountingSection("association", "name", event.target.value)} /></label>
              <label><span>SIRET</span><input value={accounting.association.siret || ""} onChange={(event) => updateAccountingSection("association", "siret", event.target.value)} /></label>
              <label><span>Exercice</span><input value={accounting.exercise.year || ""} onChange={(event) => updateAccountingSection("exercise", "year", event.target.value)} /></label>
              <label><span>Début</span><input type="date" value={accounting.exercise.startDate || ""} onChange={(event) => updateAccountingSection("exercise", "startDate", event.target.value)} /></label>
              <label><span>Clôture</span><input type="date" value={accounting.exercise.endDate || ""} onChange={(event) => updateAccountingSection("exercise", "endDate", event.target.value)} /></label>
              <label><span>Trésorerie de clôture</span><input type="number" step="0.01" value={accounting.exercise.closingCash ?? 0} onChange={(event) => updateAccountingSection("exercise", "closingCash", amount(event.target.value))} /></label>
            </div>
            <div className="accounting-editor-grid">
              <AccountingLinesEditor title="Produits prévisionnels 2026" lines={accounting.forecast.products} onChange={(lines) => updateAccountingSection("forecast", "products", lines)} />
              <AccountingLinesEditor title="Charges prévisionnelles 2026" lines={accounting.forecast.expenses} onChange={(lines) => updateAccountingSection("forecast", "expenses", lines)} />
              <AccountingLinesEditor title="Contributions volontaires" lines={accounting.forecast.voluntary} onChange={(lines) => updateAccountingSection("forecast", "voluntary", lines)} />
              <AccountingLinesEditor title="Actif du bilan courant" lines={accounting.balance.assets} onChange={(lines) => updateAccountingSection("balance", "assets", lines)} />
              <AccountingLinesEditor title="Passif du bilan courant" lines={accounting.balance.liabilities} onChange={(lines) => updateAccountingSection("balance", "liabilities", lines)} />
            </div>
            <AccountingTextEditor accounting={accounting} setAccounting={setAccounting} />
          </>
        )}
      </section>
      )}

      {activeFinanceSection === "stays" && (
        <>
          <section className="finance-section-head">
            <div>
              <h2>Séjours et transports</h2>
              <p>Synthèse opérationnelle issue des réservations validées, des semaines et des billets transport.</p>
            </div>
            <button type="button" className="dash-btn" onClick={exportCsv} disabled={!rows.length}>
              Exporter en CSV
            </button>
          </section>
          {loading ? (
            <section className="dash-section"><p className="dash-muted">Chargement des synthèses séjours...</p></section>
          ) : (
            <>
              <div className="finance-summary-grid">
                <SummaryTable title="Totaux par séjour" firstColumn="Séjour" rows={staySummaries} />
                <SummaryTable title="Totaux par semaine" firstColumn="Semaine" rows={weekSummaries} />
              </div>
              <TransportFinanceTable rows={rows} transports={transportFinance} />
            </>
          )}
        </>
      )}
    </div>
  );
}
