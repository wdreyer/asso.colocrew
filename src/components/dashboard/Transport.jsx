"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc,
  getDocs, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/* ── Constants ─────────────────────────────────────────────────────────── */

const TRAIN_TYPES = ["TGV", "TER", "Intercités", "Ouigo", "Bus", "Car", "Autre"];

const STATUS_CFG = {
  brouillon: { label: "Brouillon",  variant: "neutral"  },
  confirmé:  { label: "Confirmé",   variant: "success"  },
  annulé:    { label: "Annulé",     variant: "error"    },
};

/* ── Utilities ─────────────────────────────────────────────────────────── */

function tsToMs(v) {
  if (v?.toMillis) return v.toMillis();
  if (typeof v === "number") return v;
  const p = Date.parse(String(v || ""));
  return Number.isNaN(p) ? 0 : p;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtBirthDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function mapTransport(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    sejourName:      d.sejourName      || "—",
    direction:       d.direction       || "aller",
    departureCity:   d.departureCity   || "",
    arrivalCity:     d.arrivalCity     || "",
    date:            d.date            || "",
    departureTime:   d.departureTime   || "",
    arrivalTime:     d.arrivalTime     || "",
    trainType:       d.trainType       || "TGV",
    trainNumber:     d.trainNumber     || "",
    meetingPoint:    d.meetingPoint    || "",
    meetingTime:     d.meetingTime     || "",
    platform:        d.platform        || "",
    convoyeur:       d.convoyeur       || "",
    convoyeurPhone:  d.convoyeurPhone  || "",
    capacity:        Number(d.capacity) || 0,
    status:          d.status          || "brouillon",
    notes:           d.notes           || "",
    passengers:      d.passengers      || [],
    dateMs:          tsToMs(d.createdAt),
  };
}

function mapReservationForTransport(snap) {
  const d = snap.data() || {};
  const legal   = d.legal   || {};
  const minor   = d.minor   || {};
  const sejour  = d.sejour  || {};
  const transport = d.transport || {};
  const children = minor.children || [];
  const first   = children[0] || {};
  return {
    id:   snap.id,
    numeroDeReservation: d.numeroDeReservation || "",
    nom:  `${legal.firstName || ""} ${legal.lastName || ""}`.trim() || "—",
    email: legal.email || "—",
    phone: legal.phone || "—",
    children,
    childName: `${first.firstName || ""} ${first.lastName || ""}`.trim() || "—",
    sejourName:    sejour.name       || "—",
    departureCity: transport.departureCity || "",
    returnCity:    transport.returnCity    || "",
    status: d.status || "pending",
  };
}

/* ── Document generators ─────────────────────────────────────────────────
   All return an HTML string opened in a new window for print/PDF.         */

