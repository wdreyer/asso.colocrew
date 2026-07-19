"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const fmt = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

function fmtDate(iso) {
  if (!iso || iso === "Sans date") return "Sans date";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function segmentRouteLabel(segment) {
  return `${segment?.from || "Départ"} → ${segment?.to || "Arrivée"}`;
}

function transportRouteLabel(transport) {
  return `${transport?.departureCity || "Départ"} → ${transport?.arrivalCity || "Arrivée"}`;
}

function directionIcon(direction) {
  return direction === "retour" ? "↓" : "↑";
}

function normalizeStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isActiveTransport(transport) {
  const status = normalizeStatus(transport?.status);
  return status !== "annule" && status !== "archive" && status !== "archivee";
}

function ticketDraft(ticket) {
  return {
    name: ticket.name || "",
    segmentId: ticket.segmentId || "",
    seats: ticket.seats || 1,
    price: ticket.price ?? "",
    departureTime: ticket.departureTime || "",
    arrivalTime: ticket.arrivalTime || "",
    bookingReference: ticket.bookingReference || "",
    purchased: Boolean(ticket.purchased),
  };
}

function ticketRowsForTransport(transport) {
  const segments = Array.isArray(transport.segments) ? transport.segments : [];
  const tickets = Array.isArray(transport.tickets) ? transport.tickets : [];
  const segmentIds = new Set(segments.map((segment) => segment.id).filter(Boolean));
  const linkedTickets = tickets.filter((ticket) => ticket.segmentId && segmentIds.has(ticket.segmentId));
  const rows = linkedTickets.map((ticket) => ({
    type: "ticket",
    ticket,
    transport,
    seg: segments.find((segment) => segment.id === ticket.segmentId) || null,
  }));

  for (const segment of segments) {
    if (linkedTickets.some((ticket) => ticket.segmentId === segment.id)) continue;
    rows.push({
      type: "segment-missing-ticket",
      transport,
      seg: segment,
      ticket: {
        id: `segment-missing-${transport.id}-${segment.id}`,
        name: `Billet à acheter - ${segmentRouteLabel(segment)}`,
        segmentId: segment.id,
        seats: 1,
        price: "",
        departureTime: segment.departureTime || "",
        arrivalTime: segment.arrivalTime || "",
        bookingReference: "",
        purchased: false,
        url: "",
        virtual: true,
      },
    });
  }

  return rows;
}

export default function TousBilletsPage() {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | purchased | pending
  const [editingKey, setEditingKey] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

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
    for (const transport of transports.filter(isActiveTransport)) {
      out.push(...ticketRowsForTransport(transport));
    }
    return out.sort((a, b) => {
      const dateOrder = String(a.transport.date || "").localeCompare(String(b.transport.date || ""));
      if (dateOrder !== 0) return dateOrder;
      const routeOrder = transportRouteLabel(a.transport).localeCompare(transportRouteLabel(b.transport), "fr");
      if (routeOrder !== 0) return routeOrder;
      const aSegmentIndex = (a.transport.segments || []).findIndex((segment) => segment.id === a.ticket.segmentId);
      const bSegmentIndex = (b.transport.segments || []).findIndex((segment) => segment.id === b.ticket.segmentId);
      return aSegmentIndex - bSegmentIndex;
    });
  }, [transports]);

  const filtered = useMemo(() => {
    if (filter === "purchased") return rows.filter((r) => r.ticket.purchased);
    if (filter === "pending")   return rows.filter((r) => !r.ticket.purchased);
    return rows;
  }, [rows, filter]);

  const totalPaid    = rows.filter((r) => r.ticket.purchased).reduce((s, r) => s + Number(r.ticket.price || 0), 0);
  const totalPending = rows.filter((r) => !r.ticket.purchased).reduce((s, r) => s + Number(r.ticket.price || 0), 0);

  const startEdit = (transport, ticket) => {
    setEditingKey(`${transport.id}-${ticket.id}`);
    setDraft(ticketDraft(ticket));
  };

  const cancelEdit = () => {
    setEditingKey("");
    setDraft(null);
  };

  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const saveTicket = async (transport, ticket) => {
    if (!draft) return;
    if (!draft.segmentId) return;
    setSaving(true);
    try {
      const { virtual, ...ticketBase } = ticket;
      const updatedTicket = {
        ...ticketBase,
        ...draft,
        id: virtual ? crypto.randomUUID() : ticket.id,
        seats: Math.max(1, parseInt(draft.seats, 10) || 1),
        price: draft.price === "" ? "" : Number(String(draft.price).replace(",", ".")),
      };
      const nextTickets = virtual
        ? [...(transport.tickets || []), updatedTicket]
        : (transport.tickets || []).map((item) => item.id === ticket.id ? updatedTicket : item);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        tickets: nextTickets,
        updatedAt: serverTimestamp(),
      });
      setTransports((items) => items.map((item) =>
        item.id === transport.id ? { ...item, tickets: nextTickets } : item
      ));
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const deleteTicket = async (transport, ticket) => {
    if (ticket.virtual) return;
    if (!window.confirm(`Supprimer le billet "${ticket.name || "sans titre"}" ?`)) return;
    setSaving(true);
    try {
      const nextTickets = (transport.tickets || []).filter((item) => item.id !== ticket.id);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        tickets: nextTickets,
        updatedAt: serverTimestamp(),
      });
      setTransports((items) => items.map((item) =>
        item.id === transport.id ? { ...item, tickets: nextTickets } : item
      ));
      if (editingKey === `${transport.id}-${ticket.id}`) cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const days = new Map();
    for (const row of filtered) {
      const day = row.transport.date || "Sans date";
      if (!days.has(day)) days.set(day, new Map());
      const trips = days.get(day);
      if (!trips.has(row.transport.id)) trips.set(row.transport.id, { transport: row.transport, rows: [] });
      trips.get(row.transport.id).rows.push(row);
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [filtered]);

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

      {!loading && filtered.length > 0 && grouped.map(([day, trips]) => (
        <section key={day} className="tr-bil-week" style={{ marginTop: 18 }}>
          <div className="tr-bil-week-hd">
            <span>{fmtDate(day)}</span>
            <small>{[...trips.values()][0]?.transport.week || ""}</small>
          </div>
          {[...trips.values()]
            .sort((a, b) => transportRouteLabel(a.transport).localeCompare(transportRouteLabel(b.transport), "fr"))
            .map(({ transport, rows: tripRows }) => (
              <div key={transport.id} className="tr-bil-trip-group">
                <div className="tr-bil-trip-hd">
                  <span className={`tr-days-dir is-${transport.direction}`}>{directionIcon(transport.direction)}</span>
                  <span className="tr-bil-trip-route">{transportRouteLabel(transport)}</span>
                  <span className="tr-bil-trip-date">{transport.direction === "retour" ? "Retour" : "Aller"}</span>
                  <span className="tr-bil-trip-stat">{tripRows.filter((row) => row.ticket.purchased).length}/{tripRows.length} achetés</span>
                </div>
                <div className="bil-table-wrap">
                  <table className="bil-table">
                    <thead>
                      <tr>
                        <th>Statut</th>
                        <th>Nom / référence</th>
                        <th>Portion</th>
                        <th>Places</th>
                        <th>Prix</th>
                        <th>PDF / actions</th>
                      </tr>
                    </thead>
                    <tbody>
              {tripRows.map(({ ticket, seg }) => {
                const rowKey = `${transport.id}-${ticket.id}`;
                const editing = editingKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr key={rowKey} className={ticket.purchased ? "bil-row-ok" : "bil-row-warn"}>
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
                        {ticket.virtual && <span className="bil-ticket-ref">Créé depuis le segment</span>}
                      </td>
                      <td>
                        {seg
                          ? <span className="bil-seg-route">{segmentRouteLabel(seg)}</span>
                          : <span style={{ color: "#a32222", fontSize: 11 }}>Portion non définie</span>}
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
                        <div className="bil-actions">
                          {ticket.url ? (
                            <a href={ticket.url} target="_blank" rel="noreferrer" className="bil-pdf-btn">PDF</a>
                          ) : <span style={{ color: "var(--dash-muted)", fontSize: 12 }}>—</span>}
                          <button type="button" className="bil-edit-btn" onClick={() => editing ? cancelEdit() : startEdit(transport, ticket)}>
                            {editing ? "Fermer" : ticket.virtual ? "Créer" : "Modifier"}
                          </button>
                          {!ticket.virtual && (
                            <button type="button" className="bil-edit-btn is-danger" onClick={() => deleteTicket(transport, ticket)} disabled={saving}>
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editing && (
                      <tr key={`${rowKey}-edit`} className="bil-edit-row">
                        <td colSpan={6}>
                          <div className="bil-edit-grid">
                            <label className="bil-edit-span2">
                              <span>Nom / référence</span>
                              <input className="dash-input" value={draft?.name || ""} onChange={(event) => setField("name", event.target.value)} />
                            </label>
                            <label>
                              <span>Portion</span>
                              <select className="dash-input" value={draft?.segmentId || ""} onChange={(event) => setField("segmentId", event.target.value)}>
                                <option value="">Non définie</option>
                                {(transport.segments || []).map((segment) => (
                                  <option key={segment.id} value={segment.id}>{segmentRouteLabel(segment)}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Places</span>
                              <input className="dash-input" type="number" min="1" step="1" value={draft?.seats ?? 1} onChange={(event) => setField("seats", event.target.value)} />
                            </label>
                            <label>
                              <span>Prix (€)</span>
                              <input className="dash-input" type="number" min="0" step="0.01" value={draft?.price ?? ""} onChange={(event) => setField("price", event.target.value)} placeholder="0.00" />
                            </label>
                            <label>
                              <span>Départ</span>
                              <input className="dash-input" type="time" value={draft?.departureTime || ""} onChange={(event) => setField("departureTime", event.target.value)} />
                            </label>
                            <label>
                              <span>Arrivée</span>
                              <input className="dash-input" type="time" value={draft?.arrivalTime || ""} onChange={(event) => setField("arrivalTime", event.target.value)} />
                            </label>
                            <label className="bil-edit-span2">
                              <span>Référence achat / dossier</span>
                              <input className="dash-input" value={draft?.bookingReference || ""} onChange={(event) => setField("bookingReference", event.target.value)} />
                            </label>
                            <label className="bil-edit-check">
                              <input type="checkbox" checked={Boolean(draft?.purchased)} onChange={(event) => setField("purchased", event.target.checked)} />
                              <span>Billet acheté</span>
                            </label>
                            <div className="bil-edit-actions">
                              <button type="button" className="dash-btn" onClick={cancelEdit} disabled={saving}>Annuler</button>
                              <button type="button" className="dash-btn dash-btn-primary" onClick={() => saveTicket(transport, ticket)} disabled={saving}>
                                {saving ? "Enregistrement..." : ticket.virtual ? "Créer le billet" : "Enregistrer"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
