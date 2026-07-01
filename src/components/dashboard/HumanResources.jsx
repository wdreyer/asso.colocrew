"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDocs, updateDoc, arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { openContractPrint } from "@/src/lib/contractTemplate";

// ─── Constantes ──────────────────────────────────────────────────────────────

const WEEK_ORDER = ["S1", "S2", "S3", "S4"];

const TYPE_LABEL   = { animateur: "Animateur", directeur: "Directeur", "": "—" };
const TYPE_VARIANT = { animateur: "info", directeur: "primary" };
const TYPE_COLOR   = { animateur: "#1d4ed8", directeur: "#7c3aed" };
const TYPE_BG      = { animateur: "#eff6ff", directeur: "#f5f0ff" };

const AVATAR_COLORS = [
  ["#1d4ed8","#eff6ff"], ["#7c3aed","#f5f0ff"], ["#0891b2","#ecfeff"],
  ["#059669","#ecfdf5"], ["#d97706","#fffbeb"], ["#db2777","#fdf2f8"],
];

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function amount(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function currency(v) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(amount(v));
}
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return v;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(m) {
  return [m.firstName?.[0], m.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

// ─── Mapping Firestore ────────────────────────────────────────────────────────

function mapMember(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: d.name || `${d.firstName || ""} ${d.lastName || ""}`.trim() || "Nom à compléter",
    firstName: d.firstName || "",
    lastName:  d.lastName  || "",
    email:     d.email     || "",
    phone:     d.phone     || "",
    dateOfBirth:          d.dateOfBirth          || "",
    birthPlace:           d.birthPlace           || "",
    socialSecurityNumber: d.socialSecurityNumber || "",
    address:   d.address   || "",
    staffType: d.staffType || "",
    photoUrl:  d.photoUrl  || "",
    documents: d.documents || [],
    active:    d.active !== false,
  };
}

function mapContract(snap) {
  const d = snap.data() || {};
  const gross   = amount(d.grossSalary);
  const paid    = amount(d.paidAmount);
  const outstanding = Math.max(amount(d.outstandingAmount ?? gross - paid), 0);
  return {
    id: snap.id,
    memberId:   d.memberId   || "",
    memberName: d.memberName || "Animateur non renseigné",
    stay:     d.stayName  || d.stayCode || "Non renseigné",
    stayCode: d.stayCode  || "",
    week:     d.week      || "Non renseignée",
    role:     d.role      || "Poste non renseigné",
    startDate: d.startDate || "",
    endDate:   d.endDate   || "",
    datesLabel: d.startDate && d.endDate
      ? `${fmtDate(d.startDate)} – ${fmtDate(d.endDate)}`
      : "Dates à compléter",
    grossSalary: gross,
    paidAmount:  paid,
    outstandingAmount: outstanding,
    status: gross > 0 && paid >= gross ? "Payé" : "À régler",
    contractFileUrl: d.contractFileUrl || "",
  };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ member, size = 44 }) {
  const [err, setErr] = useState(false);
  const [color, bg] = avatarColor(member.id);
  const style = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (member.photoUrl && !err) {
    return <img src={member.photoUrl} alt={member.name} style={style} onError={() => setErr(true)} />;
  }
  return (
    <div style={{ ...style, background: bg, color, fontSize: size * 0.38, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {initials(member)}
    </div>
  );
}

// ─── Vue "Par séjour" ─────────────────────────────────────────────────────────

function SejoursView({ members, contracts, onFiche, onContract }) {
  const groups = useMemo(() => {
    const map = new Map();
    contracts.forEach((c) => {
      const key = `${c.stayCode || c.stay}__${c.week}`;
      if (!map.has(key)) {
        map.set(key, {
          key, stay: c.stay, stayCode: c.stayCode, week: c.week,
          startDate: c.startDate, endDate: c.endDate,
          contracts: [],
        });
      }
      const g = map.get(key);
      if (!g.startDate && c.startDate) g.startDate = c.startDate;
      if (!g.endDate   && c.endDate)   g.endDate   = c.endDate;
      g.contracts.push(c);
    });
    return [...map.values()].sort((a, b) => {
      const ai = WEEK_ORDER.indexOf(a.week), bi = WEEK_ORDER.indexOf(b.week);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.stay.localeCompare(b.stay, "fr");
    });
  }, [contracts]);

  if (!groups.length) {
    return (
      <div className="hr-empty">
        <p>Aucun contrat enregistré — les séjours apparaîtront ici une fois les contrats créés.</p>
      </div>
    );
  }

  return (
    <div className="hr-sejour-list">
      {groups.map((g) => {
        const contractsByMember = g.contracts;
        const memberIds = [...new Set(contractsByMember.map((c) => c.memberId))];
        const groupMembers = memberIds
          .map((id) => members.find((m) => m.id === id))
          .filter(Boolean);

        const dirs  = groupMembers.filter((m) => m.staffType === "directeur");
        const anims = groupMembers.filter((m) => m.staffType !== "directeur" || !m.staffType);

        const memberContract = (m) => contractsByMember.find((c) => c.memberId === m.id);

        return (
          <section key={g.key} className="hr-sejour-block">
            <div className="hr-sejour-header">
              <div className="hr-sejour-title-row">
                <span className="hr-sejour-week">{g.week}</span>
                <h2 className="hr-sejour-name">{g.stay}</h2>
              </div>
              <div className="hr-sejour-dates">
                {g.startDate && g.endDate
                  ? `${fmtDate(g.startDate)} → ${fmtDate(g.endDate)}`
                  : "Dates à compléter"}
                <span className="hr-sejour-count">{groupMembers.length} personnes</span>
              </div>
            </div>

            {dirs.length > 0 && (
              <div className="hr-sejour-team-section">
                <div className="hr-team-label">Direction</div>
                <div className="hr-team-row">
                  {dirs.map((m) => {
                    const c = memberContract(m);
                    return <MiniCard key={m.id} member={m} contract={c} onFiche={onFiche} onContract={onContract} />;
                  })}
                </div>
              </div>
            )}

            {anims.length > 0 && (
              <div className="hr-sejour-team-section">
                <div className="hr-team-label">Animateurs</div>
                <div className="hr-team-row">
                  {anims.map((m) => {
                    const c = memberContract(m);
                    return <MiniCard key={m.id} member={m} contract={c} onFiche={onFiche} onContract={onContract} />;
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MiniCard({ member, contract, onFiche, onContract }) {
  return (
    <div className="hr-mini-card">
      <Avatar member={member} size={44} />
      <div className="hr-mini-info">
        <div className="hr-mini-name">{member.firstName} <strong>{member.lastName}</strong></div>
        <div className="hr-mini-role">{contract?.role || TYPE_LABEL[member.staffType] || "—"}</div>
        {contract && (
          <div className={`hr-mini-status ${contract.status === "Payé" ? "is-paid" : "is-due"}`}>
            {contract.status}
          </div>
        )}
      </div>
      <div className="hr-mini-actions">
        <button type="button" className="hr-btn-sm" onClick={() => onFiche(member)}>Fiche</button>
        {contract && (
          <button type="button" className="hr-btn-sm is-contract" onClick={() => onContract(member, contract)}>
            Contrat
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Vue "Équipe" ─────────────────────────────────────────────────────────────

function EquipeView({ members, contracts, onFiche, onContract }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = members;
    if (filter !== "all") list = list.filter((m) => m.staffType === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((m) =>
        [m.firstName, m.lastName, m.email, m.phone, m.address, m.dateOfBirth].some((v) => v.toLowerCase().includes(s))
      );
    }
    return list;
  }, [members, filter, search]);

  const animCount = members.filter((m) => m.staffType === "animateur").length;
  const dirCount  = members.filter((m) => m.staffType === "directeur").length;

  return (
    <div className="hr-equipe-wrap">
      <div className="hr-equipe-toolbar">
        <div className="hr-equipe-filters">
          <button type="button" className={`hr-filter-btn${filter === "all" ? " is-active" : ""}`} onClick={() => setFilter("all")}>
            Tous <span>{members.length}</span>
          </button>
          <button type="button" className={`hr-filter-btn${filter === "animateur" ? " is-active" : ""}`} onClick={() => setFilter("animateur")}>
            Animateurs <span>{animCount}</span>
          </button>
          <button type="button" className={`hr-filter-btn${filter === "directeur" ? " is-active" : ""}`} onClick={() => setFilter("directeur")}>
            Direction <span>{dirCount}</span>
          </button>
        </div>
        <input
          type="search"
          className="hr-equipe-search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!filtered.length ? (
        <div className="hr-empty"><p>Aucun membre trouvé.</p></div>
      ) : (
        <div className="hr-equipe-grid">
          {filtered.map((m) => (
            <StaffCard key={m.id} member={m} contracts={contracts} onFiche={onFiche} onContract={onContract} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({ member: m, contracts, onFiche, onContract }) {
  const memberContracts = contracts.filter((c) => c.memberId === m.id);
  const [color, bg] = avatarColor(m.id);

  const firstContract = memberContracts[0];

  return (
    <div className="hr-staff-card">
      <div className="hr-staff-card-top" style={{ background: bg, borderBottom: `2px solid ${color}20` }}>
        <Avatar member={m} size={64} />
        <div className="hr-staff-card-identity">
          <div className="hr-staff-card-name">{m.firstName} {m.lastName}</div>
          {m.staffType && (
            <span className="hr-staff-type-badge"
              style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
              {TYPE_LABEL[m.staffType] || m.staffType}
            </span>
          )}
        </div>
      </div>

      <div className="hr-staff-card-body">
        {m.phone && (
          <div className="hr-staff-row">
            <span className="hr-staff-icon">📞</span>
            <a href={`tel:${m.phone}`} className="hr-staff-link">{m.phone}</a>
          </div>
        )}
        {m.email && (
          <div className="hr-staff-row">
            <span className="hr-staff-icon">✉</span>
            <a href={`mailto:${m.email}`} className="hr-staff-link">{m.email}</a>
          </div>
        )}
        {m.dateOfBirth && (
          <div className="hr-staff-row">
            <span className="hr-staff-icon">🎂</span>
            <span>{m.dateOfBirth}{m.birthPlace ? ` — ${m.birthPlace}` : ""}</span>
          </div>
        )}
        {m.address && (
          <div className="hr-staff-row">
            <span className="hr-staff-icon">📍</span>
            <span>{m.address}</span>
          </div>
        )}
        {memberContracts.length > 0 && (
          <div className="hr-staff-contracts-summary">
            <span className="hr-staff-contracts-count">{memberContracts.length} contrat{memberContracts.length > 1 ? "s" : ""}</span>
            {" · "}{[...new Set(memberContracts.map((c) => c.week))].join(", ")}
          </div>
        )}
      </div>

      <div className="hr-staff-card-footer">
        <button type="button" className="hr-card-btn" onClick={() => onFiche(m)}>
          Voir la fiche
        </button>
        {firstContract && (
          <button type="button" className="hr-card-btn is-secondary" onClick={() => onContract(m, firstContract)}>
            Contrat
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Vue "Contrats" ───────────────────────────────────────────────────────────

function ContratsView({ contracts, members, onContract }) {
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const columns = [
    {
      key: "memberName", label: "Animateur",
      render: (row) => {
        const m = memberById[row.memberId];
        return (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {m && <Avatar member={m} size={28} />}
            {row.memberName}
          </span>
        );
      },
    },
    { key: "week", label: "Semaine", filterable: true, filterLabel: "Toutes les semaines" },
    { key: "stay", label: "Séjour",  filterable: true, filterLabel: "Tous les séjours" },
    { key: "role", label: "Poste",   filterable: true, filterLabel: "Tous les postes" },
    { key: "datesLabel", label: "Dates", sortValue: (r) => r.startDate },
    { key: "grossSalary", label: "Brut", render: (r) => currency(r.grossSalary), sortValue: (r) => r.grossSalary },
    { key: "paidAmount",  label: "Réglé", render: (r) => <span className="hr-paid">{currency(r.paidAmount)}</span>, sortValue: (r) => r.paidAmount },
    { key: "outstandingAmount", label: "Reste",
      render: (r) => <span className={r.outstandingAmount ? "hr-due" : "hr-paid"}>{currency(r.outstandingAmount)}</span>,
      sortValue: (r) => r.outstandingAmount },
    {
      key: "status", label: "Paiement", filterable: true, filterLabel: "Tous",
      render: (r) => <Badge label={r.status} variant={r.status === "Payé" ? "success" : "warning"} />,
      sortValue: (r) => r.status,
    },
    {
      key: "_gen", label: "",
      render: (row) => {
        const m = memberById[row.memberId];
        return m ? (
          <button type="button" className="hr-btn-contract" onClick={() => onContract(m, row)}>
            Générer contrat
          </button>
        ) : null;
      },
    },
  ];

  const exportCsv = () => {
    const headers = ["Animateur", "Semaine", "Séjour", "Poste", "Début", "Fin", "Brut", "Réglé", "Reste", "Statut"];
    const lines = contracts.map((c) => [
      c.memberName, c.week, c.stay, c.role, c.startDate, c.endDate,
      c.grossSalary, c.paidAmount, c.outstandingAmount, c.status,
    ]);
    const csv = [headers, ...lines]
      .map((l) => l.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `contrats-rh-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="dash-btn" onClick={exportCsv} disabled={!contracts.length}>
          Exporter CSV
        </button>
      </div>
      <DataTable
        columns={columns}
        data={contracts}
        searchableKeys={["memberName", "week", "stay", "role"]}
        defaultSortKey="week"
        emptyLabel="Aucun contrat enregistré."
        toolsInline
      />
    </div>
  );
}

// ─── Fiche animateur (modal) ──────────────────────────────────────────────────

const EDIT_FIELDS = [
  { key: "firstName",            label: "Prénom" },
  { key: "lastName",             label: "Nom" },
  { key: "email",                label: "E-mail",           type: "email" },
  { key: "phone",                label: "Téléphone",        type: "tel" },
  { key: "dateOfBirth",          label: "Date de naissance (JJ/MM/AAAA)" },
  { key: "birthPlace",           label: "Lieu de naissance" },
  { key: "socialSecurityNumber", label: "N° Sécurité sociale" },
  { key: "address",              label: "Adresse / Ville" },
  { key: "nationality",          label: "Nationalité" },
];

function FicheModal({ member: initial, contracts, onClose, onUpdate }) {
  const [member, setMember]   = useState(initial);
  const [editMode, setEdit]   = useState(false);
  const [form, setForm]       = useState({ ...initial });
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("info"); // info | docs
  const [uploading, setUpl]   = useState(false);
  const photoInputRef         = useRef(null);
  const docInputRef           = useRef(null);

  const memberContracts = contracts.filter((c) => c.memberId === member.id);

  // ── Sauvegarde des infos ──
  const saveInfo = async () => {
    setSaving(true);
    try {
      const updateData = {};
      for (const { key } of EDIT_FIELDS) updateData[key] = form[key] || "";
      updateData.staffType = form.staffType || "";
      updateData.name = `${form.firstName || ""} ${form.lastName || ""}`.trim();
      await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, member.id), updateData);
      const updated = { ...member, ...updateData };
      setMember(updated);
      onUpdate(updated);
      setEdit(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Upload photo ──
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpl(true);
    try {
      const storageRef = ref(storage, `staff-photos/${member.id}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, member.id), { photoUrl: url });
      const updated = { ...member, photoUrl: url };
      setMember(updated);
      setForm((p) => ({ ...p, photoUrl: url }));
      onUpdate(updated);
    } finally {
      setUpl(false);
    }
  };

  // ── Upload document ──
  const handleDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpl(true);
    try {
      const storageRef = ref(storage, `staff-docs/${member.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const docEntry = { name: file.name, url, uploadedAt: new Date().toISOString() };
      await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, member.id), { documents: arrayUnion(docEntry) });
      const updated = { ...member, documents: [...(member.documents || []), docEntry] };
      setMember(updated);
      onUpdate(updated);
    } finally {
      setUpl(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const [typeColor] = [TYPE_COLOR[member.staffType] || "#7c3aed"];
  const [, typeBg]  = [TYPE_BG[member.staffType]   || "#f5f0ff"];

  return (
    <div className="hr-overlay" onClick={onClose}>
      <div className="hr-fiche-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── En-tête ── */}
        <div className="hr-fiche-header" style={{ background: `linear-gradient(135deg, ${TYPE_BG[member.staffType] || "#f5f0ff"} 0%, #fff 100%)` }}>
          <div className="hr-fiche-avatar-wrap">
            <Avatar member={member} size={64} />
            <button
              type="button"
              className="hr-photo-change"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              title="Changer la photo"
            >
              {uploading ? "…" : "📷"}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>

          <div className="hr-fiche-identity">
            <div className="hr-fiche-name">{member.firstName} {member.lastName}</div>
            {member.staffType && (
              <span className="hr-staff-type-badge"
                style={{ background: `${TYPE_COLOR[member.staffType]}18`, color: TYPE_COLOR[member.staffType], border: `1px solid ${TYPE_COLOR[member.staffType]}30` }}>
                {TYPE_LABEL[member.staffType]}
              </span>
            )}
            {memberContracts.length > 0 && (
              <div className="hr-fiche-contracts-meta">
                {memberContracts.length} contrat{memberContracts.length > 1 ? "s" : ""} · {[...new Set(memberContracts.map((c) => c.week))].join(", ")}
              </div>
            )}
          </div>

          <button type="button" className="hr-fiche-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Tabs ── */}
        <div className="hr-fiche-tabs">
          <button type="button" className={tab === "info" ? "is-active" : ""} onClick={() => setTab("info")}>
            Informations
          </button>
          <button type="button" className={tab === "docs" ? "is-active" : ""} onClick={() => setTab("docs")}>
            Documents <span>{member.documents?.length || 0}</span>
          </button>
          {memberContracts.length > 0 && (
            <button type="button" className={tab === "contracts" ? "is-active" : ""} onClick={() => setTab("contracts")}>
              Contrats <span>{memberContracts.length}</span>
            </button>
          )}
        </div>

        {/* ── Contenu ── */}
        <div className="hr-fiche-body">

          {/* INFO */}
          {tab === "info" && (
            <>
              {!editMode ? (
                <>
                  <div className="hr-info-grid">
                    <InfoField label="Téléphone"         value={member.phone}   href={`tel:${member.phone}`} />
                    <InfoField label="E-mail"            value={member.email}   href={`mailto:${member.email}`} />
                    <InfoField label="Adresse"           value={member.address} />
                    <InfoField
                      label="Date & lieu de naissance"
                      value={[member.dateOfBirth, member.birthPlace].filter(Boolean).join(" — ")}
                    />
                    <InfoField label="N° Sécurité sociale" value={member.socialSecurityNumber} sensitive />
                    <InfoField label="Nationalité"       value={member.nationality} />
                  </div>
                  <button type="button" className="hr-edit-trigger" onClick={() => { setForm({ ...member }); setEdit(true); }}>
                    Modifier les informations
                  </button>
                </>
              ) : (
                <div className="hr-edit-form">
                  {EDIT_FIELDS.map(({ key, label, type }) => (
                    <label key={key} className="hr-edit-label">
                      <span>{label}</span>
                      <input
                        type={type || "text"}
                        value={form[key] || ""}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <label className="hr-edit-label">
                    <span>Rôle</span>
                    <select value={form.staffType || ""} onChange={(e) => setForm((p) => ({ ...p, staffType: e.target.value }))}>
                      <option value="">— Choisir —</option>
                      <option value="animateur">Animateur</option>
                      <option value="directeur">Directeur</option>
                    </select>
                  </label>
                  <div className="hr-edit-actions">
                    <button type="button" className="hr-btn-cancel" onClick={() => setEdit(false)} disabled={saving}>Annuler</button>
                    <button type="button" className="hr-btn-save"   onClick={saveInfo}          disabled={saving}>
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* DOCUMENTS */}
          {tab === "docs" && (
            <div className="hr-docs-section">
              <div className="hr-docs-upload">
                <button
                  type="button"
                  className="hr-upload-btn"
                  onClick={() => docInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Envoi en cours…" : "+ Ajouter un document"}
                </button>
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleDoc} />
                <span className="hr-docs-hint">PDF, Word ou image — fiche sanitaire, diplôme, BAFA, etc.</span>
              </div>
              {!member.documents?.length ? (
                <p className="hr-docs-empty">Aucun document enregistré.</p>
              ) : (
                <div className="hr-docs-list">
                  {member.documents.map((doc, i) => (
                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="hr-doc-item">
                      <span className="hr-doc-icon">📄</span>
                      <div>
                        <div className="hr-doc-name">{doc.name}</div>
                        {doc.uploadedAt && (
                          <div className="hr-doc-date">
                            {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
                          </div>
                        )}
                      </div>
                      <span className="hr-doc-open">Ouvrir →</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONTRATS */}
          {tab === "contracts" && (
            <div className="hr-fiche-contracts-list">
              {memberContracts.map((c) => (
                <div key={c.id} className="hr-fiche-contract-card">
                  <div className="hr-fiche-contract-head">
                    <div>
                      <strong>{c.role}</strong>
                      <span className="hr-fiche-contract-meta"> · {c.stay} · {c.week}</span>
                    </div>
                    <Badge label={c.status} variant={c.status === "Payé" ? "success" : "warning"} />
                  </div>
                  <div className="hr-fiche-contract-dates">{c.datesLabel}</div>
                  <div className="hr-fiche-contract-salary">
                    <span>{currency(c.grossSalary)} brut</span>
                    <span className="hr-paid">{currency(c.paidAmount)} réglé</span>
                    {c.outstandingAmount > 0 && <span className="hr-due">{currency(c.outstandingAmount)} restant</span>}
                  </div>
                  <button
                    type="button"
                    className="hr-btn-contract"
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                    onClick={() => openContractPrint(member, c)}
                  >
                    Générer le contrat CEE
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value, href, sensitive }) {
  if (!value) return null;
  return (
    <div className={`hr-info-field${sensitive ? " is-sensitive" : ""}`}>
      <span className="hr-info-label">{label}</span>
      {href
        ? <a href={href} className="hr-info-value hr-info-link">{value}</a>
        : <span className="hr-info-value">{value}</span>
      }
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function HumanResources() {
  const [members,   setMembers]   = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState("sejours");
  const [fiche,     setFiche]     = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [mSnap, cSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        ]);
        setMembers(mSnap.docs.map(mapMember).sort((a, b) => a.name.localeCompare(b.name, "fr")));
        setContracts(cSnap.docs.map(mapContract));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const updateMember = (updated) => {
    setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m));
    setFiche((prev) => prev?.id === updated.id ? updated : prev);
  };

  const handleContract = (member, contract) => {
    openContractPrint(member, contract);
  };

  const animCount = members.filter((m) => m.staffType !== "directeur").length;
  const dirCount  = members.filter((m) => m.staffType === "directeur").length;

  const TABS = [
    { key: "sejours",  label: "Par séjour",  count: contracts.length > 0 ? [...new Set(contracts.map((c) => `${c.stayCode}${c.week}`))].length : null },
    { key: "equipe",   label: "Équipe",       count: members.length },
    { key: "contrats", label: "Contrats",     count: contracts.length },
  ];

  return (
    <div className="dash-page hr-page">

      {/* ── En-tête ── */}
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Ressources humaines</h1>
          <p>{animCount} animateur{animCount !== 1 ? "s" : ""} · {dirCount} direction · {contracts.length} contrat{contracts.length !== 1 ? "s" : ""}</p>
        </div>
      </header>

      {/* ── Navigation principale ── */}
      <nav className="hr-main-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`hr-main-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count != null && <span className="hr-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      {loading ? (
        <section className="dash-section">
          <p className="dash-muted">Chargement des données RH…</p>
        </section>
      ) : (
        <div className="hr-content">
          {tab === "sejours"  && <SejoursView  members={members} contracts={contracts} onFiche={setFiche} onContract={handleContract} />}
          {tab === "equipe"   && <EquipeView   members={members} contracts={contracts} onFiche={setFiche} onContract={handleContract} />}
          {tab === "contrats" && <ContratsView contracts={contracts} members={members} onContract={handleContract} />}
        </div>
      )}

      {/* ── Fiche modale ── */}
      {fiche && (
        <FicheModal
          member={fiche}
          contracts={contracts}
          onClose={() => setFiche(null)}
          onUpdate={updateMember}
        />
      )}
    </div>
  );
}