const SHARED_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1e1535;font-size:14px;line-height:1.5}
  .doc-header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #B8336A;padding-bottom:16px;margin-bottom:22px}
  .logo{font-size:26px;font-weight:900;color:#B8336A;letter-spacing:-0.02em}
  .logo-sub{font-size:11px;color:#999;margin-top:2px}
  .hdr-right{text-align:right;font-size:12px;color:#666;line-height:1.8}
  .sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#B8336A;border-bottom:2px solid #f5e8f0;padding-bottom:5px;margin:18px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  tr:nth-child(even){background:#fdf8fc}
  td{padding:8px 11px;border-bottom:1px solid #f0e8f5;vertical-align:top}
  td:first-child{font-weight:700;color:#7c3a6a;width:36%}
  .sub{font-size:11.5px;color:#888}
  .transport-card{border-left:4px solid;border-radius:0 10px 10px 0;padding:14px 18px}
  .tr-row{display:flex;gap:12px;align-items:baseline;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.04)}
  .tr-row:last-child{border-bottom:none}
  .tr-lbl{font-weight:700;min-width:148px;font-size:12.5px;color:#555}
  .sig-grid{display:grid;gap:14px;margin-top:26px}
  .sig-box{border:1px solid #ddd;border-radius:8px;padding:12px;min-height:78px}
  .sig-box h4{font-size:10.5px;text-transform:uppercase;color:#aaa;letter-spacing:0.07em;margin-bottom:6px}
  .print-btn{text-align:center;margin:30px auto}
  .print-btn button{padding:11px 30px;background:#B8336A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.02em}
  @media print{.print-btn{display:none}body{padding:20px}}
`;

function buildPassengerListHTML(transport) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const dirLabel = transport.direction === "aller" ? "↑ ALLER" : "↓ RETOUR";
  const dirColor = transport.direction === "aller" ? "#16a34a" : "#ea580c";

  const rows = transport.passengers.map((p, i) => {
    const children = p.children || [];
    const childStr  = children.length > 0 ? children.map(c => `${c.firstName||""} ${c.lastName||""}`.trim()).join("<br>") : (p.childName || "—");
    const birthStr  = children.length > 0 ? children.map(c => fmtBirthDate(c.birthDate) || "—").join("<br>") : "—";
    return `<tr>
      <td style="text-align:center;font-weight:800;color:${dirColor}">${i + 1}</td>
      <td><strong>${p.nom}</strong></td>
      <td><strong>${p.phone}</strong></td>
      <td>${childStr}</td>
      <td>${birthStr}</td>
      <td style="font-family:monospace;font-size:11.5px;color:#888">${p.numeroDeReservation || "—"}</td>
      <td style="text-align:center;font-size:16px">☐</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa;font-style:italic">Aucun passager assigné</td></tr>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Liste passagers — ${transport.sejourName}</title>
<style>
  ${SHARED_CSS}
  body{padding:36px 32px;max-width:1020px;margin:0 auto}
  .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:10px;margin-bottom:22px}
  .info-card{background:#faf8fe;border:1px solid rgba(120,90,160,0.12);border-radius:8px;padding:11px 14px}
  .ic-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#B8336A;margin-bottom:3px}
  .ic-val{font-size:14px;font-weight:700}
  .ic-sub{font-size:11.5px;color:#666;margin-top:2px}
  thead tr{background:#B8336A}
  thead th{padding:9px 10px;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;text-align:left}
  .cap{display:inline-block;background:${dirColor}22;color:${dirColor};border:1px solid ${dirColor}44;border-radius:999px;padding:3px 12px;font-weight:800;font-size:13px;margin-left:8px}
</style></head><body>
  <div class="doc-header">
    <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
    <div class="hdr-right">
      <div style="font-size:17px;font-weight:900;color:#1e1535">LISTE PASSAGERS</div>
      <div style="color:${dirColor};font-weight:800">${dirLabel} — ${transport.sejourName}</div>
      <div>Édité le ${today}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card"><div class="ic-label">Trajet</div><div class="ic-val">${transport.departureCity || "—"} → ${transport.arrivalCity || "—"}</div></div>
    <div class="info-card"><div class="ic-label">Date</div><div class="ic-val">${fmtDateLong(transport.date)}</div></div>
    <div class="info-card"><div class="ic-label">Train</div><div class="ic-val">${transport.trainType || ""} ${transport.trainNumber || ""}</div></div>
    <div class="info-card"><div class="ic-label">Départ / Arrivée</div><div class="ic-val">${transport.departureTime || "—"} → ${transport.arrivalTime || "—"}</div></div>
    <div class="info-card"><div class="ic-label">Point de RDV</div><div class="ic-val">${transport.meetingPoint || transport.departureCity || "—"}</div>${transport.meetingTime ? `<div class="ic-sub">RDV à ${transport.meetingTime}</div>` : ""}${transport.platform ? `<div class="ic-sub">Voie ${transport.platform}</div>` : ""}</div>
    <div class="info-card"><div class="ic-label">Convoyeur</div><div class="ic-val">${transport.convoyeur || "—"}</div>${transport.convoyeurPhone ? `<div class="ic-sub">${transport.convoyeurPhone}</div>` : ""}</div>
  </div>
  <div class="sec">Passagers <span class="cap">${transport.passengers.length}${transport.capacity ? " / " + transport.capacity : ""}</span></div>
  <table>
    <thead><tr><th style="width:32px">#</th><th>Responsable légal</th><th>Téléphone</th><th>Enfant(s)</th><th>Date naissance</th><th>N° réservation</th><th style="width:32px">✓</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sig-grid" style="grid-template-columns:1fr 1fr;margin-top:28px">
    <div class="sig-box"><h4>Signature convoyeur</h4></div>
    <div class="sig-box"><h4>Visa ColoCrew</h4></div>
  </div>
  ${transport.notes ? `<div class="sec" style="margin-top:22px">Notes</div><p style="font-size:13px;color:#444;background:#faf8fe;border-radius:8px;padding:12px 14px">${transport.notes}</p>` : ""}
  <div class="print-btn"><button onclick="window.print()">🖨 Imprimer / Télécharger PDF</button></div>
</body></html>`;
}

function buildGroupConvocHTML(transport) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const isAller   = transport.direction === "aller";
  const dirColor  = isAller ? "#16a34a" : "#ea580c";
  const dirBg     = isAller ? "#f0fdf4" : "#fff7ed";
  const dirLabel  = isAller ? "↑ ALLER" : "↓ RETOUR";

  const transportCard = `
    <div class="transport-card" style="border-color:${dirColor};background:${dirBg};margin-bottom:4px">
      <div class="tr-row"><span class="tr-lbl">📅 Date</span><strong>${fmtDateLong(transport.date)}</strong></div>
      ${transport.meetingTime ? `<div class="tr-row"><span class="tr-lbl">⏰ Heure de RDV</span><strong>${transport.meetingTime}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">📍 Point de RDV</span><strong>${transport.meetingPoint || transport.departureCity || "—"}</strong></div>
      ${transport.platform ? `<div class="tr-row"><span class="tr-lbl">🚉 Voie / Quai</span><strong>${transport.platform}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">🚄 Train</span><strong>${transport.trainType || ""} ${transport.trainNumber || ""}</strong></div>
      <div class="tr-row"><span class="tr-lbl">🕐 Départ</span><strong>${transport.departureTime || "—"}</strong> depuis ${transport.departureCity || "—"}</div>
      ${transport.arrivalTime ? `<div class="tr-row"><span class="tr-lbl">🏁 Arrivée prévue</span><strong>${transport.arrivalTime}</strong> à ${transport.arrivalCity || "—"}</div>` : ""}
    </div>`;

  const pages = transport.passengers.map((p, idx) => {
    const children = p.children || [];
    const childRows = children.length > 0
      ? children.map((c, j) => `<tr>
          <td>${children.length > 1 ? `Enfant ${j + 1}` : "Jeune"}</td>
          <td><strong>${c.firstName || ""} ${c.lastName || ""}</strong>
          ${c.birthDate ? `<br><span class="sub">Né(e) le ${fmtBirthDate(c.birthDate)}</span>` : ""}
          ${c.birthPlace ? `<br><span class="sub">à ${c.birthPlace}</span>` : ""}
          </td></tr>`).join("")
      : `<tr><td>Jeune</td><td><strong>${p.childName || "—"}</strong></td></tr>`;

    const isLast = idx === transport.passengers.length - 1;

    return `<div class="page${isLast ? "" : " pb"}">
      <div class="doc-header">
        <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
        <div class="hdr-right"><div>Réf. <strong>${p.numeroDeReservation || p.reservationId?.slice(0,8) || "—"}</strong></div><div>${today}</div></div>
      </div>
      <div class="doc-title">CONVOCATION</div>
      <div class="dir-badge" style="background:${dirBg};border-color:${dirColor};color:${dirColor}">
        ${dirLabel} — ${transport.sejourName}
      </div>
      <div class="sec">Participant(s)</div>
      <table><tbody>${childRows}</tbody></table>
      <div class="sec">Responsable légal</div>
      <table><tbody>
        <tr><td>Nom</td><td>${p.nom}</td></tr>
        <tr><td>Téléphone</td><td><strong>${p.phone}</strong></td></tr>
        <tr><td>Email</td><td>${p.email}</td></tr>
      </tbody></table>
      <div class="sec">Informations de transport</div>
      ${transportCard}
      ${transport.convoyeur ? `
      <div class="sec">Accompagnateur</div>
      <table><tbody>
        <tr><td>Nom</td><td><strong>${transport.convoyeur}</strong></td></tr>
        ${transport.convoyeurPhone ? `<tr><td>Téléphone</td><td>${transport.convoyeurPhone}</td></tr>` : ""}
      </tbody></table>` : ""}
      <div class="sig-grid" style="grid-template-columns:${isAller ? "1fr 1fr" : "1fr 1fr 1fr"}">
        <div class="sig-box"><h4>Signature responsable légal<br>(remise de l'enfant)</h4></div>
        <div class="sig-box"><h4>Signature convoyeur<br>(prise en charge aller)</h4></div>
        ${!isAller ? `<div class="sig-box"><h4>Signature responsable légal<br>(reprise de l'enfant retour)</h4></div>` : ""}
      </div>
    </div>`;
  });

  if (pages.length === 0) {
    pages.push(`<div class="page"><p style="text-align:center;padding:60px;color:#aaa">Aucun passager assigné à ce transport.</p></div>`);
  }

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Convocations — ${transport.sejourName} ${transport.direction}</title>
<style>
  ${SHARED_CSS}
  .page{max-width:760px;margin:0 auto;padding:36px 32px}
  .pb{page-break-after:always}
  .doc-title{font-size:21px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#B8336A;text-align:center;border:2px solid #B8336A;padding:12px 20px;margin:0 0 18px;border-radius:6px}
  .dir-badge{text-align:center;font-weight:800;font-size:13.5px;border:1.5px solid;border-radius:8px;padding:10px;margin-bottom:18px;letter-spacing:0.04em}
</style></head><body>
${pages.join("\n")}
<div class="print-btn"><button onclick="window.print()">🖨 Imprimer toutes les convocations (${transport.passengers.length} page${transport.passengers.length > 1 ? "s" : ""})</button></div>
</body></html>`;
}

function buildSingleConvocHTML(transport, passenger) {
  return buildGroupConvocHTML({ ...transport, passengers: [passenger] });
}

/* ── Shared panel sub-components ────────────────────────────────────────── */

function InfoRow({ label, value, accent, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div className="rp-info-row">
      <span className="rp-info-label">{label}</span>
      <span className={`rp-info-value${accent ? " rp-info-accent" : ""}${mono ? " rp-info-mono" : ""}`}>{value}</span>
    </div>
  );
}

function CapacityBar({ current, total }) {
  if (!total) return <span className="tr-pax-count">{current} passager{current !== 1 ? "s" : ""}</span>;
  const pct = Math.min(100, Math.round((current / total) * 100));
  const cls  = pct >= 100 ? "full" : pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";
  return (
    <div className="tr-capacity-wrap">
      <div className="tr-capacity-bar">
        <div className={`tr-capacity-fill tr-cap-${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tr-pax-count tr-cap-txt-${cls}`}>{current} / {total}</span>
    </div>
  );
}

/* ── Panel tabs ─────────────────────────────────────────────────────────── */

function PassengersTab({ transport, allReservations, onUpdate }) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const assignedIds = useMemo(
    () => new Set(transport.passengers.map(p => p.reservationId)),
    [transport.passengers],
  );

  const cityKey  = transport.direction === "aller" ? "departureCity" : "returnCity";
  const cityVal  = (transport.direction === "aller" ? transport.departureCity : transport.arrivalCity)?.toLowerCase() || "";

  const candidates = useMemo(() => {
    const q = search.toLowerCase();
    return allReservations.filter(r =>
      !assignedIds.has(r.id) &&
      (r.status === "pending" || r.status === "validated") &&
      (q
        ? r.nom.toLowerCase().includes(q) || r.childName.toLowerCase().includes(q) || r.sejourName.toLowerCase().includes(q)
        : true),
    ).sort((a, b) => {
      const aCity = (a[cityKey] || "").toLowerCase();
      const bCity = (b[cityKey] || "").toLowerCase();
      const aMatch = cityVal && aCity.includes(cityVal) ? 0 : 1;
      const bMatch = cityVal && bCity.includes(cityVal) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [allReservations, assignedIds, cityKey, cityVal, search]);

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const toAdd = allReservations
        .filter(r => selected.has(r.id))
        .map(r => ({
          reservationId:       r.id,
          numeroDeReservation: r.numeroDeReservation,
          nom:       r.nom,
          email:     r.email,
          phone:     r.phone,
          children:  r.children,
          childName: r.childName,
          sejourName: r.sejourName,
        }));
      const updated = [...transport.passengers, ...toAdd];
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated,
        updatedAt: serverTimestamp(),
      });
      onUpdate({ ...transport, passengers: updated });
      showToast(`${toAdd.length} passager${toAdd.length > 1 ? "s" : ""} ajouté${toAdd.length > 1 ? "s" : ""}`, "success");
      setSelected(new Set());
      setShowAdd(false);
    } catch {
      showToast("Erreur lors de l'ajout", "error");
    } finally {
      setSaving(false);
    }
  };

  const removePassenger = async (reservationId) => {
    const updated = transport.passengers.filter(p => p.reservationId !== reservationId);
    try {
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated, updatedAt: serverTimestamp(),
      });
      onUpdate({ ...transport, passengers: updated });
      showToast("Passager retiré", "success");
    } catch {
      showToast("Erreur", "error");
    }
  };

  const toggleSel = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div className="tr-pax-tab">
      <div className="tr-pax-header">
        <CapacityBar current={transport.passengers.length} total={transport.capacity} />
        <button type="button" className="dash-btn dash-btn-primary tr-add-btn" onClick={() => setShowAdd(v => !v)}>
          {showAdd ? "Fermer" : (
            <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>Ajouter</>
          )}
        </button>
      </div>

      {/* Add passengers panel */}
      {showAdd && (
        <div className="tr-add-panel">
          <div className="tr-add-panel-head">
            <span className="tr-add-panel-title">Sélectionner des passagers</span>
            <input className="dash-input tr-add-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Chercher par nom, enfant, séjour…" />
          </div>
          <div className="tr-add-list">
            {candidates.length === 0 ? (
              <p className="tr-add-empty">Aucune réservation disponible</p>
            ) : candidates.map(r => {
              const cityMatch = cityVal && (r[cityKey] || "").toLowerCase().includes(cityVal);
              return (
                <label key={r.id} className={`tr-add-item${selected.has(r.id) ? " is-checked" : ""}${cityMatch ? " is-match" : ""}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                  <div className="tr-add-item-info">
                    <span className="tr-add-nom">{r.nom}</span>
                    <span className="tr-add-child">{r.childName}</span>
                    <span className="tr-add-meta">{r.sejourName} · {r[cityKey] || "ville non renseignée"}</span>
                  </div>
                  {cityMatch && <span className="tr-city-match">✓ ville</span>}
                </label>
              );
            })}
          </div>
          {selected.size > 0 && (
            <button type="button" className="dash-btn dash-btn-primary tr-add-confirm" onClick={addSelected} disabled={saving}>
              {saving ? "Ajout…" : `Ajouter ${selected.size} passager${selected.size > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}

      {/* Passenger list */}
      {transport.passengers.length === 0 ? (
        <div className="tr-pax-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" stroke="#c4bbd6">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <p>Aucun passager assigné</p>
          <small>Cliquez sur "Ajouter" pour sélectionner des réservations</small>
        </div>
      ) : (
        <div className="tr-pax-list">
          {transport.passengers.map((p, i) => {
            const childStr = p.children?.length > 0
              ? p.children.map(c => `${c.firstName||""} ${c.lastName||""}`.trim()).join(", ")
              : p.childName;
            return (
              <div key={p.reservationId || i} className="tr-pax-row">
                <div className="tr-pax-num">{i + 1}</div>
                <div className="tr-pax-info">
                  <span className="tr-pax-nom">{p.nom}</span>
                  <span className="tr-pax-child">{childStr}</span>
                  <span className="tr-pax-contact">{p.phone}</span>
                </div>
                <div className="tr-pax-ref">{p.numeroDeReservation}</div>
                <button type="button" className="tr-pax-remove" title="Retirer"
                  onClick={() => removePassenger(p.reservationId)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ transport }) {
  const openDoc = (html) => {
    const win = window.open("", "_blank", "width=1000,height=780");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 700);
  };

  const [singleIdx, setSingleIdx] = useState(0);

  return (
    <div className="tr-docs-tab">
      {/* Document type cards */}
      <div className="tr-doc-card" onClick={() => openDoc(buildPassengerListHTML(transport))}>
        <div className="tr-doc-card-icon">📋</div>
        <div className="tr-doc-card-body">
          <div className="tr-doc-card-title">Liste des passagers</div>
          <div className="tr-doc-card-desc">
            Tableau interne pour le convoyeur — noms, téléphones, enfants, numéros de réservation.
          </div>
        </div>
        <div className="tr-doc-card-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </div>
      </div>

      <div
        className={`tr-doc-card${transport.passengers.length === 0 ? " is-disabled" : ""}`}
        onClick={() => transport.passengers.length > 0 && openDoc(buildGroupConvocHTML(transport))}
      >
        <div className="tr-doc-card-icon">📨</div>
        <div className="tr-doc-card-body">
          <div className="tr-doc-card-title">Convocations groupées</div>
          <div className="tr-doc-card-desc">
            Une page de convocation par famille — {transport.passengers.length} page{transport.passengers.length !== 1 ? "s" : ""}. Prêt pour impression et découpe.
          </div>
        </div>
        <div className="tr-doc-card-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </div>
      </div>

      {/* Individual convocation */}
      {transport.passengers.length > 0 && (
        <div className="tr-doc-individual">
          <div className="tr-doc-ind-title">Convocation individuelle</div>
          <div className="tr-doc-ind-row">
            <select className="dash-input" value={singleIdx} onChange={e => setSingleIdx(Number(e.target.value))}>
              {transport.passengers.map((p, i) => (
                <option key={p.reservationId || i} value={i}>
                  {p.nom} — {p.children?.length > 0 ? p.children.map(c => `${c.firstName||""} ${c.lastName||""}`.trim()).join(", ") : p.childName}
                </option>
              ))}
            </select>
            <button type="button" className="dash-btn dash-btn-primary"
              onClick={() => openDoc(buildSingleConvocHTML(transport, transport.passengers[singleIdx]))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Générer
            </button>
          </div>
        </div>
      )}

      <div className="tr-doc-hint">
        Les documents s'ouvrent dans un nouvel onglet. Utilisez "Enregistrer en PDF" dans la fenêtre d'impression.
      </div>
    </div>
  );
}

function TransportEditTab({ transport, onSave }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sejourName:    transport.sejourName !== "—" ? transport.sejourName : "",
    direction:     transport.direction,
    departureCity: transport.departureCity,
    arrivalCity:   transport.arrivalCity,
    date:          transport.date,
    departureTime: transport.departureTime,
    arrivalTime:   transport.arrivalTime,
    trainType:     transport.trainType,
    trainNumber:   transport.trainNumber,
    meetingPoint:  transport.meetingPoint,
    meetingTime:   transport.meetingTime,
    platform:      transport.platform,
    convoyeur:     transport.convoyeur,
    convoyeurPhone: transport.convoyeurPhone,
    capacity:      transport.capacity ? String(transport.capacity) : "",
    status:        transport.status,
    notes:         transport.notes,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        capacity: form.capacity !== "" ? Number(form.capacity) : 0,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), payload);
      onSave({ ...transport, ...payload });
      showToast("Transport mis à jour", "success");
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
        <div className="rp-edit-grid">
          <div className="rp-edit-field">
            <span>Statut</span>
            <select className="dash-input" value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="brouillon">Brouillon</option>
              <option value="confirmé">Confirmé</option>
              <option value="annulé">Annulé</option>
            </select>
          </div>
          <div className="rp-edit-field">
            <span>Direction</span>
            <select className="dash-input" value={form.direction} onChange={e => set("direction", e.target.value)}>
              <option value="aller">↑ Aller</option>
              <option value="retour">↓ Retour</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Séjour & trajet</div>
        <div className="rp-edit-grid">
          <label className="rp-edit-field rp-edit-span2">
            <span>Nom du séjour</span>
            <input className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)} placeholder="ex : Alpes Été 2026" />
          </label>
          <F label="Ville de départ" k="departureCity" placeholder="ex : Paris" />
          <F label="Ville d'arrivée"  k="arrivalCity"   placeholder="ex : Grenoble" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Date & horaires</div>
        <div className="rp-edit-grid">
          <F label="Date"          k="date"          type="date" />
          <F label="Heure de RDV"  k="meetingTime"   type="time" />
          <F label="Heure départ"  k="departureTime" type="time" />
          <F label="Heure arrivée" k="arrivalTime"   type="time" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Train</div>
        <div className="rp-edit-grid">
          <div className="rp-edit-field">
            <span>Type de train</span>
            <select className="dash-input" value={form.trainType} onChange={e => set("trainType", e.target.value)}>
              {TRAIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <F label="N° de train / ligne" k="trainNumber" placeholder="ex : TGV 6051" />
          <F label="Point de RDV" k="meetingPoint" placeholder="ex : Gare de Lyon, hall 1" />
          <F label="Voie / Quai"  k="platform"    placeholder="ex : Voie 12" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Convoyeur & capacité</div>
        <div className="rp-edit-grid">
          <F label="Nom du convoyeur"      k="convoyeur"      placeholder="Prénom Nom" />
          <F label="Téléphone convoyeur"   k="convoyeurPhone" placeholder="06..." />
          <F label="Capacité max (places)" k="capacity"       type="number" placeholder="20" />
        </div>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Notes internes</div>
        <textarea className="dash-input" rows={3} style={{ resize: "vertical" }}
          value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Instructions, remarques, informations complémentaires…" />
      </div>

      <button type="button" className="dash-btn dash-btn-primary rp-send-btn" onClick={save} disabled={saving}>
        {saving ? "Enregistrement…" : "Sauvegarder les modifications"}
      </button>
    </div>
  );
}

/* ── Right panel ────────────────────────────────────────────────────────── */

const TRANSPORT_PANEL_TABS = [
  { key: "passengers", label: "Passagers" },
  { key: "documents",  label: "Documents" },
  { key: "edit",       label: "Modifier"  },
];

function TransportPanel({ transport: ext, allReservations, onClose, onSave, onDelete }) {
  const { showToast } = useToast();
  const [transport, setTransport] = useState(ext);
  const [tab, setTab]             = useState("passengers");
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => setTransport(ext), [ext]);

  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleUpdate = (updated) => {
    setTransport(updated);
    onSave(updated);
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer ce transport définitivement ?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id));
      onDelete(transport.id);
      onClose();
    } catch {
      showToast("Erreur lors de la suppression", "error");
    } finally {
      setDeleting(false);
    }
  };

  const isAller = transport.direction === "aller";
  const dirColor = isAller ? "#16a34a" : "#ea580c";
  const sCfg = STATUS_CFG[transport.status] || STATUS_CFG.brouillon;

  return (
    <aside className="res-panel">
      <div className="rp-header">
        <div className="rp-header-top">
          <div className="tr-panel-dir-badge" style={{ background: `${dirColor}18`, color: dirColor, borderColor: `${dirColor}44` }}>
            {isAller ? "↑" : "↓"}
          </div>
          <div className="rp-header-info">
            <div className="rp-header-name">{transport.departureCity || "—"} → {transport.arrivalCity || "—"}</div>
            <div className="rp-header-meta">
              <span className="rp-header-sejour">{transport.sejourName}</span>
              <span className="rp-header-ref">{fmtDate(transport.date)}</span>
              {transport.departureTime && <span className="rp-header-ref">{transport.departureTime}</span>}
            </div>
          </div>
          <button type="button" className="rp-close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rp-header-actions">
          <Badge label={sCfg.label} variant={sCfg.variant} />
          {transport.trainType && transport.trainNumber && (
            <span className="tr-train-chip">
              🚄 {transport.trainType} {transport.trainNumber}
            </span>
          )}
          {transport.convoyeur && (
            <span className="tr-train-chip">
              👤 {transport.convoyeur}
            </span>
          )}
        </div>

        <div className="rp-tabs">
          {TRANSPORT_PANEL_TABS.map(t => (
            <button key={t.key} type="button"
              className={`rp-tab${tab === t.key ? " is-active" : ""}`}
              onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "passengers" && (
                <span className="rp-tab-count">{transport.passengers.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rp-body">
        {tab === "passengers" && (
          <PassengersTab transport={transport} allReservations={allReservations} onUpdate={handleUpdate} />
        )}
        {tab === "documents" && <DocumentsTab transport={transport} />}
        {tab === "edit"      && <TransportEditTab transport={transport} onSave={handleUpdate} />}
      </div>

      <div className="rp-footer">
        <button type="button" className="dash-btn dash-btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Suppression…" : "Supprimer"}
        </button>
        <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>
          {transport.passengers.length} passager{transport.passengers.length !== 1 ? "s" : ""}
          {transport.capacity ? ` / ${transport.capacity} places` : ""}
        </span>
      </div>
    </aside>
  );
}

/* ── New transport modal ─────────────────────────────────────────────────── */

const EMPTY_TRANSPORT = {
  sejourName: "", direction: "aller",
  departureCity: "", arrivalCity: "",
  date: "", departureTime: "", arrivalTime: "",
  trainType: "TGV", trainNumber: "",
  meetingPoint: "", meetingTime: "", platform: "",
  convoyeur: "", convoyeurPhone: "",
  capacity: "", status: "brouillon", notes: "",
};

function NewTransportModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState(EMPTY_TRANSPORT);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.departureCity || !form.arrivalCity || !form.date) {
      showToast("Renseignez le trajet et la date", "warning"); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        capacity: form.capacity !== "" ? Number(form.capacity) : 0,
        passengers: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, COLLECTIONS.TRANSPORTS), payload);
      showToast("Transport créé !", "success");
      onCreated({ id: ref.id, ...payload, passengers: [], dateMs: Date.now() });
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la création", "error");
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, k, type = "text", placeholder = "", span2 = false }) => (
    <label className={`rp-edit-field${span2 ? " rp-edit-span2" : ""}`}>
      <span>{label}</span>
      <input className="dash-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="res-new-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="res-new-modal">
        <div className="res-new-header">
          <div>
            <div className="res-new-title">Nouveau transport</div>
            <div className="res-new-sub">Créer une ligne de transport et y assigner des passagers</div>
          </div>
          <button type="button" className="rp-close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="res-new-body">
          <div className="rp-edit-grid">
            <label className="rp-edit-field rp-edit-span2">
              <span>Séjour associé</span>
              <input className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)} placeholder="ex : Alpes Été 2026" />
            </label>

            <div className="rp-edit-field">
              <span>Direction</span>
              <select className="dash-input" value={form.direction} onChange={e => set("direction", e.target.value)}>
                <option value="aller">↑ Aller</option>
                <option value="retour">↓ Retour</option>
              </select>
            </div>
            <div className="rp-edit-field">
              <span>Statut</span>
              <select className="dash-input" value={form.status} onChange={e => set("status", e.target.value)}>
                <option value="brouillon">Brouillon</option>
                <option value="confirmé">Confirmé</option>
              </select>
            </div>

            <F label="Ville de départ *"  k="departureCity" placeholder="ex : Paris" />
            <F label="Ville d'arrivée *"  k="arrivalCity"   placeholder="ex : Grenoble" />
            <F label="Date *"             k="date"          type="date" />
            <F label="Heure de RDV"       k="meetingTime"   type="time" />
            <F label="Heure de départ"    k="departureTime" type="time" />
            <F label="Heure d'arrivée"    k="arrivalTime"   type="time" />

            <div className="rp-edit-field">
              <span>Type de train / transport</span>
              <select className="dash-input" value={form.trainType} onChange={e => set("trainType", e.target.value)}>
                {TRAIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <F label="N° de train / ligne" k="trainNumber"  placeholder="ex : TGV 6051" />
            <F label="Point de RDV"        k="meetingPoint" placeholder="ex : Gare de Lyon, voie 12" span2 />
            <F label="Voie / Quai"         k="platform"     placeholder="ex : Voie 12" />
            <F label="Capacité (places)"   k="capacity"     type="number" placeholder="20" />
            <F label="Nom du convoyeur"    k="convoyeur"    placeholder="Prénom Nom" />
            <F label="Tél. convoyeur"      k="convoyeurPhone" placeholder="06…" />
            <label className="rp-edit-field rp-edit-span2">
              <span>Notes</span>
              <textarea className="dash-input" rows={2} style={{ resize: "vertical" }}
                value={form.notes} onChange={e => set("notes", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="res-new-footer">
          <button type="button" className="dash-btn" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Création…" : "Créer le transport"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export default function Transport() {
  const [transports, setTransports]     = useState([]);
  const [reservations, setReservations] = useState([]);
  const [selected, setSelected]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [showNew, setShowNew]           = useState(false);
  const { showToast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "desc"))),
        getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
      ]);
      setTransports(tSnap.docs.map(mapTransport));
      setReservations(rSnap.docs.map(mapReservationForTransport));
    } catch { showToast("Erreur de chargement", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = (updated) => {
    setTransports(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (selected?.id === updated.id) setSelected(updated);
  };

  const handleDelete = (id) => {
    setTransports(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleCreated = (t) => {
    setTransports(prev => [t, ...prev]);
    setSelected(t);
  };

  /* Stats */
  const totalPassengers = useMemo(() => transports.reduce((s, t) => s + t.passengers.length, 0), [transports]);
  const confirmed       = useMemo(() => transports.filter(t => t.status === "confirmé").length, [transports]);

  /* Table columns */
  const columns = useMemo(() => [
    {
      key: "direction",
      label: "Dir.",
      sortable: false,
      render: row => {
        const isA = row.direction === "aller";
        return (
          <span className={`tr-dir-badge tr-dir-${row.direction}`}>
            {isA ? "↑ Aller" : "↓ Retour"}
          </span>
        );
      },
    },
    {
      key: "trajet",
      label: "Trajet",
      sortValue: row => row.departureCity,
      render: row => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {row.departureCity || "—"} → {row.arrivalCity || "—"}
          </div>
          {row.trainNumber && (
            <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>
              {row.trainType} {row.trainNumber}
            </div>
          )}
        </div>
      ),
    },
    { key: "sejourName", label: "Séjour", filterable: true, filterLabel: "Tous les séjours" },
    {
      key: "date",
      label: "Date & heure",
      sortValue: row => row.date || "",
      render: row => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtDate(row.date)}</div>
          {row.departureTime && (
            <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>
              {row.meetingTime ? `RDV ${row.meetingTime} · ` : ""}Départ {row.departureTime}
              {row.arrivalTime ? ` → ${row.arrivalTime}` : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "passengers",
      label: "Passagers",
      sortValue: row => row.passengers.length,
      render: row => <CapacityBar current={row.passengers.length} total={row.capacity} />,
    },
    {
      key: "status",
      label: "Statut",
      filterable: true,
      filterLabel: "Tous les statuts",
      sortable: false,
      render: row => {
        const cfg = STATUS_CFG[row.status] || STATUS_CFG.brouillon;
        return <Badge label={cfg.label} variant={cfg.variant} />;
      },
    },
  ], []);

  return (
    <>
      <div className={`res-page-layout${selected ? " has-panel" : ""}`}>
        <div className="res-main">
          <div className="dash-page">
            <header className="dash-page-header dash-page-header-row">
              <div>
                <h1>Transport</h1>
                <p>Gestion des lignes de transport, passagers et convocations.</p>
              </div>
              <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
                <div className="res-stat-badge">
                  <span className="res-stat-value">{transports.length}</span>
                  <span className="res-stat-label">trajets</span>
                </div>
                <div className="res-stat-badge res-stat-green">
                  <span className="res-stat-value">{confirmed}</span>
                  <span className="res-stat-label">confirmés</span>
                </div>
                <div className="res-stat-badge res-stat-orange">
                  <span className="res-stat-value">{totalPassengers}</span>
                  <span className="res-stat-label">passagers</span>
                </div>
                <button type="button" className="dash-btn" onClick={loadAll}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.5 15A9 9 0 1 1 21 9" />
                  </svg>
                  Actualiser
                </button>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Nouveau transport
                </button>
              </div>
            </header>

            {loading ? (
              <div className="dash-section" style={{ padding: 24 }}>
                <p className="dash-muted">Chargement des transports…</p>
              </div>
            ) : transports.length === 0 ? (
              <div className="dash-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.2" strokeLinecap="round" stroke="currentColor">
                  <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 4v4h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <h3>Aucun transport créé</h3>
                <p>Créez votre première ligne de transport pour commencer à gérer les déplacements.</p>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
                  + Nouveau transport
                </button>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={transports}
                searchableKeys={["sejourName","departureCity","arrivalCity","trainNumber","convoyeur"]}
                defaultSortKey="date"
                defaultSortDirection="desc"
                onRowClick={row => setSelected(prev => prev?.id === row.id ? null : row)}
                selectedRowId={selected?.id}
                emptyLabel="Aucun transport pour ces filtres."
                toolsInline
              />
            )}
          </div>
        </div>

        {selected && (
          <TransportPanel
            transport={selected}
            allReservations={reservations}
            onClose={() => setSelected(null)}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </div>

      {showNew && (
        <NewTransportModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
