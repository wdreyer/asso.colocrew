"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const fmt = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

export default function TousBilletsPage() {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | purchased | pending

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "desc")));
        setTransports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    const out = [];
    for (const transport of transports) {
      const segments = Array.isArray(transport.segments) ? transport.segments : [];
      const tickets = Array.isArray(transport.tickets) ? transport.tickets : [];
      for (const ticket of tickets) {
        const seg = segments.find((s) => s.id === ticket.segmentId);
        out.push({ ticket, transport, seg });
      }
    }
    return out;
  }, [transports]);

  const filtered = useMemo(() => {
    if (filter === "purchased") return rows.filter((r) => r.ticket.purchased);
    if (filter === "pending")   return rows.filter((r) => !r.ticket.purchased);
    return rows;
  }, [rows, filter]);

  const totalPaid    = rows.filter((r) => r.ticket.purchased).reduce((s, r) => s + Number(r.ticket.price || 0), 0);
  const totalPending = rows.filter((r) => !r.ticket.purchased).reduce((s, r) => s + Number(r.ticket.price || 0), 0);

  return (
    <div className="res-page">
      <div className="res-page-header">
        <h1 className="res-page-title">Tous les billets</h1>
        <Link href="/dashboard/transport" className="dash-btn" style={{ fontSize: 12 }}>
          ← Transport
        </Link>
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="bil-chip bil-chip-total">
          <span className="bil-chip-label">Total billets</span>
          <span className="bil-chip-val">{rows.length}</span>
        </div>
        <div className="bil-chip bil-chip-ok">
          <span className="bil-chip-label">Achetés</span>
          <span className="bil-chip-val">{rows.filter((r) => r.ticket.purchased).length} · {fmt(totalPaid)}</span>
        </div>
        <div className="bil-chip bil-chip-warn">
          <span className="bil-chip-label">À acheter</span>
          <span className="bil-chip-val">{rows.filter((r) => !r.ticket.purchased).length} · {fmt(totalPending)}</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bil-filter-bar">
        {[["all", "Tous"], ["purchased", "Achetés"], ["pending", "À acheter"]].map(([val, label]) => (
          <button
            key={val}
            type="button"
            className={`bil-filter-btn${filter === val ? " is-active" : ""}`}
            onClick={() => setFilter(val)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "var(--dash-muted)", fontSize: 13, padding: "24px 0" }}>Chargement…</p>}

      {!loading && filtered.length === 0 && (
        <p style={{ color: "var(--dash-muted)", fontSize: 13, padding: "24px 0" }}>Aucun billet trouvé.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bil-table-wrap">
          <table className="bil-table">
            <thead>
              <tr>
                <th>Statut</th>
                <th>Nom / référence</th>
                <th>Portion</th>
                <th>Transport</th>
                <th>Places</th>
                <th>Prix</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ ticket, transport, seg }) => (
                <tr key={`${transport.id}-${ticket.id}`} className={ticket.purchased ? "bil-row-ok" : "bil-row-warn"}>
                  <td>
                    <span className={`bil-status-badge ${ticket.purchased ? "is-bought" : "is-missing"}`}>
                      {ticket.purchased ? "Acheté" : "À acheter"}
                    </span>
                  </td>
                  <td>
                    <span className="bil-ticket-name">{ticket.name || <em style={{ color: "var(--dash-muted)" }}>Sans titre</em>}</span>
                    {ticket.bookingReference && (
                      <span className="bil-ticket-ref">{ticket.bookingReference}</span>
                    )}
                  </td>
                  <td>
                    {seg
                      ? <span className="bil-seg-route">{seg.from} → {seg.to}</span>
                      : <span style={{ color: "#a32222", fontSize: 11 }}>Portion non définie</span>}
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/transport/${transport.date || ""}`}
                      className="bil-transport-link"
                    >
                      <span className="bil-transport-name">
                        {transport.sejourName || "Transport"} — {transport.direction === "retour" ? "Retour" : "Aller"}
                      </span>
                      {transport.date && <span className="bil-transport-date">{transport.date}</span>}
                    </Link>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {ticket.seats > 0 ? (
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{ticket.seats}</span>
                    ) : "—"}
                  </td>
                  <td style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                    {ticket.price ? fmt(ticket.price) : "—"}
                  </td>
                  <td>
                    {ticket.url ? (
                      <a href={ticket.url} target="_blank" rel="noreferrer" className="bil-pdf-btn">PDF</a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
