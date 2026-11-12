"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import Modal from "@/src/components/dashboard/ui/Modal";
import EmptyState from "@/src/components/dashboard/ui/EmptyState";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/contexts/ToastContext";
import { useSeasons } from "@/src/lib/seasons";
import { parseSessionId } from "@/src/lib/sessions";
import {
  ARCHIVED_COLLECTIONS,
  amount,
  applyArchiveBefore,
  applySeasonArchive,
  childCountOf,
  loadArchivedRecords,
  normalizeReservationStatus,
  previewArchiveBefore,
  previewSeasonArchive,
  reservationPaid,
  reservationRevenue,
  restoreSeason,
  scanSeasonCounts,
  timestampToMs,
} from "@/src/lib/seasonArchive";
import "@/src/styles/archives.css";

/* Archives des saisons : clôture d'une saison (tag `archived`) et consultation en lecture seule. */

const DEFAULT_SEASON_TO_CLOSE = "2026";

const RESERVATION_STATUS = {
  validated: { label: "Validée", variant: "success" },
  pending: { label: "En attente", variant: "warning" },
  cancelled: { label: "Annulée", variant: "neutral" },
  waitlist: { label: "Liste d'attente", variant: "info" },
};

const PAYMENT_STATUS = { paid: "Payé", in_progress: "En cours", not_paid: "Non payé" };

const DOCUSIGN_STATUS = {
  created: "Brouillon",
  sent: "En cours",
  delivered: "Ouvert",
  completed: "Signé",
  declined: "Refusé",
  voided: "Annulé",
};

const currencyFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const currency = (value) => currencyFormatter.format(Number(value) || 0);

