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
  actual: {
    products: [
      { label: "Vente de séjours / participations familles", account: "70", amount: 108857.3 },
      { label: "CAF / VACAF", account: "74", amount: 17079.44 },
      { label: "SDJES 93", account: "74", amount: 9900 },
      { label: "Adhésions", account: "756", amount: 135 },
      { label: "Dons / mécénat", account: "758", amount: 1400 },
      { label: "Prêt reçu", account: "16", amount: 6000 },
    ],
    expenses: [
      { label: "Fonctionnement", account: "60-62", amount: 10866.6 },
      { label: "Séjours", account: "60-64", amount: 131595.68 },
    ],
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
      { label: "Résultat de l'exercice", account: "12", amount: -4620.54 },
      { label: "Emprunt / dette", account: "16", amount: 6000 },
      { label: "Dettes d'exploitation", account: "4", amount: 0 },
    ],
  },
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
    actual: {
      products: saved.actual?.products || DEFAULT_ACCOUNTING.actual.products,
      expenses: saved.actual?.expenses || DEFAULT_ACCOUNTING.actual.expenses,
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
        <p><span>Recettes hors prêt</span><strong>${escapeHtml(currency(actualProducts - sumLines(accounting.actual.products.filter((line) => String(line.account).startsWith("16")))))}</strong></p>
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
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
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

export default function Finances() {
  const [rows, setRows] = useState([]);
  const [transportFinance, setTransportFinance] = useState([]);
  const [staffContracts, setStaffContracts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accounting, setAccounting] = useState(() => deepClone(DEFAULT_ACCOUNTING));
  const [accountingStatus, setAccountingStatus] = useState("");
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
        </div>

        <div className="accounting-form-grid">
          <label>
            <span>Association</span>
            <input
              value={accounting.association.name || ""}
              onChange={(event) => updateAccountingSection("association", "name", event.target.value)}
            />
          </label>
          <label>
            <span>SIRET</span>
            <input
              value={accounting.association.siret || ""}
              onChange={(event) => updateAccountingSection("association", "siret", event.target.value)}
            />
          </label>
          <label>
            <span>Exercice</span>
            <input
              value={accounting.exercise.year || ""}
              onChange={(event) => updateAccountingSection("exercise", "year", event.target.value)}
            />
          </label>
          <label>
            <span>Début</span>
            <input
              type="date"
              value={accounting.exercise.startDate || ""}
              onChange={(event) => updateAccountingSection("exercise", "startDate", event.target.value)}
            />
          </label>
          <label>
            <span>Clôture</span>
            <input
              type="date"
              value={accounting.exercise.endDate || ""}
              onChange={(event) => updateAccountingSection("exercise", "endDate", event.target.value)}
            />
          </label>
          <label>
            <span>Trésorerie de clôture</span>
            <input
              type="number"
              step="0.01"
              value={accounting.exercise.closingCash ?? 0}
              onChange={(event) => updateAccountingSection("exercise", "closingCash", amount(event.target.value))}
            />
          </label>
        </div>

        <div className="accounting-export-grid">
          {[
            ["annual", "Comptes annuels", "Recettes, dépenses, bilan actif/passif."],
            ["financial", "Bilan financier", "Synthèse prête à transmettre."],
            ["forecast", "Budget prévisionnel", "Postes 2026 issus du modèle joint."],
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

        <div className="accounting-editor-grid">
          <AccountingLinesEditor
            title="Recettes / produits réalisés"
            lines={accounting.actual.products}
            onChange={(lines) => updateAccountingSection("actual", "products", lines)}
          />
          <AccountingLinesEditor
            title="Dépenses / charges réalisées"
            lines={accounting.actual.expenses}
            onChange={(lines) => updateAccountingSection("actual", "expenses", lines)}
          />
          <AccountingLinesEditor
            title="Produits prévisionnels"
            lines={accounting.forecast.products}
            onChange={(lines) => updateAccountingSection("forecast", "products", lines)}
          />
          <AccountingLinesEditor
            title="Charges prévisionnelles"
            lines={accounting.forecast.expenses}
            onChange={(lines) => updateAccountingSection("forecast", "expenses", lines)}
          />
          <AccountingLinesEditor
            title="Contributions volontaires"
            lines={accounting.forecast.voluntary}
            onChange={(lines) => updateAccountingSection("forecast", "voluntary", lines)}
          />
          <AccountingLinesEditor
            title="Actif du bilan"
            lines={accounting.balance.assets}
            onChange={(lines) => updateAccountingSection("balance", "assets", lines)}
          />
          <AccountingLinesEditor
            title="Passif du bilan"
            lines={accounting.balance.liabilities}
            onChange={(lines) => updateAccountingSection("balance", "liabilities", lines)}
          />
        </div>

        <div className="accounting-forecast-result">
          <span>Prévisionnel : produits {currency(accountingForecastProducts)} · charges {currency(accountingForecastExpenses)}</span>
          <strong className={resultFrom(accounting.forecast) >= 0 ? "finance-paid" : "finance-due"}>
            Résultat {currency(resultFrom(accounting.forecast))}
          </strong>
        </div>

        <AccountingTextEditor accounting={accounting} setAccounting={setAccounting} />
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
