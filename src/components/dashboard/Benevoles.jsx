"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import Modal from "@/src/components/dashboard/ui/Modal";
import EmptyState from "@/src/components/dashboard/ui/EmptyState";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  VOLUNTEER_INTERESTS,
  VOLUNTEER_STATUSES,
  availabilityLabel,
  interestLabel,
  interestShort,
  volunteerStatus,
} from "@/src/lib/volunteers";
import "@/src/styles/benevoles.css";

/* Bénévoles : réponses au formulaire de /edito-2026. */

function toMs(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows) {
  const header = ["Date", "Prénom", "Nom", "Téléphone", "Email", "Missions", "Disponibilité", "Statut", "Message", "Notes"];
  const lines = rows.map((row) => [
    fmtDate(row.createdMs), row.firstName, row.lastName, row.phone, row.email,
    (row.interests || []).map(interestLabel).join(", "), availabilityLabel(row.availability),
    volunteerStatus(row.status).label, row.message, row.notes,
  ].map(csvCell).join(";"));
  const blob = new Blob([`﻿${[header.join(";"), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `benevoles-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function VolunteerDetail({ volunteer, onClose }) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState(volunteer.notes || "");
  const [saving, setSaving] = useState(false);

  const save = async (patch, message) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.VOLUNTEERS, volunteer.id), { ...patch, updatedAt: serverTimestamp() });
      if (message) showToast(message, "success");
    } catch (error) {
      showToast(`Enregistrement impossible : ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement la fiche de ${volunteer.firstName} ${volunteer.lastName} ?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.VOLUNTEERS, volunteer.id));
      showToast("Fiche supprimée.", "success");
      onClose();
    } catch (error) {
      showToast(`Suppression impossible : ${error.message}`, "error");
    }
  };

  return (
    <div className="bv-detail">
      <div className="bv-contact">
        <a href={`tel:${volunteer.phone.replace(/\s/g, "")}`} className="dash-btn">📞 {volunteer.phone}</a>
        <a href={`mailto:${volunteer.email}`} className="dash-btn">✉️ {volunteer.email}</a>
      </div>

      <dl className="bv-facts">
        <div>
          <dt>Missions</dt>
          <dd className="bv-tags">{(volunteer.interests || []).map((key) => <span key={key} className="bv-tag">{interestLabel(key)}</span>)}</dd>
        </div>
        <div>
          <dt>Disponibilité</dt>
          <dd>{availabilityLabel(volunteer.availability) || "—"}</dd>
        </div>
        <div>
          <dt>Reçu le</dt>
          <dd>{fmtDate(volunteer.createdMs) || "—"}</dd>
        </div>
      </dl>

      {volunteer.message ? <blockquote className="bv-message">{volunteer.message}</blockquote> : null}

      <div className="bv-block">
        <span className="bv-label">Statut</span>
        <div className="dash-subtabs">
          {VOLUNTEER_STATUSES.map((status) => (
            <button
              key={status.key}
              type="button"
              disabled={saving}
              className={`dash-subtab ${volunteer.status === status.key ? "is-active" : ""}`}
              onClick={() => save({ status: status.key }, `Statut : ${status.label}`)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bv-block">
        <span className="bv-label">Notes internes</span>
        <textarea className="dash-input bv-notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Appel du…, intéressé·e par…, à rappeler…" />
        <div className="bv-actions">
          <button type="button" className="dash-btn dash-btn-danger" onClick={remove}>Supprimer</button>
          <button type="button" className="dash-btn dash-btn-primary" disabled={saving || notes === (volunteer.notes || "")} onClick={() => save({ notes }, "Notes enregistrées.")}>
            Enregistrer les notes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Benevoles() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [interestFilter, setInterestFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.VOLUNTEERS),
    (snapshot) => {
      setRows(snapshot.docs.map((entry) => {
        const data = entry.data();
        return { id: entry.id, ...data, status: data.status || "new", createdMs: toMs(data.createdAt) };
      }));
      setLoadError("");
    },
    (error) => {
      setRows([]);
      setLoadError(error.message);
    },
  ), []);

  const all = rows || [];
  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(VOLUNTEER_STATUSES.map((status) => [status.key, 0]));
    all.forEach((row) => { byStatus[row.status] = (byStatus[row.status] || 0) + 1; });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return {
      byStatus,
      total: all.length - byStatus.archived,
      thisMonth: all.filter((row) => row.createdMs >= monthStart.getTime()).length,
      byInterest: Object.fromEntries(VOLUNTEER_INTERESTS.map((interest) => [
        interest.key,
        all.filter((row) => row.status !== "archived" && row.interests?.includes(interest.key)).length,
      ])),
    };
  }, [all]);

  const visible = useMemo(() => all
    .filter((row) => (statusFilter === "all" ? true : statusFilter === "open" ? row.status !== "archived" : row.status === statusFilter))
    .filter((row) => interestFilter === "all" || row.interests?.includes(interestFilter))
    .map((row) => ({
      ...row,
      fullName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
      missionsText: (row.interests || []).map(interestLabel).join(", "),
      availabilityText: availabilityLabel(row.availability),
    })), [all, statusFilter, interestFilter]);

  const selected = all.find((row) => row.id === selectedId) || null;

  const columns = [
    { key: "createdMs", label: "Reçu", width: 110, render: (row) => fmtDate(row.createdMs), sortValue: (row) => row.createdMs },
    {
      key: "fullName",
      label: "Personne",
      render: (row) => (
        <div className="bv-person">
          <strong>{row.fullName}</strong>
          <span>{row.email}</span>
        </div>
      ),
      sortValue: (row) => row.fullName,
    },
    { key: "phone", label: "Téléphone", width: 140 },
    {
      key: "missionsText",
      label: "Missions",
      render: (row) => <div className="bv-tags">{(row.interests || []).map((key) => <span key={key} className="bv-tag">{interestShort(key)}</span>)}</div>,
      sortValue: (row) => row.missionsText,
    },
    { key: "availabilityText", label: "Disponibilité", width: 190 },
    {
      key: "status",
      label: "Statut",
      width: 130,
      render: (row) => {
        const status = volunteerStatus(row.status);
        return <Badge label={status.label} variant={status.variant} />;
      },
      sortValue: (row) => VOLUNTEER_STATUSES.findIndex((status) => status.key === row.status),
    },
  ];

  const statusTabs = [
    { key: "open", label: "En cours", count: counts.total },
    ...VOLUNTEER_STATUSES.map((status) => ({ key: status.key, label: status.label, count: counts.byStatus[status.key] || 0 })),
    { key: "all", label: "Tout", count: all.length },
  ];

  return (
    <div className="dash-page bv-page">
      <div className="dash-page-header bv-header">
        <div>
          <span className="dash-eyebrow">Association</span>
          <h1>Bénévoles</h1>
          <p>Les personnes qui proposent leur aide depuis la page <a href="/edito-2026" target="_blank" rel="noreferrer">Édito 2026</a>. Une notification arrive aussi sur contact@colocrew.com à chaque nouvelle réponse.</p>
        </div>
        <button type="button" className="dash-btn" onClick={() => downloadCsv(visible)} disabled={!visible.length}>Exporter (CSV)</button>
      </div>

      <section className="dash-metrics-grid">
        <article className="dash-card dash-card-pink">
          <div className="dash-card-icon dash-card-icon-pink">🙋</div>
          <p>À recontacter</p>
          <strong>{rows ? counts.byStatus.new : "…"}</strong>
        </article>
        <article className="dash-card dash-card-indigo">
          <div className="dash-card-icon dash-card-icon-indigo">💬</div>
          <p>Contacté·es</p>
          <strong>{rows ? counts.byStatus.contacted : "…"}</strong>
        </article>
        <article className="dash-card dash-card-green">
          <div className="dash-card-icon dash-card-icon-green">🤝</div>
          <p>Dans l&apos;équipe</p>
          <strong>{rows ? counts.byStatus.active : "…"}</strong>
        </article>
        <article className="dash-card dash-card-orange">
          <div className="dash-card-icon dash-card-icon-orange">📅</div>
          <p>Reçus ce mois-ci</p>
          <strong>{rows ? counts.thisMonth : "…"}</strong>
        </article>
      </section>

      <section className="dash-card dash-section">
        <div className="bv-filters">
          <nav className="dash-subtabs" aria-label="Statut">
            {statusTabs.map((tab) => (
              <button key={tab.key} type="button" className={`dash-subtab ${statusFilter === tab.key ? "is-active" : ""}`} onClick={() => setStatusFilter(tab.key)}>
                {tab.label} <em>{tab.count}</em>
              </button>
            ))}
          </nav>
          <select className="dash-select" value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)} aria-label="Mission">
            <option value="all">Toutes les missions</option>
            {VOLUNTEER_INTERESTS.map((interest) => (
              <option key={interest.key} value={interest.key}>{interest.fullLabel} ({counts.byInterest[interest.key] || 0})</option>
            ))}
          </select>
        </div>

        {loadError ? <p className="bv-error">Lecture impossible : {loadError}</p> : null}

        {rows === null ? (
          <p className="dash-muted">Chargement…</p>
        ) : all.length === 0 ? (
          <EmptyState title="Pas encore de réponse" description="Les propositions envoyées depuis la page Édito 2026 apparaîtront ici." />
        ) : (
          <DataTable
            columns={columns}
            data={visible}
            searchableKeys={["fullName", "email", "phone", "missionsText", "message", "notes"]}
            defaultSortKey="createdMs"
            defaultSortDirection="desc"
            onRowClick={(row) => setSelectedId(row.id)}
            selectedRowId={selectedId}
            emptyLabel="Aucune fiche avec ces filtres."
            toolsInline
          />
        )}
      </section>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId("")}
        title={selected ? `${selected.firstName} ${selected.lastName}` : ""}
        size="md"
      >
        {selected ? <VolunteerDetail key={selected.id} volunteer={selected} onClose={() => setSelectedId("")} /> : null}
      </Modal>
    </div>
  );
}
