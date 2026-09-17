"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  ACCOMMODATION_FIT_OPTIONS,
  ACCOMMODATION_RESEARCH_DOC_ID,
  ACCOMMODATION_SEED,
  ACCOMMODATION_STATUS_OPTIONS,
} from "@/src/lib/accommodationSeed";

const EMPTY_ROW = {
  type: "ocean", priority: 2, department: "", name: "", location: "", access: "", capacity: "",
  selfCatering: "À confirmer", fit: "À confirmer", phone: "", email: "", website: "",
  status: "À contacter", source: "", notes: "",
};

const TYPE_META = {
  ocean: {
    label: "Surf / Océan",
    title: "Hébergements surf accessibles à pied",
    description: "Côte basque, Landes et Gironde · autogestion, groupes et accès plage contrôlés séparément.",
  },
  river: {
    label: "Eau vive / Pyrénées",
    title: "Gîtes proches des bases d’eau vive",
    description: "Cible 30 à 40 personnes · cuisine autonome et accès rafting, hydrospeed ou canoë.",
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const rowId = () => `hebergement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const realEmail = (value) => String(value || "").includes("@") && !String(value).toLowerCase().startsWith("formulaire");
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function fitClass(value) {
  if (value === "Conforme") return "is-good";
  if (value === "Hors critère") return "is-out";
  return "is-check";
}

function StatusPill({ value, kind = "status" }) {
  return <span className={`acc-pill ${kind === "fit" ? fitClass(value) : ""}`}>{value || "Non renseigné"}</span>;
}

function Field({ label, wide = false, children }) {
  return <label className={wide ? "is-wide" : ""}><span>{label}</span>{children}</label>;
}

export default function Hebergements() {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => clone(ACCOMMODATION_SEED));
  const [activeType, setActiveType] = useState("ocean");
  const [search, setSearch] = useState("");
  const [fitFilter, setFitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, COLLECTIONS.ACCOMMODATION_RESEARCH, ACCOMMODATION_RESEARCH_DOC_ID));
        if (!mounted) return;
        if (snapshot.exists() && Array.isArray(snapshot.data()?.rows) && snapshot.data().rows.length) {
          setRows(snapshot.data().rows);
          const savedAt = snapshot.data()?.updatedAt?.toDate?.();
          if (savedAt) setLastSavedAt(savedAt.toLocaleString("fr-FR"));
        }
      } catch {
        showToast("La liste locale est affichée, mais la sauvegarde en ligne n’a pas pu être chargée.", "warning");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [showToast]);

  const typeRows = useMemo(() => rows.filter((row) => row.type === activeType), [activeType, rows]);
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return typeRows
      .filter((row) => fitFilter === "all" || row.fit === fitFilter)
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => !needle || [row.name, row.location, row.department, row.access, row.notes]
        .some((value) => String(value || "").toLocaleLowerCase("fr").includes(needle)))
      .sort((a, b) => Number(a.priority || 9) - Number(b.priority || 9) || String(a.name).localeCompare(String(b.name), "fr"));
  }, [fitFilter, search, statusFilter, typeRows]);

  const stats = useMemo(() => ({
    total: typeRows.length,
    qualified: typeRows.filter((row) => row.fit === "Conforme").length,
    pending: typeRows.filter((row) => row.fit === "À confirmer").length,
    contacted: typeRows.filter((row) => ["Contacté", "À relancer", "Visite prévue", "Devis reçu"].includes(row.status)).length,
  }), [typeRows]);

  const updateRow = (id, patch) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setDirty(true);
  };

  const addRow = () => {
    const row = { ...EMPTY_ROW, id: rowId(), type: activeType };
    setRows((current) => [row, ...current]);
    setExpandedId(row.id);
    setDirty(true);
  };

  const removeRow = (row) => {
    if (!window.confirm(`Supprimer « ${row.name || "cet hébergement"} » de la liste ?`)) return;
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (expandedId === row.id) setExpandedId("");
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, COLLECTIONS.ACCOMMODATION_RESEARCH, ACCOMMODATION_RESEARCH_DOC_ID), { rows, updatedAt: serverTimestamp() });
      setDirty(false);
      setLastSavedAt(new Date().toLocaleString("fr-FR"));
      showToast("Liste des hébergements enregistrée.", "success");
    } catch {
      showToast("Impossible d’enregistrer la liste des hébergements.", "error");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const columns = ["Priorité", "Département", "Centre", "Lieu", "Accès activité", "Capacité", "Autogestion", "Compatibilité", "Téléphone", "E-mail", "Site", "Statut", "Notes", "Source"];
    const body = typeRows.map((row) => [row.priority, row.department, row.name, row.location, row.access, row.capacity, row.selfCatering, row.fit, row.phone, row.email, row.website, row.status, row.notes, row.source]);
    const csv = `\uFEFF${[columns, ...body].map((line) => line.map(csvCell).join(";")).join("\r\n")}`;
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `hebergements-2027-${activeType === "ocean" ? "surf-ocean" : "eau-vive-pyrenees"}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const meta = TYPE_META[activeType];

  return (
    <div className="dash-page acc-page">
      <div className="dash-page-header-row">
        <div className="dash-page-header">
          <span className="dash-eyebrow">Production 2027</span>
          <h1>Prospection hébergements</h1>
          <p>Une liste de travail qualifiée, issue de ton Excel et complétée avec les coordonnées et sources publiques vérifiées.</p>
        </div>
        <div className="acc-header-actions">
          <button type="button" className="dash-btn dash-btn-secondary" onClick={exportCsv}>Exporter en CSV</button>
          <button type="button" className="dash-btn" onClick={addRow}>Ajouter un lieu</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}</button>
        </div>
      </div>

      <nav className="acc-type-tabs" aria-label="Types de recherche">
        {Object.entries(TYPE_META).map(([key, item]) => (
          <button key={key} type="button" className={activeType === key ? "is-active" : ""} onClick={() => { setActiveType(key); setExpandedId(""); }}>
            <span>{item.label}</span><strong>{rows.filter((row) => row.type === key).length}</strong>
          </button>
        ))}
      </nav>

      <section className="acc-context">
        <div><h2>{meta.title}</h2><p>{meta.description}</p></div>
        <small>{loading ? "Chargement de la sauvegarde…" : lastSavedAt ? `Dernière sauvegarde : ${lastSavedAt}` : "Base initiale non encore sauvegardée"}</small>
      </section>

      <section className="acc-metrics">
        <article><span>Total recensé</span><strong>{stats.total}</strong></article>
        <article className="is-good"><span>Conformes</span><strong>{stats.qualified}</strong></article>
        <article className="is-check"><span>À confirmer</span><strong>{stats.pending}</strong></article>
        <article><span>Déjà travaillés</span><strong>{stats.contacted}</strong></article>
      </section>

      <section className="acc-workspace">
        <div className="acc-toolbar">
          <label className="acc-search"><span>Rechercher</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Centre, ville, département, note…" /></label>
          <label><span>Compatibilité</span><select value={fitFilter} onChange={(event) => setFitFilter(event.target.value)}><option value="all">Toutes</option>{ACCOMMODATION_FIT_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label><span>Suivi</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tous les statuts</option>{ACCOMMODATION_STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className="acc-results"><strong>{visibleRows.length}</strong><span>résultat{visibleRows.length > 1 ? "s" : ""}</span></div>
        </div>

        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead><tr><th>Priorité</th><th>Centre / lieu</th><th>Accès</th><th>Capacité</th><th>Autogestion</th><th>Compatibilité</th><th>Coordonnées</th><th>Suivi</th><th /></tr></thead>
            <tbody>
              {visibleRows.map((row) => {
                const expanded = expandedId === row.id;
                return <Fragment key={row.id}>
                  <tr className={expanded ? "is-expanded" : ""} onClick={() => setExpandedId(expanded ? "" : row.id)}>
                    <td><span className={`acc-priority p${row.priority || 3}`}>P{row.priority || 3}</span></td>
                    <td><strong className="acc-name">{row.name || "Nouveau lieu"}</strong><small>{row.department ? `${row.department} · ` : ""}{row.location || "Lieu à renseigner"}</small></td>
                    <td className="acc-access">{row.access || "À renseigner"}</td>
                    <td>{row.capacity || "À renseigner"}</td>
                    <td><span className={`acc-self ${String(row.selfCatering).startsWith("Oui") ? "is-yes" : ""}`}>{row.selfCatering || "À confirmer"}</span></td>
                    <td><StatusPill value={row.fit} kind="fit" /></td>
                    <td className="acc-contact-cell">
                      {row.phone && <a href={`tel:${row.phone.split("/")[0].replace(/\s/g, "")}`} onClick={(event) => event.stopPropagation()}>{row.phone}</a>}
                      {realEmail(row.email) ? <a href={`mailto:${row.email}`} onClick={(event) => event.stopPropagation()}>{row.email}</a> : row.email && <span>{row.email}</span>}
                    </td>
                    <td><StatusPill value={row.status} /></td>
                    <td><button type="button" className="acc-expand" aria-label={expanded ? "Fermer" : "Modifier"}>{expanded ? "−" : "+"}</button></td>
                  </tr>
                  {expanded && <tr className="acc-editor-row"><td colSpan="9">
                    <div className="acc-editor">
                      <div className="acc-editor-grid">
                        <Field label="Nom du lieu"><input value={row.name || ""} onChange={(event) => updateRow(row.id, { name: event.target.value })} /></Field>
                        <Field label="Commune / secteur"><input value={row.location || ""} onChange={(event) => updateRow(row.id, { location: event.target.value })} /></Field>
                        <Field label="Département"><input value={row.department || ""} onChange={(event) => updateRow(row.id, { department: event.target.value })} /></Field>
                        <Field label="Priorité"><select value={row.priority || 2} onChange={(event) => updateRow(row.id, { priority: Number(event.target.value) })}><option value="1">P1 · prioritaire</option><option value="2">P2 · intéressant</option><option value="3">P3 · secondaire</option></select></Field>
                        <Field label="Accès océan / eau vive"><input value={row.access || ""} onChange={(event) => updateRow(row.id, { access: event.target.value })} /></Field>
                        <Field label="Capacité"><input value={row.capacity || ""} onChange={(event) => updateRow(row.id, { capacity: event.target.value })} /></Field>
                        <Field label="Autogestion"><select value={row.selfCatering || "À confirmer"} onChange={(event) => updateRow(row.id, { selfCatering: event.target.value })}><option>Oui</option><option>Oui, en logements</option><option>À confirmer</option><option>Non confirmée</option><option>Non</option></select></Field>
                        <Field label="Compatibilité"><select value={row.fit || "À confirmer"} onChange={(event) => updateRow(row.id, { fit: event.target.value })}>{ACCOMMODATION_FIT_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                        <Field label="Statut"><select value={row.status || "À contacter"} onChange={(event) => updateRow(row.id, { status: event.target.value })}>{ACCOMMODATION_STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                        <Field label="Téléphone"><input value={row.phone || ""} onChange={(event) => updateRow(row.id, { phone: event.target.value })} /></Field>
                        <Field label="E-mail"><input value={row.email || ""} onChange={(event) => updateRow(row.id, { email: event.target.value })} /></Field>
                        <Field label="Site officiel"><input value={row.website || ""} onChange={(event) => updateRow(row.id, { website: event.target.value })} /></Field>
                        <Field label="Source"><input value={row.source || ""} onChange={(event) => updateRow(row.id, { source: event.target.value })} /></Field>
                        <Field label="Notes" wide><textarea value={row.notes || ""} onChange={(event) => updateRow(row.id, { notes: event.target.value })} /></Field>
                      </div>
                      <div className="acc-editor-actions">
                        {row.website && <a className="dash-btn dash-btn-secondary" href={row.website} target="_blank" rel="noreferrer">Ouvrir le site</a>}
                        {row.source && row.source.startsWith("http") && <a className="dash-btn dash-btn-secondary" href={row.source} target="_blank" rel="noreferrer">Voir la source</a>}
                        <button type="button" className="dash-btn dash-btn-danger" onClick={() => removeRow(row)}>Supprimer</button>
                      </div>
                    </div>
                  </td></tr>}
                </Fragment>;
              })}
              {!visibleRows.length && <tr><td colSpan="9" className="acc-empty">Aucun hébergement ne correspond à ces filtres.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
