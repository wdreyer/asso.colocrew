"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDocs, updateDoc, arrayUnion, arrayRemove, addDoc, setDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import Link from "next/link";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Badge from "@/src/components/dashboard/ui/Badge";
import Modal from "@/src/components/dashboard/ui/Modal";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { openContractPrint, openContractsBatchPrint } from "@/src/lib/contractTemplate";
import { useToast } from "@/src/contexts/ToastContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { DEFAULT_SALARY_GRID, REFERENCE_DAYS, computeSalary, ensureSalaryGridSeeded, splitPaidLeaveIncluded } from "@/src/lib/salaryGrid";
import StaffDocumentsPanel from "@/src/components/dashboard/StaffDocumentsPanel";
import { STAFF_DOCUMENT_TYPES, documentsByType, latestDocumentByType, uploadStaffDocument } from "@/src/lib/staffDocuments";
import { isArchivedRecord, seasonOfDate, seasonOfRecord, useSeasons } from "@/src/lib/seasons";
import { formatDateRange, useSessionCatalog } from "@/src/lib/sessions";
import {
  STAFF_ACCOUNT_ROLES,
  STAFF_ACCOUNT_STATUS,
  accountLinkedToMember,
  approveStaffAccount,
  approveStaffAccountWithNewMember,
  countPendingAccounts,
  mapStaffAccount,
  rankMemberCandidates,
  rejectStaffAccount,
  staffAccountName,
  unlinkStaffAccount,
} from "@/src/lib/staffAccounts";

// ─── Sessions ────────────────────────────────────────────────────────────────
//
// Un contrat = une personne × une session du catalogue (`sessionId`). Les contrats 2026 n'ont
// que `stayCode` + `week` : ils sont regroupés sur ces deux champs.

function contractSessionKey(contract) {
  return contract.sessionId || `legacy__${contract.stayCode || contract.stay}__${contract.week}`;
}

function contractShortLabel(contract) {
  return [contract.stayCode || contract.stay, contract.week].filter(Boolean).join(" ");
}

/** Lieu d'exercice d'un séjour, repris sur le contrat : "Dax, Landes" → "Dax". */
function sejourPlace(sejour) {
  const location = String(sejour?.location || sejour?.productionSnapshot?.plan?.location || "").trim();
  return location.split(",")[0].trim();
}

function nbDaysBetween(start, end) {
  if (!start || !end) return REFERENCE_DAYS;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (isNaN(a) || isNaN(b)) return REFERENCE_DAYS;
  return Math.max(Math.round((b - a) / 86400000) + 1, 1);
}

const TYPE_LABEL   = { animateur: "Animateur", directeur: "Directeur", benevole: "Benevole", "": "—" };
const TYPE_VARIANT = { animateur: "info", directeur: "primary", benevole: "success" };
const TYPE_COLOR   = { animateur: "#1d4ed8", directeur: "#7c3aed", benevole: "#047857" };
const TYPE_BG      = { animateur: "#eff6ff", directeur: "#f5f0ff", benevole: "#ecfdf5" };

const AVATAR_COLORS = [
  ["#1d4ed8","#eff6ff"], ["#7c3aed","#f5f0ff"], ["#0891b2","#ecfeff"],
  ["#059669","#ecfdf5"], ["#d97706","#fffbeb"], ["#db2777","#fdf2f8"],
];

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function amount(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function currency(v) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(amount(v));
}
function socialSalarySplit(total) {
  return splitPaidLeaveIncluded(amount(total));
}
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return v;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
function fmtDateShort(v) {
  if (!v) return "—";
  const raw = String(v).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, month, day] = raw.split("-");
    return `${day}/${month}`;
  }
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime())
    ? String(v).slice(0, 5)
    : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(parsed);
}
function compactRole(contract) {
  const key = String(contract?.roleKey || "").toLowerCase();
  if (key === "ds") return "Direction";
  if (key === "dsa") return "Adjoint·e";
  if (key === "as-sb") return "AS / SB";
  if (key === "bafa") return "BAFA";
  if (key === "stagiaire") return "Stagiaire";
  return contract?.role || "—";
}
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(m) {
  return [m.firstName?.[0], m.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

function SocialSalaryBreakdown({ grossSalary, netSalary, compact = false }) {
  const gross = socialSalarySplit(grossSalary);
  const net = socialSalarySplit(netSalary);
  if (gross.total <= 0 && net.total <= 0) return <span className="dash-muted">—</span>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.25 }}>
      <strong>{currency(gross.salary)} brut hors CP</strong>
      <small style={{ color: "#6b5a7c", fontWeight: 700 }}>{currency(gross.paidLeave)} CP 10%</small>
      {!compact && <small style={{ color: "#8a789d" }}>{currency(net.salary)} net hors CP · {currency(net.paidLeave)} CP</small>}
    </span>
  );
}

const PERSONAL_INFORMATION_RULES = [
  { key: "firstName", label: "prénom", valid: (value) => String(value || "").trim().length >= 2 },
  { key: "lastName", label: "nom", valid: (value) => String(value || "").trim().length >= 2 },
  { key: "email", label: "e-mail", valid: (value) => /^\S+@\S+\.\S+$/.test(String(value || "").trim()) },
  { key: "phone", label: "téléphone", valid: (value) => String(value || "").replace(/\D/g, "").length >= 8 },
  { key: "address", label: "adresse complète", valid: (value) => String(value || "").trim().length >= 8 },
  { key: "dateOfBirth", label: "date de naissance", valid: (value) => String(value || "").trim().length >= 8 },
  { key: "birthPlace", label: "lieu de naissance", valid: (value) => String(value || "").trim().length >= 2 },
  {
    key: "socialSecurityNumber",
    label: "n° de Sécurité sociale (15 chiffres)",
    valid: (value) => String(value || "").replace(/\D/g, "").length === 15,
  },
  { key: "nationality", label: "nationalité", valid: (value) => String(value || "").trim().length >= 2 },
];

function missingPersonalInformation(member) {
  return PERSONAL_INFORMATION_RULES.filter((rule) => !rule.valid(member?.[rule.key]));
}

function memberIdentityUpdateData(form) {
  const updateData = {};
  for (const { key } of EDIT_FIELDS) updateData[key] = String(form?.[key] || "").trim();
  updateData.staffType = form?.staffType || "";
  updateData.name = `${updateData.firstName || ""} ${updateData.lastName || ""}`.trim();
  return updateData;
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
    nationality: d.nationality || "",
    staffType: d.staffType || "",
    photoUrl:  d.photoUrl  || "",
    documents: d.documents || [],
    documentStatus: d.documentStatus || {},
    accountUid: d.accountUid || "",
    active:    d.active !== false,
  };
}

function mapContract(snap) {
  const d = snap.data() || {};
  const gross   = amount(d.grossSalary);
  const net     = amount(d.netSalary);
  const paid    = amount(d.paidAmount);
  const paymentValidated = d.paymentValidated === true || (d.paymentValidated == null && net > 0 && paid >= net);
  const outstanding = paymentValidated ? 0 : Math.max(net - paid, 0);
  return {
    id: snap.id,
    memberId:   d.memberId   || "",
    memberName: d.memberName || "Animateur non renseigné",
    season:   seasonOfRecord(d),
    archived: d.archived === true,
    sejourId: d.sejourId  || "",
    sessionId: d.sessionId || "",
    place:    d.place     || "",
    stay:     d.stayName  || d.stayCode || "Non renseigné",
    stayName: d.stayName  || "",
    stayCode: d.stayCode  || "",
    week:     d.week      || "Non renseignée",
    role:     d.role      || "Poste non renseigné",
    roleKey:  d.roleKey   || "",
    primeCount: Math.max(Number(d.primeCount) || 0, 0),
    convoyagePrime: d.convoyagePrime === true,
    convoyagePrimeNet: amount(d.convoyagePrimeNet),
    convoyagePrimeGross: amount(d.convoyagePrimeGross),
    primeUnitNet: Number(d.primeUnitNet) > 0 ? amount(d.primeUnitNet) : undefined,
    primeUnitGross: Number(d.primeUnitGross) > 0 ? amount(d.primeUnitGross) : undefined,
    startDate: d.startDate || "",
    endDate:   d.endDate   || "",
    datesLabel: d.startDate && d.endDate
      ? `${fmtDate(d.startDate)} – ${fmtDate(d.endDate)}`
      : "Dates à compléter",
    netSalary:   net,
    grossSalary: gross,
    paidAmount:  paid,
    outstandingAmount: outstanding,
    status: paymentValidated ? "Payé" : "À régler",
    paymentValidated,
    paymentValidatedAt: d.paymentValidatedAt || d.paidAt || "",
    ceaDeclarationValidated: d.ceaDeclarationValidated === true,
    ceaDeclarationValidatedAt: d.ceaDeclarationValidatedAt || "",
    socialSectionDone: d.socialSectionDone === true,
    socialSectionDoneAt: d.socialSectionDoneAt || "",
    contractFileUrl: d.contractFileUrl || "",
    signedContractStoragePath: d.signedContractStoragePath || "",
    docusignEnvelopeId: d.docusignEnvelopeId || "",
    docusignStatus: d.docusignStatus || "",
    docusignSentAt: d.docusignSentAt || "",
    docusignUpdatedAt: d.docusignUpdatedAt || "",
    docusignCompletedAt: d.docusignCompletedAt || "",
    docusignWaitingFor: d.docusignWaitingFor || "",
    docusignRecipientStatuses: d.docusignRecipientStatuses || [],
  };
}

function mapStaffDocument(snap) {
  const data = snap.data() || {};
  return { id: snap.id, ...data };
}

function structuredDocumentCompletion(memberId, documents) {
  const received = STAFF_DOCUMENT_TYPES.filter((type) => documentsByType(documents, memberId, type.key).length).length;
  const validated = STAFF_DOCUMENT_TYPES.filter((type) => {
    return documentsByType(documents, memberId, type.key).some((document) => document.status === "validated" && document.locked);
  }).length;
  return { received, validated };
}

