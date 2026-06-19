"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc, collection, deleteDoc, doc, getDoc,
  getDocs, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Badge from "@/src/components/dashboard/ui/Badge";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { ReservationPanel, mapReservation } from "@/src/components/dashboard/Reservations";

/* ── Constants ─────────────────────────────────────────────────────────── */

const TRAIN_TYPES = ["TGV", "TER", "Intercités", "Ouigo", "Bus", "Car", "Autre"];
const ROUTE_GROUPS = [
  { value: "nord", label: "Nord" },
  { value: "sud-ouest", label: "Sud / Ouest" },
  { value: "direct", label: "Direct / autre" },
];
const WEEKS = ["S1", "S2", "S3", "S4"];
const KEY_DATES = [
  { date: "2026-07-06", week: "S1", direction: "aller",  label: "Jour de départ S1" },
  { date: "2026-07-17", week: "S1", direction: "retour", label: "Jour de retour S1" },
  { date: "2026-07-20", week: "S2", direction: "aller",  label: "Jour de départ S2" },
  { date: "2026-07-31", week: "S2", direction: "retour", label: "Jour de retour S2" },
  { date: "2026-08-03", week: "S3", direction: "aller",  label: "Jour de départ S3" },
  { date: "2026-08-14", week: "S3", direction: "retour", label: "Jour de retour S3" },
  { date: "2026-08-17", week: "S4", direction: "aller",  label: "Jour de départ S4" },
  { date: "2026-08-28", week: "S4", direction: "retour", label: "Jour de retour S4" },
];

const WEEK_INFO = {
  S1: { label: "Semaine 1", dates: "6 – 17 juil.",  aller: "2026-07-06", retour: "2026-07-17" },
  S2: { label: "Semaine 2", dates: "20 – 31 juil.", aller: "2026-07-20", retour: "2026-07-31" },
  S3: { label: "Semaine 3", dates: "3 – 14 août",   aller: "2026-08-03", retour: "2026-08-14" },
  S4: { label: "Semaine 4", dates: "17 – 28 août",  aller: "2026-08-17", retour: "2026-08-28" },
};

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

function weekFromStartDate(value) {
  const date = String(value || "").slice(0, 10);
  return {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[date] || "";
}

function countChildren(passengers) {
  return (passengers || []).reduce(
    (total, passenger) => total + Math.max(passenger.children?.length || 0, 1),
    0,
  );
}

function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function passengerCity(transport, passenger) {
  return passenger.pickupCity
    || (transport.direction === "aller" ? passenger.departureCity : passenger.returnCity)
    || "Ville à préciser";
}

function groupPassengersByCity(transport, passengers = transport.passengers || []) {
  const groups = new Map();
  passengers.forEach((passenger) => {
    const city = passengerCity(transport, passenger);
    const key = normalizePlace(city) || "ville-a-preciser";
    if (!groups.has(key)) groups.set(key, { city, passengers: [] });
    groups.get(key).passengers.push(passenger);
  });
  return [...groups.values()].sort((a, b) =>
    a.city.localeCompare(b.city, "fr", { sensitivity: "base" }),
  );
}

function openPrintableDocument(html, features = "width=1000,height=780") {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", features);
  if (!win) {
    URL.revokeObjectURL(url);
    return null;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win;
}

function passengersAtStop(transport, city) {
  const normalizedCity = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(passenger.pickupCity) === normalizedCity,
  );
}

function passengersOnSegment(transport, segmentIndex) {
  const segments = transport.segments || [];
  if (!segments[segmentIndex]) return [];

  return (transport.passengers || []).filter((passenger) => {
    const passengerCity = normalizePlace(passenger.pickupCity);
    if (!passengerCity) return false;

    if (transport.direction === "retour") {
      const dropoffIndex = segments.findIndex((segment) => normalizePlace(segment.to) === passengerCity);
      return dropoffIndex >= 0 && segmentIndex <= dropoffIndex;
    }

    const boardingIndex = segments.findIndex((segment) => normalizePlace(segment.from) === passengerCity);
    return boardingIndex >= 0 && segmentIndex >= boardingIndex;
  });
}

function purchasedTicketsForSegment(tickets, segmentId) {
  return (tickets || []).filter((ticket) => ticket.segmentId === segmentId && ticket.purchased);
}

function ticketSegmentLabel(ticket, segments) {
  const segment = (segments || []).find((item) => item.id === ticket.segmentId);
  return segment ? `${segment.from || "Départ"} → ${segment.to || "Arrivée"}` : ticket.segmentLabel || "";
}

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
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
    routeGroup:      d.routeGroup      || "direct",
    week:            d.week            || "",
    segments:        Array.isArray(d.segments) ? d.segments : [],
    staff:           Array.isArray(d.staff) ? d.staff : [],
    tickets:         Array.isArray(d.tickets) ? d.tickets : [],
    emergencyContact: d.emergencyContact || "",
    emergencyPhone:   d.emergencyPhone || "",
    dateMs:          tsToMs(d.createdAt),
  };
}

function mapReservationForTransport(snap) {
  const d = snap.data() || {};
  const legal   = d.legal   || {};
  const minor   = d.minor   || {};
  const sejour  = d.sejour  || {};
  const transport = d.transport || {};
  const finance = d.finance || {};
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
    sejourStartDate: sejour.startDate || "",
    week: weekFromStartDate(sejour.startDate),
    departureCity: transport.departureCity || "",
    returnCity:    transport.returnCity    || "",
    transportAmount: Number(finance.transportAmount ?? transport.fee ?? 0) || 0,
    financeNetAmount: Number(finance.netAmount || 0) || 0,
    financeStayAmount: Number(finance.stayAmount || 0) || 0,
    status: d.status || "pending",
    isImported2026: d.validationSource === "ete26_validated_workbook",
    childCount: Math.max(children.length, 1),
  };
}

function mapStaffMember(snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
    phone: data.phone || "",
    email: data.email || "",
    birthDate: data.birthDate || "",
    active: data.active !== false,
  };
}

