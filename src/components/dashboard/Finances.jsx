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
  { key: "exports", label: "Exports" },
  { key: "year2025", label: "Bilan 2025" },
  { key: "landing2026", label: "Atterrissage 2026" },
  { key: "forecast2027", label: "Prévisionnel 2027" },
  { key: "request", label: "Financement" },
  { key: "settings", label: "Paramètres" },
];

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
    ],
    note: "Au 3 septembre 2026, les extraits Qonto montrent déjà plus de 316 k€ d'encaissements et une trésorerie positive de 14 186,20 €. L'activité est fortement saisonnière, avec une première tension en février puis une concentration majeure des flux sur juin, juillet et août.",
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
      { label: "Locations centres, salles, matériel", account: "61", amount: 105000 },
      { label: "Entretien et réparation", account: "61", amount: 6000 },
      { label: "Assurance", account: "61", amount: 8000 },
      { label: "Documentation", account: "61", amount: 6000 },
      { label: "Honoraires / intervenants", account: "62", amount: 60000 },
      { label: "Publicité, publication, relations publiques", account: "62", amount: 8000 },
      { label: "Impôts et taxes", account: "63", amount: 5000 },
      { label: "Rémunération des personnels", account: "64", amount: 55000 },
      { label: "Charges sociales", account: "64", amount: 20000 },
      { label: "Autres charges de personnel", account: "64", amount: 5000 },
      { label: "Autres charges de gestion courante", account: "65", amount: 10000 },
      { label: "Charges financières", account: "66", amount: 2000 },
      { label: "Charges exceptionnelles", account: "67", amount: 3000 },
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
  const products = accounting.forecast2027?.products || [];
  const total = sumLines(products);
  return products.map((line) => ({
    ...line,
    share: total > 0 ? (amount(line.amount) / total) * 100 : 0,
  }));
}

