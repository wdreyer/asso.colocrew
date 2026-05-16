"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
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

/* ── Constants ─────────────────────────────────────────────────────────── */

const TABS = [
  { key: "all",       label: "Toutes",   color: "#7c3aed" },
  { key: "pending",   label: "En cours", color: "#f97316" },
  { key: "validated", label: "Validées", color: "#10b981" },
  { key: "deleted",   label: "Passées",  color: "#94a3b8" },
];

const STATUS_LABEL = { pending: "En cours", validated: "Validée", deleted: "Passée" };
const STATUS_BADGE  = { pending: "warning",  validated: "success",  deleted: "neutral" };

const EMAIL_TEMPLATES = [
  {
    key: "validation",
    label: "Confirmation",
    subject: (nom, sejour) =>
      `ColoCrew — Votre réservation est confirmée ! (${sejour})`,
    body: (nom, sejour, ref) =>
      `Bonjour ${nom},\n\nNous avons le plaisir de vous confirmer votre réservation pour le séjour "${sejour}" (réf. ${ref}).\n\nVotre dossier a été validé par notre équipe. Vous recevrez prochainement les informations pratiques concernant le séjour.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL'équipe ColoCrew`,
  },
  {
    key: "payment_cb",
    label: "Lien paiement CB",
    subject: (_n, sejour) =>
      `ColoCrew — Lien de paiement pour "${sejour}"`,
    body: (nom, sejour, ref, price) =>
      `Bonjour ${nom},\n\nSuite à votre demande pour le séjour "${sejour}" (réf. ${ref}), voici votre lien de paiement sécurisé.\n\nMontant : ${price}\n\n[LIEN DE PAIEMENT À INSÉRER ICI]\n\nCe lien est valable 48h. En cas de difficulté, contactez-nous.\n\nCordialement,\nL'équipe ColoCrew`,
  },
  {
    key: "docs_missing",
    label: "Documents manquants",
    subject: () => `ColoCrew — Documents manquants pour votre dossier`,
    body: (nom, sejour, ref) =>
      `Bonjour ${nom},\n\nNous avons bien reçu votre demande pour le séjour "${sejour}" (réf. ${ref}).\n\nAfin de compléter votre dossier, merci de nous transmettre les documents suivants :\n\n- \n- \n\nVous pouvez les envoyer par réponse à cet email.\n\nCordialement,\nL'équipe ColoCrew`,
  },
  {
    key: "waiting_list",
    label: "Liste d'attente",
    subject: (_n, sejour) =>
      `ColoCrew — Votre demande pour "${sejour}" est sur liste d'attente`,
    body: (nom, sejour, ref) =>
      `Bonjour ${nom},\n\nNous avons bien reçu votre demande pour le séjour "${sejour}" (réf. ${ref}).\n\nCe séjour est actuellement complet. Votre demande a été placée sur liste d'attente et nous vous contacterons dès qu'une place se libère.\n\nCordialement,\nL'équipe ColoCrew`,
  },
  {
    key: "custom",
    label: "Personnalisé",
    subject: () => "",
    body: () => "",
  },
];

/* ── Utilities ─────────────────────────────────────────────────────────── */

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
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtCur(v) {
  const n = toAmount(v);
  if (n === null) return "—";
  return `${n.toLocaleString("fr-FR")} €`;
}

function normalizeStatus(v) {
  const s = String(v || "").toLowerCase().trim();
  if (["validated","validee","validée","confirmed"].includes(s)) return "validated";
  if (["deleted","supprimee","supprimée","cancelled","archived","passée","passe"].includes(s)) return "deleted";
  return "pending";
}

function generateRef() {
  const n = new Date();
  const dd = String(n.getDate()).padStart(2, "0");
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900) + 100;
  return `RES-${dd}${mm}${rnd}`;
}

function mapReservation(snap) {
  const d = snap.data() || {};
  const legal     = d.legal     || {};
  const minor     = d.minor     || {};
  const sejour    = d.sejour    || {};
  const transport = d.transport || {};
  const pricing   = d.pricing   || d.payment || {};
  const options   = d.options   || {};

  const children   = minor.children || [];
  const firstChild = children[0] || d.child || d.participant || {};

  return {
    id: snap.id,
    status: normalizeStatus(d.status),
    numeroDeReservation: d.numeroDeReservation || "",
    tokenUnique: d.tokenUnique || "",
    nom: `${legal.firstName || legal.prenom || ""} ${legal.lastName || legal.nom || ""}`.trim() || d.name || "—",
    email: legal.email || d.email || "—",
    phone: legal.phone || legal.telephone || d.phone || "—",
    relation: legal.relation || "",
    relationOther: legal.relationOther || "",
    address: legal.address || "",
    city: legal.city || "",
    postalCode: legal.postalCode || "",
    cafOrSecu: legal.cafOrSecu || "",
    qf: legal.qf || "",
    promoCode: legal.promoCode || "",
    message: legal.message || "",
    justificatifUrl: legal.justificatifUrl || "",
    numberOfChildren: minor.numberOfChildren || "1",
    children,
    childName: `${firstChild.firstName || ""} ${firstChild.lastName || ""}`.trim() || firstChild.name || "—",
    sejourName:      sejour.name      || d.sejourName || "—",
    sejourStartDate: sejour.startDate || "",
    sejourEndDate:   sejour.endDate   || "",
    sejourAgeGroup:  sejour.ageGroup  || "",
    departureCity: transport.departureCity || transport.stationName || transport.station || "",
    returnCity:    transport.returnCity || "",
    transportFee:  toAmount(transport.fee ?? d.transportFee ?? null),
    paymentMethod: options.paymentMethod || pricing.paymentMethod || "",
    paymentStatus: pricing.paymentStatus || d.paymentStatus || "not_paid",
    totalPrice:    toAmount(pricing.totalPrice ?? pricing.total ?? null),
    estimatedMin:  toAmount(pricing.estimatedPriceMin ?? pricing.basePriceMin ?? null),
    estimatedMax:  toAmount(pricing.estimatedPriceMax ?? pricing.basePriceMax ?? null),
    insuranceFee:  toAmount(pricing.insuranceFee ?? null),
    alreadyPaid:   toAmount(pricing.alreadyPaid ?? null),
    remainingValue: toAmount(pricing.remainingValue ?? null),
    requestedPrice: toAmount(
      pricing.total ?? pricing.requested ?? pricing.estimatedPriceMax ??
      pricing.basePriceMax ?? sejour.priceMax ?? sejour.basePrice ?? d.basePrice ?? null,
    ),
    finalPrice: toAmount(d.finalPrice ?? pricing.validatedPrice ?? null),
    notes:     d.notes || "",
    dateMs:    tsToMs(d.createdAt),
    dateUpdatedMs: tsToMs(d.updatedAt),
    raw: d,
  };
}

/* ── Document generators ────────────────────────────────────────────────── */

