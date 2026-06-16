"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const WEEK_ORDER = ["S1", "S2", "S3", "S4"];

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

function formatDate(value) {
  if (!value) return "Non renseignée";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function mapMember(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "Nom à compléter",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    email: data.email || "",
    phone: data.phone || "",
    active: data.active !== false,
  };
}

function mapContract(snapshot) {
  const data = snapshot.data() || {};
  const grossSalary = amount(data.grossSalary);
  const paidAmount = amount(data.paidAmount);
  const outstandingAmount = amount(data.outstandingAmount ?? grossSalary - paidAmount);
  return {
    id: snapshot.id,
    memberId: data.memberId || "",
    memberName: data.memberName || "Animateur non renseigné",
    stay: data.stayName || data.stayCode || "Non renseigné",
    stayCode: data.stayCode || "",
    week: data.week || "Non renseignée",
    role: data.role || "Poste non renseigné",
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    datesLabel: data.startDate && data.endDate
      ? `${formatDate(data.startDate)} – ${formatDate(data.endDate)}`
      : "Dates à compléter",
    netSalary: amount(data.netSalary),
    bonusAmount: amount(data.bonusAmount),
    grossSalary,
    paidAmount,
    outstandingAmount: Math.max(outstandingAmount, 0),
    status: grossSalary > 0 && paidAmount >= grossSalary ? "Payé" : "À régler",
    contractFileUrl: data.contractFileUrl || "",
  };
}

function summarize(contracts, key) {
  const groups = new Map();
  contracts.forEach((contract) => {
    const label = contract[key] || "Non renseigné";
    const current = groups.get(label) || {
      label,
      contracts: 0,
      memberIds: new Set(),
      grossSalary: 0,
      paidAmount: 0,
      outstandingAmount: 0,
    };
    current.contracts += 1;
    current.memberIds.add(contract.memberId || contract.memberName);
    current.grossSalary += contract.grossSalary;
    current.paidAmount += contract.paidAmount;
    current.outstandingAmount += contract.outstandingAmount;
    groups.set(label, current);
  });
  return [...groups.values()].map((group) => ({ ...group, people: group.memberIds.size }));
}

