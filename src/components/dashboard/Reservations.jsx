"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const TABS = [
  { key: "pending", label: "En cours", color: "#f97316" },
  { key: "validated", label: "Validées", color: "#10b981" },
  { key: "deleted", label: "Passées", color: "#94a3b8" },
];

const STATUS_LABEL = { pending: "En cours", validated: "Validée", deleted: "Passée" };
const STATUS_BADGE = { pending: "warning", validated: "success", deleted: "neutral" };

function tsToMs(v) {
  if (v?.toMillis) return v.toMillis();
  if (typeof v === "number") return v;
  const p = Date.parse(String(v || ""));
  return Number.isNaN(p) ? 0 : p;
}

function toAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtCur(v) {
  const n = toAmount(v);
  if (n === null) return "—";
  return `${n.toLocaleString("fr-FR")} €`;
}

function normalizeStatus(v) {
  const s = String(v || "").toLowerCase().trim();
  if (["validated", "validee", "validée", "confirmed"].includes(s)) return "validated";
  if (["deleted", "supprimee", "supprimée", "cancelled", "archived", "passée", "passe"].includes(s)) return "deleted";
  return "pending";
}

function mapReservation(snap) {
  const d = snap.data() || {};
  const legal = d.legal || {};
  const child = d.child || d.participant || {};
  const sejour = d.sejour || {};
  const transport = d.transport || {};
  const pricing = d.pricing || {};

  return {
    id: snap.id,
    status: normalizeStatus(d.status),
    nom:
      `${legal.firstName || legal.prenom || ""} ${legal.lastName || legal.nom || ""}`.trim() ||
      d.name ||
      "—",
    email: legal.email || d.email || "—",
    phone: legal.phone || legal.telephone || d.phone || "—",
    childName: `${child.firstName || ""} ${child.lastName || ""}`.trim() || child.name || "—",
    childAge: child.age || child.birthdate || "",
    sejourName: sejour.name || d.sejourName || "—",
    sejourDate: sejour.date || d.sejourDate || "",
    departureCity: transport.departureCity || transport.stationName || transport.station || "",
    returnCity: transport.returnCity || "",
    transportFee: toAmount(transport.fee ?? d.transportFee ?? null),
    dateMs: tsToMs(d.createdAt),
    dateUpdatedMs: tsToMs(d.updatedAt),
    requestedPrice: toAmount(
      pricing.total ??
        pricing.requested ??
        pricing.estimatedPriceMax ??
        pricing.basePriceMax ??
        sejour.priceMax ??
        sejour.basePrice ??
        d.basePrice ??
        null,
    ),
    finalPrice: toAmount(d.finalPrice ?? pricing.validatedPrice ?? null),
    notes: d.notes || "",
    raw: d,
  };
}