function buildConvocationHTML(item, extra) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const childRows = item.children?.length > 0
    ? item.children.map((c, i) => `
        <tr>
          <td>${item.children.length > 1 ? `Enfant ${i + 1}` : "Nom du jeune"}</td>
          <td><strong>${c.firstName || ""} ${c.lastName || ""}</strong>
          ${c.birthDate ? `<br><small>Né(e) le ${fmtDate(c.birthDate) || c.birthDate}</small>` : ""}
          ${c.birthPlace ? `<br><small>à ${c.birthPlace}</small>` : ""}
          </td>
        </tr>`).join("")
    : `<tr><td>Nom du jeune</td><td><strong>${item.childName}</strong></td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Convocation — ${item.sejourName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:760px;margin:0 auto;padding:40px 32px;color:#1e1535;font-size:14px;line-height:1.5}
  .logo{font-size:28px;font-weight:900;color:#B8336A;letter-spacing:-0.02em}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #B8336A;padding-bottom:18px;margin-bottom:28px}
  .header-right{text-align:right;font-size:12px;color:#666;line-height:1.7}
  .doc-title{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#B8336A;text-align:center;border:2px solid #B8336A;padding:14px 20px;margin:0 0 26px;border-radius:6px}
  .intro{background:#fdf0f5;border-left:4px solid #B8336A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:14px}
  .section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#B8336A;border-bottom:2px solid #f5e8f0;padding-bottom:6px;margin:24px 0 12px}
  table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:13.5px}
  tr:nth-child(even){background:#fdf8fc}
  td{padding:9px 13px;border-bottom:1px solid #f0e8f5;vertical-align:top}
  td:first-child{font-weight:700;color:#7c3a6a;width:38%}
  .highlight-box{background:#fff5fb;border:1px solid #f0b8ce;border-radius:8px;padding:14px 18px;margin:12px 0;font-size:14px}
  .items{background:#faf8fe;border-radius:8px;padding:12px 18px;font-size:13.5px;white-space:pre-line;line-height:1.8}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}
  .sig-box{border:1px solid #ddd;border-radius:8px;padding:14px;min-height:90px}
  .sig-box h4{font-size:11px;text-transform:uppercase;color:#999;letter-spacing:0.08em;margin-bottom:8px}
  .footer{margin-top:36px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #f0e8f5;padding-top:14px}
  .print-btn{text-align:center;margin:32px 0 0}
  .print-btn button{padding:11px 30px;background:#B8336A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
  @media print{.print-btn{display:none}body{padding:20px}}
</style>
</head>
<body>
  <div class="header">
    <div><div class="logo">ColoCrew</div><div style="font-size:12px;color:#999;margin-top:3px">Association de séjours éducatifs</div></div>
    <div class="header-right">
      <div>Réf. <strong>${item.numeroDeReservation || item.id?.slice(0, 8) || "—"}</strong></div>
      <div>Paris, le ${today}</div>
    </div>
  </div>

  <div class="doc-title">Convocation</div>

  <div class="intro">
    Nous avons le plaisir de convoquer votre enfant pour le séjour <strong>${item.sejourName}</strong>.
    Merci de lire attentivement les informations ci-dessous et d'être présent(e) à l'heure indiquée.
  </div>

  <div class="section-title">Participant</div>
  <table><tbody>${childRows}</tbody></table>

  <div class="section-title">Responsable légal</div>
  <table><tbody>
    <tr><td>Nom</td><td>${item.nom}</td></tr>
    <tr><td>Email</td><td>${item.email}</td></tr>
    <tr><td>Téléphone</td><td>${item.phone}</td></tr>
  </tbody></table>

  <div class="section-title">Informations sur le séjour</div>
  <table><tbody>
    <tr><td>Séjour</td><td><strong>${item.sejourName}</strong></td></tr>
    ${item.sejourAgeGroup ? `<tr><td>Tranche d'âge</td><td>${item.sejourAgeGroup}</td></tr>` : ""}
    ${item.sejourStartDate ? `<tr><td>Début</td><td>${fmtDate(item.sejourStartDate) || item.sejourStartDate}</td></tr>` : ""}
    ${item.sejourEndDate ? `<tr><td>Fin</td><td>${fmtDate(item.sejourEndDate) || item.sejourEndDate}</td></tr>` : ""}
  </tbody></table>

  <div class="section-title">Point de rendez-vous &amp; transport</div>
  <div class="highlight-box">
    <div>📍 <strong>Lieu de départ :</strong> ${extra.meetingPoint || item.departureCity || "À préciser"}</div>
    ${extra.departureTime ? `<div style="margin-top:8px">🕐 <strong>Heure de départ :</strong> ${extra.departureTime}</div>` : ""}
    ${extra.returnTime ? `<div style="margin-top:8px">🔄 <strong>Heure de retour :</strong> ${extra.returnTime}</div>` : ""}
    ${item.returnCity ? `<div style="margin-top:8px">🏠 <strong>Ville de retour :</strong> ${item.returnCity}</div>` : ""}
  </div>

  ${extra.toBring ? `<div class="section-title">À apporter</div><div class="items">${extra.toBring}</div>` : ""}
  ${extra.notes ? `<div class="section-title">Informations complémentaires</div><div class="items">${extra.notes}</div>` : ""}

  <div class="sig-grid">
    <div class="sig-box"><h4>Signature du responsable légal</h4></div>
    <div class="sig-box"><h4>Cachet &amp; signature ColoCrew</h4></div>
  </div>

  <div class="footer">ColoCrew · contact@colocrew.com · Réf. ${item.numeroDeReservation || item.id?.slice(0, 8) || "—"}</div>
  <div class="print-btn"><button onclick="window.print()">🖨 Imprimer / Télécharger PDF</button></div>
