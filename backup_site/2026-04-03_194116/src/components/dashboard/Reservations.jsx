"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const statusVariant = {
  pending: "warning",
  confirmed: "success",
  cancelled: "error",
};

function normalizeStatus(value) {
  if (!value) return "pending";
  const v = String(value).toLowerCase();
  if (["confirmée", "confirmé", "confirmed"].includes(v)) return "confirmed";
  if (["annulée", "annulee", "cancelled"].includes(v)) return "cancelled";
  if (["en attente", "pending"].includes(v)) return "pending";
  return v;
}

export default function Reservations() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc")));
      setItems(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            nom: `${data?.legal?.firstName || ""} ${data?.legal?.lastName || ""}`.trim() || "-",
            email: data?.legal?.email || "-",
            sejour: data?.sejour?.name || "-",
            dateDemande: data?.createdAt ? new Date(data.createdAt).toLocaleDateString("fr-FR") : "-",
            statut: normalizeStatus(data?.status),
          };
        }),
      );
    } catch {
      showToast("Erreur de chargement des réservations", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((r) => {
      const q = search.trim().toLowerCase();
      const bySearch = !q || r.nom.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
      const byFilter = filter === "all" ? true : r.statut === filter;
      return bySearch && byFilter;
    });
  }, [items, filter, search]);

  const updateStatus = async (row, status) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, row.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, statut: status } : x)));
      showToast("Statut réservation mis à jour", "success");
    } catch {
      showToast("Erreur de mise à jour du statut", "error");
    }
  };

  const removeRow = async (row) => {
    if (!window.confirm(`Supprimer la réservation de ${row.nom} ?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.RESERVATIONS, row.id));
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      showToast("Réservation supprimée", "success");
    } catch {
      showToast("Erreur de suppression", "error");
    }
  };

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "email", label: "Email" },
    { key: "sejour", label: "Séjour" },
    { key: "dateDemande", label: "Date demande" },
    {
      key: "statut",
      label: "Statut",
      render: (row) => <Badge label={row.statut} variant={statusVariant[row.statut] || "neutral"} />,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="dash-actions-cell">
          <select
            className="dash-input"
            style={{ minHeight: 32 }}
            value={row.statut}
            onChange={(e) => updateStatus(row, e.target.value)}
          >
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <button type="button" className="dash-icon-btn" onClick={() => removeRow(row)} title="Supprimer">
            🗑
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Réservations (live)</h1>
          <p>Lecture et opérations CRUD sur la collection {COLLECTIONS.RESERVATIONS}.</p>
        </div>
        <button type="button" className="dash-btn" onClick={load}>
          Actualiser
        </button>
      </header>

      <div className="dash-toolbar">
        {["all", "pending", "confirmed", "cancelled"].map((label) => (
          <button
            key={label}
            type="button"
            className={`dash-filter-chip ${filter === label ? "is-active" : ""}`}
            onClick={() => setFilter(label)}
          >
            {label}
          </button>
        ))}
        <input className="dash-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche nom/email" />
      </div>

      {loading ? <p className="dash-muted">Chargement...</p> : <DataTable columns={columns} data={filtered} />}
    </div>
  );
}