function isDirectionContract(contract) {
  const roleKey = String(contract?.roleKey || "").trim().toLowerCase();
  if (roleKey === "ds" || roleKey === "dsa") return true;
  const role = String(contract?.role || "").trim().toLowerCase().replace(/\s+/g, "");
  return role === "ds" || role === "dsa";
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

function SejoursView({ members, contracts, sessions, season, onFiche, onContract, onEditContract, onBatchContracts, onNewContract }) {
  const groups = useMemo(() => {
    const map = new Map();
    // Toutes les sessions de la saison, même sans contrat, pour pouvoir y recruter.
    sessions.forEach((session) => {
      map.set(session.id, {
        key: session.id, sessionId: session.id, session,
        stay: session.sejourName, stayCode: session.sejourCode, week: session.week,
        startDate: session.startDate, endDate: session.endDate,
        contracts: [],
      });
    });
    contracts.forEach((c) => {
      const key = contractSessionKey(c);
      if (!map.has(key)) {
        map.set(key, {
          key, sessionId: c.sessionId, session: null,
          stay: c.stay, stayCode: c.stayCode, week: c.week,
          startDate: c.startDate, endDate: c.endDate,
          contracts: [],
        });
      }
      const g = map.get(key);
      if (!g.startDate && c.startDate) g.startDate = c.startDate;
      if (!g.endDate   && c.endDate)   g.endDate   = c.endDate;
      g.contracts.push(c);
    });
    return [...map.values()].sort((a, b) => (
      String(a.startDate || "9999").localeCompare(String(b.startDate || "9999"))
      || String(a.stay).localeCompare(String(b.stay), "fr")
    ));
  }, [contracts, sessions]);

  if (!groups.length) {
    return (
      <div className="hr-empty">
        <p>Aucune session pour la saison {season}. Ajoutez des dates aux séjours pour créer les sessions, puis les contrats.</p>
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
                {!g.sessionId && <Badge label="Ancien contrat" variant="neutral" />}
              </div>
              <div className="hr-sejour-dates">
                {g.startDate && g.endDate
                  ? `${fmtDate(g.startDate)} → ${fmtDate(g.endDate)}`
                  : "Dates à compléter"}
                <span className="hr-sejour-count">
                  {groupMembers.length} personne{groupMembers.length > 1 ? "s" : ""}
                  {g.session?.capacity ? ` · ${g.session.capacity} enfants max.` : ""}
                </span>
                {g.session && (
                  <button type="button" className="dash-btn" onClick={() => onNewContract(null, g.session)}>
                    + Contrat
                  </button>
                )}
                {g.sessionId && (
                  <Link className="dash-btn" href={`/dashboard/rh/deroules/${encodeURIComponent(g.sessionId)}`}>
                    Déroulés
                  </Link>
                )}
                <button type="button" className="dash-btn" onClick={() => onBatchContracts(g)} disabled={!groupMembers.length}>
                  PDF groupé recto-verso
                </button>
              </div>
            </div>

            {!groupMembers.length && (
              <p className="hr-sejour-empty">Aucun contrat sur cette session pour l’instant.</p>
            )}

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

function EquipeView({ members, contracts, documents, onFiche, onContract, onEditContract }) {
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
            <StaffCard key={m.id} member={m} contracts={contracts} documents={documents} onFiche={onFiche} onContract={onContract} onEditContract={onEditContract} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({ member: m, contracts, documents, onFiche, onContract, onEditContract }) {
  const memberContracts = contracts.filter((c) => c.memberId === m.id);
  const documentCompletion = structuredDocumentCompletion(m.id, documents);
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
        <div className={`hr-staff-doc-progress${documentCompletion.validated === STAFF_DOCUMENT_TYPES.length ? " is-complete" : ""}`}>
          Documents : {documentCompletion.validated}/{STAFF_DOCUMENT_TYPES.length} validés
          {documentCompletion.received > documentCompletion.validated ? ` · ${documentCompletion.received - documentCompletion.validated} à vérifier` : ""}
        </div>
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

const DOCUSIGN_STATUS = {
  created: { label: "Brouillon", variant: "neutral" },
  sent: { label: "En cours", variant: "warning" },
  delivered: { label: "Ouvert", variant: "info" },
  completed: { label: "Signé", variant: "success" },
  declined: { label: "Refusé", variant: "error" },
  voided: { label: "Annulé", variant: "error" },
};

function docusignWaitingLabel(value) {
  if (value === "staff") return "A eux de signer";
  if (value === "colocrew") return "A moi de signer";
  if (value === "completed") return "Tout signe";
  return "";
}

function docusignWaitingFromSigners(status, signers = []) {
  if (status === "completed") return "completed";
  const ordered = [...(signers || [])].sort((a, b) => Number(a.recipientId || 0) - Number(b.recipientId || 0));
  const staffSigner = ordered.find((signer) => String(signer.recipientId) === "1") || ordered[0];
  const organizerSigner = ordered.find((signer) => String(signer.recipientId) === "2") || ordered[1];
  if (staffSigner && staffSigner.status !== "completed") return "staff";
  if (organizerSigner && organizerSigner.status !== "completed") return "colocrew";
  return "";
}

function ContratsView({ contracts, members, onContract, onEditContract, onDeleteContract, onNewContract, onCompleteMember, onToggleCea, onToggleSocialSection, onTogglePayment, onDocusignSend, onDocusignAttach, onDocusignRefresh, onDocusignRefreshMany, onDocusignReset, docusignBusyId }) {
  const [visibleContracts, setVisibleContracts] = useState([]);
  const [sessionTile, setSessionTile] = useState("all");
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  // Une tuile par session de la saison (dans l'ordre des dates), pour filtrer le tableau.
  const sessionTiles = useMemo(() => {
    const tiles = new Map();
    contracts.forEach((contract) => {
      const key = contractSessionKey(contract);
      if (!tiles.has(key)) tiles.set(key, { key, label: contractShortLabel(contract) || "Sans séjour", startDate: contract.startDate || "", count: 0 });
      const tile = tiles.get(key);
      tile.count += 1;
      if (contract.startDate && (!tile.startDate || contract.startDate < tile.startDate)) tile.startDate = contract.startDate;
    });
    return [...tiles.values()].sort((a, b) => String(a.startDate || "9999").localeCompare(String(b.startDate || "9999")) || a.label.localeCompare(b.label, "fr"));
  }, [contracts]);
  const tableContracts = useMemo(() => contracts.filter((contract) => sessionTile === "all" || contractSessionKey(contract) === sessionTile).map((contract) => ({
    ...contract,
    ceaStatus: contract.ceaDeclarationValidated ? "CEA fait" : "CEA à faire",
    socialSectionStatus: contract.socialSectionDone ? "Volet social fait" : "Volet social à faire",
  })), [contracts, sessionTile]);

  const payrollSummary = useMemo(() => {
    const empty = {
      contracts: 0,
      paidContracts: 0,
      dueContracts: 0,
      netTotal: 0,
      netPaid: 0,
      netDue: 0,
      grossTotal: 0,
      chargesDue: 0,
    };
    const summary = tableContracts.reduce((acc, contract) => {
      const net = amount(contract.netSalary);
      const gross = amount(contract.grossSalary);
      const paidAmount = amount(contract.paidAmount);
      const paid = contract.paymentValidated ? net : Math.min(paidAmount, net);
      const due = contract.paymentValidated ? 0 : Math.max(net - paidAmount, 0);
      const charges = Math.max(gross - net, 0);
      const key = contractSessionKey(contract);
      if (!acc.groups.has(key)) {
        acc.groups.set(key, {
          ...empty,
          key,
          week: contract.week || "Non renseignee",
          stay: contract.stayCode || contract.stay || "Non renseigne",
          startDate: contract.startDate || "",
        });
      }
      [acc.total, acc.groups.get(key)].forEach((target) => {
        target.contracts += 1;
        target.paidContracts += contract.paymentValidated ? 1 : 0;
        target.dueContracts += due > 0 ? 1 : 0;
        target.netTotal += net;
        target.netPaid += paid;
        target.netDue += due;
        target.grossTotal += gross;
        target.chargesDue += charges;
      });
      return acc;
    }, { total: { ...empty }, groups: new Map() });

    return {
      total: summary.total,
      groups: [...summary.groups.values()].sort((left, right) =>
        String(left.startDate || "9999").localeCompare(String(right.startDate || "9999"))
        || left.stay.localeCompare(right.stay, "fr")
      ),
    };
  }, [tableContracts]);

  const visibleRefreshableContracts = visibleContracts.filter((contract) => (
    contract.docusignEnvelopeId && contract.docusignStatus !== "completed" && contract.docusignStatus !== "voided"
  ));

  const columns = [
    {
      key: "memberName", label: "Anim.",
      render: (row) => {
        const m = memberById[row.memberId];
        return (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {m && <Avatar member={m} size={28} />}
            {m ? `${m.firstName || ""} ${m.lastName || ""}`.trim() : row.memberName}
          </span>
        );
      },
    },
    { key: "week", label: "S." },
    { key: "stay", label: "Séj.", filterable: true, filterLabel: "Tous les séjours", render: (row) => row.stayCode || row.stay },
    { key: "role", label: "Poste", filterable: true, filterLabel: "Tous les postes", render: compactRole },
    {
      key: "_personalInformation", label: "Infos", sortable: false,
      render: (row) => {
        const member = memberById[row.memberId];
        const missing = missingPersonalInformation(member);
        return missing.length ? (
          <span title={missing.map((item) => item.label).join(", ")}>
            <Badge label={`${missing.length} manq.`} variant="warning" />
          </span>
        ) : <Badge label="Complet" variant="success" />;
      },
    },
    { key: "datesLabel", label: "Dates", render: (row) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateShort(row.startDate)} → {fmtDateShort(row.endDate)}</span>, sortValue: (r) => r.startDate },
    {
      key: "netSalary", label: "Net",
      render: (r) => (
        <span style={{ display: "flex", flexDirection: "column", gap: 2, whiteSpace: "nowrap" }}>
          <strong>{currency(r.netSalary)}</strong>
          <small className="dash-muted">total contrat</small>
        </span>
      ),
      sortValue: (r) => r.netSalary,
    },
    {
      key: "_socialSalary", label: "Droits sociaux", sortable: false,
      render: (row) => <SocialSalaryBreakdown grossSalary={row.grossSalary} netSalary={row.netSalary} />,
    },
    {
      key: "convoyagePrime", label: "Conv.",
      render: (row) => row.convoyagePrime ? <Badge label="+ 1 jour" variant="success" /> : <span className="dash-muted">Non</span>,
      sortValue: (row) => row.convoyagePrime ? 1 : 0,
    },
    {
      key: "ceaStatus", label: "CEA", sortable: false, filterable: true, filterLabel: "Tous CEA",
      render: (row) => (
        <label className="hr-contract-check" title="Déclaration CEA validée">
          <input type="checkbox" checked={row.ceaDeclarationValidated} onChange={(event) => onToggleCea(row, event.target.checked)} />
          <span>{row.ceaDeclarationValidated ? "Fait" : "À faire"}</span>
        </label>
      ),
    },
    {
      key: "socialSectionStatus", label: "Volet social", filterable: true, filterLabel: "Tous volets sociaux",
      render: (row) => (
        <label className="hr-contract-check" title="Volet social fait">
          <input type="checkbox" checked={row.socialSectionDone} onChange={(event) => onToggleSocialSection(row, event.target.checked)} />
          <span>{row.socialSectionDone ? "Fait" : "À faire"}</span>
        </label>
      ),
      sortValue: (row) => row.socialSectionStatus,
    },
    {
      key: "status", label: "Paiement", filterable: true, filterLabel: "Tous",
      render: (row) => (
        <label className="hr-contract-check" title={`${currency(row.netSalary)} net`}>
          <input type="checkbox" checked={row.paymentValidated} onChange={(event) => onTogglePayment(row, event.target.checked)} />
          <span>{row.paymentValidated ? "Payé" : "À payer"}</span>
        </label>
      ),
      sortValue: (r) => r.status,
    },
    {
      key: "docusignStatus", label: "Signature", filterable: true, filterLabel: "Tous",
      render: (row) => {
        if (!row.docusignEnvelopeId) return <Badge label="Non envoyé" variant="neutral" />;
        const display = DOCUSIGN_STATUS[row.docusignStatus] || { label: row.docusignStatus || "Envoyé", variant: "info" };
        const waiting = docusignWaitingLabel(row.docusignWaitingFor);
        return (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <Badge label={display.label} variant={display.variant} />
            {waiting && row.docusignStatus !== "completed" && <small style={{ color: "#6b5a7c", fontWeight: 800 }}>{waiting}</small>}
          </span>
        );
      },
      sortValue: (row) => row.docusignStatus || "",
    },
    {
      key: "_actions", label: "",
      render: (row) => {
        const m = memberById[row.memberId];
        return (
          <select
            className="hr-contract-actions-select"
            defaultValue=""
            disabled={Boolean(docusignBusyId)}
            onChange={(event) => {
              const action = event.target.value;
              event.target.value = "";
              if (action === "edit") onEditContract(m, row);
              if (action === "profile") onCompleteMember(m, false);
              if (action === "complete-profile") onCompleteMember(m, true);
              if (action === "preview") onContract(m, row);
              if (action === "delete") onDeleteContract(row);
              if (action === "send") onDocusignSend(m, row);
              if (action === "attach") onDocusignAttach(row);
              if (action === "refresh") onDocusignRefresh(row);
              if (action === "reset") onDocusignReset(row);
              if (action === "pdf") window.open(row.contractFileUrl, "_blank", "noopener,noreferrer");
            }}
            aria-label={`Actions pour ${row.memberName}`}
          >
            <option value="">Actions…</option>
            {m && <option value="profile">Voir fiche</option>}
            <option value="edit">Modifier contrat</option>
            <option value="delete">Supprimer contrat</option>
            {m && missingPersonalInformation(m).length > 0 && <option value="complete-profile">Compléter fiche</option>}
            {m && <option value="preview">Aperçu PDF</option>}
            {m && !row.docusignEnvelopeId && m.email && <option value="send">Envoyer DocuSign</option>}
            <option value="attach">Rattacher enveloppe DocuSign</option>
            {row.docusignEnvelopeId && <option value="refresh">Actualiser signature</option>}
            {row.docusignEnvelopeId && <option value="reset">Réinitialiser</option>}
            {row.contractFileUrl && <option value="pdf">Ouvrir PDF signé</option>}
          </select>
        );
      },
    },
  ];

  const exportCsv = () => {
    const headers = ["Animateur", "Saison", "Semaine", "Séjour", "Poste", "Début", "Fin", "Net total", "Brut total", "Brut hors CP", "CP 10% brut", "Net hors CP", "CP 10% net", "Déclaration CEA", "Volet social", "Paiement", "Signature"];
    const lines = contracts.map((c) => {
      const grossSplit = socialSalarySplit(c.grossSalary);
      const netSplit = socialSalarySplit(c.netSalary);
      return [
        c.memberName, c.season, c.week, c.stay, c.role, c.startDate, c.endDate,
        c.netSalary, c.grossSalary, grossSplit.salary, grossSplit.paidLeave, netSplit.salary, netSplit.paidLeave,
        c.ceaDeclarationValidated ? "Validée" : "À faire", c.socialSectionDone ? "Fait" : "À faire", c.status, c.docusignStatus || "Non envoyé",
      ];
    });
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
      <div className="hr-week-tiles" aria-label="Filtrer les contrats par session">
        <button type="button" className={`hr-week-tile${sessionTile === "all" ? " is-active" : ""}`} onClick={() => setSessionTile("all")}>
          <strong>Toutes</strong><span>{contracts.length}</span>
        </button>
        {sessionTiles.map((tile) => (
          <button key={tile.key} type="button" className={`hr-week-tile${sessionTile === tile.key ? " is-active" : ""}`} onClick={() => setSessionTile(tile.key)}>
            <strong>{tile.label}</strong><span>{tile.count}</span>
          </button>
        ))}
      </div>
      <section className="hr-payroll-summary" aria-label="Synthese paie">
        <div className="hr-payroll-kpis">
          <div className="hr-payroll-kpi">
            <span>Net total contrats</span>
            <strong>{currency(payrollSummary.total.netTotal)}</strong>
            <small>{payrollSummary.total.contracts} contrat{payrollSummary.total.contracts > 1 ? "s" : ""}</small>
          </div>
          <div className="hr-payroll-kpi is-paid">
            <span>Net deja paye</span>
            <strong>{currency(payrollSummary.total.netPaid)}</strong>
            <small>{payrollSummary.total.paidContracts} marque{payrollSummary.total.paidContracts > 1 ? "s" : ""} paye{payrollSummary.total.paidContracts > 1 ? "s" : ""}</small>
          </div>
          <div className="hr-payroll-kpi is-due">
            <span>Net reste a payer</span>
            <strong>{currency(payrollSummary.total.netDue)}</strong>
            <small>{payrollSummary.total.dueContracts} contrat{payrollSummary.total.dueContracts > 1 ? "s" : ""} a solder</small>
          </div>
          <div className="hr-payroll-kpi is-charge">
            <span>Charges estimees</span>
            <strong>{currency(payrollSummary.total.chargesDue)}</strong>
            <small>Brut total {currency(payrollSummary.total.grossTotal)}</small>
          </div>
        </div>
        {payrollSummary.groups.length > 0 && (
          <div className="hr-payroll-breakdown">
            <table>
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th>Sejour</th>
                  <th>Contrats</th>
                  <th>Net total</th>
                  <th>Net paye</th>
                  <th>Net restant</th>
                  <th>Brut total</th>
                  <th>Charges estimees</th>
                </tr>
              </thead>
              <tbody>
                {payrollSummary.groups.map((group) => (
                  <tr key={group.key}>
                    <td>{group.week}</td>
                    <td>{group.stay}</td>
                    <td>{group.contracts}</td>
                    <td>{currency(group.netTotal)}</td>
                    <td className="hr-paid">{currency(group.netPaid)}</td>
                    <td className={group.netDue > 0 ? "hr-due" : "hr-paid"}>{currency(group.netDue)}</td>
                    <td>{currency(group.grossTotal)}</td>
                    <td>{currency(group.chargesDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="dash-btn"
          onClick={() => onDocusignRefreshMany(visibleRefreshableContracts)}
          disabled={!visibleRefreshableContracts.length || Boolean(docusignBusyId)}
          title="Actualise les contrats affiches par les filtres du tableau"
        >
          {docusignBusyId === "__bulk__" ? "Actualisation..." : `Actualiser signatures (${visibleRefreshableContracts.length})`}
        </button>
        <button type="button" className="dash-btn" onClick={exportCsv} disabled={!contracts.length}>
          Exporter CSV
        </button>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onNewContract}>
          + Nouveau contrat
        </button>
      </div>
      <DataTable
        columns={columns}
        data={tableContracts}
        searchableKeys={["memberName", "week", "stay", "role", "ceaStatus"]}
        defaultSortKey="datesLabel"
        emptyLabel="Aucun contrat enregistré."
        toolsInline
        onProcessedDataChange={setVisibleContracts}
      />
    </div>
  );
}

// ─── Fiche animateur (modal) ──────────────────────────────────────────────────

const EDIT_FIELDS = [
  { key: "firstName",            label: "Prénom", placeholder: "Prénom complet" },
  { key: "lastName",             label: "Nom", placeholder: "Nom de naissance" },
  { key: "email",                label: "E-mail", type: "email", placeholder: "prenom.nom@email.fr" },
  { key: "phone",                label: "Téléphone", type: "tel", placeholder: "06 00 00 00 00" },
  { key: "dateOfBirth",          label: "Date de naissance", placeholder: "JJ/MM/AAAA" },
  { key: "birthPlace",           label: "Lieu de naissance", placeholder: "Ville et pays si nécessaire" },
  { key: "socialSecurityNumber", label: "N° Sécurité sociale (15 chiffres)", placeholder: "1 00 00 00 000 000 00", inputMode: "numeric" },
  { key: "address",              label: "Adresse complète", placeholder: "N°, voie, code postal et ville" },
  { key: "nationality",          label: "Nationalité", placeholder: "Française" },
];

function FicheModal({ member: initial, contracts, allContracts = [], archivedSeasons, sessionsById, structuredDocuments, initialEdit = false, onClose, onUpdate, onEditContract, onDocumentChange }) {
  const { showToast } = useToast();
  const [member, setMember]   = useState(initial);
  const [editMode, setEdit]   = useState(initialEdit);
  const [form, setForm]       = useState({ ...initial });
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("info"); // info | docs
  const [uploading, setUpl]   = useState(false);
  const [typedDocumentBusy, setTypedDocumentBusy] = useState("");
  const photoInputRef         = useRef(null);
  const docInputRef           = useRef(null);

  const memberContracts = contracts.filter((c) => c.memberId === member.id);
  const historyContracts = allContracts.filter((c) => c.memberId === member.id);

  // ── Sauvegarde des infos ──
  const saveInfo = async () => {
    setSaving(true);
    try {
      const updateData = memberIdentityUpdateData(form);
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

  const openTypedDocument = async (document) => {
    if (!document?.storagePath) return;
    const key = `${document.id}-open`;
    setTypedDocumentBusy(key);
    try {
      const url = await getDownloadURL(ref(storage, document.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      showToast(error?.message || "Ouverture du document impossible.", "error");
    } finally {
      setTypedDocumentBusy("");
    }
  };

  const uploadTypedDocuments = async (documentType, selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (!files.length) return;
    const key = `${documentType}-upload`;
    setTypedDocumentBusy(key);
    try {
      for (const file of files) {
        const created = await uploadStaffDocument({ member, documentType, file, source: "admin-team" });
        onDocumentChange(created);
      }
      showToast(`${files.length} fichier${files.length > 1 ? "s" : ""} ajouté${files.length > 1 ? "s" : ""}.`, "success");
    } catch (error) {
      showToast(error?.message || "Ajout du document impossible.", "error");
    } finally {
      setTypedDocumentBusy("");
    }
  };

  const [typeColor] = [TYPE_COLOR[member.staffType] || "#7c3aed"];
  const [, typeBg]  = [TYPE_BG[member.staffType]   || "#f5f0ff"];

  return (
    <div className="hr-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
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
          <button type="button" className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}>
            Historique <span>{historyContracts.length}</span>
          </button>
        </div>

        {/* ── Contenu ── */}
        <div className="hr-fiche-body">

          {/* INFO */}
          {tab === "info" && (
            <>
              {missingPersonalInformation(member).length > 0 && (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 13 }}>
                  <strong>Informations à compléter :</strong>{" "}
                  {missingPersonalInformation(member).map((item) => item.label).join(", ")}.
                </div>
              )}
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
                  {EDIT_FIELDS.map(({ key, label, type, placeholder, inputMode }) => (
                    <label key={key} className="hr-edit-label">
                      <span>{label}</span>
                      <input
                        type={type || "text"}
                        placeholder={placeholder || ""}
                        inputMode={inputMode}
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
              <div className="hr-structured-docs">
                {STAFF_DOCUMENT_TYPES.map((type) => {
                  const typeDocuments = documentsByType(structuredDocuments, member.id, type.key);
                  const current = typeDocuments.find((document) => document.status === "validated" && document.locked) || latestDocumentByType(structuredDocuments, member.id, type.key);
                  const validated = typeDocuments.some((document) => document.status === "validated" && document.locked);
                  return (
                    <div key={type.key} className={`hr-structured-doc${validated ? " is-valid" : current ? " is-pending" : ""}`}>
                      <strong>{type.label}</strong>
                      <span>{validated ? `Validé et verrouillé · ${typeDocuments.length} élément${typeDocuments.length > 1 ? "s" : ""}` : current ? `${typeDocuments.length} reçu${typeDocuments.length > 1 ? "s" : ""} · à vérifier` : "Manquant"}</span>
                      {typeDocuments.length > 0 && (
                        <div className="hr-team-doc-files">
                          {typeDocuments.map((document) => document.storagePath ? (
                            <button
                              key={document.id}
                              type="button"
                              onClick={() => openTypedDocument(document)}
                              disabled={Boolean(typedDocumentBusy)}
                              title={document.originalName}
                            >
                              <span>📄 {document.originalName}</span>
                              <em>{typedDocumentBusy === `${document.id}-open` ? "Ouverture…" : "Ouvrir"}</em>
                            </button>
                          ) : (
                            <div key={document.id} className="hr-team-doc-virtual">✓ Validation sans fichier</div>
                          ))}
                        </div>
                      )}
                      <label className="hr-team-doc-upload">
                        <input
                          type="file"
                          multiple
                          accept={type.accept}
                          disabled={Boolean(typedDocumentBusy)}
                          onChange={(event) => {
                            uploadTypedDocuments(type.key, event.target.files);
                            event.target.value = "";
                          }}
                        />
                        <span>{typedDocumentBusy === `${type.key}-upload` ? "Ajout…" : "+ Ajouter dans cette catégorie"}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="hr-docs-hint">Les fichiers ajoutés ci-dessus sont aussi disponibles dans l’onglet Documents principal. La liste ci-dessous conserve les anciens fichiers non classés.</p>
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
                  <div style={{ marginTop: 6 }}>
                    <SocialSalaryBreakdown grossSalary={c.grossSalary} netSalary={c.netSalary} compact />
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
                    {c.contractFileUrl && (
                      <a
                        className="hr-btn-contract"
                        href={c.contractFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ouvrir le contrat signé
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HISTORIQUE */}
          {tab === "history" && (
            <MemberHistory member={member} contracts={historyContracts} archivedSeasons={archivedSeasons} sessionsById={sessionsById} />
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Fiche : historique (toutes saisons, archives comprises) ─────────────────

/** Convoyages d'un membre : nouveau format (`staffMemberIds`) ou ancien (`staff[].memberId`). */
function transportIncludesMember(transport, memberId) {
  if (!memberId) return false;
  if (Array.isArray(transport.staffMemberIds) && transport.staffMemberIds.includes(memberId)) return true;
  return (Array.isArray(transport.staff) ? transport.staff : []).some((entry) => entry?.memberId === memberId || entry?.id === memberId);
}

function transportRole(transport, memberId) {
  const entry = (transport.staff || []).find((item) => item?.memberId === memberId || item?.id === memberId);
  if (transport.leadStaffId && (transport.leadStaffId === memberId || transport.leadStaffId === entry?.id)) return "Chef de convoi";
  return entry?.role || "Convoyeur·se";
}

function signatureLabel(contract) {
  if (!contract.docusignEnvelopeId) return contract.contractFileUrl ? { label: "PDF signé", variant: "success" } : { label: "Non envoyé", variant: "neutral" };
  return DOCUSIGN_STATUS[contract.docusignStatus] || { label: contract.docusignStatus || "Envoyé", variant: "info" };
}

function MemberHistory({ member, contracts, archivedSeasons, sessionsById }) {
  const [transports, setTransports] = useState(null);

  useEffect(() => {
    let active = true;
    getDocs(collection(db, COLLECTIONS.TRANSPORTS))
      .then((snapshot) => {
        if (!active) return;
        setTransports(snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((transport) => transportIncludesMember(transport, member.id)));
      })
      .catch(() => { if (active) setTransports([]); });
    return () => { active = false; };
  }, [member.id]);

  const seasons = useMemo(() => {
    const map = new Map();
    const bucket = (season) => {
      const key = season || "Sans date";
      if (!map.has(key)) map.set(key, { key, contracts: [], transports: [] });
      return map.get(key);
    };
    contracts.forEach((contract) => bucket(contract.season).contracts.push(contract));
    (transports || []).forEach((transport) => bucket(seasonOfRecord(transport)).transports.push(transport));
    map.forEach((group) => {
      group.contracts.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      group.transports.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.direction).localeCompare(String(b.direction)));
    });
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [contracts, transports]);

  if (!seasons.length && transports !== null) {
    return <p className="hr-docs-empty">Aucun contrat ni convoyage enregistré pour {member.firstName || "cette personne"}.</p>;
  }

  return (
    <div className="hr-history">
      <p className="hr-docs-hint">Lecture seule : contrats et convoyages de toutes les saisons, y compris archivées.</p>
      {transports === null && <p className="dash-muted">Chargement des convoyages…</p>}
      {seasons.map((group) => (
        <section key={group.key} className="hr-history-season">
          <header>
            <h3>Saison {group.key}</h3>
            {archivedSeasons?.has(group.key) && <Badge label="Archivée" variant="neutral" />}
          </header>
          {group.contracts.length > 0 && (
            <div className="hr-history-table">
              <table>
                <thead>
                  <tr><th>Poste</th><th>Séjour</th><th>Dates</th><th>Net</th><th>Brut</th><th>Signature</th><th>Paiement</th></tr>
                </thead>
                <tbody>
                  {group.contracts.map((contract) => {
                    const session = contract.sessionId ? sessionsById?.get(contract.sessionId) : null;
                    const signature = signatureLabel(contract);
                    return (
                      <tr key={contract.id} className={contract.archived ? "is-archived" : ""}>
                        <td>{compactRole(contract)}</td>
                        <td>{session ? `${session.sejourName} · ${session.week}` : `${contract.stay} · ${contract.week}`}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDateRange(contract.startDate, contract.endDate) || "Dates à compléter"}</td>
                        <td>{currency(contract.netSalary)}</td>
                        <td>{currency(contract.grossSalary)}</td>
                        <td>
                          <Badge label={signature.label} variant={signature.variant} />
                          {contract.contractFileUrl && (
                            <a className="hr-history-link" href={contract.contractFileUrl} target="_blank" rel="noopener noreferrer">PDF</a>
                          )}
                        </td>
                        <td><Badge label={contract.status} variant={contract.paymentValidated ? "success" : "warning"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {group.transports.length > 0 && (
            <ul className="hr-history-transports">
              {group.transports.map((transport) => (
                <li key={transport.id}>
                  <strong>{transport.direction === "retour" ? "Retour" : "Aller"} · {fmtDate(transport.date)}</strong>
                  <span>{[transport.departureCity, transport.arrivalCity].filter(Boolean).join(" → ") || transport.routeLabel || "Trajet"}</span>
                  <small>{transportRole(transport, member.id)}{transport.trainNumber ? ` · train ${transport.trainNumber}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
          {!group.contracts.length && !group.transports.length && <p className="dash-muted">Rien sur cette saison.</p>}
        </section>
      ))}
    </div>
  );
}

// ─── Onglet « Comptes » : demandes d'accès à l'espace équipe ─────────────────

function StaffAccountsPanel({ accounts, members, onMemberCreated, onMemberLinked, onFiche }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState("");

  const memberById = useMemo(() => Object.fromEntries(members.map((member) => [member.id, member])), [members]);
  const counts = useMemo(() => accounts.reduce((result, account) => {
    result[account.status] = (result[account.status] || 0) + 1;
    return result;
  }, {}), [accounts]);
  const visible = useMemo(() => accounts
    .filter((account) => statusFilter === "all" || account.status === statusFilter)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [accounts, statusFilter]);

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      showToast(success, "success");
    } catch (error) {
      showToast(error?.message || "Action impossible.", "error");
    } finally {
      setBusy("");
    }
  };

  const approveLinked = (account, memberId) => {
    const member = memberById[memberId];
    if (!member) { showToast("Choisissez la fiche à lier.", "error"); return; }
    const conflict = accountLinkedToMember(memberId, accounts, account.uid);
    if (conflict && !window.confirm(`La fiche de ${member.name} est déjà liée au compte ${conflict.email}. Lier quand même ce nouveau compte ?`)) return;
    run(account.uid, async () => {
      await approveStaffAccount({ account, memberId, reviewer: currentUser });
      onMemberLinked(memberId, account);
    }, `Compte validé et lié à ${member.name}.`);
  };

  const approveNew = (account) => {
    if (!window.confirm(`Créer une nouvelle fiche pour ${staffAccountName(account)} et valider son compte ?`)) return;
    run(account.uid, async () => {
      const { member } = await approveStaffAccountWithNewMember({ account, reviewer: currentUser });
      onMemberCreated(member);
    }, "Compte validé, fiche créée.");
  };

  const reject = (account, suspend = false) => {
    const reason = window.prompt(suspend ? "Motif de la suspension (visible par la personne) :" : "Motif du refus (visible par la personne) :", account.rejectionReason || "");
    if (reason == null) return;
    run(account.uid, () => rejectStaffAccount({ account, reason, reviewer: currentUser }), suspend ? "Compte suspendu." : "Demande refusée.");
  };

  const unlink = (account) => {
    const member = memberById[account.memberId];
    if (!window.confirm(`Délier le compte ${account.email} de la fiche ${member?.name || ""} ?\n\nLe compte repasse en attente de validation ; la fiche et ses contrats ne changent pas.`)) return;
    run(account.uid, async () => {
      await unlinkStaffAccount({ account, reviewer: currentUser });
      if (account.memberId) onMemberLinked(account.memberId, null);
    }, "Compte délié.");
  };

  const filters = [
    { key: "pending", label: "En attente" },
    { key: "approved", label: "Validés" },
    { key: "rejected", label: "Refusés / suspendus" },
    { key: "all", label: "Tous" },
  ];

  return (
    <div className="hr-accounts">
      <div className="hr-equipe-filters">
        {filters.map((filter) => (
          <button key={filter.key} type="button" className={`hr-filter-btn${statusFilter === filter.key ? " is-active" : ""}`} onClick={() => setStatusFilter(filter.key)}>
            {filter.label} <span>{filter.key === "all" ? accounts.length : counts[filter.key] || 0}</span>
          </button>
        ))}
      </div>
      <p className="hr-docs-hint">
        Chaque animateur·ice ou directeur·ice crée son compte depuis l’espace équipe. Une fois validé et lié à sa fiche,
        il ou elle y retrouve son planning, ses contrats, ses documents et ses convoyages.
      </p>

      {!visible.length ? (
        <div className="hr-empty"><p>Aucun compte dans cette catégorie.</p></div>
      ) : (
        <div className="hr-account-list">
          {visible.map((account) => {
            const status = STAFF_ACCOUNT_STATUS[account.status];
            const candidates = rankMemberCandidates(account, members);
            const linked = account.memberId ? memberById[account.memberId] : null;
            const chosen = choices[account.uid] ?? (account.memberId || candidates[0]?.member.id || "");
            const isBusy = busy === account.uid;
            return (
              <article key={account.uid} className={`hr-account-card is-${account.status}`}>
                <header>
                  <div>
                    <strong>{staffAccountName(account)}</strong>
                    <small>{STAFF_ACCOUNT_ROLES[account.requestedRole] || account.requestedRole} demandé·e{account.createdAt ? ` · ${fmtDate(account.createdAt)}` : ""}</small>
                  </div>
                  <Badge label={status.label} variant={status.variant} />
                </header>
                <div className="hr-account-contact">
                  <a href={`mailto:${account.email}`}>{account.email || "E-mail manquant"}</a>
                  {account.phone && <a href={`tel:${account.phone}`}>{account.phone}</a>}
                </div>

                {account.status === "approved" && (
                  <div className="hr-account-linked">
                    Lié à {linked ? <button type="button" className="hr-form-link-btn" onClick={() => onFiche(linked)}>{linked.name}</button> : <em>une fiche introuvable</em>}
                    {account.reviewedBy && <small> · validé par {account.reviewedBy}{account.reviewedAt ? ` le ${fmtDate(account.reviewedAt)}` : ""}</small>}
                  </div>
                )}
                {account.status === "rejected" && account.rejectionReason && (
                  <div className="hr-account-reason">Motif : {account.rejectionReason}</div>
                )}

                {account.status !== "approved" && (
                  <div className="hr-account-match">
                    {candidates.length > 0 ? (
                      <span className="hr-account-suggestion">Fiche proposée : <strong>{candidates[0].member.name}</strong> ({candidates[0].reason})</span>
                    ) : (
                      <span className="hr-account-suggestion">Aucune fiche existante ne correspond.</span>
                    )}
                    <select value={chosen} onChange={(event) => setChoices((previous) => ({ ...previous, [account.uid]: event.target.value }))} disabled={isBusy}>
                      <option value="">— Choisir une fiche existante —</option>
                      {candidates.map(({ member }) => <option key={`c-${member.id}`} value={member.id}>★ {member.name}</option>)}
                      {members.filter((member) => !candidates.some((candidate) => candidate.member.id === member.id)).map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="hr-account-actions">
                  {account.status !== "approved" && (
                    <>
                      <button type="button" className="dash-btn dash-btn-primary" disabled={isBusy || !chosen} onClick={() => approveLinked(account, chosen)}>
                        {chosen && memberById[chosen] ? `Valider et lier à ${memberById[chosen].firstName || memberById[chosen].name}` : "Valider et lier"}
                      </button>
                      <button type="button" className="dash-btn" disabled={isBusy} onClick={() => approveNew(account)}>Valider et créer la fiche</button>
                    </>
                  )}
                  {account.status === "pending" && <button type="button" className="dash-btn" disabled={isBusy} onClick={() => reject(account)}>Refuser</button>}
                  {account.status === "approved" && <button type="button" className="dash-btn" disabled={isBusy} onClick={() => reject(account, true)}>Suspendre</button>}
                  {account.memberId && <button type="button" className="dash-btn" disabled={isBusy} onClick={() => unlink(account)}>Délier</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
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

function DocusignPreparationModal({ isOpen, member, contract, busy, onClose, onPreview, onSaveAndSend }) {
  const [form, setForm] = useState(member || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(member || {});
    setSaving(false);
  }, [isOpen, member]);

  if (!member || !contract) return null;

  const previewMember = { ...member, ...memberIdentityUpdateData(form) };
  const missing = missingPersonalInformation(previewMember);
  const canSend = !missing.some((item) => ["firstName", "lastName", "email"].includes(item.key));

  const handleSaveAndSend = async () => {
    if (!canSend || saving || busy) return;
    const confirmed = window.confirm(
      `Enregistrer les informations puis envoyer le contrat de ${previewMember.firstName} ${previewMember.lastName} à ${previewMember.email} ?\n\n` +
      "L'animateur·ice signera en premier, puis ColoCrew recevra la demande de contresignature.",
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await onSaveAndSend(previewMember);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Vérifier avant DocuSign" size="lg" closeOnBackdrop={!saving && !busy} closeOnEscape={!saving && !busy}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ padding: "11px 13px", borderRadius: 10, background: missing.length ? "#fff7ed" : "#f0fdf4", color: missing.length ? "#9a3412" : "#166534", fontSize: 13, lineHeight: 1.5 }}>
          {missing.length ? (
            <>
              <strong>Infos encore à compléter :</strong>{" "}
              {missing.map((item) => item.label).join(", ")}.
              <br />
              Les champs non bloquants pourront aussi être complétés par l'animateur·ice dans DocuSign.
            </>
          ) : (
            <strong>Les informations nécessaires au contrat sont complètes.</strong>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
          {EDIT_FIELDS.map(({ key, label, type, placeholder, inputMode }) => {
            const rule = PERSONAL_INFORMATION_RULES.find((item) => item.key === key);
            const invalid = rule && !rule.valid(form?.[key]);
            return (
              <label key={key} className="hr-edit-label" style={{ margin: 0 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  {label}
                  {invalid && <em style={{ color: "#b45309", fontSize: 11, fontStyle: "normal", fontWeight: 900 }}>manquant</em>}
                </span>
                <input
                  type={type || "text"}
                  placeholder={placeholder || ""}
                  inputMode={inputMode}
                  value={form?.[key] || ""}
                  onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))}
                />
              </label>
            );
          })}
        </div>

        {!canSend && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13, fontWeight: 800 }}>
            Prénom, nom et e-mail doivent être renseignés avant tout envoi DocuSign.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="dash-btn" onClick={() => onPreview(previewMember, contract)} disabled={saving || busy}>
            Prévisualiser sans envoyer
          </button>
          <button type="button" className="dash-btn" onClick={onClose} disabled={saving || busy}>
            Annuler
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={handleSaveAndSend} disabled={!canSend || saving || busy}>
            {saving || busy ? "Envoi..." : "Enregistrer et envoyer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function emptyContractForm(member, contract, initialSession = null) {
  const session = contract ? null : initialSession;
  return {
    memberId: member?.id || contract?.memberId || "",
    newFirstName: "",
    newLastName: "",
    // Vide pour un ancien contrat 2026 sans session : ses champs séjour/semaine sont conservés.
    sessionId: contract?.sessionId || session?.id || "",
    startDate: contract?.startDate || session?.startDate || "",
    endDate:   contract?.endDate   || session?.endDate   || "",
    roleKey: contract?.roleKey || "",
    primeCount: contract?.primeCount || 0,
    convoyagePrime: contract?.convoyagePrime === true,
    netSalary: contract?.netSalary || 0,
    grossSalary: contract?.grossSalary || 0,
    paidAmount: contract?.paidAmount || 0,
    paymentValidated: contract?.paymentValidated === true,
  };
}

function ContractFormModal({ isOpen, member, contract, initialSession, members, gridRows, sessions, sessionsById, sejoursById, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEdit = !!contract;
  const posteRows = useMemo(() => gridRows.filter((r) => !r.isPrime).sort((a, b) => a.order - b.order), [gridRows]);
  const primeUnit = useMemo(() => gridRows.find((r) => r.isPrime), [gridRows]);

  const [addingMember, setAddingMember] = useState(!member && !isEdit);
  const [form, setForm] = useState(() => emptyContractForm(member, contract, initialSession));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyContractForm(member, contract, initialSession));
    setAddingMember(!member && !isEdit);
  }, [isOpen, member, contract, initialSession, isEdit]);

  // Sessions proposées : celles de la saison affichée, plus celle du contrat si elle est ailleurs.
  const sessionOptions = useMemo(() => {
    const list = [...(sessions || [])];
    const current = form.sessionId ? sessionsById?.get(form.sessionId) : null;
    if (current && !list.some((session) => session.id === current.id)) list.unshift(current);
    return list;
  }, [sessions, sessionsById, form.sessionId]);
  const legacyLabel = isEdit && !contract?.sessionId
    ? `Ancien contrat : ${contractShortLabel(contract) || "séjour non renseigné"}${contract?.season ? ` (${contract.season})` : ""}`
    : "";

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const recalculate = () => {
    const gridRow = posteRows.find((r) => r.id === form.roleKey);
    if (gridRow?.id === "benevole") {
      setForm((p) => ({ ...p, primeCount: 0, convoyagePrime: false, netSalary: 0, grossSalary: 0, paidAmount: 0, paymentValidated: true }));
      return;
    }
    const nbDays = nbDaysBetween(form.startDate, form.endDate);
    const { net, gross } = computeSalary({ gridRow, primeUnit, primeCount: form.primeCount, convoyagePrime: form.convoyagePrime, nbDays });
    setForm((p) => ({ ...p, netSalary: net, grossSalary: gross }));
  };

  // Choisir une session reprend ses dates ; elles restent modifiables (arrivée la veille…).
  const handleSessionChange = (sessionId) => {
    const session = sessionsById?.get(sessionId);
    setForm((p) => ({
      ...p,
      sessionId,
      startDate: session?.startDate || p.startDate,
      endDate: session?.endDate || p.endDate,
    }));
  };

  const handleConvoyagePrimeChange = (checked) => {
    const gridRow = posteRows.find((r) => r.id === form.roleKey);
    if (!gridRow || gridRow.id === "benevole") {
      setForm((p) => ({ ...p, convoyagePrime: false }));
      return;
    }
    const nbDays = nbDaysBetween(form.startDate, form.endDate);
    const { net, gross } = computeSalary({ gridRow, primeUnit, primeCount: form.primeCount, convoyagePrime: checked, nbDays });
    setForm((p) => ({ ...p, convoyagePrime: checked, netSalary: net, grossSalary: gross }));
  };

  const save = async () => {
    const gridRow = posteRows.find((r) => r.id === form.roleKey);
    if (!gridRow) { showToast("Choisissez un poste.", "error"); return; }
    if (addingMember && !form.newFirstName.trim() && !form.newLastName.trim()) {
      showToast("Renseignez le nom du nouveau membre.", "error");
      return;
    }
    if (!addingMember && !form.memberId) { showToast("Choisissez un membre.", "error"); return; }
    const session = form.sessionId ? sessionsById?.get(form.sessionId) : null;
    if (form.sessionId && !session) { showToast("Cette session n'existe plus dans le catalogue des séjours.", "error"); return; }
    if (!session && !legacyLabel) { showToast("Choisissez une session.", "error"); return; }
    if (!form.startDate || !form.endDate) { showToast("Renseignez les dates du contrat.", "error"); return; }
    const stayFields = session
      ? {
          season: session.season,
          sejourId: session.sejourId,
          sessionId: session.id,
          stayName: session.sejourName,
          stayCode: session.sejourCode,
          week: session.week,
          place: sejourPlace(sejoursById?.get(session.sejourId)) || contract?.place || "",
        }
      : {
          season: contract?.season || seasonOfDate(form.startDate),
          stayName: contract?.stayName || contract?.stay || "",
          stayCode: contract?.stayCode || "",
          week: contract?.week || "",
        };

    setSaving(true);
    try {
      let memberId = form.memberId;
      let memberName;
      let createdMember = null;

      const directionRole = gridRow.id === "ds" || gridRow.id === "dsa";
      const volunteerRole = gridRow.id === "benevole";

      if (addingMember) {
        const newMemberData = {
          firstName: form.newFirstName.trim(),
          lastName:  form.newLastName.trim(),
          name: `${form.newFirstName.trim()} ${form.newLastName.trim()}`.trim(),
          email: "", phone: "", staffType: volunteerRole ? "benevole" : directionRole ? "directeur" : "animateur", active: true,
        };
        const memberRef = await addDoc(collection(db, COLLECTIONS.STAFF_MEMBERS), newMemberData);
        memberId = memberRef.id;
        memberName = newMemberData.name;
        createdMember = { id: memberRef.id, ...newMemberData, dateOfBirth: "", birthPlace: "", socialSecurityNumber: "", address: "", photoUrl: "", documents: [] };
      } else {
        const m = members.find((mm) => mm.id === memberId);
        memberName = m ? `${m.firstName} ${m.lastName}`.trim() : "Animateur non renseigné";
        const nextStaffType = volunteerRole ? "benevole" : directionRole ? "directeur" : "";
        if (nextStaffType && m?.staffType !== nextStaffType) {
          await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, memberId), { staffType: nextStaffType });
        }
      }

      const paymentValidated = volunteerRole || (form.paymentValidated === true && amount(form.paidAmount) >= amount(form.netSalary));
      const outstandingAmount = paymentValidated ? 0 : Math.max(amount(form.netSalary) - amount(form.paidAmount), 0);
      const convoyagePrime = !volunteerRole && form.convoyagePrime === true;
      const convoyagePrimeNet = convoyagePrime ? amount(gridRow.perDay || gridRow.perStayNet / REFERENCE_DAYS) : 0;
      const convoyagePrimeGross = convoyagePrime ? amount(gridRow.perStayGross / REFERENCE_DAYS) : 0;
      const payload = {
        memberId,
        memberName,
        ...stayFields,
        role: gridRow.label,
        roleKey: gridRow.id,
        startDate: form.startDate,
        endDate: form.endDate,
        primeCount: volunteerRole ? 0 : Math.max(Number(form.primeCount) || 0, 0),
        convoyagePrime,
        convoyagePrimeNet,
        convoyagePrimeGross,
        primeUnitNet: amount(primeUnit?.perStayNet),
        primeUnitGross: amount(primeUnit?.perStayGross),
        netSalary: volunteerRole ? 0 : amount(form.netSalary),
        grossSalary: volunteerRole ? 0 : amount(form.grossSalary),
        paidAmount: volunteerRole ? 0 : amount(form.paidAmount),
        outstandingAmount,
        paymentValidated,
        socialSectionDone: volunteerRole ? true : contract?.socialSectionDone === true,
        socialSectionDoneAt: volunteerRole
          ? (contract?.socialSectionDoneAt || new Date().toISOString())
          : (contract?.socialSectionDoneAt || ""),
      };

      let savedId = contract?.id;
      if (isEdit) {
        await updateDoc(doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id), payload);
      } else {
        savedId = (await addDoc(collection(db, COLLECTIONS.STAFF_CONTRACTS), payload)).id;
      }

      showToast(isEdit ? "Contrat mis à jour." : "Contrat créé.", "success");
      onSaved({ id: savedId, ...payload }, createdMember, directionRole ? memberId : "");
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
            <span>Session</span>
            <select value={form.sessionId} onChange={(e) => handleSessionChange(e.target.value)}>
              <option value="">{legacyLabel || "— Choisir une session —"}</option>
              {sessionOptions.map((session) => (
                <option key={session.id} value={session.id}>{session.sejourName} · {session.label}</option>
              ))}
            </select>
          </label>
        </div>
        {!sessionOptions.length && !legacyLabel && (
          <p className="hr-form-hint">Aucune session sur cette saison : ajoutez d’abord des dates au séjour.</p>
        )}

        <div className="hr-form-row">
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

        <label className="hr-convoyage-prime-toggle">
          <input
            type="checkbox"
            checked={form.convoyagePrime}
            onChange={(e) => handleConvoyagePrimeChange(e.target.checked)}
          />
          <span>
            <strong>Prime convoyage</strong>
            <small>Ajoute 1 jour de salaire au contrat.</small>
          </span>
        </label>

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
        <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid #e7def3", borderRadius: 8, background: "#fbf8ff" }}>
          <span style={{ display: "block", color: "#6b5a7c", fontSize: 12, fontWeight: 800, marginBottom: 4, textTransform: "uppercase" }}>
            Décomposition droits sociaux
          </span>
          <SocialSalaryBreakdown grossSalary={form.grossSalary} netSalary={form.netSalary} />
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

export default function HumanResources({ initialTab = "sejours" }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [members,   setMembers]   = useState([]);
  // Tous les contrats, toutes saisons (archives comprises) : l'historique des fiches en a besoin.
  const [allContracts, setContracts] = useState([]);
  const [staffDocuments, setStaffDocuments] = useState([]);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [gridRows,  setGridRows]  = useState(DEFAULT_SALARY_GRID);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState(initialTab);
  const [fiche,     setFiche]     = useState(null);
  const [ficheStartsInEdit, setFicheStartsInEdit] = useState(false);
  const [contractModal, setContractModal] = useState({ isOpen: false, member: null, contract: null, session: null });
  const [seasonChoice, setSeasonChoice] = useState("");

  const { activeSeason, archivedSeasons, seasons: seasonDocs } = useSeasons();
  const catalog = useSessionCatalog();
  const season = seasonChoice || activeSeason;

  // Saisons consultables ici : uniquement les non archivées (les archives sont dans /dashboard/archives).
  const seasonOptions = useMemo(() => {
    const keys = new Set([
      activeSeason,
      ...seasonDocs.map((item) => item.id),
      ...catalog.sessions.map((session) => session.season),
      ...allContracts.map((contract) => contract.season),
    ]);
    return [...keys].filter((key) => /^\d{4}$/.test(String(key || "")) && !archivedSeasons.has(key)).sort();
  }, [activeSeason, seasonDocs, catalog.sessions, allContracts, archivedSeasons]);

  const seasonSessions = useMemo(
    () => catalog.sessions.filter((session) => session.season === season),
    [catalog.sessions, season],
  );
  const sejoursById = useMemo(() => new Map(catalog.sejours.map((sejour) => [sejour.id, sejour])), [catalog.sejours]);

  // Vue de travail : contrats non archivés de la saison choisie (ceux sans date restent visibles
  // dans la saison active pour être complétés).
  const contracts = useMemo(() => allContracts.filter((contract) => {
    if (isArchivedRecord(contract, archivedSeasons)) return false;
    return contract.season ? contract.season === season : season === activeSeason;
  }), [allContracts, archivedSeasons, season, activeSeason]);
  const [contractSendReview, setContractSendReview] = useState({ isOpen: false, member: null, contract: null });
  const [gridModalOpen, setGridModalOpen]  = useState(false);
  const [docusignBusyId, setDocusignBusyId] = useState("");

  const openMemberFile = (member, startEditing = false) => {
    setFicheStartsInEdit(startEditing);
    setFiche(member);
  };

  const closeMemberFile = () => {
    setFiche(null);
    setFicheStartsInEdit(false);
  };

  const persistDocusignState = async (contractId, fields) => {
    await updateDoc(doc(db, COLLECTIONS.STAFF_CONTRACTS, contractId), fields);
    setContracts((previous) => previous.map((contract) => (
      contract.id === contractId ? { ...contract, ...fields } : contract
    )));
  };

  const toggleCeaDeclaration = async (contract, checked) => {
    try {
      await persistDocusignState(contract.id, {
        ceaDeclarationValidated: checked,
        ceaDeclarationValidatedAt: checked ? new Date().toISOString() : "",
      });
      showToast(checked ? "Déclaration CEA validée." : "Validation CEA retirée.", "success");
    } catch (error) {
      showToast(error?.message || "Mise à jour CEA impossible.", "error");
    }
  };

  const toggleSocialSection = async (contract, checked) => {
    try {
      await persistDocusignState(contract.id, {
        socialSectionDone: checked,
        socialSectionDoneAt: checked ? new Date().toISOString() : "",
      });
      showToast(checked ? "Volet social marqué fait." : "Volet social remis à faire.", "success");
    } catch (error) {
      showToast(error?.message || "Mise à jour du volet social impossible.", "error");
    }
  };

  const toggleContractPayment = async (contract, checked) => {
    const confirmation = checked
      ? `Confirmer le paiement net de ${currency(contract.netSalary)} pour ${contract.memberName} ?`
      : "Retirer la validation du paiement de ce contrat ?";
    if (!window.confirm(confirmation)) return;
    try {
      await persistDocusignState(contract.id, {
        paymentValidated: checked,
        paymentValidatedAt: checked ? new Date().toISOString() : "",
        paidAmount: checked ? contract.netSalary : 0,
        outstandingAmount: checked ? 0 : contract.netSalary,
        status: checked ? "Payé" : "À régler",
      });
      showToast(checked ? `Paiement net de ${currency(contract.netSalary)} validé.` : "Validation du paiement retirée.", "success");
    } catch (error) {
      showToast(error?.message || "Mise à jour du paiement impossible.", "error");
    }
  };

  const deleteContractOnly = async (contract) => {
    if (!currentUser || !contract?.id || docusignBusyId) return;
    const hasDocusign = Boolean(contract.docusignEnvelopeId);
    const hasSignedPdf = Boolean(contract.contractFileUrl || contract.signedContractStoragePath);
    const warning = hasDocusign || hasSignedPdf
      ? "\n\nAttention : ce contrat a une enveloppe DocuSign ou un PDF signe. Cette action supprime seulement la ligne RH. Pour annuler DocuSign et retirer le PDF signe, utilisez d'abord Reinitialiser."
      : "";
    const confirmed = window.confirm(
      `Supprimer le contrat de ${contract.memberName || "cet animateur"} (${contract.week || ""} ${contract.stayCode || contract.stay || ""}) ?\n\n` +
      "La fiche RH de la personne sera conservee." + warning,
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id));
      setContracts((previous) => previous.filter((item) => item.id !== contract.id));
      showToast("Contrat supprime. La fiche RH est conservee.", "success");
    } catch (error) {
      showToast(error?.message || "Suppression du contrat impossible.", "error");
    }
  };

  const archiveSignedContract = async (contract, statusPayload, firebaseToken) => {
    const member = members.find((item) => item.id === contract.memberId);
    if (!member) throw new Error("Animateur·ice introuvable pour l'archivage du contrat.");

    const response = await fetch(
      `/api/docusign/envelopes/${encodeURIComponent(contract.docusignEnvelopeId)}/documents`,
      { headers: { Authorization: `Bearer ${firebaseToken}` } },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "PDF signé indisponible.");
    }

    const pdf = await response.blob();
    const storagePath = `staff-contracts/${member.id}/${contract.id}-${contract.docusignEnvelopeId}.pdf`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, pdf, {
      contentType: "application/pdf",
      customMetadata: {
        memberId: member.id,
        contractId: contract.id,
        docusignEnvelopeId: contract.docusignEnvelopeId,
        status: "signed",
      },
    });
    const url = await getDownloadURL(storageRef);
    const completedAt = statusPayload.completedDateTime || new Date().toISOString();
    const fileName = `Contrat signé - ${contract.stayCode || contract.stay} - ${contract.week}.pdf`;
    const documentEntry = {
      name: fileName,
      url,
      uploadedAt: completedAt,
      type: "signed-contract",
      contractId: contract.id,
      docusignEnvelopeId: contract.docusignEnvelopeId,
    };
    const contractFields = {
      docusignStatus: "completed",
      docusignUpdatedAt: statusPayload.statusChangedDateTime || completedAt,
      docusignCompletedAt: completedAt,
      docusignWaitingFor: "completed",
      docusignRecipientStatuses: statusPayload.signers || [],
      contractFileUrl: url,
      signedContractStoragePath: storagePath,
    };

    await Promise.all([
      updateDoc(doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id), contractFields),
      updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, member.id), { documents: arrayUnion(documentEntry) }),
    ]);
    setContracts((previous) => previous.map((item) => (
      item.id === contract.id ? { ...item, ...contractFields } : item
    )));
    const updateDocuments = (item) => {
      if (item.id !== member.id) return item;
      const exists = (item.documents || []).some((document) => document.contractId === contract.id);
      return exists ? item : { ...item, documents: [...(item.documents || []), documentEntry] };
    };
    setMembers((previous) => previous.map(updateDocuments));
    setFiche((previous) => previous ? updateDocuments(previous) : previous);
    return url;
  };

  const sendContractWithDocusign = async (member, contract, options = {}) => {
    if (!currentUser || !member || !contract || docusignBusyId) return;
    if (!member.email) {
      showToast("Ajoutez d'abord l'adresse e-mail de l'animateur·ice.", "error");
      return;
    }
    if (contract.docusignEnvelopeId) {
      showToast("Ce contrat possède déjà une enveloppe DocuSign.", "error");
      return;
    }
    const missingInformation = missingPersonalInformation(member)
      .filter((item) => !["firstName", "lastName", "email"].includes(item.key));
    const completionNote = missingInformation.length
      ? `\n\nL'animateur·ice devra compléter dans DocuSign : ${missingInformation.map((item) => item.label).join(", ")}.`
      : "";
    if (!options.skipConfirm) {
      const confirmed = window.confirm(
        `Envoyer maintenant le contrat de ${member.firstName} ${member.lastName} à ${member.email} ?\n\n` +
        "L'animateur·ice signera en premier, puis ColoCrew recevra la demande de contresignature." + completionNote,
      );
      if (!confirmed) return;
    }

    setDocusignBusyId(contract.id);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/docusign/contracts/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ member, contract }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (payload.consentUrl) window.open(payload.consentUrl, "_blank", "noopener,noreferrer");
        throw new Error(payload.error || "Envoi DocuSign impossible.");
      }
      await persistDocusignState(contract.id, {
        docusignEnvelopeId: payload.envelopeId,
        docusignStatus: payload.status || "sent",
        docusignSentAt: payload.sentAt,
        docusignUpdatedAt: payload.sentAt,
        docusignWaitingFor: "staff",
        docusignRecipientStatuses: [],
      });
      showToast(`Contrat envoyé à ${payload.recipient}.`, "success");
    } catch (error) {
      showToast(error?.message || "Envoi DocuSign impossible.", "error");
    } finally {
      setDocusignBusyId("");
    }
  };

  const requestDocusignSend = (member, contract) => {
    if (!member || !contract) return;
    if (missingPersonalInformation(member).length > 0) {
      setContractSendReview({ isOpen: true, member, contract });
      return;
    }
    sendContractWithDocusign(member, contract);
  };

  const attachDocusignEnvelope = async (contract) => {
    if (!currentUser || !contract || docusignBusyId) return;
    const current = contract.docusignEnvelopeId || "";
    const envelopeId = window.prompt(
      `ID d'enveloppe DocuSign pour ${contract.memberName || "ce contrat"} :`,
      current,
    );
    if (envelopeId == null) return;
    const cleanEnvelopeId = envelopeId.trim();
    if (!/^[0-9a-f-]{20,}$/i.test(cleanEnvelopeId)) {
      showToast("ID d'enveloppe DocuSign invalide.", "error");
      return;
    }
    const fields = {
      docusignEnvelopeId: cleanEnvelopeId,
      docusignStatus: contract.docusignStatus || "sent",
      docusignUpdatedAt: new Date().toISOString(),
      docusignWaitingFor: contract.docusignWaitingFor || "staff",
      docusignRecipientStatuses: contract.docusignRecipientStatuses || [],
    };
    setDocusignBusyId(contract.id);
    try {
      await persistDocusignState(contract.id, fields);
      showToast("Enveloppe DocuSign rattachée. Actualisation du statut...", "success");
    } catch (error) {
      showToast(error?.message || "Rattachement DocuSign impossible.", "error");
      setDocusignBusyId("");
      return;
    }
    setDocusignBusyId("");
    await refreshDocusignStatus({ ...contract, ...fields });
  };

  const saveMemberThenSendContract = async (updatedMember) => {
    if (!updatedMember?.id || !contractSendReview.contract) return;
    const updateData = memberIdentityUpdateData(updatedMember);
    await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, updatedMember.id), updateData);
    const savedMember = { ...updatedMember, ...updateData };
    updateMember(savedMember);
    await sendContractWithDocusign(savedMember, contractSendReview.contract, { skipConfirm: true });
    setContractSendReview({ isOpen: false, member: null, contract: null });
  };

  const syncDocusignPersonalInformation = async (contract, formData) => {
    const mapping = {
      cc_phone: "phone",
      cc_address: "address",
      cc_birth_date: "dateOfBirth",
      cc_birth_place: "birthPlace",
      cc_social_security: "socialSecurityNumber",
      cc_nationality: "nationality",
    };
    const updates = Object.fromEntries(
      Object.entries(mapping)
        .filter(([tabLabel]) => String(formData?.[tabLabel] || "").trim())
        .map(([tabLabel, memberField]) => [memberField, String(formData[tabLabel]).trim()]),
    );
    if (!Object.keys(updates).length) return;
    await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, contract.memberId), updates);
    const applyUpdates = (member) => member.id === contract.memberId ? { ...member, ...updates } : member;
    setMembers((previous) => previous.map(applyUpdates));
    setFiche((previous) => previous ? applyUpdates(previous) : previous);
  };

  const refreshDocusignStatus = async (contract) => {
    if (!currentUser || !contract?.docusignEnvelopeId || docusignBusyId) return;
    setDocusignBusyId(contract.id);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/docusign/envelopes/${encodeURIComponent(contract.docusignEnvelopeId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Statut DocuSign indisponible.");
      const updatedAt = payload.statusChangedDateTime || new Date().toISOString();
      if (payload.status === "completed") {
        await syncDocusignPersonalInformation(contract, payload.formData);
      }
      if (payload.status === "completed" && !contract.contractFileUrl) {
        await archiveSignedContract(contract, payload, token);
      } else {
        await persistDocusignState(contract.id, {
          docusignStatus: payload.status,
          docusignUpdatedAt: updatedAt,
          docusignWaitingFor: docusignWaitingFromSigners(payload.status, payload.signers),
          docusignRecipientStatuses: payload.signers || [],
          ...(payload.completedDateTime ? { docusignCompletedAt: payload.completedDateTime } : {}),
        });
      }
      const display = DOCUSIGN_STATUS[payload.status]?.label || payload.status;
      showToast(
        payload.status === "completed" && !contract.contractFileUrl
          ? "Contrat signé archivé dans la fiche RH."
          : `Statut DocuSign : ${display}.`,
        "success",
      );
    } catch (error) {
      showToast(error?.message || "Statut DocuSign indisponible.", "error");
    } finally {
      setDocusignBusyId("");
    }
  };

  const refreshVisibleDocusignStatuses = async (visibleContracts = []) => {
    const refreshable = (visibleContracts || []).filter((contract) => (
      contract.docusignEnvelopeId && contract.docusignStatus !== "completed" && contract.docusignStatus !== "voided"
    ));
    if (!currentUser || docusignBusyId || !refreshable.length) return;
    setDocusignBusyId("__bulk__");
    let completed = 0;
    let updated = 0;
    const errors = [];
    try {
      const token = await currentUser.getIdToken();
      for (const contract of refreshable) {
        try {
          const response = await fetch(`/api/docusign/envelopes/${encodeURIComponent(contract.docusignEnvelopeId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.ok) throw new Error(payload.error || "Statut DocuSign indisponible.");
          const updatedAt = payload.statusChangedDateTime || new Date().toISOString();
          if (payload.status === "completed") {
            await syncDocusignPersonalInformation(contract, payload.formData);
          }
          if (payload.status === "completed" && !contract.contractFileUrl) {
            await archiveSignedContract(contract, payload, token);
            completed += 1;
          } else {
            await persistDocusignState(contract.id, {
              docusignStatus: payload.status,
              docusignUpdatedAt: updatedAt,
              docusignWaitingFor: docusignWaitingFromSigners(payload.status, payload.signers),
              docusignRecipientStatuses: payload.signers || [],
              ...(payload.completedDateTime ? { docusignCompletedAt: payload.completedDateTime } : {}),
            });
            if (payload.status === "completed") completed += 1;
          }
          updated += 1;
        } catch (error) {
          errors.push(`${contract.memberName || "Contrat"} : ${error?.message || "erreur"}`);
        }
      }
      showToast(
        errors.length
          ? `${updated}/${refreshable.length} signature(s) actualisee(s), ${errors.length} erreur(s).`
          : `${updated} signature(s) actualisee(s), ${completed} terminee(s).`,
        errors.length ? "warning" : "success",
      );
      if (errors.length) console.warn("Erreurs actualisation DocuSign", errors);
    } catch (error) {
      showToast(error?.message || "Actualisation DocuSign impossible.", "error");
    } finally {
      setDocusignBusyId("");
    }
  };

  const resetDocusignContract = async (contract) => {
    if (!currentUser || !contract?.docusignEnvelopeId || docusignBusyId) return;
    const confirmed = window.confirm(
      "Réinitialiser ce contrat DocuSign ?\n\n" +
      "L'enveloppe encore active sera annulée, le PDF signé archivé sera retiré de la fiche RH et le contrat pourra être renvoyé. Les informations du contrat seront conservées.",
    );
    if (!confirmed) return;

    setDocusignBusyId(contract.id);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(
        `/api/docusign/envelopes/${encodeURIComponent(contract.docusignEnvelopeId)}/reset`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Réinitialisation impossible.");

      if (contract.signedContractStoragePath) {
        try { await deleteObject(ref(storage, contract.signedContractStoragePath)); } catch {}
      }

      const member = members.find((item) => item.id === contract.memberId);
      const linkedDocuments = (member?.documents || []).filter((document) => (
        document.contractId === contract.id || document.docusignEnvelopeId === contract.docusignEnvelopeId
      ));
      if (member && linkedDocuments.length) {
        await updateDoc(
          doc(db, COLLECTIONS.STAFF_MEMBERS, member.id),
          { documents: arrayRemove(...linkedDocuments) },
        );
      }

      const resetFields = {
        docusignEnvelopeId: "",
        docusignStatus: "",
        docusignSentAt: "",
        docusignUpdatedAt: "",
        docusignCompletedAt: "",
        docusignWaitingFor: "",
        docusignRecipientStatuses: [],
        contractFileUrl: "",
        signedContractStoragePath: "",
      };
      await persistDocusignState(contract.id, resetFields);
      if (member && linkedDocuments.length) {
        const removeLinkedDocuments = (item) => item.id === member.id
          ? {
              ...item,
              documents: (item.documents || []).filter((document) => (
                document.contractId !== contract.id && document.docusignEnvelopeId !== contract.docusignEnvelopeId
              )),
            }
          : item;
        setMembers((previous) => previous.map(removeLinkedDocuments));
        setFiche((previous) => previous ? removeLinkedDocuments(previous) : previous);
      }
      showToast(
        payload.voided
          ? "Enveloppe annulée et contrat réinitialisé."
          : "Contrat réinitialisé. L'ancienne enveloppe terminée reste conservée dans DocuSign.",
        "success",
      );
    } catch (error) {
      showToast(error?.message || "Réinitialisation impossible.", "error");
    } finally {
      setDocusignBusyId("");
    }
  };

  useEffect(() => {
    async function load() {
      try {
        await ensureSalaryGridSeeded(db);
        const [mSnap, cSnap, gSnap, dSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
          getDocs(collection(db, COLLECTIONS.SALARY_GRID)),
          getDocs(collection(db, COLLECTIONS.STAFF_DOCUMENTS)),
        ]);
        const mappedMembers = mSnap.docs.map(mapMember).sort((a, b) => a.name.localeCompare(b.name, "fr"));
        const memberNameById = Object.fromEntries(mappedMembers.map((member) => [
          member.id,
          `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.name,
        ]));
        const storedContracts = cSnap.docs.map(mapContract);
        const mappedContracts = storedContracts.map((contract) => ({
          ...contract,
          memberName: memberNameById[contract.memberId] || contract.memberName,
        }));
        const staleContractNames = storedContracts.filter((contract) => (
          !contract.archived
          && memberNameById[contract.memberId]
          && memberNameById[contract.memberId] !== contract.memberName
        ));
        Promise.all(staleContractNames.map((contract) => updateDoc(
          doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id),
          { memberName: memberNameById[contract.memberId] },
        ))).catch(() => {});
        const directionMemberIds = new Set(
          mappedContracts.filter(isDirectionContract).map((contract) => contract.memberId),
        );
        setMembers(mappedMembers.map((member) => (
          directionMemberIds.has(member.id) ? { ...member, staffType: "directeur" } : member
        )));
        setContracts(mappedContracts);
        setGridRows(gSnap.docs.map(mapGridRow));
        setStaffDocuments(dSnap.docs.map(mapStaffDocument));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.STAFF_DOCUMENTS),
    (snapshot) => setStaffDocuments(snapshot.docs.map(mapStaffDocument)),
    () => {},
  ), []);

  // Demandes de comptes de l'espace équipe, en direct pour le badge de l'onglet.
  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.STAFF_ACCOUNTS),
    (snapshot) => setStaffAccounts(snapshot.docs.map(mapStaffAccount)),
    () => setStaffAccounts([]),
  ), []);

  const updateMember = (updated) => {
    setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m));
    setFiche((prev) => prev?.id === updated.id ? updated : prev);
    const memberName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim() || updated.name;
    const linkedContracts = allContracts.filter((contract) => contract.memberId === updated.id && !isArchivedRecord(contract, archivedSeasons));
    const linkedIds = new Set(linkedContracts.map((contract) => contract.id));
    setContracts((previous) => previous.map((contract) => (
      linkedIds.has(contract.id) ? { ...contract, memberName } : contract
    )));
    Promise.all(
      linkedContracts.map((contract) => updateDoc(
        doc(db, COLLECTIONS.STAFF_CONTRACTS, contract.id),
        { memberName },
      )),
    ).catch(() => showToast("Le nom est enregistré dans la fiche, mais sa synchronisation vers un contrat a échoué.", "error"));
  };

  const handleContract = (member, contract) => {
    openContractPrint(member, contract);
  };

  const handleBatchContracts = (group) => {
    const entries = (group.contracts || []).map((contract) => ({
      contract,
      member: members.find((member) => member.id === contract.memberId),
    })).filter((entry) => entry.member);
    openContractsBatchPrint(entries, [group.stayCode || group.stay, group.week, seasonOfDate(group.startDate)].filter(Boolean).join("-"));
  };

  const openNewContract = (member = null, session = null) => setContractModal({ isOpen: true, member, contract: null, session });
  const openEditContract = (member, contract) => setContractModal({ isOpen: true, member: member || null, contract, session: null });
  const closeContractModal = () => setContractModal({ isOpen: false, member: null, contract: null, session: null });

  // Comptes : garder les fiches à jour après une validation, une création ou un déliement.
  const handleAccountMemberCreated = (member) => {
    const mapped = mapMember({ id: member.id, data: () => member });
    setMembers((previous) => [...previous, mapped].sort((a, b) => a.name.localeCompare(b.name, "fr")));
  };
  const handleAccountMemberLinked = (memberId, account) => {
    const apply = (member) => (member.id === memberId
      ? { ...member, accountUid: account?.uid || "", email: account?.email ? account.email.trim().toLowerCase() : member.email }
      : member);
    setMembers((previous) => previous.map(apply));
    setFiche((previous) => previous ? apply(previous) : previous);
  };

  const handleContractSaved = (savedContract, createdMember, directionMemberId = "") => {
    if (createdMember) {
      setMembers((prev) => [...prev, createdMember].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    } else if (directionMemberId) {
      setMembers((prev) => prev.map((member) => (
        member.id === directionMemberId ? { ...member, staffType: "directeur" } : member
      )));
    }
    // Re-mappe le contrat pour que les champs calculés (séjour, saison, dates, statut) suivent.
    setContracts((prev) => {
      const id = savedContract.id || `${Date.now()}`;
      const existing = prev.find((c) => c.id === id);
      const mapped = mapContract({ id, data: () => ({ ...(existing || {}), ...savedContract }) });
      return existing ? prev.map((c) => (c.id === id ? { ...c, ...mapped } : c)) : [...prev, mapped];
    });
  };

  const handleGridChange = (rows) => setGridRows(rows);

  const handleDocumentChange = (updatedDocument) => {
    setStaffDocuments((previous) => {
      const exists = previous.some((document) => document.id === updatedDocument.id);
      return exists
        ? previous.map((document) => document.id === updatedDocument.id ? { ...document, ...updatedDocument } : document)
        : [...previous, updatedDocument];
    });
  };

  const handleDocumentDelete = (documentId) => {
    setStaffDocuments((previous) => previous.filter((document) => document.id !== documentId));
  };

  const allRefreshableDocusignContracts = contracts.filter((contract) => (
    contract.docusignEnvelopeId && contract.docusignStatus !== "completed" && contract.docusignStatus !== "voided"
  ));
  const animCount = members.filter((m) => m.staffType !== "directeur").length;
  const dirCount  = members.filter((m) => m.staffType === "directeur").length;

  const TABS = [
    { key: "sejours",  label: "Par séjour",  count: new Set([...seasonSessions.map((session) => session.id), ...contracts.map(contractSessionKey)]).size || null },
    { key: "equipe",   label: "Équipe",       count: members.length },
    { key: "contrats", label: "Contrats",     count: contracts.length },
    { key: "documents", label: "Documents", count: staffDocuments.filter((document) => document.status !== "validated").length || null },
    { key: "comptes",  label: "Comptes",      count: countPendingAccounts(staffAccounts) || null, alert: true },
  ];

  return (
    <div className="dash-page hr-page">

      {/* ── En-tête ── */}
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Ressources humaines</h1>
          <p>Saison {season} · {animCount} animateur{animCount !== 1 ? "s" : ""} · {dirCount} direction · {contracts.length} contrat{contracts.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="dash-row-actions">
          <select className="hr-season-select" value={season} onChange={(event) => setSeasonChoice(event.target.value)} aria-label="Saison affichée">
            {seasonOptions.map((key) => <option key={key} value={key}>Saison {key}</option>)}
          </select>
          <button
            type="button"
            className="dash-btn"
            onClick={() => refreshVisibleDocusignStatuses(allRefreshableDocusignContracts)}
            disabled={!allRefreshableDocusignContracts.length || Boolean(docusignBusyId)}
            title="Actualise tous les contrats DocuSign actifs et archive les PDF termines"
          >
            {docusignBusyId === "__bulk__"
              ? "Actualisation signatures..."
              : `Actualiser signatures (${allRefreshableDocusignContracts.length})`}
          </button>
          <a className="dash-btn" href="/api/docusign/consent" target="_blank" rel="noreferrer">
            Connecter DocuSign
          </a>
          <Link className="dash-btn" href="/dashboard/rh/deroules">
            Déroulés
          </Link>
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
            {t.count != null && <span className={`hr-tab-count${t.alert ? " is-alert" : ""}`}>{t.count}</span>}
          </button>
        ))}
      </nav>

      {loading ? (
        <section className="dash-section">
          <p className="dash-muted">Chargement des données RH…</p>
        </section>
      ) : (
        <div className="hr-content">
          {tab === "sejours"  && <SejoursView  members={members} contracts={contracts} sessions={seasonSessions} season={season} onFiche={openMemberFile} onContract={handleContract} onEditContract={openEditContract} onBatchContracts={handleBatchContracts} onNewContract={openNewContract} />}
          {tab === "equipe"   && <EquipeView   members={members} contracts={contracts} documents={staffDocuments} onFiche={openMemberFile} onContract={handleContract} onEditContract={openEditContract} />}
          {tab === "contrats" && <ContratsView
            contracts={contracts}
            members={members}
            onContract={handleContract}
            onEditContract={openEditContract}
            onDeleteContract={deleteContractOnly}
            onNewContract={() => openNewContract(null)}
            onCompleteMember={(member, startEditing = true) => openMemberFile(member, startEditing)}
            onToggleCea={toggleCeaDeclaration}
            onToggleSocialSection={toggleSocialSection}
            onTogglePayment={toggleContractPayment}
            onDocusignSend={requestDocusignSend}
            onDocusignAttach={attachDocusignEnvelope}
            onDocusignRefresh={refreshDocusignStatus}
            onDocusignRefreshMany={refreshVisibleDocusignStatuses}
            onDocusignReset={resetDocusignContract}
            docusignBusyId={docusignBusyId}
          />}
          {tab === "documents" && <StaffDocumentsPanel
            members={members}
            contracts={contracts}
            documents={staffDocuments}
            onDocumentChange={handleDocumentChange}
            onDocumentDelete={handleDocumentDelete}
          />}
          {tab === "comptes" && <StaffAccountsPanel
            accounts={staffAccounts}
            members={members}
            onMemberCreated={handleAccountMemberCreated}
            onMemberLinked={handleAccountMemberLinked}
            onFiche={openMemberFile}
          />}
        </div>
      )}

      {/* ── Fiche modale ── */}
      {fiche && (
        <FicheModal
          member={fiche}
          contracts={contracts}
          allContracts={allContracts}
          archivedSeasons={archivedSeasons}
          sessionsById={catalog.byId}
          structuredDocuments={staffDocuments}
          initialEdit={ficheStartsInEdit}
          onClose={closeMemberFile}
          onUpdate={updateMember}
          onEditContract={openEditContract}
          onDocumentChange={handleDocumentChange}
        />
      )}

      {/* ── Contrat : création / édition ── */}
      <ContractFormModal
        isOpen={contractModal.isOpen}
        member={contractModal.member}
        contract={contractModal.contract}
        initialSession={contractModal.session}
        members={members}
        gridRows={gridRows}
        sessions={seasonSessions}
        sessionsById={catalog.byId}
        sejoursById={sejoursById}
        onClose={closeContractModal}
        onSaved={handleContractSaved}
      />

      <DocusignPreparationModal
        isOpen={contractSendReview.isOpen}
        member={contractSendReview.member}
        contract={contractSendReview.contract}
        busy={Boolean(docusignBusyId)}
        onClose={() => setContractSendReview({ isOpen: false, member: null, contract: null })}
        onPreview={(member, contract) => openContractPrint(member, contract)}
        onSaveAndSend={saveMemberThenSendContract}
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