function ReservationModal({ item, onClose, onSave, onDelete }) {
  const { showToast } = useToast();
  const overlayRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    status: item.status,
    nom: item.nom,
    email: item.email,
    phone: item.phone,
    childName: item.childName,
    childAge: item.childAge,
    sejourName: item.sejourName,
    sejourDate: item.sejourDate,
    departureCity: item.departureCity,
    returnCity: item.returnCity,
    transportFee: item.transportFee !== null ? String(item.transportFee) : "",
    finalPrice:
      item.finalPrice !== null
        ? String(item.finalPrice)
        : item.requestedPrice !== null
          ? String(item.requestedPrice)
          : "",
    notes: item.notes,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleOverlay = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const save = async () => {
    setSaving(true);
    try {
      const finalPriceNum = Number(String(form.finalPrice).replace(",", "."));
      const transportFeeNum = Number(String(form.transportFee).replace(",", "."));

      const payload = {
        status: form.status,
        finalPrice: Number.isFinite(finalPriceNum) ? finalPriceNum : null,
        notes: form.notes,
        "legal.firstName": form.nom.split(" ")[0] || form.nom,
        "legal.lastName": form.nom.split(" ").slice(1).join(" ") || "",
        "legal.email": form.email,
        "legal.phone": form.phone,
        "child.name": form.childName,
        "child.age": form.childAge,
        "sejour.name": form.sejourName,
        "sejour.date": form.sejourDate,
        "transport.departureCity": form.departureCity,
        "transport.returnCity": form.returnCity,
        "transport.fee": Number.isFinite(transportFeeNum) && form.transportFee !== "" ? transportFeeNum : null,
        updatedAt: serverTimestamp(),
        ...(form.status === "validated" ? { validatedAt: serverTimestamp() } : {}),
      };

      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), payload);
      onSave({
        ...item,
        ...form,
        finalPrice: Number.isFinite(finalPriceNum) ? finalPriceNum : item.finalPrice,
      });
      showToast("Réservation mise à jour", "success");
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm("Supprimer définitivement cette réservation ?");
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="res-modal-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="res-modal">
        <div className="res-modal-header">
          <div className="res-modal-header-left">
            <div className="res-modal-avatar">{(form.nom || "?")[0].toUpperCase()}</div>
            <div>
              <div className="res-modal-title">{form.nom || "Réservation"}</div>
              <div className="res-modal-sub">
                {form.sejourName} · reçue le {fmt(item.dateMs)}
              </div>
            </div>
          </div>
          <div className="res-modal-header-right">
            <select
              className="dash-input res-status-select"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {TABS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" className="res-modal-close" onClick={onClose} aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="res-modal-body">
          <div className="res-modal-section">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Responsable légal
            </div>
            <div className="res-form-grid">
              <label className="res-field">
                <span>Nom complet</span>
                <input className="dash-input" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
              </label>
              <label className="res-field">
                <span>Email</span>
                <input className="dash-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </label>
              <label className="res-field">
                <span>Téléphone</span>
                <input className="dash-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="res-modal-section">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Participant
            </div>
            <div className="res-form-grid">
              <label className="res-field">
                <span>Nom du jeune</span>
                <input className="dash-input" value={form.childName} onChange={(e) => set("childName", e.target.value)} />
              </label>
              <label className="res-field">
                <span>Âge / Date de naissance</span>
                <input className="dash-input" value={form.childAge} onChange={(e) => set("childAge", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="res-modal-section">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
              Séjour
            </div>
            <div className="res-form-grid">
              <label className="res-field">
                <span>Nom du séjour</span>
                <input className="dash-input" value={form.sejourName} onChange={(e) => set("sejourName", e.target.value)} />
              </label>
              <label className="res-field">
                <span>Date du séjour</span>
                <input className="dash-input" value={form.sejourDate} onChange={(e) => set("sejourDate", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="res-modal-section">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v4M10 14h4" />
              </svg>
              Transport
            </div>
            <div className="res-form-grid res-form-grid-3">
              <label className="res-field">
                <span>Ville aller</span>
                <input className="dash-input" value={form.departureCity} onChange={(e) => set("departureCity", e.target.value)} placeholder="ex : Paris" />
              </label>
              <label className="res-field">
                <span>Ville retour</span>
                <input className="dash-input" value={form.returnCity} onChange={(e) => set("returnCity", e.target.value)} placeholder="ex : Paris" />
              </label>
              <label className="res-field">
                <span>Frais transport (€)</span>
                <input className="dash-input" type="number" min="0" value={form.transportFee} onChange={(e) => set("transportFee", e.target.value)} placeholder="0" />
              </label>
            </div>
          </div>

          <div className="res-modal-section res-price-section">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Tarification
            </div>
            <div className="res-form-grid res-form-grid-2">
              <div className="res-field">
                <span>Prix demandé</span>
                <div className="dash-input res-price-readonly">{fmtCur(item.requestedPrice)}</div>
              </div>
              <label className="res-field res-field-accent">
                <span>Prix final validé (€)</span>
                <input className="dash-input" type="number" min="0" value={form.finalPrice} onChange={(e) => set("finalPrice", e.target.value)} placeholder="ex : 890" />
              </label>
            </div>
          </div>

          <div className="res-modal-section res-full-col">
            <div className="res-modal-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Notes internes
            </div>
            <textarea
              className="dash-input"
              rows={3}
              style={{ resize: "vertical", lineHeight: 1.5 }}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Notes visibles uniquement par l'équipe…"
            />
          </div>

          <div className="res-modal-section res-full-col">
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--dash-muted)", userSelect: "none" }}>
                Données brutes (JSON)
              </summary>
              <pre style={{ marginTop: 10, padding: 12, borderRadius: 8, background: "#f8f4fb", border: "1px solid rgba(120,90,160,0.12)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, lineHeight: 1.5, maxHeight: 250, overflowY: "auto" }}>
                {JSON.stringify(item.raw || {}, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        <div className="res-modal-footer">
          <button type="button" className="dash-btn dash-btn-danger" onClick={remove} disabled={saving || deleting}>
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
          <div className="dash-row-actions">
            <button type="button" className="dash-btn" onClick={onClose} disabled={saving || deleting}>
              Annuler
            </button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving || deleting}>
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Reservations() {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [modalItem, setModalItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc")));
      setItems(snap.docs.map(mapReservation));
    } catch {
      showToast("Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buckets = useMemo(
    () => ({
      pending: items.filter((x) => x.status === "pending"),
      validated: items.filter((x) => x.status === "validated"),
      deleted: items.filter((x) => x.status === "deleted"),
    }),
    [items],
  );

  const currentList = buckets[activeTab] || [];

  const handleSave = (updated) => {
    setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  };

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.RESERVATIONS, id));
      setItems((prev) => prev.filter((x) => x.id !== id));
      setModalItem((prev) => (prev?.id === id ? null : prev));
      showToast("Réservation supprimée", "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de supprimer la réservation", "error");
      throw error;
    }
  }, [showToast]);

  const columns = useMemo(
    () => [
      {
        key: "nom",
        label: "Nom",
        sortValue: (row) => `${row.nom || ""} ${row.childName || ""}`.trim(),
        render: (row) => (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{row.nom}</div>
            {row.childName && row.childName !== "—" && row.childName !== row.nom && (
              <div style={{ fontSize: 11, color: "var(--dash-muted)", marginTop: 1 }}>{row.childName}</div>
            )}
          </div>
        ),
      },
      {
        key: "email",
        label: "Contact",
        sortValue: (row) => `${row.email || ""} ${row.phone || ""}`.trim(),
        render: (row) => (
          <div>
            <div style={{ fontSize: 12 }}>{row.email}</div>
            {row.phone && row.phone !== "—" && <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>{row.phone}</div>}
          </div>
        ),
      },
      { key: "sejourName", label: "Séjour", filterable: true, filterLabel: "Tous les séjours" },
      {
        key: "departureCity",
        label: "Transport",
        sortValue: (row) => `${row.departureCity || ""} ${row.returnCity || ""}`.trim(),
        render: (row) =>
          row.departureCity ? (
            <div style={{ fontSize: 12 }}>
              <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 5, padding: "1px 7px", fontWeight: 600, marginRight: 4 }}>
                ↑ {row.departureCity}
              </span>
              {row.returnCity && (
                <span style={{ background: "#fff7f0", color: "#c2410c", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>
                  ↓ {row.returnCity}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: "var(--dash-muted)", fontSize: 12 }}>Sur place</span>
          ),
      },
      {
        key: "finalPrice",
        label: "Prix",
        sortValue: (row) => row.finalPrice ?? row.requestedPrice ?? -1,
        render: (row) => (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtCur(row.finalPrice ?? row.requestedPrice)}</div>
            {row.finalPrice !== null && row.requestedPrice !== null && row.finalPrice !== row.requestedPrice && (
              <div style={{ fontSize: 11, color: "var(--dash-muted)", textDecoration: "line-through" }}>{fmtCur(row.requestedPrice)}</div>
            )}
          </div>
        ),
      },
      {
        key: "dateMs",
        label: "Date",
        sortValue: (row) => row.dateMs || 0,
        render: (row) => <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>{fmt(row.dateMs)}</span>,
      },
      {
        key: "status",
        label: "Statut",
        sortable: false,
        render: (row) => <Badge label={STATUS_LABEL[row.status] || row.status} variant={STATUS_BADGE[row.status] || "neutral"} />,
      },
      {
        key: "actions",
        label: "",
        sortable: false,
        render: (row) => (
          <div className="dash-row-actions">
            <button
              type="button"
              className="res-open-btn"
              onClick={(e) => {
                e.stopPropagation();
                setModalItem(row);
              }}
            >
              Voir
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                const ok = window.confirm("Supprimer définitivement cette réservation ?");
                if (!ok) return;
                handleDelete(row.id).catch(() => {});
              }}
            >
              Supprimer
            </button>
          </div>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Réservations</h1>
          <p>Gestion des inscriptions, tarifs et statuts.</p>
        </div>
        <button type="button" className="dash-btn" onClick={load}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.5 15A9 9 0 1 1 21 9" />
          </svg>
          Actualiser
        </button>
      </header>

      <div className="res-tabs">
        {TABS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            className={`res-tab ${activeTab === key ? "is-active" : ""}`}
            style={{ "--tab-color": color }}
            onClick={() => setActiveTab(key)}
          >
            <span className="res-tab-dot" />
            {label}
            <span className="res-tab-count">{buckets[key].length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="dash-section" style={{ padding: 24 }}>
          <p className="dash-muted">Chargement…</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={currentList}
          searchableKeys={["nom", "email", "childName", "sejourName", "departureCity", "returnCity"]}
          defaultSortKey="dateMs"
          defaultSortDirection="desc"
          onRowClick={(row) => setModalItem(row)}
          emptyLabel="Aucune réservation dans cet onglet."
          toolsInline
        />
      )}

      {modalItem && (
        <ReservationModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
