"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import Modal from "@/src/components/dashboard/ui/Modal";
import EmptyState from "@/src/components/dashboard/ui/EmptyState";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { MERCH_SHIPPING } from "@/src/lib/merchConfig";
import "@/src/styles/benevoles.css";

/* Commandes de tee-shirts payées sur /merch (écrites par le webhook Stripe). */

const ORDER_STATUSES = [
  { key: "to_ship", label: "À expédier", variant: "warning" },
  { key: "shipped", label: "Expédiée", variant: "success" },
  { key: "cancelled", label: "Annulée / remboursée", variant: "neutral" },
];

const orderStatus = (key) => ORDER_STATUSES.find((status) => status.key === key) || ORDER_STATUSES[0];
const euros = (value) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);

function fmtDate(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function addressLines(order) {
  const address = order.address || {};
  return [
    order.customer?.name,
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country && address.country !== "FR" ? address.country : "",
  ].filter(Boolean);
}

/** Days since payment, to keep the "sous 1 semaine" promise in sight. */
function daysSince(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isNaN(ms) ? 0 : Math.floor((Date.now() - ms) / 86400000);
}

function OrderDetail({ order }) {
  const { showToast } = useToast();
  const [tracking, setTracking] = useState(order.trackingNumber || "");
  const [saving, setSaving] = useState(false);
  const lines = addressLines(order);

  const save = async (patch, message) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.MERCH_ORDERS, order.id), { ...patch, updatedAt: serverTimestamp() });
      showToast(message, "success");
    } catch (error) {
      showToast(`Enregistrement impossible : ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Adresse copiée.", "success");
    } catch {
      showToast("Copie impossible.", "error");
    }
  };

  return (
    <div className="bv-detail">
      <dl className="bv-facts">
        <div><dt>Article</dt><dd>{order.productName} · taille {order.size} · × {order.quantity}</dd></div>
        <div><dt>Payé</dt><dd>{euros(order.totalAmount)} <span className="dash-muted">(dont {euros(order.shippingAmount)} de port)</span></dd></div>
        <div><dt>Commande du</dt><dd>{fmtDate(order.paidAt)}</dd></div>
      </dl>

      <div className="bv-block">
        <span className="bv-label">Adresse de livraison</span>
        <pre className="bv-address">{lines.join("\n") || "—"}</pre>
        <div className="bv-contact">
          <button type="button" className="dash-btn" onClick={copyAddress}>Copier l&apos;adresse</button>
          {order.customer?.email ? <a className="dash-btn" href={`mailto:${order.customer.email}`}>✉️ {order.customer.email}</a> : null}
          {order.customer?.phone ? <a className="dash-btn" href={`tel:${order.customer.phone}`}>📞 {order.customer.phone}</a> : null}
        </div>
      </div>

      <div className="bv-block">
        <span className="bv-label">Expédition</span>
        <input className="dash-input" value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Numéro de suivi (facultatif)" />
        <div className="bv-actions">
          {order.status !== "cancelled" ? (
            <button type="button" className="dash-btn" disabled={saving} onClick={() => save({ status: "cancelled" }, "Commande marquée annulée.")}>Annulée / remboursée</button>
          ) : null}
          {order.status === "shipped" ? (
            <button type="button" className="dash-btn" disabled={saving} onClick={() => save({ status: "to_ship", shippedAt: null }, "Commande remise à expédier.")}>Remettre à expédier</button>
          ) : null}
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            disabled={saving}
            onClick={() => save({ status: "shipped", trackingNumber: tracking.trim(), shippedAt: order.shippedAt || new Date().toISOString() }, "Commande expédiée.")}
          >
            {order.status === "shipped" ? "Mettre à jour le suivi" : "Marquer expédiée"}
          </button>
        </div>
      </div>
      <p className="dash-muted bv-footnote">Paiement Stripe : {order.stripePaymentIntent || order.stripeSessionId}</p>
    </div>
  );
}

export default function MerchOrders() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("to_ship");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.MERCH_ORDERS),
    (snapshot) => {
      setRows(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setLoadError("");
    },
    (error) => {
      setRows([]);
      setLoadError(error.message);
    },
  ), []);

  const all = rows || [];
  const stats = useMemo(() => {
    const paid = all.filter((order) => order.status !== "cancelled");
    return {
      toShip: all.filter((order) => order.status === "to_ship").length,
      late: all.filter((order) => order.status === "to_ship" && daysSince(order.paidAt) >= 5).length,
      shirts: paid.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0),
      revenue: paid.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0),
      byStatus: Object.fromEntries(ORDER_STATUSES.map((status) => [status.key, all.filter((order) => order.status === status.key).length])),
    };
  }, [all]);

  const visible = useMemo(() => all
    .filter((order) => statusFilter === "all" || order.status === statusFilter)
    .map((order) => ({
      ...order,
      paidMs: Date.parse(String(order.paidAt || "")) || 0,
      customerName: order.customer?.name || "",
      customerEmail: order.customer?.email || "",
      itemText: `${order.productName || ""} ${order.size || ""} × ${order.quantity || 1}`,
      cityText: [order.address?.postalCode, order.address?.city].filter(Boolean).join(" "),
    })), [all, statusFilter]);

  const selected = all.find((order) => order.id === selectedId) || null;

  const columns = [
    {
      key: "paidMs",
      label: "Commande",
      width: 130,
      render: (order) => {
        const days = daysSince(order.paidAt);
        return (
          <div className="bv-person">
            <strong>{fmtDate(order.paidAt)}</strong>
            {order.status === "to_ship" ? <span className={days >= 5 ? "bv-late" : ""}>il y a {days} j</span> : null}
          </div>
        );
      },
      sortValue: (order) => order.paidMs,
    },
    {
      key: "customerName",
      label: "Client",
      render: (order) => <div className="bv-person"><strong>{order.customerName}</strong><span>{order.customerEmail}</span></div>,
      sortValue: (order) => order.customerName,
    },
    { key: "itemText", label: "Article" },
    { key: "cityText", label: "Ville", width: 160 },
    { key: "totalAmount", label: "Payé", width: 100, render: (order) => euros(order.totalAmount), sortValue: (order) => order.totalAmount },
    {
      key: "status",
      label: "Statut",
      width: 150,
      render: (order) => {
        const status = orderStatus(order.status);
        return <Badge label={status.label} variant={status.variant} />;
      },
      sortValue: (order) => order.status,
    },
  ];

  return (
    <div className="dash-page bv-page">
      <div className="dash-page-header">
        <span className="dash-eyebrow">Boutique</span>
        <h1>Tee-shirts</h1>
        <p>
          Les commandes payées sur <a href="/merch" target="_blank" rel="noreferrer">la page tee-shirts</a>.
          Promesse aux clients : envoi {MERCH_SHIPPING.delay}. Les commandes en attente depuis 5 jours ou plus sont signalées en rouge.
        </p>
      </div>

      <section className="dash-metrics-grid">
        <article className="dash-card dash-card-pink">
          <div className="dash-card-icon dash-card-icon-pink">📦</div>
          <p>À expédier{stats.late ? ` · ${stats.late} en retard` : ""}</p>
          <strong>{rows ? stats.toShip : "…"}</strong>
        </article>
        <article className="dash-card dash-card-green">
          <div className="dash-card-icon dash-card-icon-green">✅</div>
          <p>Expédiées</p>
          <strong>{rows ? stats.byStatus.shipped : "…"}</strong>
        </article>
        <article className="dash-card dash-card-indigo">
          <div className="dash-card-icon dash-card-icon-indigo">👕</div>
          <p>Tee-shirts vendus</p>
          <strong>{rows ? stats.shirts : "…"}</strong>
        </article>
        <article className="dash-card dash-card-orange">
          <div className="dash-card-icon dash-card-icon-orange">💶</div>
          <p>Encaissé (port compris)</p>
          <strong>{rows ? euros(stats.revenue) : "…"}</strong>
        </article>
      </section>

      <section className="dash-card dash-section">
        <div className="bv-filters">
          <nav className="dash-subtabs" aria-label="Statut">
            {[...ORDER_STATUSES, { key: "all", label: "Toutes" }].map((status) => (
              <button key={status.key} type="button" className={`dash-subtab ${statusFilter === status.key ? "is-active" : ""}`} onClick={() => setStatusFilter(status.key)}>
                {status.label} <em>{status.key === "all" ? all.length : stats.byStatus[status.key] || 0}</em>
              </button>
            ))}
          </nav>
        </div>

        {loadError ? <p className="bv-error">Lecture impossible : {loadError}</p> : null}

        {rows === null ? (
          <p className="dash-muted">Chargement…</p>
        ) : all.length === 0 ? (
          <EmptyState title="Pas encore de commande" description="Chaque tee-shirt payé sur le site apparaîtra ici, avec l'adresse de livraison." />
        ) : (
          <DataTable
            columns={columns}
            data={visible}
            searchableKeys={["customerName", "customerEmail", "itemText", "cityText", "trackingNumber"]}
            defaultSortKey="paidMs"
            defaultSortDirection="desc"
            onRowClick={(order) => setSelectedId(order.id)}
            selectedRowId={selectedId}
            emptyLabel="Aucune commande avec ce statut."
            toolsInline
          />
        )}
      </section>

      <Modal isOpen={Boolean(selected)} onClose={() => setSelectedId("")} title={selected ? `Commande de ${selected.customer?.name || "client"}` : ""} size="md">
        {selected ? <OrderDetail key={selected.id} order={selected} /> : null}
      </Modal>
    </div>
  );
}