function Metric({ label, value, detail, tone = "primary", money = false }) {
  return (
    <article className={`hr-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{money ? currency(value) : value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SummaryTable({ title, label, rows }) {
  return (
    <section className="hr-summary">
      <header><h2>{title}</h2></header>
      <div className="hr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{label}</th>
              <th>Personnes</th>
              <th>Contrats</th>
              <th>Brut</th>
              <th>Réglé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td><strong>{row.label}</strong></td>
                <td>{row.people}</td>
                <td>{row.contracts}</td>
                <td>{currency(row.grossSalary)}</td>
                <td className="hr-paid">{currency(row.paidAmount)}</td>
                <td className={row.outstandingAmount ? "hr-due" : "hr-paid"}>{currency(row.outstandingAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeekStayMatrix({ contracts }) {
  const stays = [...new Set(contracts.map((item) => item.stay).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const weeks = [...new Set(contracts.map((item) => item.week).filter(Boolean))]
    .sort((a, b) => {
      const aIndex = WEEK_ORDER.indexOf(a);
      const bIndex = WEEK_ORDER.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      return a.localeCompare(b, "fr");
    });

  return (
    <section className="hr-summary hr-matrix">
      <header>
        <h2>Répartition semaine × séjour</h2>
        <span>Nombre de contrats</span>
      </header>
      <div className="hr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Semaine</th>
              {stays.map((stay) => <th key={stay}>{stay}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => {
              const counts = stays.map((stay) => contracts.filter((item) => item.week === week && item.stay === stay).length);
              return (
                <tr key={week}>
                  <td><strong>{week}</strong></td>
                  {counts.map((count, index) => <td key={stays[index]}>{count || "—"}</td>)}
                  <td><strong>{counts.reduce((total, count) => total + count, 0)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function HumanResources() {
  const [members, setMembers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("contracts");

  useEffect(() => {
    async function load() {
      try {
        const [membersSnapshot, contractsSnapshot] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        ]);
        setMembers(membersSnapshot.docs.map(mapMember).sort((a, b) => a.name.localeCompare(b.name, "fr")));
        setContracts(contractsSnapshot.docs.map(mapContract));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totals = useMemo(() => contracts.reduce((result, contract) => ({
    grossSalary: result.grossSalary + contract.grossSalary,
    paidAmount: result.paidAmount + contract.paidAmount,
    outstandingAmount: result.outstandingAmount + contract.outstandingAmount,
  }), { grossSalary: 0, paidAmount: 0, outstandingAmount: 0 }), [contracts]);

  const byWeek = useMemo(() => summarize(contracts, "week").sort((a, b) => {
    const aIndex = WEEK_ORDER.indexOf(a.label);
    const bIndex = WEEK_ORDER.indexOf(b.label);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  }), [contracts]);
  const byStay = useMemo(() => summarize(contracts, "stay").sort((a, b) => a.label.localeCompare(b.label, "fr")), [contracts]);
  const byRole = useMemo(() => summarize(contracts, "role").sort((a, b) => b.contracts - a.contracts || a.label.localeCompare(b.label, "fr")), [contracts]);

  const memberRows = useMemo(() => members.map((member) => {
    const memberContracts = contracts.filter((contract) => contract.memberId === member.id);
    return {
      ...member,
      weeks: [...new Set(memberContracts.map((contract) => contract.week))].sort().join(", ") || "Aucune",
      stays: [...new Set(memberContracts.map((contract) => contract.stay))].sort().join(", ") || "Aucun",
      roles: [...new Set(memberContracts.map((contract) => contract.role))].sort().join(", ") || "Non renseigné",
      contractCount: memberContracts.length,
    };
  }), [contracts, members]);

  const contractColumns = [
    { key: "memberName", label: "Animateur" },
    { key: "week", label: "Semaine", filterable: true, filterLabel: "Toutes les semaines" },
    { key: "stay", label: "Séjour", filterable: true, filterLabel: "Tous les séjours" },
    { key: "role", label: "Poste", filterable: true, filterLabel: "Tous les postes" },
    { key: "datesLabel", label: "Dates", sortValue: (row) => row.startDate },
    { key: "grossSalary", label: "Brut", render: (row) => currency(row.grossSalary), sortValue: (row) => row.grossSalary },
    { key: "paidAmount", label: "Réglé", render: (row) => <span className="hr-paid">{currency(row.paidAmount)}</span>, sortValue: (row) => row.paidAmount },
    { key: "outstandingAmount", label: "Reste", render: (row) => <span className={row.outstandingAmount ? "hr-due" : "hr-paid"}>{currency(row.outstandingAmount)}</span>, sortValue: (row) => row.outstandingAmount },
    { key: "status", label: "Paiement", filterable: true, filterLabel: "Tous les paiements", render: (row) => <Badge label={row.status} variant={row.status === "Payé" ? "success" : "warning"} />, sortValue: (row) => row.status },
  ];

  const memberColumns = [
    { key: "name", label: "Animateur" },
    { key: "contractCount", label: "Contrats", sortValue: (row) => row.contractCount },
    { key: "weeks", label: "Semaines", filterable: true, filterLabel: "Toutes les disponibilités" },
    { key: "stays", label: "Séjours" },
    { key: "roles", label: "Postes" },
    { key: "phone", label: "Téléphone", render: (row) => row.phone || <span className="hr-missing">À compléter</span>, sortValue: (row) => row.phone },
    { key: "email", label: "E-mail", render: (row) => row.email || <span className="hr-missing">À compléter</span>, sortValue: (row) => row.email },
  ];

  const exportCsv = () => {
    const headers = ["Animateur", "Semaine", "Séjour", "Poste", "Début", "Fin", "Brut", "Réglé", "Reste", "Statut"];
    const lines = contracts.map((contract) => [
      contract.memberName, contract.week, contract.stay, contract.role, contract.startDate, contract.endDate,
      contract.grossSalary, contract.paidAmount, contract.outstandingAmount, contract.status,
    ]);
    const csv = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `contrats-rh-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dash-page hr-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Ressources humaines</h1>
          <p>Contrats, affectations, postes et suivi des rémunérations par semaine et par séjour.</p>
        </div>
        <button type="button" className="dash-btn" onClick={exportCsv} disabled={!contracts.length}>
          Exporter les contrats
        </button>
      </header>

      <section className="hr-metrics">
        <Metric label="Animateurs" value={members.length} detail="Personnes enregistrées" tone="people" />
        <Metric label="Contrats" value={contracts.length} detail={`${byWeek.length} semaines couvertes`} tone="contracts" />
        <Metric label="Masse salariale brute" value={totals.grossSalary} detail="Total des contrats importés" tone="salary" money />
        <Metric label="Reste à régler" value={totals.outstandingAmount} detail={`${currency(totals.paidAmount)} déjà réglés`} tone={totals.outstandingAmount ? "due" : "paid"} money />
      </section>

      {loading ? (
        <section className="dash-section"><p className="dash-muted">Chargement des données RH...</p></section>
      ) : (
        <>
          <div className="hr-summary-grid">
            <SummaryTable title="Par semaine" label="Semaine" rows={byWeek} />
            <SummaryTable title="Par séjour" label="Séjour" rows={byStay} />
            <SummaryTable title="Par poste" label="Poste" rows={byRole} />
            <WeekStayMatrix contracts={contracts} />
          </div>

          <div className="hr-view-tabs" role="tablist" aria-label="Vues ressources humaines">
            <button type="button" className={view === "contracts" ? "is-active" : ""} onClick={() => setView("contracts")}>
              Contrats <span>{contracts.length}</span>
            </button>
            <button type="button" className={view === "members" ? "is-active" : ""} onClick={() => setView("members")}>
              Animateurs <span>{members.length}</span>
            </button>
          </div>

          {view === "contracts" ? (
            <DataTable
              columns={contractColumns}
              data={contracts}
              searchableKeys={["memberName", "week", "stay", "role"]}
              defaultSortKey="week"
              emptyLabel="Aucun contrat RH enregistré."
              toolsInline
            />
          ) : (
            <DataTable
              columns={memberColumns}
              data={memberRows}
              searchableKeys={["name", "weeks", "stays", "roles", "phone", "email"]}
              defaultSortKey="name"
              emptyLabel="Aucun animateur enregistré."
              toolsInline
            />
          )}
        </>
      )}
    </div>
  );
}
