"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDocs, updateDoc, arrayUnion, addDoc, setDoc, deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import Modal from "@/src/components/dashboard/ui/Modal";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { openContractPrint } from "@/src/lib/contractTemplate";
import { useToast } from "@/src/contexts/ToastContext";
import { DEFAULT_SALARY_GRID, REFERENCE_DAYS, computeSalary, ensureSalaryGridSeeded } from "@/src/lib/salaryGrid";

// ─── Constantes ──────────────────────────────────────────────────────────────

const WEEK_ORDER = ["S1", "S2", "S3", "S4"];

// Séjours 2026 — liste fermée pour éviter les doublons dus à des variantes tapées à la main
// (ex. "mcsc" vs "MCSC") qui casseraient le regroupement "Par séjour".
const STAYS = [
  { code: "MCSC", name: "My Creative Surf Camp" },
  { code: "EVCC", name: "Eaux Vives Creative Camp" },
];

// Dates de référence des séjours d'été 2026 (pré-remplissage, modifiable dans le formulaire).
const WEEK_DATES = {
  S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
  S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
  S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
  S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
};

function nbDaysBetween(start, end) {
  if (!start || !end) return REFERENCE_DAYS;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (isNaN(a) || isNaN(b)) return REFERENCE_DAYS;
  return Math.max(Math.round((b - a) / 86400000) + 1, 1);
}

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
  const net     = amount(d.netSalary);
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
    roleKey:  d.roleKey   || "",
    primeCount: Math.max(Number(d.primeCount) || 0, 0),
    startDate: d.startDate || "",
    endDate:   d.endDate   || "",
    datesLabel: d.startDate && d.endDate
      ? `${fmtDate(d.startDate)} – ${fmtDate(d.endDate)}`
      : "Dates à compléter",
    netSalary:   net,
    grossSalary: gross,
    paidAmount:  paid,
    outstandingAmount: outstanding,
    status: gross > 0 && paid >= gross ? "Payé" : "À régler",
    contractFileUrl: d.contractFileUrl || "",
  };
}

