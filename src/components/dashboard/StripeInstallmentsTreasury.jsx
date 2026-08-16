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
  if (row.completed) return <span className="subs-pill subs-pill-done">Termine</span>;
  if (row.cancelAtPeriodEnd) return <span className="subs-pill subs-pill-warn">Annulation prevue</span>;
  return <span className="subs-pill subs-pill-active">Actif</span>;
}

function WeekBars({ weeks }) {
  const max = Math.max(...weeks.map((week) => week.amount), 1);
  return (
    <section className="subs-panel subs-panel-wide">
      <div className="subs-panel-head">
        <div>
          <h2>Arrivees semaine par semaine</h2>
          <p>Projection des prochaines factures Stripe restantes.</p>
        </div>
      </div>
      {weeks.length ? (
        <div className="subs-week-list">
          {weeks.map((week) => (
            <div className="subs-week-row" key={week.weekStart}>
              <div className="subs-week-meta">
                <strong>{week.label}</strong>
                <span>{week.invoices} echeance(s) - {week.subscriptions} abonnement(s)</span>
              </div>
              <div className="subs-week-track" aria-hidden="true">
                <span style={{ width: `${Math.max((week.amount / max) * 100, 5)}%` }} />
              </div>
              <strong className="subs-week-amount">{money(week.amount)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-muted">Aucune entree a venir sur les abonnements en plusieurs fois.</p>
      )}
    </section>
  );
}

function SubscriptionCard({ row }) {
  const progress = row.installments ? Math.min((row.paidInvoices / row.installments) * 100, 100) : 0;
  return (
    <article className="subs-card">
      <div className="subs-card-top">
        <div>
          <h3>{row.customerName}</h3>
          <p>{row.customerEmail || row.customerId}</p>
        </div>
        <StatusPill row={row} />
      </div>
      <div className="subs-card-product">{row.product}</div>
      <div className="subs-progress">
        <div className="subs-progress-head">
          <span>{row.paidInvoices}/{row.installments} paiements encaisses</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="subs-progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="subs-card-grid">
        <div><span>Reste a venir</span><strong>{money(row.expectedAmount)}</strong></div>
        <div><span>Montant echeance</span><strong>{money(row.invoiceAmount)}</strong></div>
        <div><span>Prochaine date</span><strong>{dateLabel(row.nextInvoices?.[0]?.date)}</strong></div>
        <div><span>Annulation</span><strong>{row.completed ? dateLabel(row.cancelAt || row.currentPeriodEnd) : "Apres la derniere echeance"}</strong></div>
      </div>
      {row.nextInvoices?.length > 0 && (
        <div className="subs-next-list">
          {row.nextInvoices.map((invoice) => (
            <span key={`${row.id}-${invoice.installmentNumber}`}>
              #{invoice.installmentNumber} - {invoice.label} - {money(invoice.amount)}
            </span>
          ))}
        </div>
      )}
    </article>
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
  const totals = data?.totals || {};

  return (
    <div className="dash-page subs-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Tresorerie abonnements</h1>
          <p>Projection des paiements Stripe en plusieurs fois et des annulations automatiques.</p>
        </div>
        <button type="button" className="dash-btn" onClick={load} disabled={loading}>
          Actualiser
        </button>
      </header>

      {error && <section className="dash-section"><p className="finance-due">{error}</p></section>}

      <section className="subs-metrics">
        <Metric label="A venir" value={money(totals.expectedAmount)} detail="Total restant avant annulation" tone="primary" />
        <Metric label="30 prochains jours" value={money(nextThirtyDays)} detail="Tresorerie proche" tone="success" />
        <Metric label="Abonnements actifs" value={totals.activeSubscriptions || 0} detail={`${totals.completedSubscriptions || 0} deja termine(s)`} tone="info" />
        <Metric label="Echeances restantes" value={totals.remainingInvoices || 0} detail={`${money(totals.monthlyRunRate)} par cycle actuellement`} tone="warning" />
      </section>

      {loading ? (
        <section className="dash-section"><p className="dash-muted">Chargement des abonnements Stripe...</p></section>
      ) : (
        <>
          <WeekBars weeks={weekly} />
          <section className="subs-layout">
            <div className="subs-panel">
              <div className="subs-panel-head">
                <div>
                  <h2>Abonnements en cours</h2>
                  <p>{subscriptions.length} abonnement(s) en plusieurs fois.</p>
                </div>
              </div>
              <div className="subs-card-list">
                {subscriptions.map((row) => <SubscriptionCard key={row.id} row={row} />)}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