function fmtDate(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return new Date(`${raw}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMs(ms) {
  return ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
}

const personName = (person) => `${person?.firstName || person?.prenom || ""} ${person?.lastName || person?.nom || ""}`.trim();

function childrenNames(data) {
  const children = Array.isArray(data?.minor?.children) ? data.minor.children : [];
  const names = children.map(personName).filter(Boolean);
  if (names.length) return names.join(", ");
  return personName(data?.child || data?.participant || {}) || "";
}

/* ── Row mappers per collection (consultation + CSV) ─────────────────── */

function reservationRow({ id, data }) {
  const status = normalizeReservationStatus(data.status);
  const sejour = data.sejour || {};
  const startDate = sejour.startDate || data.sejourStartDate || "";
  const pricing = data.payment || data.pricing || {};
  const revenue = reservationRevenue(data);
  return {
    id,
    reference: data.numeroDeReservation || id.slice(0, 8),
    children: childrenNames(data) || "—",
    childCount: childCountOf(data),
    responsible: personName(data.legal) || data.name || "—",
    email: data.legal?.email || data.email || "",
    sejour: sejour.name || data.sejourName || "—",
    session: startDate ? `${fmtDate(startDate)}${sejour.endDate ? ` → ${fmtDate(sejour.endDate)}` : ""}` : "—",
    startDate,
    statusKey: status,
    status: RESERVATION_STATUS[status]?.label || status,
    payment: PAYMENT_STATUS[pricing.paymentStatus || data.paymentStatus] || "",
    revenue: revenue ?? "",
    paid: reservationPaid(data),
    departureCity: data.transport?.departureCity || "",
    returnCity: data.transport?.returnCity || "",
    createdAt: fmtMs(timestampToMs(data.createdAt)),
  };
}

function transportRow({ id, data }) {
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];
  const sessions = (Array.isArray(data.sessionIds) ? data.sessionIds : []).map((sessionId) => parseSessionId(sessionId).sejourId).filter(Boolean);
  const staff = (Array.isArray(data.staff) ? data.staff : []).map((member) => member?.name).filter(Boolean);
  return {
    id,
    date: data.date || "",
    dateLabel: fmtDate(data.date) || "—",
    direction: data.direction === "retour" ? "Retour" : "Aller",
    route: [data.departureCity, data.arrivalCity].filter(Boolean).join(" → ") || "—",
    times: [data.departureTime, data.arrivalTime].filter(Boolean).join(" – "),
    train: [data.trainType, data.trainNumber].filter(Boolean).join(" "),
    passengers: passengers.length,
    week: data.week || "",
    sejour: sessions.length ? [...new Set(sessions)].join(", ") : (data.sejourName || "—"),
    staff: staff.join(", ") || data.convoyeur || "",
    status: data.status || "",
  };
}

function contractRow({ id, data }) {
  const dates = data.startDate ? `${fmtDate(data.startDate)}${data.endDate ? ` → ${fmtDate(data.endDate)}` : ""}` : "";
  return {
    id,
    member: data.memberName || "—",
    role: data.role || "—",
    stay: [data.stayCode || data.stayName, data.week].filter(Boolean).join(" ") || "—",
    dates: dates || "—",
    startDate: data.startDate || "",
    netSalary: amount(data.netSalary),
    grossSalary: amount(data.grossSalary),
    paid: data.paymentValidated === true ? "Payé" : "À régler",
    docusign: DOCUSIGN_STATUS[data.docusignStatus] || (data.docusignStatus ? data.docusignStatus : "Non envoyé"),
  };
}

function dayPlanRow({ id, data }) {
  const fromId = String(id).match(/^(.*?)(?:__|-)(\d{4}-\d{2}-\d{2})$/);
  const date = data.date || fromId?.[2] || "";
  const stay = data.sessionId ? parseSessionId(data.sessionId).sejourId : (data.stayId || fromId?.[1] || "");
  return {
    id,
    date,
    dateLabel: fmtDate(date) || "—",
    stay: stay || "—",
    tasks: Array.isArray(data.tasks) ? data.tasks.length : 0,
    notes: String(data.notes || "").slice(0, 140),
  };
}

const money = (key, label) => ({
  key,
  label,
  sortValue: (row) => Number(row[key]) || 0,
  render: (row) => (row[key] === "" ? <span className="dash-muted">—</span> : currency(row[key])),
});

const TABS = {
  reservations: {
    mapRow: reservationRow,
    sortKey: "startDate",
    searchKeys: ["reference", "children", "responsible", "email", "sejour", "status", "departureCity"],
    columns: [
      { key: "reference", label: "Réf." },
      { key: "children", label: "Enfant(s)" },
      { key: "responsible", label: "Responsable" },
      { key: "sejour", label: "Séjour" },
      { key: "session", label: "Session", sortValue: (row) => row.startDate, render: (row) => row.session },
      {
        key: "status", label: "Statut", filterable: true, filterLabel: "Tous les statuts",
        sortValue: (row) => row.status,
        render: (row) => <Badge label={row.status} variant={RESERVATION_STATUS[row.statusKey]?.variant} />,
      },
      money("revenue", "Montant"),
      money("paid", "Payé"),
    ],
    csv: [
      ["Référence", "reference"], ["Enfant(s)", "children"], ["Nb enfants", "childCount"], ["Responsable", "responsible"],
      ["E-mail", "email"], ["Séjour", "sejour"], ["Session", "session"], ["Statut", "status"], ["Paiement", "payment"],
      ["Montant", "revenue"], ["Payé", "paid"], ["Ville aller", "departureCity"], ["Ville retour", "returnCity"], ["Créée le", "createdAt"],
    ],
  },
  transports: {
    mapRow: transportRow,
    sortKey: "date",
    searchKeys: ["dateLabel", "direction", "route", "sejour", "week", "staff", "train"],
    columns: [
      { key: "date", label: "Date", sortValue: (row) => row.date, render: (row) => row.dateLabel },
      { key: "direction", label: "Sens", filterable: true, filterLabel: "Aller et retour" },
      { key: "route", label: "Trajet" },
      { key: "sejour", label: "Séjour / semaine", sortValue: (row) => row.sejour, render: (row) => [row.sejour, row.week].filter((value) => value && value !== "—").join(" · ") || "—" },
      { key: "passengers", label: "Passagers" },
      { key: "staff", label: "Convoyeurs" },
    ],
    csv: [
      ["Date", "dateLabel"], ["Sens", "direction"], ["Trajet", "route"], ["Horaires", "times"], ["Train", "train"],
      ["Séjour", "sejour"], ["Semaine", "week"], ["Passagers", "passengers"], ["Convoyeurs", "staff"], ["Statut", "status"],
    ],
  },
  contracts: {
    mapRow: contractRow,
    sortKey: "member",
    searchKeys: ["member", "role", "stay", "docusign", "paid"],
    columns: [
      { key: "member", label: "Personne" },
      { key: "role", label: "Poste", filterable: true, filterLabel: "Tous les postes" },
      { key: "stay", label: "Séjour" },
      { key: "dates", label: "Dates", sortValue: (row) => row.startDate, render: (row) => row.dates },
      money("netSalary", "Net"),
      { key: "paid", label: "Paiement" },
      { key: "docusign", label: "Signature", filterable: true, filterLabel: "Toutes" },
    ],
    csv: [
      ["Personne", "member"], ["Poste", "role"], ["Séjour", "stay"], ["Dates", "dates"], ["Net", "netSalary"],
      ["Brut", "grossSalary"], ["Paiement", "paid"], ["Signature DocuSign", "docusign"],
    ],
  },
  dayPlans: {
    mapRow: dayPlanRow,
    sortKey: "date",
    searchKeys: ["dateLabel", "stay", "notes"],
    columns: [
      { key: "date", label: "Date", sortValue: (row) => row.date, render: (row) => row.dateLabel },
      { key: "stay", label: "Séjour", filterable: true, filterLabel: "Tous les séjours" },
      { key: "tasks", label: "Activités" },
      { key: "notes", label: "Notes" },
    ],
    csv: [["Date", "dateLabel"], ["Séjour", "stay"], ["Activités", "tasks"], ["Notes", "notes"]],
  },
};

function downloadCsv(filename, header, rows) {
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(([label]) => label), ...rows.map((row) => header.map(([, key]) => row[key]))];
  const csv = `﻿${lines.map((line) => line.map(cell).join(";")).join("\r\n")}`;
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

/** One-line description of an undetermined record, to decide without opening it. */
function describeRecord(key, item) {
  const { data, id } = item;
  const created = fmtMs(timestampToMs(data.createdAt));
  if (key === "reservations") {
    const row = reservationRow(item);
    return [row.reference, row.children, row.responsible, row.sejour, row.status, created && `créée le ${created}`].filter((value) => value && value !== "—").join(" · ");
  }
  if (key === "transports") {
    const row = transportRow(item);
    return [row.direction, row.route, row.sejour, row.week, created && `créé le ${created}`].filter((value) => value && value !== "—").join(" · ");
  }
  if (key === "contracts") {
    const row = contractRow(item);
    return [row.member, row.role, row.stay, row.netSalary ? `${currency(row.netSalary)} net` : "", created && `créé le ${created}`].filter((value) => value && value !== "—").join(" · ");
  }
  return [id, data.stayId, created && `créé le ${created}`].filter(Boolean).join(" · ");
}

/* ── Season cards ────────────────────────────────────────────────────── */

function SeasonCard({ season, selected, onSelect }) {
  const archived = season.status === "archived";
  const stats = season.stats || {};
  const counts = season.counts || {};
  return (
    <button type="button" className={`arc-season ${archived ? "is-archived" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} disabled={!archived}>
      <div className="arc-season-head">
        <strong>{season.id}</strong>
        {archived ? <Badge label="Archivée" variant="neutral" /> : <Badge label={season.isActive ? "Saison active" : "Ouverte"} variant={season.isActive ? "info" : "warning"} />}
      </div>
      {archived ? (
        <dl className="arc-season-stats">
          <div><dt>Réservations validées</dt><dd>{stats.validatedReservations ?? "—"}</dd></div>
          <div><dt>Enfants</dt><dd>{stats.children ?? "—"}</dd></div>
          <div><dt>CA validé</dt><dd>{stats.revenueValidated != null ? currency(stats.revenueValidated) : "—"}</dd></div>
          <div><dt>Convoyages</dt><dd>{stats.transports ?? "—"}</dd></div>
          <div><dt>Contrats · membres</dt><dd>{stats.contracts ?? "—"} · {stats.staffMembers ?? "—"}</dd></div>
          <div><dt>Masse salariale nette</dt><dd>{stats.payrollNet != null ? currency(stats.payrollNet) : "—"}</dd></div>
        </dl>
      ) : (
        <p className="arc-season-open">
          {counts.reservations || 0} réservation{counts.reservations > 1 ? "s" : ""} · {counts.transports || 0} convoyage{counts.transports > 1 ? "s" : ""} · {counts.contracts || 0} contrat{counts.contracts > 1 ? "s" : ""} · {counts.dayPlans || 0} déroulé{counts.dayPlans > 1 ? "s" : ""}
        </p>
      )}
      {archived && season.archivedAt ? (
        <small className="arc-season-meta">Clôturée le {fmtMs(timestampToMs(season.archivedAt))}{season.archivedBy ? ` par ${season.archivedBy}` : ""}</small>
      ) : null}
    </button>
  );
}

