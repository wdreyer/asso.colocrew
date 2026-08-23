"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

function money(cents) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);
}

function dateLabel(value) {
  if (!value) return "Aucune";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function Metric({ label, value, detail, tone = "neutral" }) {
  return (
    <article className={`subs-metric subs-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusPill({ row }) {
  if (row.completed) return <span className="subs-pill subs-pill-done">Terminé</span>;
  if (row.cancelAtPeriodEnd) return <span className="subs-pill subs-pill-warn">Annulation prévue</span>;
  return <span className="subs-pill subs-pill-active">Actif</span>;
}

function WeekBars({ weeks }) {
  const max = Math.max(...weeks.map((week) => week.amount), 1);
  return (
    <section className="subs-panel subs-panel-wide">
      <div className="subs-panel-head">
        <div>
          <h2>Arrivées semaine par semaine</h2>
          <p>Projection des prochaines factures Stripe restantes.</p>
        </div>
      </div>
      {weeks.length ? (
        <div className="subs-week-list">
          {weeks.map((week) => (
            <div className="subs-week-row" key={week.weekStart}>
              <div className="subs-week-meta">
                <strong>{week.label}</strong>
                <span>{week.invoices} échéance(s) - {week.subscriptions} abonnement(s)</span>
              </div>
              <div className="subs-week-track" aria-hidden="true">
                <span style={{ width: `${Math.max((week.amount / max) * 100, 5)}%` }} />
              </div>
              <strong className="subs-week-amount">{money(week.amount)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-muted">Aucune entrée à venir sur les abonnements en plusieurs fois.</p>
      )}
    </section>
  );
}

function dateList(row) {
  const invoices = row.nextInvoices || [];
  if (!invoices.length) return row.completed ? "Terminé" : "Aucune date";
  return invoices.map((invoice) => invoice.label || dateLabel(invoice.date)).join(" · ");
}

function UpcomingPaymentsTable({ invoices }) {
  return (
    <section className="subs-panel subs-panel-wide">
      <div className="subs-panel-head">
        <div>
          <h2>Prochains paiements exacts</h2>
          <p>{invoices.length} échéance(s) restante(s), triées par date de prélèvement Stripe.</p>
        </div>
      </div>
      <div className="subs-table-wrap">
        <table className="subs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Produit</th>
              <th>Échéance</th>
              <th>Montant</th>
              <th>Restera après</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? invoices.map((invoice) => (
              <tr key={`${invoice.subscriptionId}-${invoice.installmentNumber}-${invoice.date}`}>
                <td><strong>{invoice.label || dateLabel(invoice.date)}</strong></td>
                <td>
                  <span className="subs-client-name">{invoice.customerName}</span>
                  <small>{invoice.customerEmail || invoice.customerId}</small>
                </td>
                <td>{invoice.product}</td>
                <td>{invoice.installmentNumber}/{invoice.installments}</td>
                <td><strong>{money(invoice.amount)}</strong></td>
                <td>{Math.max((invoice.installments || 0) - (invoice.installmentNumber || 0), 0)} paiement(s)</td>
              </tr>
            )) : (
              <tr><td colSpan={6}>Aucune échéance à venir.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubscriptionsTable({ rows }) {
  return (
    <section className="subs-panel">
      <div className="subs-panel-head">
        <div>
          <h2>Clients en abonnement</h2>
          <p>{rows.length} abonnement(s) en plusieurs fois, une ligne par client.</p>
        </div>
      </div>
      <div className="subs-table-wrap">
        <table className="subs-table subs-client-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Produit</th>
              <th>Statut</th>
              <th>Avancement</th>
              <th>Prochain paiement</th>
              <th>Montant</th>
              <th>Reste à encaisser</th>
              <th>Toutes les dates restantes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="subs-client-name">{row.customerName}</span>
                  <small>{row.customerEmail || row.customerId}</small>
                </td>
                <td>{row.product}</td>
                <td><StatusPill row={row} /></td>
                <td>{row.paidInvoices}/{row.installments} payé(s)</td>
                <td><strong>{dateLabel(row.nextInvoices?.[0]?.date)}</strong></td>
                <td>{row.remainingInvoices > 0 ? money(row.invoiceAmount) : "0 €"}</td>
                <td><strong>{money(row.expectedAmount)}</strong></td>
                <td className="subs-date-list">{dateList(row)}</td>
              </tr>
            )) : (
              <tr><td colSpan={8}>Aucun abonnement en plusieurs fois.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StripeInstallmentsTreasury() {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch("/api/stripe-installments-treasury", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const raw = await response.text();
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (_error) {
        throw new Error(raw?.slice(0, 180) || "Reponse serveur illisible.");
      }
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      setData(payload);
    } catch (err) {
      setError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser) load();
  }, [currentUser]);

  const nextThirtyDays = useMemo(() => {
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 30);
    return (data?.weekly || []).reduce((total, week) => {
      const date = new Date(`${week.weekStart}T00:00:00`);
      return date <= limit ? total + week.amount : total;
    }, 0);
  }, [data?.weekly]);

  const subscriptions = data?.subscriptions || [];
  const weekly = data?.weekly || [];
  const upcomingInvoices = data?.upcomingInvoices || [];
  const totals = data?.totals || {};

  return (
    <div className="dash-page subs-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Trésorerie abonnements</h1>
          <p>Dates exactes des prochaines échéances Stripe et projection de trésorerie.</p>
        </div>
        <button type="button" className="dash-btn" onClick={load} disabled={loading}>
          Actualiser
        </button>
      </header>

      {error && <section className="dash-section"><p className="finance-due">{error}</p></section>}

      <section className="subs-metrics">
        <Metric label="À venir" value={money(totals.expectedAmount)} detail="Total restant avant annulation" tone="primary" />
        <Metric label="30 prochains jours" value={money(nextThirtyDays)} detail="Trésorerie proche" tone="success" />
        <Metric label="Abonnements actifs" value={totals.activeSubscriptions || 0} detail={`${totals.completedSubscriptions || 0} déjà terminé(s)`} tone="info" />
        <Metric label="Échéances restantes" value={totals.remainingInvoices || 0} detail={`${money(totals.monthlyRunRate)} par cycle actuellement`} tone="warning" />
      </section>

      {loading ? (
        <section className="dash-section"><p className="dash-muted">Chargement des abonnements Stripe...</p></section>
      ) : (
        <>
          <UpcomingPaymentsTable invoices={upcomingInvoices} />
          <WeekBars weeks={weekly} />
          <SubscriptionsTable rows={subscriptions} />
        </>
      )}
    </div>
  );
}
