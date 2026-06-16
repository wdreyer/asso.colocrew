"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

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
    reference: data.numeroDeReservation || snapshot.id,
    responsible: `${legal.firstName || ""} ${legal.lastName || ""}`.trim() || "Non renseigné",
    children: children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean).join(", "),
    childCount,
    stay: STAY_LABELS[canonicalStayName(data.sejour?.name)] || canonicalStayName(data.sejour?.name) || "Non renseigné",
    week: WEEK_LABELS[startDate] || startDate || "Non renseignée",
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

export default function Finances() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [snapshot, summarySnapshot] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
          getDoc(doc(db, COLLECTIONS.FINANCE_SUMMARIES, "ete-2026")),
        ]);
        setRows(snapshot.docs.map(mapFinance).filter((row) => row.hasFinance));
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

      <div className="finance-summary-grid">
        <SummaryTable title="Totaux par séjour" firstColumn="Séjour" rows={staySummaries} />
        <SummaryTable title="Totaux par semaine" firstColumn="Semaine" rows={weekSummaries} />
      </div>

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