/* ── Close a season ──────────────────────────────────────────────────── */

function ProgressBar({ progress }) {
  if (!progress) return null;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
  return (
    <div className="arc-progress">
      <div className="dash-progress-wrap">
        <div className="dash-progress"><span style={{ width: `${percent}%` }} /></div>
        <small>{progress.done} / {progress.total}</small>
      </div>
      <small className="dash-muted">{progress.phase === "done" ? "Terminé." : "Écriture en cours, ne fermez pas la page…"}</small>
    </div>
  );
}

function CloseSeasonPanel({ candidates, defaultSeason, adminEmail, onDone }) {
  const { showToast } = useToast();
  const [season, setSeason] = useState(defaultSeason);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [included, setIncluded] = useState(() => new Set());
  const [openGroup, setOpenGroup] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!candidates.includes(season)) setSeason(defaultSeason);
  }, [candidates, defaultSeason, season]);

  const reset = (nextSeason) => {
    setSeason(nextSeason);
    setPreview(null);
    setIncluded(new Set());
    setConfirmText("");
    setProgress(null);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setProgress(null);
    try {
      setPreview(await previewSeasonArchive(season));
      setIncluded(new Set());
      setConfirmText("");
    } catch (error) {
      showToast(error?.message || "Analyse impossible.", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggle = (key) => setIncluded((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const toggleAll = (items, checked) => setIncluded((previous) => {
    const next = new Set(previous);
    items.forEach((item) => (checked ? next.add(item.key) : next.delete(item.key)));
    return next;
  });

  const toTag = preview
    ? ARCHIVED_COLLECTIONS.reduce((sum, meta) => sum + preview.collections[meta.key].matched.length, 0) + included.size
    : 0;
  const expected = `ARCHIVER ${season}`;

  const apply = async () => {
    if (confirmText.trim() !== expected) return;
    setRunning(true);
    try {
      const result = await applySeasonArchive(season, { includeIds: [...included], adminEmail, onProgress: setProgress, preview });
      showToast(`Saison ${season} archivée : ${result.tagged} documents tagués.`, "success");
      setPreview(null);
      setConfirmText("");
      onDone?.(season);
    } catch (error) {
      showToast(error?.message || "Archivage interrompu.", "error");
    } finally {
      setRunning(false);
    }
  };

  if (!candidates.length) {
    return <p className="dash-muted">Aucune saison ouverte à clôturer.</p>;
  }

  return (
    <div className="arc-close">
      <div className="arc-close-bar">
        <label className="arc-field">
          <span>Saison</span>
          <select className="dash-input" value={season} onChange={(event) => reset(event.target.value)} disabled={running}>
            {candidates.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="dash-btn" onClick={analyze} disabled={analyzing || running}>
          {analyzing ? "Analyse…" : preview ? "Relancer l'analyse" : "Analyser"}
        </button>
        <p className="dash-muted">L&apos;analyse ne modifie rien. Les documents sont seulement tagués, jamais déplacés ni supprimés.</p>
      </div>

      {preview ? (
        <>
          <div className="arc-preview">
            {ARCHIVED_COLLECTIONS.map((meta) => {
              const bucket = preview.collections[meta.key];
              const chosen = bucket.undetermined.filter((item) => included.has(item.key)).length;
              const open = openGroup === meta.key;
              return (
                <article key={meta.key} className="arc-preview-card">
                  <header><strong>{meta.label}</strong><small>{bucket.total} au total</small></header>
                  <dl>
                    <div><dt>À archiver</dt><dd>{bucket.matched.length + chosen}</dd></div>
                    <div><dt>Déjà archivés</dt><dd>{bucket.archived.length}</dd></div>
                    <div><dt>Indéterminés</dt><dd>{bucket.undetermined.length}</dd></div>
                  </dl>
                  {bucket.undetermined.length ? (
                    <button type="button" className="arc-link" onClick={() => setOpenGroup(open ? "" : meta.key)}>
                      {open ? "Masquer les indéterminés" : `Choisir parmi les indéterminés (${chosen} inclus)`}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>

          {openGroup && preview.collections[openGroup]?.undetermined.length ? (
            <div className="arc-undetermined">
              <div className="arc-undetermined-head">
                <span>
                  {ARCHIVED_COLLECTIONS.find((meta) => meta.key === openGroup)?.label} sans date exploitable, créés avant le 1er octobre {season}.
                  Cochez ceux qui appartiennent à la saison {season}.
                </span>
                <span className="arc-undetermined-actions">
                  <button type="button" className="arc-link" onClick={() => toggleAll(preview.collections[openGroup].undetermined, true)}>Tout cocher</button>
                  <button type="button" className="arc-link" onClick={() => toggleAll(preview.collections[openGroup].undetermined, false)}>Tout décocher</button>
                </span>
              </div>
              <ul>
                {preview.collections[openGroup].undetermined.map((item) => (
                  <li key={item.key}>
                    <label>
                      <input type="checkbox" checked={included.has(item.key)} onChange={() => toggle(item.key)} disabled={running} />
                      <span>{describeRecord(openGroup, item) || item.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="arc-confirm">
            <p>
              <strong>{toTag}</strong> document{toTag > 1 ? "s" : ""} vont recevoir <code>archived: true</code> et disparaître des écrans de travail.
              Pour confirmer, tapez <code>{expected}</code>.
            </p>
            <div className="arc-confirm-row">
              <input className="dash-input" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={expected} disabled={running} />
              <button type="button" className="dash-btn dash-btn-primary" onClick={apply} disabled={running || confirmText.trim() !== expected}>
                {running ? "Archivage…" : `Archiver la saison ${season}`}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <ProgressBar progress={progress} />
    </div>
  );
}

/* ── Everything before the active season, in one go ─────────────────── */

function ArchiveAllPanel({ activeSeason, adminEmail, onDone }) {
  const { showToast } = useToast();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [includeUndated, setIncludeUndated] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const analyze = async () => {
    setAnalyzing(true);
    setProgress(null);
    try {
      setPreview(await previewArchiveBefore(activeSeason));
      setConfirmText("");
    } catch (error) {
      showToast(error?.message || "Analyse impossible.", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const toTag = preview
    ? ARCHIVED_COLLECTIONS.reduce((sum, meta) => {
      const bucket = preview.collections[meta.key];
      return sum + bucket.toArchive.length + (includeUndated ? bucket.undated.length : 0);
    }, 0)
    : 0;
  const expected = "TOUT ARCHIVER";

  const apply = async () => {
    if (confirmText.trim() !== expected) return;
    setRunning(true);
    try {
      const result = await applyArchiveBefore(activeSeason, { includeUndated, adminEmail, onProgress: setProgress, preview });
      showToast(`${result.tagged} documents archivés (saisons ${result.seasons.join(", ") || "—"}).`, "success");
      setPreview(null);
      setConfirmText("");
      onDone?.(result.seasons.at(-1));
    } catch (error) {
      showToast(error?.message || "Archivage interrompu.", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="arc-close">
      <div className="arc-close-bar">
        <button type="button" className="dash-btn" onClick={analyze} disabled={analyzing || running}>
          {analyzing ? "Analyse…" : preview ? "Relancer l'analyse" : "Analyser"}
        </button>
        <p className="dash-muted">
          Archive toutes les réservations, convoyages, contrats et déroulés antérieurs à {activeSeason}, quelle que soit leur année,
          ainsi que les fiches sans date. Ce qui concerne {activeSeason} et après n&apos;est pas touché.
        </p>
      </div>

      {preview ? (
        <>
          <div className="arc-preview">
            {ARCHIVED_COLLECTIONS.map((meta) => {
              const bucket = preview.collections[meta.key];
              return (
                <article key={meta.key} className="arc-preview-card">
                  <header><strong>{meta.label}</strong><small>{bucket.total} au total</small></header>
                  <dl>
                    <div><dt>Avant {activeSeason}</dt><dd>{bucket.toArchive.length}</dd></div>
                    <div><dt>Sans date</dt><dd>{bucket.undated.length}</dd></div>
                    <div><dt>Déjà archivés</dt><dd>{bucket.archived}</dd></div>
                    <div><dt>Gardés ({activeSeason}+)</dt><dd>{bucket.kept}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>

          <label className="arc-undetermined-head">
            <span>
              <input type="checkbox" checked={includeUndated} onChange={(event) => setIncludeUndated(event.target.checked)} disabled={running} />{" "}
              Archiver aussi les fiches sans date (rangées dans l&apos;année de leur création, au plus tard {Number(activeSeason) - 1})
            </span>
          </label>

          <div className="arc-confirm">
            <p>
              <strong>{toTag}</strong> document{toTag > 1 ? "s" : ""} vont être archivés
              {preview.seasons.length ? ` (saisons ${preview.seasons.join(", ")})` : ""}. Pour confirmer, tapez <code>{expected}</code>.
            </p>
            <div className="arc-confirm-row">
              <input className="dash-input" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={expected} disabled={running || !toTag} />
              <button type="button" className="dash-btn dash-btn-primary" onClick={apply} disabled={running || !toTag || confirmText.trim() !== expected}>
                {running ? "Archivage…" : "Tout archiver"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <ProgressBar progress={progress} />
    </div>
  );
}

/* ── Read-only consultation ──────────────────────────────────────────── */

function SeasonConsultation({ season, adminEmail, onRestored }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState("reservations");
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(null);
  const visibleRef = useRef([]);

  useEffect(() => {
    setCache({});
    setTab("reservations");
  }, [season]);

  useEffect(() => {
    if (cache[tab]) return undefined;
    let active = true;
    setLoading(true);
    loadArchivedRecords(season, tab)
      .then((records) => { if (active) setCache((previous) => ({ ...previous, [tab]: records.map(TABS[tab].mapRow) })); })
      .catch((error) => { if (active) showToast(error?.message || "Lecture des archives impossible.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cache, season, showToast, tab]);

  const rows = cache[tab] || [];
  const config = TABS[tab];
  const onVisible = useCallback((visible) => { visibleRef.current = visible; }, []);

  const exportCsv = () => {
    const label = ARCHIVED_COLLECTIONS.find((meta) => meta.key === tab)?.label || tab;
    const slug = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    downloadCsv(`archives-${season}-${slug}.csv`, config.csv, visibleRef.current.length ? visibleRef.current : rows);
  };

  const expected = `ROUVRIR ${season}`;
  const restore = async () => {
    if (restoreText.trim() !== expected) return;
    setRestoring(true);
    try {
      const result = await restoreSeason(season, { adminEmail, onProgress: setProgress });
      showToast(`Saison ${season} rouverte : ${result.restored} documents réactivés.`, "success");
      setRestoreOpen(false);
      onRestored?.(season);
    } catch (error) {
      showToast(error?.message || "Réouverture interrompue.", "error");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className="dash-card dash-section arc-consult">
      <div className="dash-section-head">
        <h2>Saison {season} · consultation</h2>
        <div className="arc-consult-actions">
          <button type="button" className="dash-btn" onClick={exportCsv} disabled={!rows.length}>Exporter en CSV</button>
          <button type="button" className="arc-link arc-link-quiet" onClick={() => { setRestoreText(""); setProgress(null); setRestoreOpen(true); }}>Rouvrir la saison</button>
        </div>
      </div>

      <nav className="dash-subtabs arc-tabs" aria-label="Type de documents">
        {ARCHIVED_COLLECTIONS.map((meta) => (
          <button key={meta.key} type="button" className={`dash-subtab ${tab === meta.key ? "is-active" : ""}`} onClick={() => setTab(meta.key)}>
            {meta.label}{cache[meta.key] ? <em>{cache[meta.key].length}</em> : null}
          </button>
        ))}
      </nav>

      {loading && !cache[tab] ? (
        <p className="dash-muted">Chargement…</p>
      ) : (
        <DataTable
          key={`${season}-${tab}`}
          columns={config.columns}
          data={rows}
          searchableKeys={config.searchKeys}
          defaultSortKey={config.sortKey}
          onProcessedDataChange={onVisible}
          emptyLabel="Aucun document archivé dans cette catégorie."
          toolsInline
        />
      )}

      <Modal isOpen={restoreOpen} onClose={() => !restoring && setRestoreOpen(false)} title={`Rouvrir la saison ${season}`} size="sm">
        <p>
          Les documents de la saison {season} perdront leur marque d&apos;archive et réapparaîtront dans les écrans de travail.
          Le champ <code>season</code> est conservé. Tapez <code>{expected}</code> pour confirmer.
        </p>
        <input className="dash-input" value={restoreText} onChange={(event) => setRestoreText(event.target.value)} placeholder={expected} disabled={restoring} />
        <ProgressBar progress={progress} />
        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setRestoreOpen(false)} disabled={restoring}>Annuler</button>
          <button type="button" className="dash-btn dash-btn-danger" onClick={restore} disabled={restoring || restoreText.trim() !== expected}>
            {restoring ? "Réouverture…" : "Rouvrir"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function Archives() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { seasons, archivedSeasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [counts, setCounts] = useState(null);
  const [selected, setSelected] = useState("");
  const adminEmail = currentUser?.email || "";

  const refreshCounts = useCallback(() => {
    scanSeasonCounts()
      .then(setCounts)
      .catch((error) => {
        setCounts({});
        showToast(error?.message || "Lecture des données impossible.", "error");
      });
  }, [showToast]);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const seasonList = useMemo(() => {
    const byId = new Map(seasons.map((season) => [season.id, season]));
    const ids = new Set([...byId.keys(), ...Object.keys(counts || {}), activeSeason]);
    return [...ids]
      .filter((id) => /^\d{4}$/.test(id))
      .sort((a, b) => b.localeCompare(a))
      .map((id) => ({
        id,
        status: archivedSeasons.has(id) ? "archived" : "open",
        isActive: id === activeSeason,
        counts: counts?.[id],
        ...byId.get(id),
      }));
  }, [activeSeason, archivedSeasons, counts, seasons]);

  // Seasons that can be closed: open ones before the active season (the active one is being sold).
  const candidates = useMemo(
    () => seasonList.filter((season) => season.status !== "archived" && season.id < activeSeason).map((season) => season.id).sort(),
    [activeSeason, seasonList],
  );
  const defaultSeason = candidates.includes(DEFAULT_SEASON_TO_CLOSE) ? DEFAULT_SEASON_TO_CLOSE : (candidates[0] || "");

  useEffect(() => {
    if (!selected && archivedSeasons.size) setSelected([...archivedSeasons].sort().at(-1));
  }, [archivedSeasons, selected]);

  const afterArchive = (season) => {
    refreshCounts();
    setSelected(season);
  };

  const afterRestore = () => {
    refreshCounts();
    setSelected("");
  };

  return (
    <div className="dash-page arc-page">
      <div className="dash-page-header">
        <span className="dash-eyebrow">Trace</span>
        <h1>Archives des saisons</h1>
        <p>Les saisons clôturées restent consultables ici, en lecture seule. Rien n&apos;est supprimé : chaque document est seulement marqué comme archivé.</p>
      </div>

      <div className="arc-seasons">
        {seasonsLoading && !counts ? <p className="dash-muted">Chargement des saisons…</p> : null}
        {seasonList.map((season) => (
          <SeasonCard key={season.id} season={season} selected={selected === season.id} onSelect={() => setSelected(season.id)} />
        ))}
      </div>

      <section className="dash-card dash-section arc-close-card">
        <div className="dash-section-head"><h2>Tout archiver avant {activeSeason}</h2></div>
        <ArchiveAllPanel activeSeason={activeSeason} adminEmail={adminEmail} onDone={afterArchive} />
      </section>

      <section className="dash-card dash-section arc-close-card">
        <div className="dash-section-head"><h2>Clôturer une saison</h2></div>
        {counts ? (
          <CloseSeasonPanel key={defaultSeason} candidates={candidates} defaultSeason={defaultSeason} adminEmail={adminEmail} onDone={afterArchive} />
        ) : (
          <p className="dash-muted">Lecture des données…</p>
        )}
      </section>

      {selected ? (
        <SeasonConsultation season={selected} adminEmail={adminEmail} onRestored={afterRestore} />
      ) : (
        !seasonsLoading && !archivedSeasons.size ? (
          <EmptyState title="Aucune saison archivée" description="Une fois une saison clôturée, ses réservations, convoyages, contrats et déroulés se consultent ici." />
        ) : null
      )}
    </div>
  );
}