function mapStaffContract(snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    memberId: data.memberId || "",
    memberName: data.memberName || "",
    stayCode: data.stayCode || "",
    stayName: data.stayName || "",
    week: data.week || "",
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    role: data.role || "Animateur convoyeur",
    status: data.status || "active",
    contractFileUrl: data.contractFileUrl || "",
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

  let rowNumber = 0;
  const rows = groupPassengersByCity(transport).map(({ city, passengers }) => `
    <tr class="city-row"><td colspan="7">Ville : ${city} · ${countChildren(passengers)} enfant${countChildren(passengers) !== 1 ? "s" : ""}</td></tr>
    ${passengers.map((p) => {
      rowNumber += 1;
      const children = p.children || [];
      const childStr = children.length > 0 ? children.map(c => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join("<br>") : (p.childName || "—");
      const birthStr = children.length > 0 ? children.map(c => fmtBirthDate(c.birthDate) || "—").join("<br>") : "—";
      return `<tr>
        <td style="text-align:center;font-weight:800;color:${dirColor}">${rowNumber}</td>
        <td><strong>${p.nom}</strong></td>
        <td><strong>${p.phone}</strong></td>
        <td>${childStr}</td>
        <td>${birthStr}</td>
        <td style="font-family:monospace;font-size:11.5px;color:#888">${p.numeroDeReservation || "—"}</td>
        <td style="text-align:center;font-size:16px">☐</td>
      </tr>`;
    }).join("")}
  `).join("") || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa;font-style:italic">Aucun passager assigné</td></tr>`;

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
  .city-row td{background:#f3edf9;color:#5f3374;font-weight:900;text-transform:uppercase;letter-spacing:0.05em}
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

  const sortedPassengers = groupPassengersByCity(transport).flatMap((group) => group.passengers);
  const pages = sortedPassengers.map((p, idx) => {
    const children = p.children || [];
    const childRows = children.length > 0
      ? children.map((c, j) => `<tr>
          <td>${children.length > 1 ? `Enfant ${j + 1}` : "Jeune"}</td>
          <td><strong>${c.firstName || ""} ${c.lastName || ""}</strong>
          ${c.birthDate ? `<br><span class="sub">Né(e) le ${fmtBirthDate(c.birthDate)}</span>` : ""}
          ${c.birthPlace ? `<br><span class="sub">à ${c.birthPlace}</span>` : ""}
          </td></tr>`).join("")
      : `<tr><td>Jeune</td><td><strong>${p.childName || "—"}</strong></td></tr>`;

    const city = passengerCity(transport, p);
    const isLast = idx === sortedPassengers.length - 1;

    return `<div class="page${isLast ? "" : " pb"}">
      <div class="doc-header">
        <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
        <div class="hdr-right"><div>Réf. <strong>${p.numeroDeReservation || p.reservationId?.slice(0,8) || "—"}</strong></div><div>${today}</div></div>
      </div>
      <div class="doc-title">CONVOCATION</div>
      <div class="dir-badge" style="background:${dirBg};border-color:${dirColor};color:${dirColor}">
        ${dirLabel} — ${transport.sejourName}
      </div>
      <div class="city-badge">VILLE : ${city}</div>
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
  .city-badge{text-align:center;font-weight:900;font-size:14px;color:#5f3374;background:#f3edf9;border-radius:8px;padding:9px 12px;margin:-8px 0 18px}
</style></head><body>
${pages.join("\n")}
<div class="print-btn"><button onclick="window.print()">🖨 Imprimer toutes les convocations (${transport.passengers.length} page${transport.passengers.length > 1 ? "s" : ""})</button></div>
</body></html>`;
}

function buildSingleConvocHTML(transport, passenger) {
  return buildGroupConvocHTML({ ...transport, passengers: [passenger] });
}

function buildStaffBriefingHTML(transport) {
  const staff = transport.staff || [];
  const segments = transport.segments || [];
  const tickets = transport.tickets || [];
  const routeLabel = ROUTE_GROUPS.find((item) => item.value === transport.routeGroup)?.label || "Direct";
  const passengerRows = groupPassengersByCity(transport).map(({ city, passengers }) => `
    <tr class="city-row"><td colspan="5">Ville : ${city} · ${countChildren(passengers)} enfant${countChildren(passengers) !== 1 ? "s" : ""}</td></tr>
    ${passengers.flatMap((passenger) => {
      const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
      return children.map((child) => `
        <tr>
          <td><strong>${child.firstName || ""} ${child.lastName || ""}</strong></td>
          <td><strong>${city}</strong></td>
          <td>${passenger.nom || "—"}</td><td>${passenger.phone || "—"}</td><td>☐</td>
        </tr>`);
    }).join("")}
  `).join("");
  const stopSections = segments.map((segment, index) => {
    const stopPassengers = passengersOnSegment(transport, index);
    const assignedStaff = staff.filter((member) => (segment.assignedStaffIds || []).includes(member.id));
    const childRows = stopPassengers.flatMap((passenger) => {
      const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
      return children.map((child) => `
        <tr><td><strong>${child.firstName || ""} ${child.lastName || ""}</strong></td>
        <td>${passenger.nom || "—"}</td><td><strong>${passenger.phone || "—"}</strong></td>
        <td>${passenger.numeroDeReservation || "—"}</td><td>☐</td></tr>
      `);
    }).join("");
    return `
      <section class="stop">
        <div class="stop-head">
          <div><span class="stop-number">${index + 1}</span><strong>${segment.from || "Arrêt à compléter"}</strong></div>
          <div>${segment.meetingTime ? `RDV ${segment.meetingTime}` : "RDV à compléter"} · départ ${segment.departureTime || "à compléter"}</div>
        </div>
        <div class="stop-place"><strong>Point de rendez-vous :</strong> ${segment.meetingPoint || "À compléter"}${segment.platform ? ` · Quai/voie ${segment.platform}` : ""}</div>
        <div class="stop-trip">${segment.mode || ""} ${segment.number || ""} vers <strong>${segment.to || "destination à compléter"}</strong> · arrivée ${segment.arrivalTime || "à compléter"}</div>
        <div class="stop-place"><strong>Animateurs sur cette portion :</strong> ${assignedStaff.length ? assignedStaff.map((member) => `${member.name || "Nom à compléter"} (${member.phone || "téléphone manquant"})`).join(", ") : "Aucun animateur affecté"}</div>
        ${segment.instructions ? `<div class="stop-note">${segment.instructions}</div>` : ""}
        <table><thead><tr><th>Enfant</th><th>Responsable</th><th>Téléphone</th><th>Dossier</th><th>Présent</th></tr></thead>
        <tbody>${childRows || "<tr><td colspan='5'>Aucun enfant affecté à cet arrêt.</td></tr>"}</tbody></table>
      </section>`;
  }).join("");
  const staffRows = staff.map((member) => `
    <tr><td><strong>${member.name || "—"}</strong></td><td>${member.role || "Animateur convoyeur"}</td>
    <td>${member.phone || "—"}</td><td>${member.boardingCity || "—"}</td></tr>`).join("");
  const ticketRows = tickets.map((ticket) => `
    <li><strong>${ticket.name || "Billet"}</strong> — ${ticketSegmentLabel(ticket, segments) || "segment non affecté"}
    — ${formatMoney(ticket.price)} — ${ticket.departureTime || "?"} / ${ticket.arrivalTime || "?"}
    — <strong>${ticket.purchased ? "ACHETÉ" : "À ACHETER"}</strong>${ticket.url ? ` — <a href="${ticket.url}">ouvrir</a>` : ""}</li>
  `).join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Convocation équipe — ${transport.sejourName}</title>
  <style>${SHARED_CSS}
    body{padding:34px;max-width:1000px;margin:0 auto}
    h1{font-size:22px;margin:0}.tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#f3edf9;color:#6f3d88;font-weight:800;font-size:12px}
    thead th{background:#3f3055;color:#fff;padding:8px;text-align:left;font-size:11px}td:first-child{width:auto;color:inherit}
    .alert{padding:12px 14px;background:#fff7ed;border-left:4px solid #e87918;margin:14px 0}ul{padding-left:20px;line-height:1.8}
    .stop{margin:0 0 18px;border:1px solid #ded7e8;border-radius:8px;overflow:hidden;page-break-inside:avoid}
    .stop-head{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;background:#f3edf9}
    .stop-number{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:7px;border-radius:50%;background:#3f3055;color:#fff;font-size:11px}
    .stop-place,.stop-trip,.stop-note{padding:7px 12px;border-bottom:1px solid #eee8f5}.stop-note{background:#fff7ed}
    .city-row td{background:#f3edf9;color:#5f3374;font-weight:900;text-transform:uppercase;letter-spacing:0.05em}
  </style></head><body>
    <div class="doc-header"><div><div class="logo">ColoCrew</div><div class="logo-sub">Convoyage ${routeLabel}</div></div>
    <div class="hdr-right"><h1>CONVOCATION ÉQUIPE</h1><div>${transport.week || "Semaine à compléter"} · ${transport.direction === "aller" ? "ALLER" : "RETOUR"}</div></div></div>
    <div class="alert"><strong>${transport.departureCity || "—"} → ${transport.arrivalCity || "—"}</strong> · ${fmtDateLong(transport.date)} · RDV ${transport.meetingTime || "à compléter"} à ${transport.meetingPoint || "lieu à compléter"}</div>
    <div class="sec">Équipe de convoyage</div>
    <table><thead><tr><th>Nom</th><th>Rôle</th><th>Téléphone</th><th>Prise de service</th></tr></thead><tbody>${staffRows || "<tr><td colspan='4'>Équipe à compléter</td></tr>"}</tbody></table>
    <div class="sec">Arrêts et prises en charge</div>
    ${stopSections || "<p>Arrêts à compléter.</p>"}
    <div class="sec">Liste générale des jeunes (${(transport.passengers || []).reduce((sum, p) => sum + Math.max(p.children?.length || 0, 1), 0)})</div>
    <table><thead><tr><th>Jeune</th><th>Ville</th><th>Responsable</th><th>Téléphone</th><th>Présent</th></tr></thead><tbody>${passengerRows || "<tr><td colspan='5'>Aucun jeune assigné</td></tr>"}</tbody></table>
    <div class="sec">Billets et pièces de voyage</div>${ticketRows ? `<ul>${ticketRows}</ul>` : "<p>Aucun billet téléversé.</p>"}
    <div class="sec">Contacts et consignes</div><p><strong>Urgence :</strong> ${transport.emergencyContact || "ColoCrew"} ${transport.emergencyPhone || "—"}</p>
    ${transport.notes ? `<p style="margin-top:8px">${transport.notes}</p>` : ""}
    <div class="print-btn"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  </body></html>`;
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

function TransportCoverage({ reservations, transports }) {
  const summaries = useMemo(() => {
    const imported = reservations.filter((reservation) => reservation.isImported2026 && reservation.week);
    return WEEKS.flatMap((week) => ["aller", "retour"].map((direction) => {
      const cityKey = direction === "aller" ? "departureCity" : "returnCity";
      const expected = imported.filter((reservation) =>
        reservation.week === week && normalizePlace(reservation[cityKey]) !== "sur place",
      );
      const onSite = imported.filter((reservation) =>
        reservation.week === week && normalizePlace(reservation[cityKey]) === "sur place",
      );
      const relevantTrips = transports.filter((transport) =>
        transport.week === week && transport.direction === direction && transport.status !== "annulé",
      );
      const assignments = new Map();
      for (const trip of relevantTrips) {
        for (const passenger of trip.passengers || []) {
          assignments.set(passenger.reservationId, (assignments.get(passenger.reservationId) || 0) + 1);
        }
      }
      const missing = expected.filter((reservation) => !assignments.has(reservation.id));
      const duplicated = expected.filter((reservation) => (assignments.get(reservation.id) || 0) > 1);
      const expectedChildren = expected.reduce((sum, reservation) => sum + reservation.childCount, 0);
      const missingChildren = missing.reduce((sum, reservation) => sum + reservation.childCount, 0);
      const duplicateChildren = duplicated.reduce((sum, reservation) => sum + reservation.childCount, 0);
      const cityCounts = expected.reduce((result, reservation) => {
        const city = reservation[cityKey] || "Non renseigné";
        result[city] = (result[city] || 0) + reservation.childCount;
        return result;
      }, {});
      return {
        key: `${week}-${direction}`,
        week,
        direction,
        date: relevantTrips[0]?.date || "",
        expectedChildren,
        coveredChildren: expectedChildren - missingChildren,
        missingChildren,
        duplicateChildren,
        onSiteChildren: onSite.reduce((sum, reservation) => sum + reservation.childCount, 0),
        cityCounts,
      };
    }));
  }, [reservations, transports]);
  const noWeek = reservations
    .filter((reservation) => reservation.isImported2026 && !reservation.week)
    .reduce((sum, reservation) => sum + reservation.childCount, 0);

  return (
    <section className="tr-coverage">
      <div className="tr-coverage-head">
        <div><h2>Récapitulatif des départs et retours</h2><p>Chaque enfant hors « Sur Place » doit être couvert exactement une fois.</p></div>
        {noWeek > 0 && <span className="tr-coverage-warning">{noWeek} enfant sans semaine</span>}
      </div>
      <div className="tr-coverage-grid">
        {summaries.map((summary) => {
          const complete = summary.missingChildren === 0 && summary.duplicateChildren === 0;
          return (
            <article key={summary.key} className={`tr-coverage-card${complete ? " is-complete" : " has-issue"}`}>
              <div className="tr-coverage-card-head">
                <div><strong>{summary.week} · {summary.direction === "aller" ? "Premier jour" : "Dernier jour"}</strong><span>{summary.direction === "aller" ? "Aller" : "Retour"} · {fmtDate(summary.date)}</span></div>
                <span className="tr-coverage-state">{complete ? "Complet" : "À corriger"}</span>
              </div>
              <div className="tr-coverage-numbers">
                <div><strong>{summary.coveredChildren}/{summary.expectedChildren}</strong><span>Couverts</span></div>
                <div><strong>{summary.missingChildren}</strong><span>Sans trajet</span></div>
                <div><strong>{summary.duplicateChildren}</strong><span>Doublons</span></div>
                <div><strong>{summary.onSiteChildren}</strong><span>Sur Place</span></div>
              </div>
              <div className="tr-coverage-cities">
                {Object.entries(summary.cityCounts).map(([city, count]) => <span key={city}>{city} <strong>{count}</strong></span>)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AllTransportsList({ transports, selectedId, onSelectTrip }) {
  return (
    <div className="tr-all-list">
      {WEEKS.map((week) => {
        const info = WEEK_INFO[week];
        return (
          <section key={week} className="tr-all-week">
            <div className="tr-all-week-head">
              <strong>{info.label}</strong>
              <span>{info.dates}</span>
            </div>
            {[
              { date: info.aller, direction: "aller", label: "Aller" },
              { date: info.retour, direction: "retour", label: "Retour" },
            ].map(({ date, direction, label }) => {
              const trips = transports.filter((t) => t.date === date);
              const totalChildren = trips.reduce((s, t) => s + countChildren(t.passengers), 0);
              const totalStaff = trips.reduce((s, t) => s + (t.staff || []).length, 0);
              const missingTix = trips.reduce((s, t) =>
                s + (t.segments || []).filter((seg) => !purchasedTicketsForSegment(t.tickets || [], seg.id).length).length, 0);
              return (
                <div key={date} className="tr-all-day">
                  <div className="tr-all-day-label">
                    <span className={`tr-all-dir is-${direction}`}>{direction === "aller" ? "↑" : "↓"} {label}</span>
                    <time className="tr-all-day-date">{fmtDateLong(date)}</time>
                    {totalChildren > 0 && <span className="tr-all-day-stat">{totalChildren} enf.</span>}
                    {totalStaff > 0 && <span className="tr-all-day-stat">{totalStaff} anim.</span>}
                    {missingTix > 0 && <span className="tr-all-day-warn">{missingTix} billet{missingTix > 1 ? "s" : ""} manquant{missingTix > 1 ? "s" : ""}</span>}
                  </div>
                  <div className="tr-all-day-trips">
                    {ROUTE_GROUPS.filter((g) => g.value !== "direct").map((group) => {
                      const trip = trips.find((t) => t.routeGroup === group.value);
                      if (!trip) return (
                        <div key={group.value} className="tr-all-trip is-missing">
                          <span className="tr-all-trip-zone">{group.label}</span>
                          <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>À créer</span>
                        </div>
                      );
                      const active = selectedId === trip.id;
                      return (
                        <button key={trip.id} type="button"
                          className={`tr-all-trip${active ? " is-active" : ""}`}
                          onClick={() => onSelectTrip(trip)}
                        >
                          <span className="tr-all-trip-zone">{group.label}</span>
                          <span className="tr-all-trip-route">{trip.departureCity || "?"} → {trip.arrivalCity || "?"}</span>
                          <div className="tr-all-trip-meta">
                            <span>{countChildren(trip.passengers)} enf.</span>
                            <span>{(trip.segments || []).length} étape{(trip.segments || []).length !== 1 ? "s" : ""}</span>
                            {trip.departureTime && <span>{trip.departureTime}</span>}
                          </div>
                          <Badge label={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).label} variant={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).variant} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/* ── WeeksOverview ────────────────────────────────────────────────────────── */

function WeeksOverview({ transports, selectedId, onSelectTrip }) {
  return (
    <div className="wo-root">
      {WEEKS.map((week) => {
        const info = WEEK_INFO[week];
        return (
          <section key={week} className="wo-week">
            <div className="wo-week-head">
              <span className="wo-badge">{week}</span>
              <div className="wo-week-meta">
                <strong>{info.label}</strong>
                <span>{info.dates}</span>
              </div>
            </div>
            <div className="wo-week-body">
              {[
                { dir: "aller",  date: info.aller,  label: "Aller",  icon: "↑" },
                { dir: "retour", date: info.retour, label: "Retour", icon: "↓" },
              ].map(({ dir, date, label, icon }) => {
                const trips = transports.filter((t) => t.date === date);
                const totalChildren = trips.reduce((s, t) => s + countChildren(t.passengers), 0);
                const totalSegs = trips.reduce((s, t) => s + (t.segments || []).length, 0);
                const boughtTickets = trips.reduce((s, t) => s + (t.tickets || []).filter((tk) => tk.purchased).length, 0);
                const totalTickets = trips.reduce((s, t) => s + (t.tickets || []).length, 0);
                const missingSegs = trips.reduce((s, t) =>
                  s + (t.segments || []).filter((seg) =>
                    !(t.tickets || []).some((tk) => tk.segmentId === seg.id),
                  ).length, 0,
                );
                const tickPct = totalTickets > 0 ? Math.round((boughtTickets / totalTickets) * 100) : 0;
                const allOk = missingSegs === 0 && totalTickets > 0 && boughtTickets === totalTickets;

                return (
                  <div key={dir} className={`wo-dir wo-dir-${dir}`}>
                    <div className="wo-dir-head">
                      <span className={`wo-dir-arrow wo-dir-arrow-${dir}`}>{icon}</span>
                      <div className="wo-dir-info">
                        <strong>{label}</strong>
                        <time>{fmtDateLong(date)}</time>
                      </div>
                      {totalChildren > 0 && (
                        <span className="wo-chip-children">{totalChildren} enfants</span>
                      )}
                      {missingSegs > 0 && (
                        <span className="wo-chip-alert">
                          {missingSegs} billet{missingSegs > 1 ? "s" : ""} manquant{missingSegs > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {totalSegs > 0 && (
                      <div className="wo-tix-row">
                        <div className="wo-tix-track">
                          <div
                            className={`wo-tix-fill${allOk ? " is-ok" : " is-partial"}`}
                            style={{ width: `${tickPct}%` }}
                          />
                        </div>
                        <span className={`wo-tix-count${allOk ? " is-ok" : " is-warn"}`}>
                          {boughtTickets}/{totalTickets} billets
                        </span>
                      </div>
                    )}

                    <div className="wo-trips">
                      {trips.length === 0 ? (
                        <div className="wo-trip-empty">Aucun trajet configuré</div>
                      ) : trips.map((trip) => {
                        const segs = trip.segments || [];
                        const tix = trip.tickets || [];
                        const tripBought = tix.filter((tk) => tk.purchased).length;
                        const tripMissing = segs.filter((seg) => !tix.some((tk) => tk.segmentId === seg.id)).length;
                        const tripPending = tix.filter((tk) => !tk.purchased).length;
                        const isOk = tripMissing === 0 && tripPending === 0 && tix.length > 0;
                        const isActive = selectedId === trip.id;
                        const mod = isOk ? "ok" : tripMissing > 0 ? "missing" : tripPending > 0 ? "pending" : "none";

                        return (
                          <button
                            key={trip.id}
                            type="button"
                            className={`wo-trip wo-trip-${mod}${isActive ? " is-active" : ""}`}
                            onClick={() => onSelectTrip(trip)}
                          >
                            <div className="wo-trip-left">
                              <span className="wo-trip-zone">
                                {ROUTE_GROUPS.find((g) => g.value === trip.routeGroup)?.label || trip.routeGroup || "Zone"}
                              </span>
                              <span className="wo-trip-route">
                                {trip.departureCity || "?"} → {trip.arrivalCity || "?"}
                              </span>
                              <div className="wo-trip-sub">
                                {trip.departureTime && <span>{trip.departureTime}</span>}
                                {countChildren(trip.passengers) > 0 && <span>{countChildren(trip.passengers)} enf.</span>}
                                {segs.length > 1 && <span>{segs.length} étapes</span>}
                              </div>
                            </div>
                            <div className="wo-trip-right">
                              <span className={`wo-tix-badge wo-tix-${mod}`}>
                                {isOk && "✓ Billets OK"}
                                {!isOk && tripMissing > 0 && `✗ ${tripMissing} manquant${tripMissing > 1 ? "s" : ""}`}
                                {!isOk && tripMissing === 0 && tripPending > 0 && `⏳ ${tripPending} non acheté${tripPending > 1 ? "s" : ""}`}
                                {!isOk && tripMissing === 0 && tripPending === 0 && "Aucun billet"}
                              </span>
                              <Badge
                                label={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).label}
                                variant={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).variant}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── TripTimeline ─────────────────────────────────────────────────────────── */

function TripTimeline({ transport, onToggleStaff }) {
  const segments  = transport.segments || [];
  const staffPool = transport.staff    || [];
  if (segments.length === 0) return null;

  const last = segments[segments.length - 1];

  return (
    <div className="tl-wrap">
      <div className="tl-track">
        {segments.flatMap((seg, i) => {
          const assignedIds = seg.assignedStaffIds || [];

          return [
            /* ── Stop node ── */
            <div key={`stop-${seg.id}`} className="tl-stop" style={{ "--i": i }}>
              <div className="tl-dot" />
              <div className="tl-stop-info">
                <span className="tl-city">{seg.from}</span>
                {seg.meetingTime && <span className="tl-rdv">RDV {seg.meetingTime}</span>}
                <span className="tl-time">{seg.departureTime || "—"}</span>
              </div>
            </div>,

            /* ── Leg ── */
            <div key={`leg-${seg.id}`} className="tl-leg" style={{ "--i": i }}>
              <div className="tl-leg-line" />
              {seg.mode && (
                <span className="tl-train">{seg.mode}{seg.number ? ` ${seg.number}` : ""}</span>
              )}
              {staffPool.length > 0 && (
                <div className="tl-leg-anims">
                  {staffPool.map((member) => {
                    const on = assignedIds.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className={`tl-anim-chip${on ? " is-on" : ""}`}
                        onClick={() => onToggleStaff && onToggleStaff(seg.id, member.id)}
                        title={member.role || ""}
                        disabled={!onToggleStaff}
                      >
                        {on && <span className="tl-anim-check">✓</span>}
                        {member.name || "Anim."}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>,
          ];
        })}

        {/* Arrival node */}
        <div className="tl-stop tl-stop-arr" style={{ "--i": segments.length }}>
          <div className="tl-dot tl-dot-arrival" />
          <div className="tl-stop-info">
            <span className="tl-city">{last?.to}</span>
            <span className="tl-time">{last?.arrivalTime || "—"}</span>
            <span className="tl-arr-tag">Arrivée</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DaySummary({ transports, date }) {
  const totalChildren = transports.reduce((s, t) => s + countChildren(t.passengers), 0);
  const totalStaff    = transports.reduce((s, t) => s + (t.staff || []).length, 0);
  const totalSegs     = transports.reduce((s, t) => s + (t.segments || []).length, 0);
  const missingTix    = transports.reduce((s, t) =>
    s + (t.segments || []).filter((seg) => !purchasedTicketsForSegment(t.tickets || [], seg.id).length).length, 0);
  const totalCost     = transports.reduce((s, t) =>
    s + (t.tickets || []).filter((tk) => tk.purchased).reduce((ts, tk) => ts + Number(tk.price || 0), 0), 0);

  return (
    <div className="tr-day-summary">
      <div className="tr-day-sum-stat"><strong>{totalChildren}</strong><span>enfants</span></div>
      <div className="tr-day-sum-stat"><strong>{transports.length}</strong><span>trajet{transports.length !== 1 ? "s" : ""}</span></div>
      <div className="tr-day-sum-stat"><strong>{totalStaff}</strong><span>animateurs</span></div>
      <div className="tr-day-sum-stat"><strong>{totalSegs}</strong><span>étapes</span></div>
      {totalCost > 0 && <div className="tr-day-sum-stat"><strong>{formatMoney(totalCost)}</strong><span>billets achetés</span></div>}
      {missingTix > 0 && (
        <div className="tr-day-sum-warn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {missingTix} billet{missingTix > 1 ? "s" : ""} manquant{missingTix > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function TransportBudgetOverview({ reservations, transports }) {
  const rows = useMemo(() => {
    const byWeek = new Map();
    const ensure = (week) => {
      const label = week || "Sans semaine";
      if (!byWeek.has(label)) {
        byWeek.set(label, {
          week: label,
          children: 0,
          allerChildren: 0,
          retourChildren: 0,
          onSiteChildren: 0,
          transportRevenue: 0,
          ticketCost: 0,
          tickets: 0,
          purchasedTickets: 0,
          allerCities: new Map(),
          retourCities: new Map(),
        });
      }
      return byWeek.get(label);
    };
    const addCity = (map, city, count) => {
      const clean = city || "Non renseigné";
      if (normalizePlace(clean) === "sur place") return;
      map.set(clean, (map.get(clean) || 0) + count);
    };

    reservations
      .filter((reservation) => reservation.status !== "deleted")
      .forEach((reservation) => {
        const row = ensure(reservation.week);
        const count = reservation.childCount || 1;
        row.children += count;
        row.transportRevenue += Number(reservation.transportAmount || 0);
        if (normalizePlace(reservation.departureCity) === "sur place" && normalizePlace(reservation.returnCity) === "sur place") {
          row.onSiteChildren += count;
        } else {
          if (normalizePlace(reservation.departureCity) !== "sur place") row.allerChildren += count;
          if (normalizePlace(reservation.returnCity) !== "sur place") row.retourChildren += count;
          addCity(row.allerCities, reservation.departureCity, count);
          addCity(row.retourCities, reservation.returnCity, count);
        }
      });

    transports.forEach((transport) => {
      const row = ensure(transport.week);
      (transport.tickets || []).forEach((ticket) => {
        row.tickets += 1;
        if (ticket.purchased) row.purchasedTickets += 1;
        row.ticketCost += Number(ticket.price || 0) || 0;
      });
    });

    return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week, "fr"));
  }, [reservations, transports]);

  const totals = rows.reduce((total, row) => ({
    children: total.children + row.children,
    revenue: total.revenue + row.transportRevenue,
    cost: total.cost + row.ticketCost,
    tickets: total.tickets + row.tickets,
    purchasedTickets: total.purchasedTickets + row.purchasedTickets,
  }), { children: 0, revenue: 0, cost: 0, tickets: 0, purchasedTickets: 0 });

  const citiesText = (map) => [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([city, count]) => `${city} ${count}`)
    .join(" · ") || "—";

  return (
    <section className="dash-section" style={{ display: "grid", gap: 14 }}>
      <div className="dash-section-head">
        <div>
          <h2>Budget transport</h2>
          <p className="dash-muted">CA transport séparé. Chaque billet ajouté diminue la marge transport.</p>
        </div>
      </div>
      <div className="finance-metrics">
        <article className="finance-metric finance-metric-transport">
          <span>CA transport</span>
          <strong>{formatMoney(totals.revenue)}</strong>
          <small>Facturé aux familles</small>
        </article>
        <article className="finance-metric finance-metric-warning">
          <span>Billets ajoutés</span>
          <strong>{formatMoney(totals.cost)}</strong>
          <small>{totals.purchasedTickets}/{totals.tickets} billet(s) achetés</small>
        </article>
        <article className={`finance-metric ${totals.revenue - totals.cost >= 0 ? "finance-metric-success" : "finance-metric-warning"}`}>
          <span>Marge transport</span>
          <strong>{formatMoney(totals.revenue - totals.cost)}</strong>
          <small>CA transport - billets</small>
        </article>
        <article className="finance-metric finance-metric-info">
          <span>Enfants transport</span>
          <strong>{totals.children}</strong>
          <small>Inscriptions validées importées</small>
        </article>
      </div>
      <div className="finance-summary-scroll">
        <table className="tr-budget-table">
          <thead>
            <tr>
              <th>Semaine</th>
              <th>Enfants</th>
              <th>Aller</th>
              <th>Retour</th>
              <th>Sur place</th>
              <th>Villes aller</th>
              <th>Villes retour</th>
              <th>CA transport</th>
              <th>Billets</th>
              <th>Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const margin = row.transportRevenue - row.ticketCost;
              return (
                <tr key={row.week}>
                  <td><strong>{row.week}</strong></td>
                  <td>{row.children}</td>
                  <td>{row.allerChildren}</td>
                  <td>{row.retourChildren}</td>
                  <td>{row.onSiteChildren}</td>
                  <td>{citiesText(row.allerCities)}</td>
                  <td>{citiesText(row.retourCities)}</td>
                  <td><strong>{formatMoney(row.transportRevenue)}</strong></td>
                  <td>{row.purchasedTickets}/{row.tickets} · {formatMoney(row.ticketCost)}</td>
                  <td className={margin >= 0 ? "finance-paid" : "finance-due"}>{formatMoney(margin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentSummaryTable({ transport, onEditSegment }) {
  const segments = transport.segments || [];
  if (!segments.length) {
    return (
      <div className="tr-segment-summary-empty">
        Aucune étape configurée. Ouvrez l'organisation du trajet pour ajouter les étapes.
      </div>
    );
  }

  return (
    <div className="tr-segment-summary">
      <div className="tr-segment-summary-head">
        <strong>Étapes du trajet</strong>
        <span>Cliquez sur une ligne pour la modifier</span>
      </div>
      <div className="tr-segment-summary-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Ville</th>
              <th>Trajet</th>
              <th>{transport.direction === "aller" ? "À récupérer" : "À déposer"}</th>
              <th>Cumul à bord</th>
              <th>RDV</th>
              <th>Départ</th>
              <th>Arrivée</th>
              <th>Transport</th>
              <th>Billet</th>
              <th>Animateur</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment, index) => {
              const city = transport.direction === "retour" ? segment.to : segment.from;
              const stopPassengers = passengersAtStop(transport, city);
              const onboardPassengers = passengersOnSegment(transport, index);
              const segmentTickets = purchasedTicketsForSegment(transport.tickets, segment.id);
              const assignedStaff = (transport.staff || []).filter((member) =>
                (segment.assignedStaffIds || []).includes(member.id),
              );
              return (
                <tr key={segment.id} onClick={() => onEditSegment(transport, segment.id)}>
                  <td><span className="tr-segment-step">{index + 1}</span></td>
                  <td>
                    <strong>{city || "Ville à compléter"}</strong>
                    <small>{segment.meetingPoint || "Point de rendez-vous à compléter"}</small>
                  </td>
                  <td><strong>{segment.from || "—"} → {segment.to || "—"}</strong></td>
                  <td><strong>{countChildren(stopPassengers)}</strong></td>
                  <td><strong>{countChildren(onboardPassengers)}</strong></td>
                  <td>{segment.meetingTime || "—"}</td>
                  <td>{segment.departureTime || "—"}</td>
                  <td>{segment.arrivalTime || "—"}</td>
                  <td>
                    <span>{segment.mode || "—"} {segment.number || ""}</span>
                    {segment.platform && <small>Voie {segment.platform}</small>}
                  </td>
                  <td>
                    <span className={`tr-summary-ticket ${segmentTickets.length ? "is-bought" : "is-missing"}`}>
                      {segmentTickets.length ? "Acheté" : "À acheter"}
                    </span>
                  </td>
                  <td>
                    {assignedStaff.length
                      ? assignedStaff.map((member) => member.name || "Animateur").join(", ")
                      : <span className="tr-summary-empty">Non affecté</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DateTripCards({ transports, selectedId, onSelectTrip, onEditSegment }) {
  return (
    <section className="tr-date-trips">
      <div className="tr-principal-grid">
        {ROUTE_GROUPS.filter((group) => group.value !== "direct").map((group) => {
          const trip = transports.find((transport) => transport.routeGroup === group.value);
          if (!trip) {
            return (
              <article key={group.value} className="tr-principal-card is-missing">
                <span className="tr-principal-zone">{group.label}</span>
                <h2>Trajet manquant</h2>
                <p>Ce trajet principal doit être créé pour cette date.</p>
              </article>
            );
          }
          const active = selectedId === trip.id;
          return (
            <button key={trip.id} type="button" className={`tr-principal-card${active ? " is-active" : ""}`} onClick={() => onSelectTrip(trip)}>
              <div className="tr-principal-head">
                <span className="tr-principal-zone">{group.label}</span>
                <Badge label={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).label} variant={(STATUS_CFG[trip.status] || STATUS_CFG.brouillon).variant} />
              </div>
              <h2>{trip.departureCity || "Départ à compléter"} → {trip.arrivalCity || "Arrivée à compléter"}</h2>
              <div className="tr-principal-stats is-compact">
                <div><strong>{countChildren(trip.passengers)}</strong><span>enfants</span></div>
                <div><strong>{(trip.segments || []).length}</strong><span>étapes</span></div>
                <div><strong>{trip.departureTime || "—"}</strong><span>départ</span></div>
                <div><strong>{trip.arrivalTime || "—"}</strong><span>arrivée</span></div>
              </div>
            </button>
          );
        })}
      </div>
      {selectedId && transports.find((t) => t.id === selectedId) && (
        <SegmentSummaryTable
          transport={transports.find((t) => t.id === selectedId)}
          onEditSegment={onEditSegment}
        />
      )}
    </section>
  );
}

/* ── Panel tabs ─────────────────────────────────────────────────────────── */

function PassengersTab({ transport, allReservations, onUpdate }) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [resModal, setResModal] = useState(null); // { item } | null

  const openReservation = async (reservationId) => {
    if (!reservationId) return;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId));
      if (snap.exists()) setResModal({ item: mapReservation(snap) });
      else showToast("Réservation introuvable", "error");
    } catch { showToast("Erreur de chargement", "error"); }
  };

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
      const aWeek = transport.week && a.week === transport.week ? 0 : 1;
      const bWeek = transport.week && b.week === transport.week ? 0 : 1;
      return (aWeek + aMatch) - (bWeek + bMatch);
    });
  }, [allReservations, assignedIds, cityKey, cityVal, search, transport.week]);

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
          departureCity: r.departureCity,
          returnCity: r.returnCity,
          pickupCity: transport.direction === "aller" ? r.departureCity : r.returnCity,
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

  const updatePickupCity = async (reservationId, pickupCity) => {
    const updated = transport.passengers.map((passenger) =>
      passenger.reservationId === reservationId ? { ...passenger, pickupCity } : passenger,
    );
    try {
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated,
        updatedAt: serverTimestamp(),
      });
      onUpdate({ ...transport, passengers: updated });
    } catch {
      showToast("Erreur lors du changement de ville", "error");
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
        <CapacityBar current={countChildren(transport.passengers)} total={transport.capacity} />
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
              const weekMatch = transport.week && r.week === transport.week;
              return (
                <label key={r.id} className={`tr-add-item${selected.has(r.id) ? " is-checked" : ""}${cityMatch ? " is-match" : ""}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                  <div className="tr-add-item-info">
                    <span className="tr-add-nom">{r.nom}</span>
                    <span className="tr-add-child">{r.childName}</span>
                    <span className="tr-add-meta">{r.sejourName} · {r[cityKey] || "ville non renseignée"}</span>
                  </div>
                  {cityMatch && <span className="tr-city-match">✓ ville</span>}
                  {weekMatch && <span className="tr-city-match">✓ {r.week}</span>}
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
          {groupPassengersByCity(transport).map(({ city, passengers }) => (
            <section key={normalizePlace(city)} className="tr-pax-city-group">
              <div className="tr-pax-city-header">
                <strong>{city}</strong>
                <span>{countChildren(passengers)} enfant{countChildren(passengers) !== 1 ? "s" : ""}</span>
              </div>
              {passengers.map((p, i) => {
                const kids = p.children?.length > 0 ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }];
                return (
                  <div key={p.reservationId || i} className="tr-pax-row">
                    <div className="tr-pax-num">{i + 1}</div>
                    <div className="tr-pax-info">
                      <span className="tr-pax-nom">{p.nom}</span>
                      <span className="tr-pax-contact">{p.phone}</span>
                      {kids.map((c, ci) => (
                        <span key={ci} className="tr-pax-child-row">
                          <span className="tr-pax-child">{`${c.firstName || ""} ${c.lastName || ""}`.trim() || "Enfant"}</span>
                          {c.birthDate && <span className="tr-pax-dob">{fmtBirthDate(c.birthDate)}</span>}
                        </span>
                      ))}
                    </div>
                    <select
                      className="dash-input tr-pax-city"
                      value={p.pickupCity || ""}
                      onChange={(event) => updatePickupCity(p.reservationId, event.target.value)}
                    >
                      <option value="">Ville à préciser</option>
                      {[...new Set([
                        ...(transport.segments || []).map((segment) => segment.from),
                        transport.arrivalCity,
                      ].filter(Boolean))].map((optionCity) => <option key={optionCity} value={optionCity}>{optionCity}</option>)}
                    </select>
                    <div className="tr-pax-ref">{p.numeroDeReservation}</div>
                    {p.reservationId && (
                      <button type="button" className="tr-pax-open-res" title="Ouvrir la réservation"
                        onClick={() => openReservation(p.reservationId)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                    )}
                    <button type="button" className="tr-pax-remove" title="Retirer"
                      onClick={() => removePassenger(p.reservationId)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {/* Reservation modal */}
      {resModal && (
        <div className="tr-res-overlay" onClick={(e) => { if (e.target === e.currentTarget) setResModal(null); }}>
          <div className="tr-res-modal">
            <ReservationPanel
              item={resModal.item}
              onClose={() => setResModal(null)}
              onSave={(updated) => setResModal({ item: updated })}
              onDelete={() => setResModal(null)}
              onStatusChange={(updated) => setResModal({ item: updated })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OperationsTab({ transport, staffMembers, staffContracts, onUpdate, focusSegmentId }) {
  const { showToast } = useToast();
  const [segments, setSegments] = useState(transport.segments || []);
  const [staff, setStaff] = useState(transport.staff || []);
  const [tickets, setTickets] = useState(transport.tickets || []);
  const [meta, setMeta] = useState({
    routeGroup: transport.routeGroup || "direct",
    week: transport.week || "",
    emergencyContact: transport.emergencyContact || "",
    emergencyPhone: transport.emergencyPhone || "",
  });
  const [editingSegmentId, setEditingSegmentId] = useState(focusSegmentId || "__bilan__");
  const [editingTicketId, setEditingTicketId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [resModal, setResModal] = useState(null);

  const openReservation = async (reservationId) => {
    if (!reservationId) return;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId));
      if (snap.exists()) setResModal({ item: mapReservation(snap) });
      else showToast("Réservation introuvable", "error");
    } catch { showToast("Erreur de chargement", "error"); }
  };

  const availableContracts = useMemo(() => {
    const assignedMemberIds = new Set(staff.map((member) => member.memberId || member.id));
    return staffContracts
      .filter((contract) => {
        if (assignedMemberIds.has(contract.memberId)) return false;
        if (transport.week && contract.week === transport.week) return true;
        return Boolean(
          transport.date
          && contract.startDate
          && contract.endDate
          && transport.date >= contract.startDate
          && transport.date <= contract.endDate
        );
      })
      .sort((a, b) => a.memberName.localeCompare(b.memberName, "fr", { sensitivity: "base" }));
  }, [staff, staffContracts, transport.date, transport.week]);

  useEffect(() => {
    if (!focusSegmentId) return;
    setEditingSegmentId(focusSegmentId);
    const timer = window.setTimeout(() => {
      document.getElementById(`transport-segment-${focusSegmentId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusSegmentId]);

  useEffect(() => {
    setSegments(transport.segments || []);
    setStaff(transport.staff || []);
    setTickets(transport.tickets || []);
    setMeta({
      routeGroup: transport.routeGroup || "direct",
      week: transport.week || "",
      emergencyContact: transport.emergencyContact || "",
      emergencyPhone: transport.emergencyPhone || "",
    });
  }, [transport]);

  const updateItem = (setter, id, key, value) => {
    setter((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const addSegment = () => {
    const newId = crypto.randomUUID();
    setSegments((items) => [...items, {
      id: newId,
      from: items.at(-1)?.to || transport.departureCity || "",
      to: "",
      meetingTime: "",
      meetingPoint: "",
      departureTime: "",
      arrivalTime: "",
      mode: "TGV",
      number: "",
      platform: "",
      instructions: "",
      assignedStaffIds: [],
    }]);
    setEditingSegmentId(newId);
  };

  const addStaff = () => setStaff((items) => [...items, {
    id: crypto.randomUUID(),
    name: "",
    role: "Animateur convoyeur",
    phone: "",
    boardingCity: "",
  }]);

  const addStaffFromContract = () => {
    const contract = staffContracts.find((item) => item.id === selectedContractId);
    if (!contract) return;
    const member = staffMembers.find((item) => item.id === contract.memberId);
    setStaff((items) => [...items, {
      id: crypto.randomUUID(),
      memberId: contract.memberId,
      contractId: contract.id,
      name: member?.name || contract.memberName,
      role: contract.role || "Animateur convoyeur",
      phone: member?.phone || "",
      email: member?.email || "",
      birthDate: member?.birthDate || "",
      boardingCity: "",
      stayCode: contract.stayCode,
      week: contract.week,
    }]);
    setSelectedContractId("");
  };

  /* Add a staff member from a contract AND assign them to a specific segment */
  const addStaffToSegment = (contractId, segId) => {
    const contract = staffContracts.find((item) => item.id === contractId);
    if (!contract) return;
    const member = staffMembers.find((item) => item.id === contract.memberId);
    const newEntry = {
      id: crypto.randomUUID(),
      memberId: contract.memberId,
      contractId: contract.id,
      name: member?.name || contract.memberName,
      role: contract.role || "Animateur convoyeur",
      phone: member?.phone || "",
      email: member?.email || "",
      birthDate: member?.birthDate || "",
      boardingCity: "",
      stayCode: contract.stayCode,
      week: contract.week,
    };
    setStaff((items) => [...items, newEntry]);
    setSegments((items) => items.map((s) =>
      s.id !== segId ? s : { ...s, assignedStaffIds: [...(s.assignedStaffIds || []), newEntry.id] }
    ));
  };

  const addPlannedTicket = () => {
    const newId = crypto.randomUUID();
    setTickets((items) => [...items, {
      id: newId,
      name: "",
      segmentId: "",
      seats: 1,
      price: "",
      departureTime: "",
      arrivalTime: "",
      bookingReference: "",
      purchased: false,
      url: "",
    }]);
    setEditingTicketId(newId);
  };

  const uploadTicketFile = async (ticketId, file) => {
    if (!file) return;
    setUploading(true);
    setExtracting(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storagePath = `transports/${transport.id}/billets/${Date.now()}-${safeName}`;

      // Upload Firebase + extraction IA en parallèle
      const extractFormData = new FormData();
      extractFormData.append("file", file);
      const [snapshot, extractRes] = await Promise.allSettled([
        uploadBytes(ref(storage, storagePath), file),
        fetch("/api/extract-ticket", { method: "POST", body: extractFormData }),
      ]);

      // URL Firebase
      if (snapshot.status === "fulfilled") {
        const url = await getDownloadURL(snapshot.value.ref);
        setTickets((items) => items.map((item) => item.id === ticketId ? { ...item, url, storagePath } : item));
      } else {
        showToast("Échec du téléversement", "error");
      }

      // Auto-remplissage depuis l'IA
      if (extractRes.status === "fulfilled" && extractRes.value.ok) {
        const data = await extractRes.value.json();
        setTickets((items) => items.map((item) => {
          if (item.id !== ticketId) return item;
          return {
            ...item,
            ...(data.name        && !item.name              ? { name: data.name }                         : {}),
            ...(data.seats       && item.seats <= 1         ? { seats: Number(data.seats) }              : {}),
            ...(data.price       && !item.price             ? { price: String(data.price) }              : {}),
            ...(data.departureTime && !item.departureTime   ? { departureTime: data.departureTime }      : {}),
            ...(data.arrivalTime   && !item.arrivalTime     ? { arrivalTime: data.arrivalTime }          : {}),
            ...(data.bookingReference && !item.bookingReference ? { bookingReference: data.bookingReference } : {}),
          };
        }));
        showToast("Billet lu automatiquement ✓", "success");
      } else {
        showToast("Billet ajouté (lecture IA échouée)", "success");
      }
    } catch (error) {
      console.error(error);
      showToast("Échec du téléversement", "error");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const toggleSegmentStaff = (segmentId, staffId) => {
    setSegments((items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const assigned = new Set(segment.assignedStaffIds || []);
      if (assigned.has(staffId)) assigned.delete(staffId);
      else assigned.add(staffId);
      return { ...segment, assignedStaffIds: [...assigned] };
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const first = segments[0];
      const last = segments.at(-1);
      const patch = {
        ...meta,
        segments,
        staff,
        tickets,
        ...(first ? {
          departureCity: first.from || transport.departureCity,
          departureTime: first.departureTime || transport.departureTime,
          trainType: first.mode || transport.trainType,
          trainNumber: first.number || transport.trainNumber,
        } : {}),
        ...(last ? {
          arrivalCity: last.to || transport.arrivalCity,
          arrivalTime: last.arrivalTime || transport.arrivalTime,
        } : {}),
        convoyeur: staff[0]?.name || transport.convoyeur,
        convoyeurPhone: staff[0]?.phone || transport.convoyeurPhone,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), patch);
      onUpdate({ ...transport, ...patch });
      showToast("Organisation du convoi enregistrée", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadTickets = async (files) => {
    const accepted = Array.from(files || []).filter((file) =>
      file.type === "application/pdf" || file.type.startsWith("image/"),
    );
    if (!accepted.length) {
      showToast("Ajoutez un PDF ou une image", "warning");
      return;
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of accepted) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `transports/${transport.id}/billets/${Date.now()}-${safeName}`;
        const snapshot = await uploadBytes(ref(storage, storagePath), file);
        const url = await getDownloadURL(snapshot.ref);
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          url,
          storagePath,
          segmentLabel: "",
          segmentId: "",
          price: "",
          departureTime: "",
          arrivalTime: "",
          bookingReference: "",
          purchased: true,
          uploadedAt: new Date().toISOString(),
        });
      }
      const next = [...tickets, ...uploaded];
      setTickets(next);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        tickets: next,
        updatedAt: serverTimestamp(),
      });
      onUpdate({ ...transport, tickets: next });
      showToast(`${uploaded.length} billet${uploaded.length > 1 ? "s" : ""} ajouté${uploaded.length > 1 ? "s" : ""}`, "success");
    } catch (error) {
      console.error(error);
      showToast("Échec du téléversement", "error");
    } finally {
      setUploading(false);
    }
  };

  const activeT = { ...transport, segments };
  const activeSegIdx = segments.findIndex((s) => s.id === editingSegmentId);
  const activeSeg = (activeSegIdx >= 0 && editingSegmentId !== "__bilan__") ? segments[activeSegIdx] : null;

  const addTicketForSegment = (segmentId) => {
    const newId = crypto.randomUUID();
    const segIdx = segments.findIndex((s) => s.id === segmentId);
    const autoSeats = segIdx >= 0
      ? countChildren(passengersOnSegment(activeT, segIdx)) + (segments[segIdx].assignedStaffIds || []).length
      : 1;
    setTickets((items) => [...items, {
      id: newId, name: "", segmentId, seats: autoSeats || 1,
      price: "", departureTime: "", arrivalTime: "", bookingReference: "", purchased: false, url: "",
    }]);
    setEditingTicketId(newId);
  };

  return (
    <div className="tr-ops-simple">

      {/* ── Segments ── */}
      {segments.length === 0 && (
        <div className="tr-seg-empty">Aucun segment. Cliquez sur "+ Segment" pour commencer.</div>
      )}

      {segments.map((seg, i) => {
        const segTix = tickets.filter((t) => t.segmentId === seg.id);
        const segPassengers = passengersOnSegment(activeT, i);
        const segKids = segPassengers.flatMap(p =>
          (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
            .map(c => ({ ...c, reservationId: p.reservationId }))
        );
        const childCount = segKids.length;
        const assignedStaff = staff.filter(m => (seg.assignedStaffIds || []).includes(m.id));
        const staffCount = assignedStaff.length;
        const needed = childCount + staffCount;
        const bought = segTix.reduce((s, t) => s + Number(t.seats || 0), 0);
        const seatsOk = needed === 0 || bought >= needed;

        return (
          <div key={seg.id} className="tr-ops-seg">
            <div className="tr-ops-seg-head">
              <span className="tr-ops-seg-num">{i + 1}</span>
              <span className="tr-ops-seg-title">{seg.from || "Départ"} → {seg.to || "Arrivée"}</span>
              <button type="button" className="tr-ops-seg-del"
                onClick={() => setSegments((items) => items.filter((s) => s.id !== seg.id))}>
                Supprimer
              </button>
            </div>

            {/* Train info inline */}
            <div className="tr-ops-train-row">
              <label className="tr-ops-field-sm">
                <span>De</span>
                <input className="dash-input" value={seg.from} onChange={(e) => updateItem(setSegments, seg.id, "from", e.target.value)} placeholder="Ville départ" />
              </label>
              <label className="tr-ops-field-sm">
                <span>À</span>
                <input className="dash-input" value={seg.to} onChange={(e) => updateItem(setSegments, seg.id, "to", e.target.value)} placeholder="Ville arrivée" />
              </label>
              <label className="tr-ops-field-sm">
                <span>Mode</span>
                <select className="dash-input" value={seg.mode} onChange={(e) => updateItem(setSegments, seg.id, "mode", e.target.value)}>
                  {TRAIN_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="tr-ops-field-sm">
                <span>N° train</span>
                <input className="dash-input" value={seg.number} onChange={(e) => updateItem(setSegments, seg.id, "number", e.target.value)} placeholder="8421" />
              </label>
              <label className="tr-ops-field-sm">
                <span>RDV</span>
                <input className="dash-input" type="time" value={seg.meetingTime || ""} onChange={(e) => updateItem(setSegments, seg.id, "meetingTime", e.target.value)} />
              </label>
              <label className="tr-ops-field-sm">
                <span>Départ</span>
                <input className="dash-input" type="time" value={seg.departureTime} onChange={(e) => updateItem(setSegments, seg.id, "departureTime", e.target.value)} />
              </label>
              <label className="tr-ops-field-sm">
                <span>Arrivée</span>
                <input className="dash-input" type="time" value={seg.arrivalTime} onChange={(e) => updateItem(setSegments, seg.id, "arrivalTime", e.target.value)} />
              </label>
              <label className="tr-ops-field-sm">
                <span>Quai</span>
                <input className="dash-input" value={seg.platform || ""} onChange={(e) => updateItem(setSegments, seg.id, "platform", e.target.value)} placeholder="Voie 3" />
              </label>
            </div>

            {/* Animateurs — direct checkboxes + quick-add from contracts */}
            <div className="tr-ops-anims">
              <span className="tr-ops-anims-label">
                Animateurs
                {staffCount > 0 && <span className="tr-ops-anims-count">{staffCount}</span>}
              </span>
              {staff.map((member) => {
                const checked = (seg.assignedStaffIds || []).includes(member.id);
                return (
                  <label key={member.id} className={`tr-ops-anim-chip${checked ? " is-on" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSegmentStaff(seg.id, member.id)} />
                    <span>{member.name || "Anim."}</span>
                    {member.birthDate && <span className="tr-ops-anim-dob">{fmtBirthDate(member.birthDate)}</span>}
                    {member.boardingCity && <span className="tr-ops-anim-city">{member.boardingCity}</span>}
                  </label>
                );
              })}
              {availableContracts.length > 0 && (
                <select
                  className="tr-ops-anim-quick-select"
                  value=""
                  onChange={(e) => { if (e.target.value) addStaffToSegment(e.target.value, seg.id); }}
                >
                  <option value="">+ Ajouter…</option>
                  {availableContracts.map((c) => (
                    <option key={c.id} value={c.id}>{c.memberName} · {c.role}</option>
                  ))}
                </select>
              )}
              {availableContracts.length === 0 && staff.length === 0 && (
                <span className="tr-ops-anims-empty">Aucun contrat disponible pour cette semaine</span>
              )}
            </div>

            {/* Enfants sur ce segment */}
            {segKids.length > 0 && (
              <div className="tr-ops-enfants">
                <span className="tr-ops-anims-label">
                  Enfants
                  <span className="tr-ops-anims-count">{segKids.length}</span>
                </span>
                {segKids.map((c, ci) => (
                  <button key={ci} type="button"
                    className="tr-ops-enfant-chip"
                    onClick={() => c.reservationId && openReservation(c.reservationId)}
                    title="Ouvrir la réservation">
                    {`${c.firstName || ""} ${c.lastName || ""}`.trim() || "Enfant"}
                    {c.birthDate && <span className="tr-ops-enfant-dob">{fmtBirthDate(c.birthDate)}</span>}
                    <svg className="tr-ops-enfant-link" width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Billets */}
            <div className="tr-ops-tix">
              <div className="tr-ops-tix-head">
                <span className="tr-ops-anims-label">Billets</span>
                {needed > 0 && (
                  <span className={`tr-seats-badge${seatsOk ? " is-ok" : " is-short"}`}>
                    {bought}/{needed} places
                  </span>
                )}
                <button type="button" className="dash-btn" onClick={() => addTicketForSegment(seg.id)}>+ Billet</button>
              </div>
              {segTix.length === 0 && (
                <p className="tr-add-empty">Aucun billet pour ce segment.</p>
              )}
              {segTix.map((ticket) => (
                <div key={ticket.id} className={`tr-ticket-card${ticket.purchased ? " is-bought" : " is-missing"}`} onClick={() => setEditingTicketId(ticket.id)}>
                  <span className={`tr-ticket-status${ticket.purchased ? " is-bought" : " is-missing"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span>
                  <div className="tr-ticket-card-info">
                    <span className="tr-ticket-card-name">{ticket.name || "Billet sans titre"}</span>
                    <div className="tr-ticket-card-meta">
                      {ticket.seats > 0 && <span>{ticket.seats} place{ticket.seats !== 1 ? "s" : ""}</span>}
                      {ticket.price ? <span>{formatMoney(Number(ticket.price))}</span> : null}
                      {ticket.bookingReference && <span>{ticket.bookingReference}</span>}
                    </div>
                  </div>
                  {ticket.url && <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-ticket-card-pdf" onClick={(e) => e.stopPropagation()}>PDF</a>}
                  <button type="button" className="tr-pax-remove" title="Supprimer"
                    onClick={(e) => { e.stopPropagation(); setTickets((items) => items.filter((it) => it.id !== ticket.id)); }}>×</button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button type="button" className="tr-ops-add-seg" onClick={addSegment}>+ Ajouter un segment</button>

      {/* ── Équipe du convoi ── */}
      <div className="tr-ops-team">
        <div className="tr-ops-team-head">
          <span className="tr-ops-anims-label">Équipe du convoi</span>
          <select className="dash-input" value={selectedContractId} onChange={(e) => setSelectedContractId(e.target.value)}>
            <option value="">Ajouter depuis les contrats RH…</option>
            {availableContracts.map((c) => (
              <option key={c.id} value={c.id}>{c.memberName} · {c.role} · {c.stayCode} {c.week}</option>
            ))}
          </select>
          <button type="button" className="dash-btn dash-btn-primary" onClick={addStaffFromContract} disabled={!selectedContractId}>Affecter</button>
          <button type="button" className="dash-btn" onClick={addStaff}>+ Manuel</button>
        </div>
        <div className="tr-staff-list">
          {staff.map((member) => (
            <article className="tr-staff-editor" key={member.id}>
              <input className="dash-input" value={member.name} onChange={(e) => updateItem(setStaff, member.id, "name", e.target.value)} placeholder="Prénom Nom" />
              <input className="dash-input" value={member.role} onChange={(e) => updateItem(setStaff, member.id, "role", e.target.value)} placeholder="Rôle" />
              <input className="dash-input" value={member.phone} onChange={(e) => updateItem(setStaff, member.id, "phone", e.target.value)} placeholder="Téléphone" />
              <input className="dash-input" value={member.boardingCity} onChange={(e) => updateItem(setStaff, member.id, "boardingCity", e.target.value)} placeholder="Prise de service" />
              {member.contractId && <span className="tr-staff-contract">{member.week} · {member.stayCode}</span>}
              <button type="button" className="tr-pax-remove" title="Retirer" onClick={() => setStaff((items) => items.filter((it) => it.id !== member.id))}>×</button>
            </article>
          ))}
          {!staff.length && <p className="tr-add-empty">Aucun animateur affecté à ce convoi.</p>}
        </div>
      </div>

      <div className="tr-ops-save-row">
        <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* ── Reservation modal ── */}
      {resModal && (
        <div className="tr-res-overlay" onClick={(e) => { if (e.target === e.currentTarget) setResModal(null); }}>
          <div className="tr-res-modal">
            <ReservationPanel
              item={resModal.item}
              onClose={() => setResModal(null)}
              onSave={(updated) => setResModal({ item: updated })}
              onDelete={() => setResModal(null)}
              onStatusChange={(updated) => setResModal({ item: updated })}
            />
          </div>
        </div>
      )}

      {/* ── Ticket detail modal ── */}
      {editingTicketId && (() => {
        const ticket = tickets.find((t) => t.id === editingTicketId);
        if (!ticket) return null;
        return (
          <div className="tr-ticket-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingTicketId(null)}>
            <div className="tr-ticket-modal">
              <div className="tr-ticket-modal-head">
                <div className="tr-ticket-modal-head-info">
                  <span className="tr-ticket-modal-title">{ticket.name || "Nouveau billet"}</span>
                  <span className={`tr-ticket-status ${ticket.purchased ? "is-bought" : "is-missing"}`}>
                    {ticket.purchased ? "Billet acheté" : "Billet à acheter"}
                  </span>
                </div>
                <button type="button" className="rp-close" onClick={() => setEditingTicketId(null)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="tr-ticket-modal-body">
                <label className="tr-ticket-upload tr-ticket-modal-upload">
                  <input type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files[0] && uploadTicketFile(ticket.id, e.target.files[0])} disabled={uploading} />
                  {extracting
                    ? <span className="tr-ticket-extracting">Lecture IA en cours…</span>
                    : ticket.url
                      ? <span>📄 <a href={ticket.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Voir le billet</a> · Cliquer pour remplacer</span>
                      : <span>{uploading ? "Téléversement…" : "Déposer le PDF — les champs seront remplis automatiquement"}</span>
                  }
                </label>
                <div className="tr-ticket-modal-form">
                  <label className="tr-tmf-span2">
                    <span>Nom / référence</span>
                    <input className="dash-input" value={ticket.name || ""} onChange={(e) => updateItem(setTickets, ticket.id, "name", e.target.value)} placeholder="TGV 8421, Ouigo Paris-Lyon…" />
                  </label>
                  <label className="tr-tmf-span2">
                    <span>Portion concernée</span>
                    <select className="dash-input" value={ticket.segmentId || ""} onChange={(e) => {
                      const segId = e.target.value;
                      const segIdx = segments.findIndex((s) => s.id === segId);
                      const autoSeats = segIdx >= 0
                        ? countChildren(passengersOnSegment(activeT, segIdx)) + (segments[segIdx].assignedStaffIds || []).length
                        : ticket.seats ?? 1;
                      setTickets((items) => items.map((item) => item.id === ticket.id ? { ...item, segmentId: segId, seats: autoSeats } : item));
                    }}>
                      <option value="">— Affecter à une portion —</option>
                      {segments.map((s) => <option key={s.id} value={s.id}>{s.from} → {s.to}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Nb de places</span>
                    <input className="dash-input" type="number" min="1" step="1" value={ticket.seats ?? 1} onChange={(e) => updateItem(setTickets, ticket.id, "seats", Math.max(1, parseInt(e.target.value) || 1))} />
                  </label>
                  <label>
                    <span>Prix (€)</span>
                    <input className="dash-input" type="number" min="0" step="0.01" value={ticket.price ?? ""} onChange={(e) => updateItem(setTickets, ticket.id, "price", e.target.value)} placeholder="0,00" />
                  </label>
                  <label>
                    <span>Heure de départ</span>
                    <input className="dash-input" type="time" value={ticket.departureTime || ""} onChange={(e) => updateItem(setTickets, ticket.id, "departureTime", e.target.value)} />
                  </label>
                  <label>
                    <span>Heure d'arrivée</span>
                    <input className="dash-input" type="time" value={ticket.arrivalTime || ""} onChange={(e) => updateItem(setTickets, ticket.id, "arrivalTime", e.target.value)} />
                  </label>
                  <label className="tr-tmf-span2">
                    <span>Référence achat</span>
                    <input className="dash-input" value={ticket.bookingReference || ""} onChange={(e) => updateItem(setTickets, ticket.id, "bookingReference", e.target.value)} placeholder="Dossier transporteur" />
                  </label>
                  <label className="tr-tmf-check tr-tmf-span2">
                    <input type="checkbox" checked={Boolean(ticket.purchased)} onChange={(e) => updateItem(setTickets, ticket.id, "purchased", e.target.checked)} />
                    <span>Billet acheté / confirmé</span>
                  </label>
                </div>
              </div>
              <div className="tr-ticket-modal-foot">
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setEditingTicketId(null)}>OK</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function DocumentsTab({ transport }) {
  const openDoc = (html) => {
    const win = openPrintableDocument(html);
    if (!win) return;
    win.focus();
    setTimeout(() => win.print(), 800);
  };

  const [singleIdx, setSingleIdx] = useState(0);

  return (
    <div className="tr-docs-tab">
      {/* Document type cards */}
      <div className="tr-doc-card" onClick={() => openDoc(buildStaffBriefingHTML(transport))}>
        <div className="tr-doc-card-icon">🧭</div>
        <div className="tr-doc-card-body">
          <div className="tr-doc-card-title">Convocation animateurs</div>
          <div className="tr-doc-card-desc">
            Feuille de route complète : équipe, segments, horaires, enfants, contacts et billets.
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
  { key: "operations", label: "Organisation" },
  { key: "passengers", label: "Enfants" },
  { key: "documents",  label: "Documents" },
];

function TransportPanel({
  transport: ext,
  allReservations,
  staffMembers,
  staffContracts,
  selectedSegmentId,
  onClose,
  onSave,
  onDelete,
  onCreated,
}) {
  const { showToast } = useToast();
  const [transport, setTransport] = useState(ext);
  const [tab, setTab]             = useState("operations");
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => setTransport(ext), [ext]);

  useEffect(() => {
    if (selectedSegmentId) setTab("operations");
  }, [selectedSegmentId]);

  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleUpdate = (updated) => {
    setTransport(updated);
    onSave(updated);
  };

  const quickAddTicket = async (segId, formData) => {
    const { seats, reference, purchased, file } = formData;
    let ticketUrl = "";
    let storagePath = "";
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `transports/${transport.id}/billets/${Date.now()}-${safeName}`;
      const snap = await uploadBytes(ref(storage, path), file);
      ticketUrl = await getDownloadURL(snap.ref);
      storagePath = path;
    }
    const seg = (transport.segments || []).find((s) => s.id === segId);
    const newTicket = {
      id: crypto.randomUUID(),
      segmentId: segId,
      name: seg ? `${seg.mode || "Train"} — ${seg.from} → ${seg.to}` : "Billet",
      seats: seats || 1,
      bookingReference: reference || "",
      price: "",
      departureTime: seg?.departureTime || "",
      arrivalTime: seg?.arrivalTime || "",
      purchased: purchased ?? true,
      url: ticketUrl,
      storagePath,
      uploadedAt: new Date().toISOString(),
      segmentLabel: seg ? `${seg.from} → ${seg.to}` : "",
    };
    const updatedTickets = [...(transport.tickets || []), newTicket];
    await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
      tickets: updatedTickets,
      updatedAt: serverTimestamp(),
    });
    handleUpdate({ ...transport, tickets: updatedTickets });
    showToast("Billet ajouté ✓", "success");
  };

  const quickToggleStaff = async (segId, staffId) => {
    const updatedSegments = (transport.segments || []).map((s) => {
      if (s.id !== segId) return s;
      const assigned = new Set(s.assignedStaffIds || []);
      if (assigned.has(staffId)) assigned.delete(staffId);
      else assigned.add(staffId);
      return { ...s, assignedStaffIds: [...assigned] };
    });
    await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
      segments: updatedSegments,
      updatedAt: serverTimestamp(),
    });
    handleUpdate({ ...transport, segments: updatedSegments });
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

  const createReverseTrip = async () => {
    const returnDates = { S1: "2026-07-17", S2: "2026-07-31", S3: "2026-08-14", S4: "2026-08-28" };
    try {
      const payload = {
        sejourName: transport.sejourName,
        direction: transport.direction === "aller" ? "retour" : "aller",
        routeGroup: transport.routeGroup,
        week: transport.week,
        departureCity: transport.arrivalCity,
        arrivalCity: transport.departureCity,
        date: transport.direction === "aller" ? (returnDates[transport.week] || "") : "",
        departureTime: "",
        arrivalTime: "",
        trainType: transport.trainType,
        trainNumber: "",
        meetingPoint: "",
        meetingTime: "",
        platform: "",
        convoyeur: transport.convoyeur,
        convoyeurPhone: transport.convoyeurPhone,
        emergencyContact: transport.emergencyContact,
        emergencyPhone: transport.emergencyPhone,
        capacity: transport.capacity,
        status: "brouillon",
        notes: `Copie créée depuis le trajet ${transport.direction}. Horaires et billets à compléter.`,
        passengers: transport.passengers.map((passenger) => ({
          ...passenger,
          pickupCity: passenger.returnCity || transport.arrivalCity,
        })),
        segments: [...(transport.segments || [])].reverse().map((segment) => ({
          ...segment,
          id: crypto.randomUUID(),
          from: segment.to,
          to: segment.from,
          departureTime: "",
          arrivalTime: "",
          platform: "",
        })),
        staff: transport.staff || [],
        tickets: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const created = await addDoc(collection(db, COLLECTIONS.TRANSPORTS), payload);
      onCreated({ ...payload, id: created.id, dateMs: Date.now() });
      showToast("Trajet inverse créé en brouillon", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la duplication", "error");
    }
  };

  const isAller = transport.direction === "aller";
  const dirColor = isAller ? "#16a34a" : "#ea580c";
  const sCfg = STATUS_CFG[transport.status] || STATUS_CFG.brouillon;

  return (
    <aside className="res-panel transport-panel">
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
          <span className="tr-train-chip">
            {ROUTE_GROUPS.find(group => group.value === transport.routeGroup)?.label || "Direct"}
            {transport.week ? ` · ${transport.week}` : ""}
          </span>
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

        <TripTimeline transport={transport} onToggleStaff={quickToggleStaff} />

        <div className="rp-tabs">
          {TRANSPORT_PANEL_TABS.map(t => (
            <button key={t.key} type="button"
              className={`rp-tab${tab === t.key ? " is-active" : ""}`}
              onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "passengers" && (
                <span className="rp-tab-count">{countChildren(transport.passengers)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rp-body">
        {tab === "passengers" && (
          <PassengersTab transport={transport} allReservations={allReservations} onUpdate={handleUpdate} />
        )}
        {tab === "operations" && (
          <OperationsTab
            transport={transport}
            staffMembers={staffMembers}
            staffContracts={staffContracts}
            onUpdate={handleUpdate}
            focusSegmentId={selectedSegmentId}
          />
        )}
        {tab === "documents" && <DocumentsTab transport={transport} />}
      </div>

      <div className="rp-footer">
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="dash-btn" onClick={createReverseTrip}>Créer le trajet inverse</button>
          <button type="button" className="dash-btn dash-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>
          {countChildren(transport.passengers)} enfant{countChildren(transport.passengers) !== 1 ? "s" : ""}
          {transport.capacity ? ` / ${transport.capacity} places` : ""}
        </span>
      </div>
    </aside>
  );
}

/* ── New transport modal ─────────────────────────────────────────────────── */

const EMPTY_TRANSPORT = {
  sejourName: "", direction: "aller",
  routeGroup: "nord", week: "",
  departureCity: "", arrivalCity: "",
  date: "", departureTime: "", arrivalTime: "",
  trainType: "TGV", trainNumber: "",
  meetingPoint: "", meetingTime: "", platform: "",
  convoyeur: "", convoyeurPhone: "",
  emergencyContact: "", emergencyPhone: "",
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
        segments: [{
          id: crypto.randomUUID(),
          from: form.departureCity,
          to: form.arrivalCity,
          meetingTime: form.meetingTime,
          meetingPoint: form.meetingPoint,
          departureTime: form.departureTime,
          arrivalTime: form.arrivalTime,
          mode: form.trainType,
          number: form.trainNumber,
          platform: form.platform,
          instructions: "",
          assignedStaffIds: [],
        }],
        staff: form.convoyeur ? [{
          id: crypto.randomUUID(),
          name: form.convoyeur,
          phone: form.convoyeurPhone,
          role: "Responsable de convoi",
          boardingCity: form.departureCity,
        }] : [],
        tickets: [],
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
              <span>Zone de convoi</span>
              <select className="dash-input" value={form.routeGroup} onChange={e => set("routeGroup", e.target.value)}>
                {ROUTE_GROUPS.map(group => <option key={group.value} value={group.value}>{group.label}</option>)}
              </select>
            </div>
            <div className="rp-edit-field">
              <span>Semaine</span>
              <select className="dash-input" value={form.week} onChange={e => set("week", e.target.value)}>
                <option value="">À compléter</option>
                {WEEKS.map(week => <option key={week} value={week}>{week}</option>)}
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

export default function Transport({ focusDate = "" }) {
  const [transports, setTransports]     = useState([]);
  const [reservations, setReservations] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [staffContracts, setStaffContracts] = useState([]);
  const [selected, setSelected]         = useState(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [activeTripId, setActiveTripId] = useState("");
  const [loading, setLoading]           = useState(true);
  const [showNew, setShowNew]           = useState(false);
  const { showToast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tSnap, rSnap, staffSnap, contractsSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "desc"))),
        getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
        getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
        getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
      ]);
      setTransports(tSnap.docs.map(mapTransport));
      setReservations(rSnap.docs.map(mapReservationForTransport));
      setStaffMembers(staffSnap.docs.map(mapStaffMember).filter((member) => member.active));
      setStaffContracts(contractsSnap.docs.map(mapStaffContract).filter((contract) => contract.status !== "cancelled"));
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
    if (activeTripId === id) setActiveTripId("");
  };

  const handleCreated = (t) => {
    setTransports(prev => [t, ...prev]);
    setSelected(t);
  };

  const handleSelectTrip = (transport) => {
    if (selected?.id === transport.id) {
      setSelected(null);
      setActiveTripId("");
    } else {
      setSelected(transport);
      setActiveTripId(transport.id);
      setSelectedSegmentId("");
    }
  };

  const handleEditSegment = (transport, segmentId) => {
    setActiveTripId(transport.id);
    setSelectedSegmentId(segmentId);
    setSelected(transport);
  };

  /* Stats */
  const dateTransports = useMemo(
    () => focusDate ? transports.filter((transport) => transport.date === focusDate) : transports,
    [focusDate, transports],
  );
  const activeKeyDate = KEY_DATES.find((item) => item.date === focusDate);

  return (
    <>
      <div className={`res-page-layout${selected ? " has-panel" : ""}`}>
        <div className="res-main">
          <div className="dash-page">
            <header className="dash-page-header dash-page-header-row">
              <div>
                {focusDate && (
                  <Link href="/dashboard/transport" className="tr-back-link">← Toutes les semaines</Link>
                )}
                <h1>
                  {focusDate && activeKeyDate
                    ? `${activeKeyDate.label} · ${fmtDate(focusDate)}`
                    : "Transport"}
                </h1>
                <p>
                  {focusDate
                    ? "Sélectionnez un trajet pour afficher ses étapes, puis cliquez sur une étape pour la modifier."
                    : "Accédez directement au jour de départ ou de retour qui vous intéresse."}
                </p>
              </div>
              <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
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

            {/* ── Page principale (pas de date dans l'URL) ── */}
            {!loading && !focusDate && (
              transports.length === 0 ? (
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
                <>
                  <TransportBudgetOverview reservations={reservations} transports={transports} />
                  <TransportCoverage reservations={reservations} transports={transports} />
                  <WeeksOverview
                    transports={transports}
                    selectedId={selected?.id}
                    onSelectTrip={handleSelectTrip}
                  />
                </>
              )
            )}

            {/* ── Page d'une date spécifique (focusDate dans l'URL) ── */}
            {!loading && focusDate && (
              dateTransports.length === 0 ? (
                <div className="dash-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.2" strokeLinecap="round" stroke="currentColor">
                    <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 4v4h-7V8z" />
                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  <h3>Aucun transport pour ce jour</h3>
                  <p>Créez les deux trajets principaux (Nord et Sud / Ouest) pour cette date.</p>
                  <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
                    + Nouveau transport
                  </button>
                </div>
              ) : (
                <>
                  <DaySummary transports={dateTransports} date={focusDate} />
                  <DateTripCards
                    transports={dateTransports}
                    selectedId={selected?.id}
                    onSelectTrip={handleSelectTrip}
                    onEditSegment={handleEditSegment}
                  />
                </>
              )
            )}

            {loading && (
              <div className="dash-section" style={{ padding: 24 }}>
                <p className="dash-muted">Chargement des transports…</p>
              </div>
            )}
          </div>
        </div>

        {selected && (
          <TransportPanel
            transport={selected}
            allReservations={reservations}
            staffMembers={staffMembers}
            staffContracts={staffContracts}
            selectedSegmentId={selectedSegmentId}
            onClose={() => {
              setSelected(null);
              setSelectedSegmentId("");
            }}
            onSave={handleSave}
            onDelete={handleDelete}
            onCreated={handleCreated}
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