function fundingSplitTable(accounting) {
  const rows = fundingRowsFrom(accounting);
  return `
    <section>
      <h2>Décomposition du budget par financeurs</h2>
      <table>
        <thead><tr><th>Compte</th><th>Financeur / ressource</th><th>Montant</th><th>%</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.account)}</td>
              <td>${escapeHtml(row.label)}</td>
              <td class="num">${escapeHtml(currency(row.amount))}</td>
              <td class="num">${escapeHtml(row.share.toFixed(1))} %</td>
            </tr>`).join("")}
          <tr class="total"><td colspan="2">Total</td><td class="num">${escapeHtml(currency(sumLines(rows)))}</td><td class="num">100 %</td></tr>
        </tbody>
      </table>
      <p>Lecture : cette table permet d'identifier le poids relatif des familles, aides publiques, subventions et autres ressources dans le budget prévisionnel.</p>
    </section>
  `;
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

function openAccountingPrint(accounting, kind, dashboardSnapshot) {
  const actualProducts = sumLines(accounting.actual.products);
  const actualExpenses = sumLines(accounting.actual.expenses);
  const forecastProducts = sumLines(accounting.forecast.products);
  const forecastExpenses = sumLines(accounting.forecast.expenses);
  const actualResult = actualProducts - actualExpenses;
  const forecastResult = forecastProducts - forecastExpenses;
  const titles = {
    annual: "Comptes annuels",
    financial: "Bilan financier",
    forecast: "Budget prévisionnel",
    moral: "Bilan moral et financier",
    dca: "Synthèse de dépôt DCA",
    funderPack: "Dossier financeur",
    forecast2027: "Prévisionnel financier 2027",
    cashPlan2027: "Plan de trésorerie 12 mois",
    fundingSplit: "Répartition des financeurs",
    financingRequest: "Demande de financement",
    financial2025: "Bilan comptable 2025",
    landing2026: "Atterrissage comptable 2026",
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
      ${lineTable("Produits prévisionnels", accounting.forecast.products)}
      ${lineTable("Charges prévisionnelles", accounting.forecast.expenses)}
      ${lineTable("Contributions volontaires en nature", accounting.forecast.voluntary)}
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
      ${lineTable("Prévisionnel 2027 - produits", accounting.forecast2027.products)}
      ${lineTable("Prévisionnel 2027 - charges", accounting.forecast2027.expenses)}
      ${cashPlanTable("Plan de trésorerie 2027", accounting.cashPlan2027)}
      ${fundingSplitTable(accounting)}
    `,
    forecast2027: `
      ${lineTable("Produits 2027", accounting.forecast2027.products)}
      ${lineTable("Charges 2027", accounting.forecast2027.expenses)}
      <section class="note"><strong>Résultat prévisionnel 2027 :</strong> ${escapeHtml(currency(resultFrom(accounting.forecast2027)))}</section>
    `,
    cashPlan2027: cashPlanTable("Plan de trésorerie 2027 - saisonnalité sur 12 mois", accounting.cashPlan2027),
    fundingSplit: fundingSplitTable(accounting),
    financingRequest: `
      <section><h2>Objet de la demande</h2><p>${escapeHtml(accounting.financingRequest.purpose)}</p></section>
      <section><h2>Développement envisagé</h2><p>${escapeHtml(accounting.financingRequest.development)}</p></section>
      <section><h2>Utilisation du financement</h2><p>${escapeHtml(accounting.financingRequest.useOfFunds)}</p></section>
      <section><h2>Lecture de remboursement / sécurisation</h2><p>${escapeHtml(accounting.financingRequest.repaymentView)}</p></section>
      <section class="note"><strong>Montant demandé :</strong> ${escapeHtml(currency(accounting.financingRequest.requestedAmount))}</section>
    `,
    financial2025: `
      ${financialNarrative2025(accounting)}
      ${lineTable("Produits 2025", accounting.financial2025.products)}
      ${lineTable("Charges 2025", accounting.financial2025.expenses)}
      <section class="grid">
        <p><span>Produits 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.products)))}</strong></p>
        <p><span>Charges 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.expenses)))}</strong></p>
        <p><span>Résultat 2025</span><strong>${escapeHtml(currency(sumLines(accounting.financial2025.products) - sumLines(accounting.financial2025.expenses)))}</strong></p>
        <p><span>Dette financière reclassée</span><strong>0,00 €</strong></p>
      </section>
      ${lineTable("Actif 2025", accounting.financial2025.assets)}
      ${lineTable("Passif 2025", accounting.financial2025.liabilities)}
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
  };
  const html = `<!doctype html>
    <html><head><meta charset="utf-8" /><title>${escapeHtml(titles[kind])} ${escapeHtml(accounting.association.name)}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:32px;color:#1f172f}
      header{border-bottom:3px solid #b8336a;padding-bottom:18px;margin-bottom:22px}
      h1{margin:0;font-size:28px} h2{font-size:17px;margin:24px 0 8px} h3{font-size:13px;margin:14px 0 5px}
      p{line-height:1.45} small{color:#6b5f78}
      table{width:100%;border-collapse:collapse;margin-bottom:14px} th,td{border:1px solid #ddd5e7;padding:8px;text-align:left;font-size:12px}
      th{background:#f7f2fa;color:#5f506f;text-transform:uppercase;font-size:10px}.num{text-align:right}.total td{font-weight:700;background:#faf8fc}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.grid p,.note{border:1px solid #ddd5e7;padding:12px;background:#faf8fc}
      .grid span{display:block;color:#6b5f78;font-size:10px;text-transform:uppercase}.grid strong{display:block;margin-top:4px}
      footer{margin-top:28px;color:#6b5f78;font-size:11px}
      @media print{body{margin:18mm}.no-print{display:none}}
    </style></head><body>
      <button class="no-print" onclick="window.print()">Exporter en PDF</button>
      <header>
        <h1>${escapeHtml(titles[kind])} ${escapeHtml(accounting.exercise.year)} - ${escapeHtml(accounting.association.name)}</h1>
        <small>${escapeHtml(accounting.association.email)} · ${escapeHtml(accounting.association.phone)} · ${escapeHtml(accounting.association.website)} · SIRET ${escapeHtml(accounting.association.siret)}</small>
      </header>
      ${blocks[kind] || blocks.annual}
      <footer>
        Données dashboard : ${escapeHtml(dashboardSnapshot.reservations)} réservation(s), ${escapeHtml(currency(dashboardSnapshot.grossAmount))} de CA inscriptions, ${escapeHtml(currency(dashboardSnapshot.ticketCost))} de billets transport, ${escapeHtml(currency(dashboardSnapshot.grossSalary))} de salaires bruts RH.
      </footer>
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
  const updateRow = (index, key, value) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: key === "inflows" || key === "outflows" ? amount(value) : value } : row)));
  };
  let running = 0;
  return (
    <section className="accounting-editor-block accounting-cash-block">
      <div className="accounting-editor-head">
        <h3>{title}</h3>
        <strong>{currency((rows || []).reduce((total, row) => total + amount(row.inflows) - amount(row.outflows), 0))}</strong>
      </div>
      <div className="accounting-cash-table">
        <table>
          <thead>
            <tr>
              <th>Mois</th>
              <th>Encaissements</th>
              <th>Décaissements</th>
              <th>Solde</th>
              <th>Cumul</th>
              <th>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row, index) => {
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
                </tr>
              );
            })}
          </tbody>
        </table>
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
  const [activeAccountingTab, setActiveAccountingTab] = useState("exports");
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
  const accountingActualProducts = sumLines(accounting.actual.products);
  const accountingActualExpenses = sumLines(accounting.actual.expenses);
  const accountingForecastProducts = sumLines(accounting.forecast.products);
  const accountingForecastExpenses = sumLines(accounting.forecast.expenses);
  const accounting2027Products = sumLines(accounting.forecast2027.products);
  const accounting2027Expenses = sumLines(accounting.forecast2027.expenses);
  const topFundingShare = Math.max(0, ...fundingRowsFrom(accounting).map((line) => line.share));
  const dashboardSnapshot = {
    reservations: rows.length,
    grossAmount: amount(displayed.grossAmount),
    ticketCost: ticketTotals.cost,
    grossSalary: staffTotals.gross,
  };

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
      return {
        ...previous,
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
        <button type="button" className="dash-btn" onClick={exportCsv} disabled={!rows.length}>
          Exporter en CSV
        </button>
      </header>

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
          <div><span>Produits saisis</span><strong>{currency(accountingActualProducts)}</strong></div>
          <div><span>Charges saisies</span><strong>{currency(accountingActualExpenses)}</strong></div>
          <div><span>Résultat saisi</span><strong className={resultFrom(accounting.actual) >= 0 ? "finance-paid" : "finance-due"}>{currency(resultFrom(accounting.actual))}</strong></div>
          <div><span>Salaires bruts RH</span><strong>{currency(staffTotals.gross)}</strong></div>
          <div><span>Charges sociales estimées</span><strong>{currency(staffTotals.estimatedCharges)}</strong></div>
          <div><span>Net restant à payer</span><strong className={staffTotals.remaining > 0 ? "finance-due" : "finance-paid"}>{currency(staffTotals.remaining)}</strong></div>
          <div><span>Produits 2027</span><strong>{currency(accounting2027Products)}</strong></div>
          <div><span>Charges 2027</span><strong>{currency(accounting2027Expenses)}</strong></div>
          <div><span>Résultat 2027</span><strong className={resultFrom(accounting.forecast2027) >= 0 ? "finance-paid" : "finance-due"}>{currency(resultFrom(accounting.forecast2027))}</strong></div>
          <div><span>Financement demandé</span><strong>{currency(accounting.financingRequest.requestedAmount)}</strong></div>
          <div><span>1er financeur</span><strong>{topFundingShare.toFixed(1)} %</strong></div>
          <div><span>Plan tréso 12 mois</span><strong>{accounting.cashPlan2027.length} mois</strong></div>
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

        {activeAccountingTab === "exports" && (
          <>
            <div className="accounting-export-grid">
              {[
                ["financial2025", "Bilan comptable 2025", "Version positive, prêts reclassés en dons."],
                ["landing2026", "Atterrissage 2026", "Synthèse Qonto + dashboard."],
                ["funderPack", "Dossier financeur", "Atterrissage, 2027, trésorerie, financeurs."],
                ["annual", "Comptes annuels", "Recettes, dépenses, bilan actif/passif."],
                ["financial", "Bilan financier", "Synthèse prête à transmettre."],
                ["forecast", "Budget prévisionnel 2026", "Postes issus du modèle joint."],
                ["forecast2027", "Prévisionnel 2027", "Doublement CA et séjours."],
                ["cashPlan2027", "Trésorerie 12 mois", "Saisonnalité février + été."],
                ["fundingSplit", "Répartition financeurs", "% par source de financement."],
                ["financingRequest", "Demande de financement", "Objet, usage, développement."],
                ["moral", "Bilan moral et financier", "Texte éditable + tableaux."],
                ["dca", "Dépôt DCA", "Contrôles et chiffres pour publication."],
              ].map(([kind, title, detail]) => (
                <button
                  type="button"
                  key={kind}
                  onClick={() => openAccountingPrint(accounting, kind, dashboardSnapshot)}
                >
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </button>
              ))}
            </div>
            <div className="accounting-tool-row">
              <button type="button" className="dash-btn dash-btn-secondary" onClick={reclassLoansAsDonations}>
                Reclasser prêts en dons
              </button>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={build2027From2026}>
                Recalculer 2027 depuis 2026
              </button>
              <label className="accounting-file-btn">
                <input type="file" accept=".csv,text/csv" onChange={importQontoFile} />
                <span>Importer un export Qonto CSV</span>
              </label>
              <p>Les statuts, la composition du bureau, la présentation libre et les relevés Qonto PDF restent à joindre séparément.</p>
            </div>
          </>
        )}

        {activeAccountingTab === "year2025" && (
          <>
            <section className="accounting-request-box">
              <h3>Note de lecture 2025</h3>
              <textarea
                className="accounting-wide-textarea"
                value={accounting.financial2025.note || ""}
                onChange={(event) => updateAccountingSection("financial2025", "note", event.target.value)}
              />
            </section>
            <div className="accounting-editor-grid">
              <AccountingLinesEditor title="Produits 2025" lines={accounting.financial2025.products} onChange={(lines) => updateAccountingSection("financial2025", "products", lines)} />
              <AccountingLinesEditor title="Charges 2025" lines={accounting.financial2025.expenses} onChange={(lines) => updateAccountingSection("financial2025", "expenses", lines)} />
              <AccountingLinesEditor title="Actif 2025" lines={accounting.financial2025.assets} onChange={(lines) => updateAccountingSection("financial2025", "assets", lines)} />
              <AccountingLinesEditor title="Passif 2025" lines={accounting.financial2025.liabilities} onChange={(lines) => updateAccountingSection("financial2025", "liabilities", lines)} />
            </div>
          </>
        )}

        {activeAccountingTab === "landing2026" && (
          <>
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
            <h3>Demande de financement</h3>
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

      <div className="finance-summary-grid">
        <SummaryTable title="Totaux par séjour" firstColumn="Séjour" rows={staySummaries} />
        <SummaryTable title="Totaux par semaine" firstColumn="Semaine" rows={weekSummaries} />
      </div>

      <TransportFinanceTable rows={rows} transports={transportFinance} />

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
    </div>
  );
}