function mapGridRow(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    label: d.label || "",
    perDay: amount(d.perDay),
    perStayNet: amount(d.perStayNet),
    perStayGross: amount(d.perStayGross),
    order: Number.isFinite(Number(d.order)) ? Number(d.order) : 0,
    isPrime: !!d.isPrime,
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

function SejoursView({ members, contracts, onFiche, onContract, onEditContract }) {
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
                    return <MiniCard key={m.id} member={m} contract={c} onFiche={onFiche} onContract={onContract} onEditContract={onEditContract} />;
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
                    return <MiniCard key={m.id} member={m} contract={c} onFiche={onFiche} onContract={onContract} onEditContract={onEditContract} />;
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

function MiniCard({ member, contract, onFiche, onContract, onEditContract }) {
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
          <>
            <button type="button" className="hr-btn-sm is-contract" onClick={() => onContract(member, contract)}>
              Contrat
            </button>
            <button type="button" className="hr-btn-sm" onClick={() => onEditContract(member, contract)}>
              Modifier
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Vue "Équipe" ─────────────────────────────────────────────────────────────

function EquipeView({ members, contracts, onFiche, onContract, onEditContract }) {
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
            <StaffCard key={m.id} member={m} contracts={contracts} onFiche={onFiche} onContract={onContract} onEditContract={onEditContract} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({ member: m, contracts, onFiche, onContract, onEditContract }) {
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
          <>
            <button type="button" className="hr-card-btn is-secondary" onClick={() => onContract(m, firstContract)}>
              Contrat
            </button>
            <button type="button" className="hr-card-btn is-secondary" onClick={() => onEditContract(m, firstContract)}>
              Modifier
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Vue "Contrats" ───────────────────────────────────────────────────────────

function ContratsView({ contracts, members, onContract, onEditContract, onNewContract }) {
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
    { key: "netSalary", label: "Net", render: (r) => currency(r.netSalary), sortValue: (r) => r.netSalary },
    { key: "grossSalary", label: "Brut", render: (r) => currency(r.grossSalary), sortValue: (r) => r.grossSalary },
    { key: "primeCount", label: "Primes", render: (r) => r.primeCount || 0, sortValue: (r) => r.primeCount },
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
      key: "_actions", label: "",
      render: (row) => {
        const m = memberById[row.memberId];
        return (
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="hr-btn-contract" onClick={() => onEditContract(m, row)}>
              Modifier
            </button>
            {m && (
              <button type="button" className="hr-btn-contract" onClick={() => onContract(m, row)}>
                Générer contrat
              </button>
            )}
          </span>
        );
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <button type="button" className="dash-btn" onClick={exportCsv} disabled={!contracts.length}>
          Exporter CSV
        </button>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onNewContract}>
          + Nouveau contrat
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

function FicheModal({ member: initial, contracts, onClose, onUpdate, onEditContract }) {
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
                    <span>{currency(c.netSalary)} net</span>
                    <span>{currency(c.grossSalary)} brut</span>
                    <span className="hr-paid">{currency(c.paidAmount)} réglé</span>
                    {c.outstandingAmount > 0 && <span className="hr-due">{currency(c.outstandingAmount)} restant</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="hr-btn-contract"
                      onClick={() => openContractPrint(member, c)}
                    >
                      Générer le contrat CEE
                    </button>
                    <button
                      type="button"
                      className="hr-btn-contract"
                      onClick={() => onEditContract(member, c)}
                    >
                      Modifier le contrat
                    </button>
                  </div>
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
  const isEmpty = !value;
  return (
    <div className={`hr-info-field${sensitive && !isEmpty ? " is-sensitive" : ""}${isEmpty ? " is-empty" : ""}`}>
      <span className="hr-info-label">{label}</span>
      {isEmpty
        ? <span className="hr-info-value">Non renseigné</span>
        : href
          ? <a href={href} className="hr-info-value hr-info-link">{value}</a>
          : <span className="hr-info-value">{value}</span>
      }
    </div>
  );
}

// ─── Modale : créer / modifier un contrat ─────────────────────────────────────

function emptyContractForm(member, contract) {
  const week = contract?.week && WEEK_ORDER.includes(contract.week) ? contract.week : "S1";
  const defaults = WEEK_DATES[week] || {};
  const matchedStay = STAYS.find((s) => s.code.toLowerCase() === String(contract?.stayCode || "").toLowerCase());
  return {
    memberId: member?.id || contract?.memberId || "",
    newFirstName: "",
    newLastName: "",
    stayCode: matchedStay?.code || STAYS[0].code,
    week,
    startDate: contract?.startDate || defaults.startDate || "",
    endDate:   contract?.endDate   || defaults.endDate   || "",
    roleKey: contract?.roleKey || "",
    primeCount: contract?.primeCount || 0,
    netSalary: contract?.netSalary || 0,
    grossSalary: contract?.grossSalary || 0,
    paidAmount: contract?.paidAmount || 0,
  };
}

function ContractFormModal({ isOpen, member, contract, members, gridRows, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEdit = !!contract;
  const posteRows = useMemo(() => gridRows.filter((r) => !r.isPrime).sort((a, b) => a.order - b.order), [gridRows]);
  const primeUnit = useMemo(() => gridRows.find((r) => r.isPrime), [gridRows]);

  const [addingMember, setAddingMember] = useState(!member && !isEdit);
  const [form, setForm] = useState(() => emptyContractForm(member, contract));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyContractForm(member, contract));
    setAddingMember(!member && !isEdit);
  }, [isOpen, member, contract, isEdit]);

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const recalculate = () => {
    const gridRow = posteRows.find((r) => r.id === form.roleKey);
    const nbDays = nbDaysBetween(form.startDate, form.endDate);
    const { net, gross } = computeSalary({ gridRow, primeUnit, primeCount: form.primeCount, nbDays });
    setForm((p) => ({ ...p, netSalary: net, grossSalary: gross }));
  };

  const handleWeekChange = (week) => {
    const d = WEEK_DATES[week] || {};
    setForm((p) => ({ ...p, week, startDate: d.startDate || p.startDate, endDate: d.endDate || p.endDate }));
  };

  const save = async () => {
    const gridRow = posteRows.find((r) => r.id === form.roleKey);
    if (!gridRow) { showToast("Choisissez un poste.", "error"); return; }
    if (addingMember && !form.newFirstName.trim() && !form.newLastName.trim()) {
      showToast("Renseignez le nom du nouveau membre.", "error");
      return;
    }
    if (!addingMember && !form.memberId) { showToast("Choisissez un membre.", "error"); return; }
    const stay = STAYS.find((s) => s.code === form.stayCode);
    if (!stay) { showToast("Choisissez un séjour.", "error"); return; }

    setSaving(true);
    try {
      let memberId = form.memberId;
      let memberName;
      let createdMember = null;

      if (addingMember) {
        const newMemberData = {
          firstName: form.newFirstName.trim(),
          lastName:  form.newLastName.trim(),
          name: `${form.newFirstName.trim()} ${form.newLastName.trim()}`.trim(),
          email: "", phone: "", staffType: "", active: true,
        };
        const memberRef = await addDoc(collection(db, COLLECTIONS.STAFF_MEMBERS), newMemberData);
        memberId = memberRef.id;
        memberName = newMemberData.name;
        createdMember = { id: memberRef.id, ...newMemberData, dateOfBirth: "", birthPlace: "", socialSecurityNumber: "", address: "", photoUrl: "", documents: [] };
      } else {
        const m = members.find((mm) => mm.id === memberId);
        memberName = m ? `${m.firstName} ${m.lastName}`.trim() : "Animateur non renseigné";
      }

      const outstandingAmount = Math.max(amount(form.grossSalary) - amount(form.paidAmount), 0);
      const payload = {
        memberId,
        memberName,
        stayName: stay.name,
        stayCode: stay.code,
        week: form.week,
        role: gridRow.label,
        roleKey: gridRow.id,
        startDate: form.startDate,
        endDate: form.endDate,
        primeCount: Math.max(Number(form.primeCount) || 0, 0),
        netSalary: amount(form.netSalary),
        grossSalary: amount(form.grossSalary),
        paidAmount: amount(form.paidAmount),
        outstandingAmount,
      };

      if (isEdit) {
        await updateDoc(doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id), payload);
      } else {
        await addDoc(collection(db, COLLECTIONS.STAFF_CONTRACTS), payload);
      }

      showToast(isEdit ? "Contrat mis à jour." : "Contrat créé.", "success");
      onSaved({ id: contract?.id, ...payload }, createdMember);
      onClose();
    } catch (err) {
      showToast(`Erreur : ${err.message || err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Modifier le contrat" : "Nouveau contrat"} size="md">
      <div className="hr-edit-form">

        {!isEdit && (
          <>
            {!addingMember ? (
              <label className="hr-edit-label">
                <span>Membre</span>
                <select value={form.memberId} onChange={(e) => set("memberId", e.target.value)}>
                  <option value="">— Choisir —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="hr-form-new-member">
                <div className="hr-form-row">
                  <label className="hr-edit-label">
                    <span>Prénom</span>
                    <input value={form.newFirstName} onChange={(e) => set("newFirstName", e.target.value)} />
                  </label>
                  <label className="hr-edit-label">
                    <span>Nom</span>
                    <input value={form.newLastName} onChange={(e) => set("newLastName", e.target.value)} />
                  </label>
                </div>
              </div>
            )}
            <button type="button" className="hr-form-link-btn" onClick={() => setAddingMember((v) => !v)}>
              {addingMember ? "← Choisir un membre existant" : "+ Nouveau membre"}
            </button>
          </>
        )}

        <div className="hr-form-row">
          <label className="hr-edit-label">
            <span>Séjour</span>
            <select value={form.stayCode} onChange={(e) => set("stayCode", e.target.value)}>
              {STAYS.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </label>
        </div>

        <div className="hr-form-row">
          <label className="hr-edit-label">
            <span>Semaine</span>
            <select value={form.week} onChange={(e) => handleWeekChange(e.target.value)}>
              {WEEK_ORDER.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="hr-edit-label">
            <span>Début</span>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </label>
          <label className="hr-edit-label">
            <span>Fin</span>
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </label>
        </div>

        <div className="hr-form-row">
          <label className="hr-edit-label">
            <span>Poste</span>
            <select value={form.roleKey} onChange={(e) => set("roleKey", e.target.value)}>
              <option value="">— Choisir —</option>
              {posteRows.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label className="hr-edit-label">
            <span>Primes d'ancienneté</span>
            <input type="number" min="0" value={form.primeCount} onChange={(e) => set("primeCount", e.target.value)} />
          </label>
        </div>

        <div className="hr-salary-preview">
          <div className="hr-salary-preview-item">
            <span>Net</span>
            <strong>{currency(form.netSalary)}</strong>
          </div>
          <div className="hr-salary-preview-item">
            <span>Brut</span>
            <strong>{currency(form.grossSalary)}</strong>
          </div>
        </div>
        <button type="button" className="hr-recalc-btn" onClick={recalculate}>
          ↻ Recalculer depuis la grille salariale
        </button>

        <div className="hr-form-row">
          <label className="hr-edit-label">
            <span>Net (modifiable)</span>
            <input type="number" step="0.01" value={form.netSalary} onChange={(e) => set("netSalary", e.target.value)} />
          </label>
          <label className="hr-edit-label">
            <span>Brut (modifiable)</span>
            <input type="number" step="0.01" value={form.grossSalary} onChange={(e) => set("grossSalary", e.target.value)} />
          </label>
          <label className="hr-edit-label">
            <span>Montant réglé</span>
            <input type="number" step="0.01" value={form.paidAmount} onChange={(e) => set("paidAmount", e.target.value)} />
          </label>
        </div>

        <div className="hr-edit-actions">
          <button type="button" className="hr-btn-cancel" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="button" className="hr-btn-save" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le contrat"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modale : grille salariale (types de poste) ───────────────────────────────

function SalaryGridModal({ isOpen, gridRows, onClose, onChange }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(gridRows);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (isOpen) setRows(gridRows); }, [isOpen, gridRows]);

  const updateRow = (id, key, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addRow = () => {
    const id = `poste-${Date.now()}`;
    setRows((prev) => [...prev, { id, label: "Nouveau poste", perDay: 0, perStayNet: 0, perStayGross: 0, order: prev.length + 1, isPrime: false }]);
  };

  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      const currentIds = new Set(rows.map((r) => r.id));
      const removedIds = gridRows.filter((r) => !currentIds.has(r.id)).map((r) => r.id);
      await Promise.all([
        ...rows.map((r) => {
          const { id, ...data } = r;
          return setDoc(doc(db, COLLECTIONS.SALARY_GRID, id), {
            ...data,
            perDay: amount(data.perDay),
            perStayNet: amount(data.perStayNet),
            perStayGross: amount(data.perStayGross),
          });
        }),
        ...removedIds.map((id) => deleteDoc(doc(db, COLLECTIONS.SALARY_GRID, id))),
      ]);
      onChange(rows);
      showToast("Grille salariale mise à jour.", "success");
      onClose();
    } catch (err) {
      showToast(`Erreur : ${err.message || err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const postes = rows.filter((r) => !r.isPrime);
  const primes = rows.filter((r) => r.isPrime);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Grille salariale" size="lg">
      <div className="hr-grid-table">
        <div className="hr-grid-head">
          <span>Poste</span><span>Par jour</span><span>Net / séjour</span><span>Brut / séjour</span><span />
        </div>
        {postes.map((r) => (
          <div key={r.id} className="hr-grid-row">
            <input value={r.label} onChange={(e) => updateRow(r.id, "label", e.target.value)} />
            <input type="number" step="0.01" value={r.perDay} onChange={(e) => updateRow(r.id, "perDay", e.target.value)} />
            <input type="number" step="0.01" value={r.perStayNet} onChange={(e) => updateRow(r.id, "perStayNet", e.target.value)} />
            <input type="number" step="0.01" value={r.perStayGross} onChange={(e) => updateRow(r.id, "perStayGross", e.target.value)} />
            <button type="button" className="hr-grid-delete" onClick={() => removeRow(r.id)}>✕</button>
          </div>
        ))}
        <button type="button" className="hr-grid-add-btn" onClick={addRow}>+ Ajouter un poste</button>

        <div className="hr-grid-head" style={{ marginTop: 12 }}>
          <span>Prime</span><span>Par jour</span><span>Net / unité</span><span>Brut / unité</span><span />
        </div>
        {primes.map((r) => (
          <div key={r.id} className="hr-grid-row">
            <input value={r.label} onChange={(e) => updateRow(r.id, "label", e.target.value)} />
            <input type="number" step="0.01" value={r.perDay} onChange={(e) => updateRow(r.id, "perDay", e.target.value)} />
            <input type="number" step="0.01" value={r.perStayNet} onChange={(e) => updateRow(r.id, "perStayNet", e.target.value)} />
            <input type="number" step="0.01" value={r.perStayGross} onChange={(e) => updateRow(r.id, "perStayGross", e.target.value)} />
            <span />
          </div>
        ))}
      </div>

      <div className="hr-edit-actions" style={{ marginTop: 16 }}>
        <button type="button" className="hr-btn-cancel" onClick={onClose} disabled={saving}>Annuler</button>
        <button type="button" className="hr-btn-save" onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer la grille"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function HumanResources() {
  const [members,   setMembers]   = useState([]);
  const [contracts, setContracts] = useState([]);
  const [gridRows,  setGridRows]  = useState(DEFAULT_SALARY_GRID);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState("sejours");
  const [fiche,     setFiche]     = useState(null);
  const [contractModal, setContractModal] = useState({ isOpen: false, member: null, contract: null });
  const [gridModalOpen, setGridModalOpen]  = useState(false);

  useEffect(() => {
    async function load() {
      try {
        await ensureSalaryGridSeeded(db);
        const [mSnap, cSnap, gSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
          getDocs(collection(db, COLLECTIONS.SALARY_GRID)),
        ]);
        setMembers(mSnap.docs.map(mapMember).sort((a, b) => a.name.localeCompare(b.name, "fr")));
        setContracts(cSnap.docs.map(mapContract));
        setGridRows(gSnap.docs.map(mapGridRow));
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

  const openNewContract = (member = null) => setContractModal({ isOpen: true, member, contract: null });
  const openEditContract = (member, contract) => setContractModal({ isOpen: true, member: member || null, contract });
  const closeContractModal = () => setContractModal({ isOpen: false, member: null, contract: null });

  const handleContractSaved = (savedContract, createdMember) => {
    if (createdMember) {
      setMembers((prev) => [...prev, createdMember].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    }
    setContracts((prev) => {
      const exists = prev.some((c) => c.id === savedContract.id);
      const next = exists
        ? prev.map((c) => (c.id === savedContract.id ? { ...c, ...savedContract } : c))
        : [...prev, { ...savedContract, id: savedContract.id || `${Date.now()}` }];
      return next;
    });
  };

  const handleGridChange = (rows) => setGridRows(rows);

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
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={() => setGridModalOpen(true)}>
            Grille salariale
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => openNewContract(null)}>
            + Nouveau contrat
          </button>
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
          {tab === "sejours"  && <SejoursView  members={members} contracts={contracts} onFiche={setFiche} onContract={handleContract} onEditContract={openEditContract} />}
          {tab === "equipe"   && <EquipeView   members={members} contracts={contracts} onFiche={setFiche} onContract={handleContract} onEditContract={openEditContract} />}
          {tab === "contrats" && <ContratsView contracts={contracts} members={members} onContract={handleContract} onEditContract={openEditContract} onNewContract={() => openNewContract(null)} />}
        </div>
      )}

      {/* ── Fiche modale ── */}
      {fiche && (
        <FicheModal
          member={fiche}
          contracts={contracts}
          onClose={() => setFiche(null)}
          onUpdate={updateMember}
          onEditContract={openEditContract}
        />
      )}

      {/* ── Contrat : création / édition ── */}
      <ContractFormModal
        isOpen={contractModal.isOpen}
        member={contractModal.member}
        contract={contractModal.contract}
        members={members}
        gridRows={gridRows}
        onClose={closeContractModal}
        onSaved={handleContractSaved}
      />

      {/* ── Grille salariale ── */}
      <SalaryGridModal
        isOpen={gridModalOpen}
        gridRows={gridRows}
        onClose={() => setGridModalOpen(false)}
        onChange={handleGridChange}
      />
    </div>
  );
}