</body></html>`;
}

function buildConvoyageHTML(item, extra) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const childRows = item.children?.length > 0
    ? item.children.map((c, i) => `
        <div class="child-card">
          ${item.children.length > 1 ? `<div class="child-num">Enfant ${i + 1}</div>` : ""}
          <table><tbody>
            <tr><td>Nom</td><td><strong>${c.firstName || ""} ${c.lastName || ""}</strong></td></tr>
            ${c.birthDate ? `<tr><td>Date de naissance</td><td>${fmtDate(c.birthDate) || c.birthDate}</td></tr>` : ""}
            ${c.birthPlace ? `<tr><td>Lieu de naissance</td><td>${c.birthPlace}</td></tr>` : ""}
            ${c.address ? `<tr><td>Adresse</td><td>${c.address}${c.postalCode ? ", " + c.postalCode : ""}${c.city ? " " + c.city : ""}</td></tr>` : ""}
          </tbody></table>
        </div>`).join("")
    : `<div class="child-card"><table><tbody>
        <tr><td>Nom</td><td><strong>${item.childName}</strong></td></tr>
      </tbody></table></div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bon de Convoyage — ${item.sejourName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:760px;margin:0 auto;padding:40px 32px;color:#1e1535;font-size:14px;line-height:1.5}
  .logo{font-size:28px;font-weight:900;color:#B8336A;letter-spacing:-0.02em}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #B8336A;padding-bottom:18px;margin-bottom:28px}
  .header-right{text-align:right;font-size:12px;color:#666;line-height:1.7}
  .doc-title{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#B8336A;text-align:center;border:2px solid #B8336A;padding:14px 20px;margin:0 0 26px;border-radius:6px}
  .section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#B8336A;border-bottom:2px solid #f5e8f0;padding-bottom:6px;margin:24px 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  tr:nth-child(even){background:#fdf8fc}
  td{padding:9px 13px;border-bottom:1px solid #f0e8f5;vertical-align:top}
  td:first-child{font-weight:700;color:#7c3a6a;width:38%}
  .child-card{background:#faf8fe;border:1px solid rgba(120,90,160,0.1);border-radius:10px;padding:14px;margin-bottom:10px}
  .child-num{font-size:10px;font-weight:800;text-transform:uppercase;color:#B8336A;letter-spacing:0.08em;margin-bottom:8px}
  .journey-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px}
  .journey-card{border-radius:10px;padding:16px 18px}
  .journey-card.aller{background:#f0fdf4;border:1px solid #a7f3d0}
  .journey-card.retour{background:#fff7f0;border:1px solid #fed7aa}
  .journey-card h3{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px}
  .journey-card.aller h3{color:#059669}
  .journey-card.retour h3{color:#ea580c}
  .journey-row{display:flex;gap:10px;margin-bottom:6px;font-size:13px}
  .journey-label{font-weight:700;min-width:90px;color:#555}
  .urgency-box{background:#fff8dc;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;margin:8px 0;font-size:13.5px}
  .items{background:#faf8fe;border-radius:8px;padding:12px 18px;font-size:13.5px;white-space:pre-line;line-height:1.8}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:36px}
  .sig-box{border:1px solid #ddd;border-radius:8px;padding:14px;min-height:90px}
  .sig-box h4{font-size:11px;text-transform:uppercase;color:#999;letter-spacing:0.08em;margin-bottom:8px}
  .footer{margin-top:36px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #f0e8f5;padding-top:14px}
  .print-btn{text-align:center;margin:32px 0 0}
  .print-btn button{padding:11px 30px;background:#B8336A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
  @media print{.print-btn{display:none}body{padding:20px}}
</style>
</head>
<body>
  <div class="header">
    <div><div class="logo">ColoCrew</div><div style="font-size:12px;color:#999;margin-top:3px">Association de séjours éducatifs</div></div>
    <div class="header-right">
      <div>Réf. <strong>${item.numeroDeReservation || item.id?.slice(0, 8) || "—"}</strong></div>
      <div>Paris, le ${today}</div>
    </div>
  </div>

  <div class="doc-title">Bon de Convoyage</div>

  <div class="section-title">Participant${item.children?.length > 1 ? "s" : ""}</div>
  ${childRows}

  <div class="section-title">Responsable légal</div>
  <table><tbody>
    <tr><td>Nom</td><td>${item.nom}</td></tr>
    <tr><td>Téléphone</td><td><strong>${item.phone}</strong></td></tr>
    <tr><td>Email</td><td>${item.email}</td></tr>
    ${item.address ? `<tr><td>Adresse</td><td>${item.address}${item.postalCode ? ", " + item.postalCode : ""}${item.city ? " " + item.city : ""}</td></tr>` : ""}
  </tbody></table>

  <div class="section-title">Itinéraire</div>
  <div class="journey-grid">
    <div class="journey-card aller">
      <h3>↑ Aller</h3>
      <div class="journey-row"><span class="journey-label">Ville</span><span>${item.departureCity || "—"}</span></div>
      <div class="journey-row"><span class="journey-label">Point RDV</span><span>${extra.meetingPoint || "—"}</span></div>
      <div class="journey-row"><span class="journey-label">Heure</span><span><strong>${extra.departureTime || "—"}</strong></span></div>
      ${item.sejourStartDate ? `<div class="journey-row"><span class="journey-label">Date</span><span>${fmtDate(item.sejourStartDate) || item.sejourStartDate}</span></div>` : ""}
    </div>
    <div class="journey-card retour">
      <h3>↓ Retour</h3>
      <div class="journey-row"><span class="journey-label">Ville</span><span>${item.returnCity || item.departureCity || "—"}</span></div>
      <div class="journey-row"><span class="journey-label">Point RDV</span><span>${extra.returnMeetingPoint || extra.meetingPoint || "—"}</span></div>
      <div class="journey-row"><span class="journey-label">Heure</span><span><strong>${extra.returnTime || "—"}</strong></span></div>
      ${item.sejourEndDate ? `<div class="journey-row"><span class="journey-label">Date</span><span>${fmtDate(item.sejourEndDate) || item.sejourEndDate}</span></div>` : ""}
    </div>
  </div>

  ${extra.convoyeur ? `
  <div class="section-title">Convoyeur responsable</div>
  <table><tbody>
    <tr><td>Nom</td><td><strong>${extra.convoyeur}</strong></td></tr>
    ${extra.convoyeurPhone ? `<tr><td>Téléphone</td><td>${extra.convoyeurPhone}</td></tr>` : ""}
  </tbody></table>` : ""}

  ${extra.urgency ? `
  <div class="section-title">Contact d'urgence</div>
  <div class="urgency-box">⚠️ ${extra.urgency}</div>` : ""}

  ${extra.notes ? `<div class="section-title">Informations complémentaires</div><div class="items">${extra.notes}</div>` : ""}

  <div class="sig-grid">
    <div class="sig-box"><h4>Signature du responsable légal<br>(remise de l'enfant)</h4></div>
    <div class="sig-box"><h4>Signature convoyeur<br>(prise en charge)</h4></div>
    <div class="sig-box"><h4>Signature convoyeur<br>(remise retour)</h4></div>
  </div>

  <div class="footer">ColoCrew · contact@colocrew.com · Réf. ${item.numeroDeReservation || item.id?.slice(0, 8) || "—"}</div>
  <div class="print-btn"><button onclick="window.print()">🖨 Imprimer / Télécharger PDF</button></div>
</body></html>`;
}

/* ── Shared sub-components ─────────────────────────────────────────────── */

function InfoRow({ label, value, accent, mono }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div className="rp-info-row">
      <span className="rp-info-label">{label}</span>
      <span className={`rp-info-value${accent ? " rp-info-accent" : ""}${mono ? " rp-info-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function PanelSection({ icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rp-section">
      <button type="button" className="rp-section-header" onClick={() => setOpen(o => !o)}>
        <span className="rp-section-icon">{icon}</span>
        <span className="rp-section-title">{title}</span>
        <svg className={`rp-section-chevron${open ? " is-open" : ""}`} width="13" height="13"
          viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="rp-section-body">{children}</div>}
    </div>
  );
}

/* ── Panel tabs ─────────────────────────────────────────────────────────── */

function PanelInfoTab({ item }) {
  const paymentMethodLabel =
    item.paymentMethod === "CB" ? "Carte bancaire" :
    item.paymentMethod === "chequeVirement" ? "Chèque / Virement" :
    item.paymentMethod || null;

  const paymentStatusLabel =
    item.paymentStatus === "paid"        ? "✅ Payé" :
    item.paymentStatus === "in_progress" ? "🕐 En cours" : "⏳ Non payé";

  const relation = item.relation
    ? `${item.relation}${item.relationOther ? ` (${item.relationOther})` : ""}` : null;

  return (
    <div className="rp-info-tab">
      <PanelSection icon="🏕️" title="Séjour">
        <InfoRow label="Nom" value={item.sejourName} />
        <InfoRow label="Tranche d'âge" value={item.sejourAgeGroup} />
        <InfoRow label="Début" value={fmtDate(item.sejourStartDate)} />
        <InfoRow label="Fin" value={fmtDate(item.sejourEndDate)} />
      </PanelSection>

      <PanelSection icon="👧" title={`Enfant${item.children?.length > 1 ? "s" : ""} (${item.children?.length || 1})`}>
        {item.children?.length > 0 ? item.children.map((c, i) => (
          <div key={i} className="rp-child-block">
            {item.children.length > 1 && <div className="rp-child-index">Enfant {i + 1}</div>}
            <InfoRow label="Nom" value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />
            <InfoRow label="Naissance" value={fmtDate(c.birthDate) || c.birthDate} />
            <InfoRow label="Lieu de naissance" value={c.birthPlace} />
            {c.address && <InfoRow label="Adresse" value={`${c.address}${c.postalCode ? ", " + c.postalCode : ""}${c.city ? " " + c.city : ""}`} />}
          </div>
        )) : <InfoRow label="Nom" value={item.childName} />}
      </PanelSection>

      <PanelSection icon="👤" title="Responsable légal">
        <InfoRow label="Nom" value={item.nom} />
        <InfoRow label="Lien de parenté" value={relation} />
        <InfoRow label="Email" value={item.email} />
        <InfoRow label="Téléphone" value={item.phone} />
        {item.address && (
          <InfoRow label="Adresse" value={`${item.address}${item.postalCode ? ", " + item.postalCode : ""}${item.city ? " " + item.city : ""}`} />
        )}
        <InfoRow label="N° CAF / Sécu" value={item.cafOrSecu} mono />
        <InfoRow label="Quotient familial" value={item.qf ? `${item.qf} €` : null} />
        {item.promoCode && <InfoRow label="Code promo" value={item.promoCode} accent />}
        {item.justificatifUrl && (
          <div className="rp-info-row">
            <span className="rp-info-label">Justificatif</span>
            <a href={item.justificatifUrl} target="_blank" rel="noopener noreferrer" className="rp-link">Télécharger →</a>
          </div>
        )}
        {item.message && (
          <div className="rp-message-block">
            <span className="rp-info-label">Message</span>
            <p className="rp-message-text">{item.message}</p>
          </div>
        )}
      </PanelSection>

      <PanelSection icon="🚌" title="Transport">
        <InfoRow label="Départ" value={item.departureCity || "Sur place"} />
        <InfoRow label="Retour" value={item.returnCity || (item.departureCity ? "—" : "Sur place")} />
        <InfoRow label="Frais transport" value={item.transportFee !== null ? fmtCur(item.transportFee) : "Inclus / Sur place"} />
      </PanelSection>

      <PanelSection icon="💳" title="Paiement">
        <InfoRow label="Mode" value={paymentMethodLabel} />
        <InfoRow label="Statut" value={paymentStatusLabel} />
        {item.estimatedMin !== null && item.estimatedMax !== null && (
          <InfoRow label="Estimation" value={
            item.estimatedMin === item.estimatedMax
              ? fmtCur(item.estimatedMin)
              : `${fmtCur(item.estimatedMin)} – ${fmtCur(item.estimatedMax)}`
          } />
        )}
        <InfoRow label="Prix final" value={fmtCur(item.finalPrice ?? item.requestedPrice)} accent />
        {item.insuranceFee > 0 && <InfoRow label="Assurance" value={fmtCur(item.insuranceFee)} />}
        {item.alreadyPaid > 0 && <InfoRow label="Déjà payé" value={fmtCur(item.alreadyPaid)} />}
        {item.remainingValue > 0 && <InfoRow label="Reste à payer" value={fmtCur(item.remainingValue)} accent />}
      </PanelSection>

      <details className="rp-raw-details">
        <summary>Données brutes (JSON)</summary>
        <pre className="rp-raw-pre">{JSON.stringify(item.raw || {}, null, 2)}</pre>
      </details>
    </div>
  );
}

function EmailComposer({ item }) {
  const { showToast } = useToast();
  const [tplKey, setTplKey] = useState("validation");
  const [sending, setSending] = useState(false);

  const priceTxt = fmtCur(item.finalPrice ?? item.requestedPrice);
  const nom = item.nom !== "—" ? item.nom.split(" ")[0] : "Madame/Monsieur";

  const initFromTpl = (key) => {
    const t = EMAIL_TEMPLATES.find(x => x.key === key) || EMAIL_TEMPLATES[0];
    return {
      subject: t.subject(nom, item.sejourName, item.numeroDeReservation, priceTxt),
      body:    t.body(nom, item.sejourName, item.numeroDeReservation, priceTxt),
    };
  };

  const [to, setTo]         = useState(item.email !== "—" ? item.email : "");
  const [subject, setSubject] = useState(() => initFromTpl("validation").subject);
  const [body, setBody]       = useState(() => initFromTpl("validation").body);

  const applyTpl = (key) => {
    setTplKey(key);
    const { subject: s, body: b } = initFromTpl(key);
    setSubject(s);
    setBody(b);
  };

  const send = async () => {
    if (!to || !subject || !body) { showToast("Remplissez tous les champs", "warning"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/send-admin-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) throw new Error();
      showToast("Email envoyé !", "success");
    } catch {
      showToast("Erreur lors de l'envoi", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rp-email-composer">
      <div className="rp-tpl-grid">
        {EMAIL_TEMPLATES.map(t => (
          <button key={t.key} type="button"
            className={`rp-tpl-chip${tplKey === t.key ? " is-active" : ""}`}
            onClick={() => applyTpl(t.key)}>{t.label}</button>
        ))}
      </div>
      <label className="rp-email-label">
        <span>Destinataire</span>
        <input className="dash-input" type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemple.com" />
      </label>
      <label className="rp-email-label">
        <span>Objet</span>
        <input className="dash-input" value={subject} onChange={e => setSubject(e.target.value)} />
      </label>
      <label className="rp-email-label">
        <span>Message</span>
        <textarea className="dash-input" rows={10} style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
          value={body} onChange={e => setBody(e.target.value)} />
      </label>
      <button type="button" className="dash-btn dash-btn-primary rp-send-btn" onClick={send} disabled={sending}>
        {sending ? "Envoi en cours…" : (
          <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>Envoyer l'email</>
        )}
      </button>
    </div>
  );
}

function DocumentsTab({ item }) {
  const [docType, setDocType] = useState("convocation");
  const [extra, setExtra] = useState({
    meetingPoint:        item.departureCity || "",
    departureTime:       "",
    returnTime:          "",
    returnMeetingPoint:  item.returnCity || "",
    convoyeur:           "",
    convoyeurPhone:      "",
    urgency:             item.phone && item.phone !== "—" ? `${item.nom} — ${item.phone}` : "",
    toBring:             "Carte nationale d'identité ou passeport\nCarnet de santé\nOrdonances médicales (si nécessaire)\nVêtements adaptés à la météo\nMaillot de bain, crème solaire\nArgent de poche",
    notes:               "",
  });

  const set = (k, v) => setExtra(p => ({ ...p, [k]: v }));

  const openDoc = () => {
    const html = docType === "convocation"
      ? buildConvocationHTML(item, extra)
      : buildConvoyageHTML(item, extra);
    const win = window.open("", "_blank", "width=900,height=760");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const isConvoc = docType === "convocation";

  return (
    <div className="rp-docs-tab">
      {/* Doc type selector */}
      <div className="rp-doc-type-row">
        <button type="button" className={`rp-doc-type-btn${isConvoc ? " is-active" : ""}`} onClick={() => setDocType("convocation")}>
          <span className="rp-doc-type-icon">📋</span>
          <span>
            <strong>Convocation</strong>
            <small>Lettre de convocation au départ</small>
          </span>
        </button>
        <button type="button" className={`rp-doc-type-btn${!isConvoc ? " is-active" : ""}`} onClick={() => setDocType("convoyage")}>
          <span className="rp-doc-type-icon">🚌</span>
          <span>
            <strong>Bon de convoyage</strong>
            <small>Document de prise en charge transport</small>
          </span>
        </button>
      </div>

      {/* Common fields */}
      <div className="rp-doc-fields">
        <div className="rp-doc-section-title">Informations de transport</div>
        <div className="rp-doc-grid">
          <label className="rp-edit-field">
            <span>Point de RDV départ</span>
            <input className="dash-input" value={extra.meetingPoint} onChange={e => set("meetingPoint", e.target.value)} placeholder="ex : Gare du Nord, voie 3" />
          </label>
          <label className="rp-edit-field">
            <span>Heure de départ</span>
            <input className="dash-input" type="time" value={extra.departureTime} onChange={e => set("departureTime", e.target.value)} />
          </label>
          {!isConvoc && (
            <label className="rp-edit-field">
              <span>Point de RDV retour</span>
              <input className="dash-input" value={extra.returnMeetingPoint} onChange={e => set("returnMeetingPoint", e.target.value)} placeholder="ex : Gare du Nord" />
            </label>
          )}
          <label className="rp-edit-field">
            <span>Heure de retour</span>
            <input className="dash-input" type="time" value={extra.returnTime} onChange={e => set("returnTime", e.target.value)} />
          </label>
        </div>

        {!isConvoc && (
          <>
            <div className="rp-doc-section-title">Convoyeur</div>
            <div className="rp-doc-grid">
              <label className="rp-edit-field">
                <span>Nom du convoyeur</span>
                <input className="dash-input" value={extra.convoyeur} onChange={e => set("convoyeur", e.target.value)} placeholder="Prénom Nom" />
              </label>
              <label className="rp-edit-field">
                <span>Téléphone convoyeur</span>
                <input className="dash-input" value={extra.convoyeurPhone} onChange={e => set("convoyeurPhone", e.target.value)} placeholder="06..." />
              </label>
            </div>
            <label className="rp-edit-field" style={{ marginTop: 10 }}>
              <span>Contact d'urgence</span>
              <input className="dash-input" value={extra.urgency} onChange={e => set("urgency", e.target.value)} placeholder="Nom — téléphone" />
            </label>
          </>
        )}

        {isConvoc && (
          <>
            <div className="rp-doc-section-title">À apporter</div>
            <label className="rp-edit-field">
              <span style={{ display: "none" }}>Liste</span>
              <textarea className="dash-input" rows={5} style={{ resize: "vertical", lineHeight: 1.7 }}
                value={extra.toBring} onChange={e => set("toBring", e.target.value)} />
            </label>
          </>
        )}

        <div className="rp-doc-section-title">Notes complémentaires</div>
        <label className="rp-edit-field">
          <span style={{ display: "none" }}>Notes</span>
          <textarea className="dash-input" rows={3} style={{ resize: "vertical" }}
            value={extra.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Informations supplémentaires à faire figurer sur le document…" />
        </label>
      </div>

      <button type="button" className="dash-btn dash-btn-primary rp-send-btn" onClick={openDoc}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
          <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Générer &amp; Imprimer / PDF
      </button>
    </div>
  );
}

function NotesTab({ item, onSave, saving }) {
  const [notes, setNotes] = useState(item.notes || "");
  useEffect(() => setNotes(item.notes || ""), [item.notes]);

  return (
    <div className="rp-notes-tab">
      <p className="rp-notes-hint">Notes internes — visibles uniquement par l'équipe ColoCrew.</p>
      <textarea className="dash-input" rows={14} style={{ resize: "vertical", lineHeight: 1.6 }}
        value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Ajouter des notes, observations, suivi du dossier…" />
      <button type="button" className="dash-btn dash-btn-primary" style={{ marginTop: 8 }}
        onClick={() => onSave(notes)} disabled={saving || notes === (item.notes || "")}>
        {saving ? "Enregistrement…" : "Sauvegarder"}
      </button>
    </div>
  );
}

function EditTab({ item, onSave }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status:          item.status,
    nom:             item.nom !== "—" ? item.nom : "",
    email:           item.email !== "—" ? item.email : "",
    phone:           item.phone !== "—" ? item.phone : "",
    sejourName:      item.sejourName !== "—" ? item.sejourName : "",
    sejourStartDate: item.sejourStartDate?.slice(0, 10) || "",
    sejourEndDate:   item.sejourEndDate?.slice(0, 10)   || "",
    sejourAgeGroup:  item.sejourAgeGroup  || "",
    departureCity:   item.departureCity   || "",
    returnCity:      item.returnCity      || "",
    transportFee:    item.transportFee    !== null ? String(item.transportFee) : "",
    finalPrice:      item.finalPrice      !== null
      ? String(item.finalPrice) : item.requestedPrice !== null ? String(item.requestedPrice) : "",
    cafOrSecu: item.cafOrSecu || "",
    qf:        item.qf ? String(item.qf) : "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const finalPrice   = Number(String(form.finalPrice).replace(",", "."));
      const transportFee = Number(String(form.transportFee).replace(",", "."));
      const qf = Number(String(form.qf).replace(",", "."));

      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        status: form.status,
        finalPrice: Number.isFinite(finalPrice) && form.finalPrice !== "" ? finalPrice : null,
        "legal.firstName": form.nom.split(" ")[0] || form.nom,
        "legal.lastName":  form.nom.split(" ").slice(1).join(" ") || "",
        "legal.email": form.email,
        "legal.phone": form.phone,
        "legal.cafOrSecu": form.cafOrSecu,
        "legal.qf": Number.isFinite(qf) && form.qf !== "" ? qf : null,
        "sejour.name":      form.sejourName,
        "sejour.startDate": form.sejourStartDate,
        "sejour.endDate":   form.sejourEndDate,
        "sejour.ageGroup":  form.sejourAgeGroup,
        "transport.departureCity": form.departureCity,
        "transport.returnCity":    form.returnCity,
        "transport.fee": Number.isFinite(transportFee) && form.transportFee !== "" ? transportFee : null,
        updatedAt: serverTimestamp(),
        ...(form.status === "validated" ? { validatedAt: serverTimestamp() } : {}),
      });
      onSave({ ...item, ...form, finalPrice: Number.isFinite(finalPrice) ? finalPrice : item.finalPrice });
      showToast("Modifications enregistrées", "success");
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, k, type = "text", placeholder = "" }) => (
    <label className="rp-edit-field">
      <span>{label}</span>
      <input className="dash-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="rp-edit-tab">
      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Statut</div>
        <select className="dash-input" value={form.status} onChange={e => set("status", e.target.value)}>
          <option value="pending">En cours</option>
          <option value="validated">Validée</option>
          <option value="deleted">Passée</option>
        </select>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Responsable légal</div>
        <div className="rp-edit-grid">
          <F label="Nom complet" k="nom" />
          <F label="Email" k="email" type="email" />
          <F label="Téléphone" k="phone" />
          <F label="N° CAF / Sécu" k="cafOrSecu" />
          <F label="Quotient familial (€)" k="qf" type="number" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Séjour</div>
        <div className="rp-edit-grid">
          <label className="rp-edit-field rp-edit-span2">
            <span>Nom du séjour</span>
            <input className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)} />
          </label>
          <F label="Date début" k="sejourStartDate" type="date" />
          <F label="Date fin"   k="sejourEndDate"   type="date" />
          <F label="Tranche d'âge" k="sejourAgeGroup" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Transport</div>
        <div className="rp-edit-grid">
          <F label="Ville départ" k="departureCity" placeholder="ex : Paris" />
          <F label="Ville retour" k="returnCity" placeholder="ex : Paris" />
          <F label="Frais transport (€)" k="transportFee" type="number" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Prix final validé (€)</div>
        <input className="dash-input" type="number" min="0" value={form.finalPrice}
          onChange={e => set("finalPrice", e.target.value)} placeholder="ex : 890"
          style={{ borderColor: "rgba(184,51,106,0.35)", fontWeight: 700 }} />
      </div>

      <button type="button" className="dash-btn dash-btn-primary rp-send-btn" onClick={save} disabled={saving}>
        {saving ? "Enregistrement…" : "Sauvegarder les modifications"}
      </button>
    </div>
  );
}

/* ── Right panel ────────────────────────────────────────────────────────── */

const PANEL_TABS = [
  { key: "info",   label: "Infos" },
  { key: "docs",   label: "Documents" },
  { key: "email",  label: "Email" },
  { key: "edit",   label: "Modifier" },
  { key: "notes",  label: "Notes" },
];

function ReservationPanel({ item: externalItem, onClose, onSave, onDelete, onStatusChange }) {
  const { showToast } = useToast();
  const [item, setItem]         = useState(externalItem);
  const [panelTab, setPanelTab] = useState("info");
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setItem(externalItem), [externalItem]);

  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const updateStatus = async (newStatus) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        status: newStatus, updatedAt: serverTimestamp(),
        ...(newStatus === "validated" ? { validatedAt: serverTimestamp() } : {}),
      });
      const updated = { ...item, status: newStatus };
      setItem(updated);
      onStatusChange(updated);
      showToast(newStatus === "validated" ? "Réservation validée !" : "Statut mis à jour", "success");
    } catch { showToast("Erreur changement statut", "error"); }
  };

  const handleSave = (updated) => { setItem(updated); onSave(updated); };

  const handleSaveNotes = async (notes) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), { notes, updatedAt: serverTimestamp() });
      const updated = { ...item, notes };
      setItem(updated);
      onSave(updated);
      showToast("Notes sauvegardées", "success");
    } catch { showToast("Erreur sauvegarde", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer définitivement cette réservation ?")) return;
    setDeleting(true);
    try { await onDelete(item.id); onClose(); }
    finally { setDeleting(false); }
  };

  const statusColors = { pending: "#f97316", validated: "#10b981", deleted: "#94a3b8" };
  const sc = statusColors[item.status] || "#94a3b8";
  const sejourLink = item.tokenUnique ? `/reservation/${item.tokenUnique}` : null;

  return (
    <aside className="res-panel">
      {/* Header */}
      <div className="rp-header">
        <div className="rp-header-top">
          <div className="rp-avatar" style={{ background: `${sc}22`, color: sc }}>
            {(item.nom || "?")[0].toUpperCase()}
          </div>
          <div className="rp-header-info">
            <div className="rp-header-name">{item.nom}</div>
            <div className="rp-header-meta">
              {item.numeroDeReservation && <span className="rp-header-ref">{item.numeroDeReservation}</span>}
              <span className="rp-header-date">{fmt(item.dateMs)}</span>
              <span className="rp-header-sejour">{item.sejourName !== "—" ? item.sejourName : ""}</span>
            </div>
          </div>
          <button type="button" className="rp-close" onClick={onClose} aria-label="Fermer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rp-header-actions">
          <select className="dash-input rp-status-select"
            value={item.status} onChange={e => updateStatus(e.target.value)}
            style={{ "--status-color": sc }}>
            <option value="pending">🟠 En cours</option>
            <option value="validated">🟢 Validée</option>
            <option value="deleted">⚫ Passée</option>
          </select>

          {item.status !== "validated" && (
            <button type="button" className="rp-validate-btn" onClick={() => updateStatus("validated")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Valider
            </button>
          )}

          {sejourLink && (
            <a href={sejourLink} target="_blank" rel="noopener noreferrer" className="rp-icon-btn" title="Voir la réservation publique">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>

        <div className="rp-tabs">
          {PANEL_TABS.map(t => (
            <button key={t.key} type="button"
              className={`rp-tab${panelTab === t.key ? " is-active" : ""}`}
              onClick={() => setPanelTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="rp-body">
        {panelTab === "info"  && <PanelInfoTab item={item} />}
        {panelTab === "docs"  && <DocumentsTab item={item} />}
        {panelTab === "email" && <EmailComposer item={item} />}
        {panelTab === "edit"  && <EditTab item={item} onSave={handleSave} />}
        {panelTab === "notes" && <NotesTab item={item} onSave={handleSaveNotes} saving={saving} />}
      </div>

      <div className="rp-footer">
        <button type="button" className="dash-btn dash-btn-danger" onClick={handleDelete} disabled={deleting || saving}>
          {deleting ? "Suppression…" : "Supprimer"}
        </button>
        {item.dateUpdatedMs && item.dateUpdatedMs !== item.dateMs && (
          <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>Modifié le {fmt(item.dateUpdatedMs)}</span>
        )}
      </div>
    </aside>
  );
}

/* ── New reservation modal ─────────────────────────────────────────────── */

const EMPTY_FORM = {
  status: "pending",
  // legal
  firstName: "", lastName: "", email: "", phone: "", relation: "",
  address: "", city: "", postalCode: "", cafOrSecu: "", qf: "", message: "",
  // child 1
  childFirstName: "", childLastName: "", childBirthDate: "", childBirthPlace: "", childCity: "",
  // sejour
  sejourName: "", sejourStartDate: "", sejourEndDate: "", sejourAgeGroup: "",
  // transport
  departureCity: "", returnCity: "", transportFee: "",
  // payment
  paymentMethod: "chequeVirement", estimatedMin: "", estimatedMax: "",
  // notes
  notes: "",
};

function NewReservationModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(1); // 1=Séjour, 2=Enfant, 3=Parent, 4=Transport+Paiement

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.lastName && !form.firstName) {
      showToast("Le nom du responsable légal est requis", "warning"); return;
    }
    setSaving(true);
    try {
      const ref = generateRef();
      const data = {
        numeroDeReservation: ref,
        status: form.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notes: form.notes,
        legal: {
          firstName: form.firstName,
          lastName:  form.lastName,
          email:     form.email,
          phone:     form.phone,
          relation:  form.relation,
          address:   form.address,
          city:      form.city,
          postalCode: form.postalCode,
          cafOrSecu: form.cafOrSecu,
          qf:        form.qf ? Number(form.qf) : null,
          message:   form.message,
        },
        minor: {
          numberOfChildren: "1",
          children: [{
            firstName:  form.childFirstName,
            lastName:   form.childLastName,
            birthDate:  form.childBirthDate,
            birthPlace: form.childBirthPlace,
            city:       form.childCity,
          }],
        },
        sejour: {
          name:      form.sejourName,
          startDate: form.sejourStartDate,
          endDate:   form.sejourEndDate,
          ageGroup:  form.sejourAgeGroup,
        },
        transport: {
          departureCity: form.departureCity,
          returnCity:    form.returnCity,
          fee: form.transportFee !== "" ? Number(form.transportFee) : null,
        },
        options: { paymentMethod: form.paymentMethod },
        payment: {
          paymentMethod:    form.paymentMethod,
          paymentStatus:    "not_paid",
          estimatedPriceMin: form.estimatedMin !== "" ? Number(form.estimatedMin) : null,
          estimatedPriceMax: form.estimatedMax !== "" ? Number(form.estimatedMax) : null,
        },
      };

      const docRef = await addDoc(collection(db, COLLECTIONS.RESERVATIONS), data);
      showToast(`Réservation ${ref} créée !`, "success");
      onCreated({ id: docRef.id, ...mapReservation({ id: docRef.id, data: () => data }) });
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la création", "error");
    } finally {
      setSaving(false);
    }
  };

  const STEPS = ["Séjour", "Enfant", "Parent", "Paiement"];

  const F = ({ label, k, type = "text", placeholder = "", required = false, span2 = false }) => (
    <label className={`rp-edit-field${span2 ? " rp-edit-span2" : ""}`}>
      <span>{label}{required && <span style={{ color: "var(--dash-accent)" }}> *</span>}</span>
      <input className="dash-input" type={type} value={form[k]}
        onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="res-new-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="res-new-modal">
        {/* Header */}
        <div className="res-new-header">
          <div>
            <div className="res-new-title">Nouvelle réservation manuelle</div>
            <div className="res-new-sub">Création directe dans Firestore</div>
          </div>
          <button type="button" className="rp-close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="res-new-steps">
          {STEPS.map((s, i) => (
            <button key={i} type="button"
              className={`res-new-step${step === i + 1 ? " is-active" : ""}${step > i + 1 ? " is-done" : ""}`}
              onClick={() => setStep(i + 1)}>
              <span className="res-new-step-num">{step > i + 1 ? "✓" : i + 1}</span>
              <span>{s}</span>
            </button>
          ))}
        </div>

        {/* Form body */}
        <div className="res-new-body">
          {step === 1 && (
            <div className="rp-edit-grid">
              <label className="rp-edit-field rp-edit-span2">
                <span>Nom du séjour <span style={{ color: "var(--dash-accent)" }}>*</span></span>
                <input className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)} placeholder="ex : Alpes Été 2026" />
              </label>
              <F label="Date de début" k="sejourStartDate" type="date" />
              <F label="Date de fin"   k="sejourEndDate"   type="date" />
              <F label="Tranche d'âge" k="sejourAgeGroup" placeholder="ex : 12-17 ans" />
              <div className="rp-edit-field">
                <span>Statut initial</span>
                <select className="dash-input" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="pending">En cours</option>
                  <option value="validated">Validée</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rp-edit-grid">
              <F label="Prénom de l'enfant" k="childFirstName" required />
              <F label="Nom de l'enfant" k="childLastName" required />
              <F label="Date de naissance" k="childBirthDate" type="date" />
              <F label="Lieu de naissance" k="childBirthPlace" placeholder="Ville" />
              <F label="Ville de résidence" k="childCity" />
            </div>
          )}

          {step === 3 && (
            <div className="rp-edit-grid">
              <F label="Prénom" k="firstName" required />
              <F label="Nom" k="lastName" required />
              <F label="Email" k="email" type="email" />
              <F label="Téléphone" k="phone" />
              <div className="rp-edit-field">
                <span>Lien de parenté</span>
                <select className="dash-input" value={form.relation} onChange={e => set("relation", e.target.value)}>
                  <option value="">—</option>
                  <option value="père">Père</option>
                  <option value="mère">Mère</option>
                  <option value="tuteur">Tuteur / Tutrice</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <F label="N° CAF / Sécu" k="cafOrSecu" />
              <F label="Quotient familial (€)" k="qf" type="number" />
              <F label="Adresse" k="address" span2 />
              <F label="Code postal" k="postalCode" />
              <F label="Ville" k="city" />
              <label className="rp-edit-field rp-edit-span2">
                <span>Message / observations</span>
                <textarea className="dash-input" rows={3} style={{ resize: "vertical" }}
                  value={form.message} onChange={e => set("message", e.target.value)} />
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="rp-edit-grid">
              <F label="Ville de départ" k="departureCity" placeholder="ex : Paris" />
              <F label="Ville de retour"  k="returnCity"    placeholder="ex : Paris" />
              <F label="Frais transport (€)" k="transportFee" type="number" />
              <div className="rp-edit-field">
                <span>Mode de paiement</span>
                <select className="dash-input" value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)}>
                  <option value="chequeVirement">Chèque / Virement</option>
                  <option value="CB">Carte bancaire (CB)</option>
                </select>
              </div>
              <F label="Prix estimé min (€)" k="estimatedMin" type="number" placeholder="ex : 700" />
              <F label="Prix estimé max (€)" k="estimatedMax" type="number" placeholder="ex : 900" />
              <label className="rp-edit-field rp-edit-span2">
                <span>Notes internes</span>
                <textarea className="dash-input" rows={3} style={{ resize: "vertical" }}
                  value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Observations, context de cette réservation manuelle…" />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="res-new-footer">
          <button type="button" className="dash-btn" onClick={onClose} disabled={saving}>Annuler</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && (
              <button type="button" className="dash-btn" onClick={() => setStep(s => s - 1)} disabled={saving}>
                ← Précédent
              </button>
            )}
            {step < 4 ? (
              <button type="button" className="dash-btn dash-btn-primary" onClick={() => setStep(s => s + 1)}>
                Suivant →
              </button>
            ) : (
              <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Création…" : "Créer la réservation"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export default function Reservations() {
  const [items, setItems]               = useState([]);
  const [activeTab, setActiveTab]       = useState("pending");
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [showNew, setShowNew]           = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc")),
      );
      setItems(snap.docs.map(mapReservation));
    } catch { showToast("Erreur de chargement", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => ({
    all:       items,
    pending:   items.filter(x => x.status === "pending"),
    validated: items.filter(x => x.status === "validated"),
    deleted:   items.filter(x => x.status === "deleted"),
  }), [items]);

  const currentList = buckets[activeTab] || [];

  const handleSave = (updated) => {
    setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    if (selectedItem?.id === updated.id) setSelectedItem(prev => ({ ...prev, ...updated }));
  };

  const handleStatusChange = (updated) => {
    setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    if (selectedItem?.id === updated.id) setSelectedItem(prev => ({ ...prev, ...updated }));
  };

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.RESERVATIONS, id));
      setItems(prev => prev.filter(x => x.id !== id));
      if (selectedItem?.id === id) setSelectedItem(null);
      showToast("Réservation supprimée", "success");
    } catch (err) {
      console.error(err);
      showToast("Impossible de supprimer", "error");
      throw err;
    }
  }, [showToast, selectedItem]);

  const handleCreated = (newItem) => {
    setItems(prev => [newItem, ...prev]);
    setSelectedItem(newItem);
    setActiveTab("all");
  };

  const totalRevenue = useMemo(
    () => items.reduce((s, x) => s + (x.finalPrice ?? x.requestedPrice ?? 0), 0),
    [items],
  );

  const columns = useMemo(() => [
    {
      key: "nom",
      label: "Nom",
      sortValue: row => row.nom || "",
      render: row => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.nom}</div>
          {row.childName && row.childName !== "—" && (
            <div style={{ fontSize: 11, color: "var(--dash-muted)", marginTop: 1 }}>
              {row.children?.length > 1 ? `${row.children.length} enfants` : row.childName !== row.nom ? row.childName : null}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "email",
      label: "Contact",
      sortValue: row => row.email || "",
      render: row => (
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
      sortValue: row => row.departureCity || "",
      render: row =>
        row.departureCity ? (
          <div style={{ fontSize: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>↑ {row.departureCity}</span>
            {row.returnCity && <span style={{ background: "#fff7f0", color: "#c2410c", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>↓ {row.returnCity}</span>}
          </div>
        ) : <span style={{ color: "var(--dash-muted)", fontSize: 12 }}>Sur place</span>,
    },
    {
      key: "finalPrice",
      label: "Prix",
      sortValue: row => row.finalPrice ?? row.requestedPrice ?? -1,
      render: row => (
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
      sortValue: row => row.dateMs || 0,
      render: row => <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>{fmt(row.dateMs)}</span>,
    },
    {
      key: "status",
      label: "Statut",
      sortable: false,
      render: row => <Badge label={STATUS_LABEL[row.status] || row.status} variant={STATUS_BADGE[row.status] || "neutral"} />,
    },
  ], []);

  return (
    <>
      <div className={`res-page-layout${selectedItem ? " has-panel" : ""}`}>
        <div className="res-main">
          <div className="dash-page">
            <header className="dash-page-header dash-page-header-row">
              <div>
                <h1>Réservations</h1>
                <p>Gestion des inscriptions, tarifs et statuts.</p>
              </div>
              <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
                <div className="res-stat-badge">
                  <span className="res-stat-value">{items.length}</span>
                  <span className="res-stat-label">total</span>
                </div>
                <div className="res-stat-badge res-stat-green">
                  <span className="res-stat-value">{buckets.validated.length}</span>
                  <span className="res-stat-label">validées</span>
                </div>
                <div className="res-stat-badge res-stat-orange">
                  <span className="res-stat-value">{buckets.pending.length}</span>
                  <span className="res-stat-label">en attente</span>
                </div>
                {totalRevenue > 0 && (
                  <div className="res-stat-badge res-stat-pink">
                    <span className="res-stat-value" style={{ fontSize: 13 }}>{fmtCur(totalRevenue)}</span>
                    <span className="res-stat-label">CA total</span>
                  </div>
                )}
                <button type="button" className="dash-btn" onClick={load}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.5 15A9 9 0 1 1 21 9" />
                  </svg>
                  Actualiser
                </button>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Nouvelle réservation
                </button>
              </div>
            </header>

            <div className="res-tabs">
              {TABS.map(({ key, label, color }) => (
                <button key={key} type="button"
                  className={`res-tab${activeTab === key ? " is-active" : ""}`}
                  style={{ "--tab-color": color }} onClick={() => setActiveTab(key)}>
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
                searchableKeys={["nom","email","childName","sejourName","departureCity","returnCity","numeroDeReservation"]}
                defaultSortKey="dateMs"
                defaultSortDirection="desc"
                onRowClick={row => setSelectedItem(prev => prev?.id === row.id ? null : row)}
                selectedRowId={selectedItem?.id}
                emptyLabel="Aucune réservation dans cet onglet."
                toolsInline
              />
            )}
          </div>
        </div>

        {selectedItem && (
          <ReservationPanel
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleSave}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {showNew && (
        <NewReservationModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
