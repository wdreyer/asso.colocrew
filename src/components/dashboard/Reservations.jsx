"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { siblingDiscountFactor } from "@/src/lib/pricing";
import { isArchivedRecord, seasonOfRecord, useSeasons } from "@/src/lib/seasons";
import { formatDateRange, useSessionCatalog } from "@/src/lib/sessions";
import {
  RESERVATION_STATUS_META,
  canTransition,
  computeSessionOccupancy,
  legacyWeekOf,
  matchReservationTransports,
  normalizeReservationStatus,
  reservationSessionId,
  reservationTransports,
  sessionFillState,
} from "@/src/lib/reservations";

/* ── Constants ─────────────────────────────────────────────────────────── */

const STATUS_LABEL = Object.fromEntries(Object.entries(RESERVATION_STATUS_META).map(([key, meta]) => [key, meta.short]));
const STATUS_BADGE = Object.fromEntries(Object.entries(RESERVATION_STATUS_META).map(([key, meta]) => [key, meta.badge]));
const STATUS_ORDER = ["pending", "validated", "waitlist", "cancelled"];
const STAGE_QUAI_RDV = "Rendez-vous sur le quai — l’animateur·ice vous contactera";

const EMAIL_TEMPLATES = [
  {
    key: "suite_reservation",
    label: "Suite réservation",
    subject: (_n, sejour) =>
      `ColoCrew — Suite à donner pour votre réservation "${sejour}"`,
    body: () => "",
  },
  {
    key: "payment_failed",
    label: "Paiement CB échoué",
    subject: (_n, sejour) =>
      `ColoCrew — Paiement par carte échoué pour votre réservation "${sejour}"`,
    body: () => "",
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

function reservationChildCount(item) {
  const childrenCount = Array.isArray(item?.children) ? item.children.length : 0;
  if (childrenCount > 0) return childrenCount;
  const declaredCount = Number(item?.numberOfChildren);
  return Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : 1;
}

function countReservationChildren(items) {
  return (items || []).reduce((total, item) => total + reservationChildCount(item), 0);
}

function canonicalStayName(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized === "mycreativesurfcamp" ? "my-creative-surf-camp" : value;
}

function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isRoadTransportMode(value) {
  const mode = normalizePlace(value);
  return mode.includes("bus") || mode.includes("autocar") || mode.includes("minibus");
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function reservationTransportReminderLines(extra) {
  const departureMinutes = timeToMinutes(extra.departureTime);
  const returnMinutes = timeToMinutes(extra.returnTime);
  return [
    departureMinutes !== null && departureMinutes < 12 * 60 ? "🥪 Pensez à prévoir un <strong>pique-nique pour le déjeuner</strong>." : null,
    returnMinutes !== null && returnMinutes >= 19 * 60 ? "🍽️ Un <strong>repas sera prévu sur place</strong>, mais l'arrivée étant tardive, pensez à prévoir un pique-nique ou un encas pour le dîner." : null,
    "💧 Merci de prévoir <strong>de l'eau et un goûter</strong> pour le trajet.",
    "⏱️ Le rendez-vous est fixé <strong>au moins 45 minutes avant le départ du train</strong>.",
    "💊 Si votre enfant a un traitement médical, merci de prévoir les <strong>médicaments dans leur emballage d'origine avec l'ordonnance</strong>.",
    "📝 Si votre enfant se rend seul au point de rendez-vous, rentre seul ou est récupéré par une tierce personne, merci de nous fournir la <strong>décharge de responsabilité ci-jointe</strong>.",
  ].filter(Boolean);
}

function segmentStopCityForReservation(transport, segment) {
  return transport.direction === "retour" ? segment?.to : segment?.from;
}

function passengerTransportCity(transport, passenger, fallbackItem) {
  return passenger?.pickupCity
    || (transport.direction === "retour" ? passenger?.returnCity || fallbackItem?.returnCity : passenger?.departureCity || fallbackItem?.departureCity)
    || "";
}

function findPassengerSegment(transport, passenger, fallbackItem) {
  const city = normalizePlace(passengerTransportCity(transport, passenger, fallbackItem));
  if (!city) return null;
  return [...(transport.segments || []), ...(transport.branches || [])].find((segment) =>
    normalizePlace(segmentStopCityForReservation(transport, segment)) === city
    || (segment.stops || []).some((stop) => normalizePlace(stop.city) === city),
  ) || null;
}

function staffMemberById(transport, staffId) {
  if (!transport || !staffId) return null;
  return (transport.staff || []).find((member) => member.id === staffId || member.memberId === staffId) || null;
}

function convoyageLeadForSegment(transport, segment) {
  if (!transport) return null;
  const assignedIds = [...new Set(segment?.assignedStaffIds || [])].filter(Boolean);
  const lead = staffMemberById(transport, transport.leadStaffId);
  if (lead && (!assignedIds.length || assignedIds.includes(lead.id) || assignedIds.includes(lead.memberId))) return lead;
  if (assignedIds.length === 1) return staffMemberById(transport, assignedIds[0]);
  return assignedIds.map((id) => staffMemberById(transport, id)).find(Boolean) || lead || (transport.staff || [])[0] || null;
}

function ticketSegmentLabelForReservation(ticket, segments = []) {
  const segment = segments.find((item) => item.id === ticket.segmentId);
  return segment ? `${segment.from || "Départ"} > ${segment.to || "Arrivée"}` : ticket.segmentLabel || "";
}

/**
 * Adds a validated reservation to the convoys of its session (one per direction, when a single
 * convoy of the right day stops in the family's city). 2026 convoys only know their `week`: it is
 * rebuilt from the séjour's dates.
 */
async function syncReservationToMatchingTransports(reservationId, data) {
  if (normalizeReservationStatus(data.status) !== "validated") return 0;
  const transportsSnap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
  const transports = transportsSnap.docs.map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }));
  let legacyWeek = "";
  if (data.sejour?.id && transports.some((transport) => !transport.sessionIds?.length && !transport.date && transport.week)) {
    const sejourSnap = await getDoc(doc(db, COLLECTIONS.SEJOURS, data.sejour.id)).catch(() => null);
    legacyWeek = sejourSnap?.exists() ? legacyWeekOf(sejourSnap.data().dates, data.sejour.startDate) : "";
  }
  let synced = 0;

  for (const { transport, city } of matchReservationTransports(transports, data, { legacyWeek })) {
    const passengers = Array.isArray(transport.passengers) ? transport.passengers : [];
    if (passengers.some((passenger) => passenger.reservationId === reservationId)) continue;
    await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
      passengers: [...passengers, { reservationId, pickupCity: city }],
      updatedAt: serverTimestamp(),
    });
    synced += 1;
  }
  return synced;
}

async function removeReservationFromAllTransports(reservationId) {
  const transportsSnap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
  let removed = 0;

  for (const transportDoc of transportsSnap.docs) {
    const transport = { id: transportDoc.id, ...transportDoc.data() };
    const passengers = Array.isArray(transport.passengers) ? transport.passengers : [];
    const nextPassengers = passengers.filter((passenger) => passenger.reservationId !== reservationId);
    if (nextPassengers.length === passengers.length) continue;
    await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
      passengers: nextPassengers,
      updatedAt: serverTimestamp(),
    });
    removed += passengers.length - nextPassengers.length;
  }

  return removed;
}

async function resyncReservationTransports(reservationId, data) {
  await removeReservationFromAllTransports(reservationId);
  return syncReservationToMatchingTransports(reservationId, data);
}

function reservationDataForSync(item, overrides = {}) {
  const base = item.raw || {};
  return {
    ...base,
    status: overrides.status ?? item.status ?? base.status,
    numeroDeReservation: overrides.numeroDeReservation ?? item.numeroDeReservation ?? base.numeroDeReservation,
    legal: {
      ...(base.legal || {}),
      firstName: overrides.legalFirstName ?? base.legal?.firstName,
      lastName: overrides.legalLastName ?? base.legal?.lastName,
      email: overrides.email ?? item.email ?? base.legal?.email,
      phone: overrides.phone ?? item.phone ?? base.legal?.phone,
    },
    minor: base.minor || { children: item.children || [] },
    sejour: {
      ...(base.sejour || {}),
      id: overrides.sejourId ?? base.sejour?.id,
      sessionId: overrides.sessionId ?? base.sejour?.sessionId,
      name: overrides.sejourName ?? item.sejourName ?? base.sejour?.name,
      startDate: overrides.sejourStartDate ?? item.sejourStartDate ?? base.sejour?.startDate,
      endDate: overrides.sejourEndDate ?? item.sejourEndDate ?? base.sejour?.endDate,
      ageGroup: overrides.sejourAgeGroup ?? item.sejourAgeGroup ?? base.sejour?.ageGroup,
    },
    transport: {
      ...(base.transport || {}),
      departureCity: overrides.departureCity ?? item.departureCity ?? base.transport?.departureCity,
      returnCity: overrides.returnCity ?? item.returnCity ?? base.transport?.returnCity,
    },
  };
}

/**
 * Sessions a reservation can be booked on: every session of the open (non-archived) seasons,
 * from the live catalog. Archived seasons are read-only in /dashboard/archives.
 */
function useBookableSessions() {
  const { archivedSeasons } = useSeasons();
  const catalog = useSessionCatalog();
  return useMemo(() => ({
    ...catalog,
    sessions: catalog.sessions.filter((session) => !archivedSeasons.has(session.season)),
  }), [catalog, archivedSeasons]);
}

function sessionOptionLabel(session) {
  return `${session.sejourName} — ${session.week} · ${formatDateRange(session.startDate, session.endDate)}`;
}

/** Fields written on a reservation when it is attached to a catalog session. */
function sessionPatch(session, ageGroup) {
  return {
    season: session.season,
    "sejour.id": session.sejourId,
    "sejour.sessionId": session.id,
    "sejour.name": session.sejourName,
    "sejour.startDate": session.startDate,
    "sejour.endDate": session.endDate,
    "sejour.ageGroup": ageGroup || "",
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function wrapPdfText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildConvocationPdf(item, extra) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [595.28, 841.89];
  const margin = 48;
  const lineHeight = 15;
  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
    page.drawText("ColoCrew", { x: margin, y, size: 22, font: bold, color: rgb(0.72, 0.2, 0.42) });
    page.drawText(`Réservation ${item.numeroDeReservation || item.id?.slice(0, 8) || ""}`, {
      x: 365, y: y + 3, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 44;
  };

  const ensureSpace = (height = 30) => {
    if (y - height < margin) newPage();
  };

  const drawLine = (text, options = {}) => {
    const size = options.size || 10.5;
    const font = options.bold ? bold : regular;
    const indent = options.indent || 0;
    const lines = wrapPdfText(text, font, size, pageSize[0] - (margin * 2) - indent);
    ensureSpace(lines.length * lineHeight + 4);
    for (const line of lines) {
      page.drawText(line, {
        x: margin + indent, y, size, font,
        color: options.color || rgb(0.12, 0.08, 0.2),
      });
      y -= lineHeight;
    }
    y -= options.after ?? 3;
  };

  const section = (title) => {
    ensureSpace(32);
    y -= 4;
    page.drawText(title.toUpperCase(), { x: margin, y, size: 9, font: bold, color: rgb(0.72, 0.2, 0.42) });
    y -= 19;
  };

  newPage();
  drawLine("CONVOCATION FAMILLE", { size: 18, bold: true, after: 14 });
  drawLine(`Bonjour ${item.nom !== "—" ? item.nom : ""},`);
  drawLine(`Voici les informations de convoyage pour le séjour ${item.sejourName}. Merci de vous présenter à l'heure indiquée.`, { after: 10 });

  section("Participant");
  const children = item.children?.length ? item.children : [{ firstName: item.childName, lastName: "" }];
  children.forEach((child) => drawLine(`${child.firstName || ""} ${child.lastName || ""}`.trim(), { bold: true }));

  section("Aller");
  drawLine(`Date : ${fmtDate(item.sejourStartDate) || "À compléter"}`);
  drawLine(`Ville : ${extra.departureCity || item.departureCity || "À compléter"}`);
  drawLine(`Rendez-vous : ${extra.meetingPoint || "À compléter"}`);
  drawLine(`Heure de rendez-vous : ${extra.meetingTime || extra.departureTime || "À compléter"}`);
  drawLine(`Départ : ${extra.departureTime || "À compléter"}${extra.trainNumber ? ` - ${extra.trainType || "Train"} ${extra.trainNumber}` : ""}`);

  section("Retour");
  drawLine(`Date : ${fmtDate(item.sejourEndDate) || "À compléter"}`);
  drawLine(`Ville : ${extra.returnCity || item.returnCity || item.departureCity || "À compléter"}`);
  drawLine(`Rendez-vous : ${extra.returnMeetingPoint || "À compléter"}`);
  drawLine(`Arrivée prévue : ${extra.returnTime || "À compléter"}`);

  if (extra.convoyeur || extra.convoyeurPhone) {
    section("Contact convoyage");
    drawLine(`${extra.convoyeur || "Équipe ColoCrew"}${extra.convoyeurPhone ? ` - ${extra.convoyeurPhone}` : ""}`);
  }
  if (extra.toBring) {
    section("À apporter");
    extra.toBring.split("\n").filter(Boolean).forEach((line) => drawLine(`- ${line}`));
  }
  if (extra.notes) {
    section("Informations complémentaires");
    extra.notes.split("\n").filter(Boolean).forEach((line) => drawLine(line));
  }

  ensureSpace(45);
  y -= 12;
  drawLine("ColoCrew - contact@colocrew.com - 01 84 21 02 30", { size: 9, color: rgb(0.45, 0.45, 0.45) });
  return pdf.save();
}

function generateRef() {
  const n = new Date();
  const dd = String(n.getDate()).padStart(2, "0");
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900) + 100;
  return `RES-${dd}${mm}${rnd}`;
}

export function mapReservation(snap) {
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
    status: normalizeReservationStatus(d.status),
    season: seasonOfRecord(d),
    sessionId: reservationSessionId(d),
    sejourId: sejour.id || "",
    archived: d.archived === true,
    depositPaid: (d.payment?.depositStatus || "") === "paid",
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
    sejourName:      canonicalStayName(sejour.name || d.sejourName) || "—",
    sejourStartDate: sejour.startDate || "",
    sejourEndDate:   sejour.endDate   || "",
    sejourAgeGroup:  sejour.ageGroup  || "",
    // S1, S2… comes from the session catalog (see `withSession`), never from hard-coded dates.
    week:            sejour.week || "",
    departureCity: transport.departureCity || transport.stationName || transport.station || "",
    returnCity:    transport.returnCity || "",
    transportFee:  toAmount(transport.fee ?? d.transportFee ?? null),
    paymentMethod: options.paymentMethod || pricing.paymentMethod || "",
    paymentStatus: pricing.paymentStatus || d.paymentStatus || "not_paid",
    totalPrice:    toAmount(pricing.totalPrice ?? pricing.total ?? null),
    estimatedMin:  toAmount(pricing.estimatedPriceMin ?? pricing.basePriceMin ?? null),
    estimatedMax:  toAmount(pricing.estimatedPriceMax ?? pricing.basePriceMax ?? null),
    basePricePerChildMin: toAmount(pricing.basePriceMin ?? null),
    basePricePerChildMax: toAmount(pricing.basePriceMax ?? null),
    insuranceFee:  toAmount(pricing.insuranceFee ?? null),
    alreadyPaid:   toAmount(pricing.alreadyPaid ?? null),
    remainingValue: toAmount(pricing.remainingValue ?? null),
    cafEligible: !!pricing.cafEligible,
    cafAmount:   toAmount(pricing.cafAmount ?? null),
    resteACharge: toAmount(pricing.resteACharge ?? null),
    requestedPrice: toAmount(
      pricing.requested ?? pricing.estimatedPriceMax ??
      pricing.basePriceMax ?? sejour.priceMax ?? sejour.basePrice ?? d.basePrice ?? null,
    ),
    finalPrice: toAmount(d.finalPrice ?? pricing.validatedPrice ?? (pricing.priceStatus === "validated" ? pricing.totalPrice : null)),
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
    <div><strong>Ville de départ :</strong> ${extra.departureCity || item.departureCity || "À préciser"}</div>
    <div>📍 <strong>Lieu de départ :</strong> ${extra.meetingPoint || item.departureCity || "À préciser"}</div>
    ${extra.meetingTime ? `<div style="margin-top:8px">🕐 <strong>Heure de rendez-vous :</strong> ${extra.meetingTime}</div>` : ""}
    ${extra.departureTime ? `<div style="margin-top:8px">🚆 <strong>Départ :</strong> ${extra.departureTime}${extra.trainNumber ? ` — ${extra.trainType || "Train"} ${extra.trainNumber}` : ""}</div>` : ""}
    ${extra.returnTime ? `<div style="margin-top:8px">🔄 <strong>Heure de retour :</strong> ${extra.returnTime}</div>` : ""}
    ${(extra.returnCity || item.returnCity) ? `<div style="margin-top:8px">🏠 <strong>Ville de retour :</strong> ${extra.returnCity || item.returnCity}</div>` : ""}
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
        <InfoRow label="Saison" value={item.season} />
        <InfoRow label="Session" value={item.sessionLabel || (item.sessionId ? "Hors catalogue" : "Non rattachée")} />
        <InfoRow label="Statut" value={RESERVATION_STATUS_META[item.status]?.label} />
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
        <InfoRow label="Acompte" value={item.depositPaid ? "Reçu" : null} />
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

const COLOCREW_RIB = {
  titulaire: "COLOCREW",
  iban: "FR76 1695 8000 0158 6780 6033 040",
  bic: "QNTOFRP1XXX",
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function suiteEmailRow(label, value, opts = {}) {
  return `
    <tr>
      <td style="padding:7px 14px;font-size:13px;color:#5a4f6b;border-bottom:1px solid #f0e3ee;">${label}</td>
      <td style="padding:7px 14px;font-size:13px;text-align:right;font-weight:700;color:${opts.accent ? "#B8336A" : "#1e1535"};border-bottom:1px solid #f0e3ee;white-space:nowrap;">${value}</td>
    </tr>`;
}

function suiteEmailButton(href, label) {
  return `
    <div style="text-align:center;margin:14px 0;">
      <a href="${href}" style="display:inline-block;background:#B8336A;color:#fff;padding:13px 30px;text-decoration:none;border-radius:100px;font-weight:700;font-size:14px;box-shadow:0 4px 14px rgba(184,51,106,0.3);">${label}</a>
    </div>`;
}

function buildSuiteEmailHtml({
  nom, sejour, ref, introText,
  sejourPriceNum, transportAmountNum, cafEligible, cafAmountNum, resteACharge,
  alreadyPaid = 0, amountDueNow, discountPercent = 0, childCount = 1,
  link, installmentsEnabled, installmentsCount, depositLink,
  priceDefined = true,
  missingCafNumber = false,
  paymentFailed = false,
}) {
  const parts = [];
  parts.push(`<p style="font-size:14px;color:#1e1535;line-height:1.6;margin:0 0 10px;">Bonjour ${escapeHtml(nom)},</p>`);
  if (introText.trim()) {
    parts.push(`<p style="font-size:14px;color:#1e1535;line-height:1.6;margin:0 0 10px;">${escapeHtml(introText).replace(/\n/g, "<br>")}</p>`);
  }

  if (paymentFailed) {
    parts.push(`
      <div style="border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin:0 0 14px;background:#fff7ed;">
        <p style="margin:0 0 5px;font-size:12px;font-weight:800;color:#c2410c;text-transform:uppercase;letter-spacing:0.04em;">Paiement par carte non abouti</p>
        <p style="margin:0;font-size:13px;color:#1e1535;line-height:1.6;">Le dernier pr&eacute;l&egrave;vement sur la carte bancaire n'a pas pu &ecirc;tre valid&eacute;. Le montant d&eacute;j&agrave; r&eacute;gl&eacute; est bien d&eacute;duit du solde ci-dessous.</p>
      </div>`);
  }

  if (priceDefined) {
    const rows = [
      suiteEmailRow("Prix du séjour", fmtCur(sejourPriceNum)),
      discountPercent > 0 ? suiteEmailRow(`Réduction groupe (${childCount} enfants)`, `−${discountPercent}%`) : "",
      suiteEmailRow("Transport", fmtCur(transportAmountNum)),
      cafEligible ? suiteEmailRow("Pris en charge CAF", `− ${fmtCur(cafAmountNum)}`) : "",
      suiteEmailRow("Reste à charge", fmtCur(resteACharge)),
      alreadyPaid > 0 ? suiteEmailRow("Déjà réglé", `− ${fmtCur(alreadyPaid)}`) : "",
      suiteEmailRow("À régler maintenant", fmtCur(amountDueNow), { accent: true }),
    ].join("");
    parts.push(`
      <div style="border:1px solid #f0e3ee;border-radius:10px;overflow:hidden;margin:6px 0 14px;">
        <div style="background:#B8336A;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:9px 14px;">Devis — ${escapeHtml(sejour)} (réf. ${escapeHtml(ref)})</div>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>`);
  } else {
    parts.push(`<p style="font-size:14px;color:#1e1535;line-height:1.6;margin:0 0 10px;">Nous revenons vers vous au sujet de votre réservation pour le séjour "${escapeHtml(sejour)}" (réf. ${escapeHtml(ref)}).</p>`);
  }

  if (missingCafNumber) {
    parts.push(`
      <div style="border:1px solid #cfe8dc;border-radius:10px;padding:12px 14px;margin:0 0 14px;background:#f4fbf7;">
        <p style="margin:0 0 5px;font-size:12px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:0.04em;">Information CAF</p>
        <p style="margin:0;font-size:13px;color:#1e1535;line-height:1.6;">Vous ne nous avez pas encore transmis votre num&eacute;ro d'allocataire CAF. Si vous nous l'envoyez, nous pourrons v&eacute;rifier si vous avez droit &agrave; une aide et, le cas &eacute;ch&eacute;ant, ajuster le reste &agrave; charge.</p>
      </div>`);
  }

  if (link) {
    const label = installmentsEnabled && installmentsCount > 1
      ? (paymentFailed ? `Régler le solde en ${installmentsCount} fois →` : `Payer en ${installmentsCount} fois →`)
      : (paymentFailed ? "Régler le solde en ligne →" : "Payer en ligne par carte →");
    parts.push(suiteEmailButton(link, label));
    parts.push(`<p style="font-size:11.5px;color:#aaa;text-align:center;margin:-6px 0 14px;">Lien valable 48h</p>`);
  }

  if (priceDefined) {
    parts.push(`
      <div style="border:1px dashed #d8b9c8;border-radius:10px;padding:13px 16px;margin:0 0 14px;background:#fdf8fc;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7c3a6a;text-transform:uppercase;letter-spacing:0.04em;">— ou par virement bancaire —</p>
        <table style="width:100%;font-size:12.5px;color:#1e1535;border-collapse:collapse;">
          <tr><td style="padding:2px 0;color:#998aa8;width:80px;">Titulaire</td><td style="font-weight:600;">${COLOCREW_RIB.titulaire}</td></tr>
          <tr><td style="padding:2px 0;color:#998aa8;">IBAN</td><td style="font-weight:600;">${COLOCREW_RIB.iban}</td></tr>
          <tr><td style="padding:2px 0;color:#998aa8;">BIC</td><td style="font-weight:600;">${COLOCREW_RIB.bic}</td></tr>
          <tr><td style="padding:2px 0;color:#998aa8;">Référence</td><td style="font-weight:600;">${escapeHtml(ref)}</td></tr>
        </table>
      </div>`);
  }

  if (depositLink) {
    parts.push(`<p style="font-size:13px;color:#5a4f6b;margin:0 0 4px;">En second choix, vous pouvez simplement verser un acompte de 100 € pour bloquer la place :</p>`);
    parts.push(suiteEmailButton(depositLink, "Verser un acompte de 100€ →"));
  }

  parts.push(`<p style="font-size:12.5px;color:#999;margin:14px 0 0;">N'hésitez pas à nous contacter pour toute question.</p>`);
  return parts.join("");
}

function PanelTarifTab({ item, onSave, onGoToEmail }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const childCount = reservationChildCount(item);
  const isPriceDefined = item.finalPrice > 0;

  const [sejourPrice, setSejourPrice] = useState(() => {
    if (item.finalPrice > 0) return String(Math.max(item.finalPrice - (item.transportFee || 0), 0));
    if (item.estimatedMax != null) return String(item.estimatedMax);
    return "";
  });
  const [transportAmount, setTransportAmount] = useState(item.transportFee != null ? String(item.transportFee) : "");
  const [cafEligible, setCafEligible] = useState(!!item.cafEligible);
  const [cafAmount, setCafAmount] = useState(item.cafAmount != null ? String(item.cafAmount) : "");

  const sejourPriceNum = Number(String(sejourPrice).replace(",", ".")) || 0;
  const transportAmountNum = Number(String(transportAmount).replace(",", ".")) || 0;
  const totalPrice = sejourPriceNum + transportAmountNum;
  const cafAmountNum = cafEligible ? (Number(String(cafAmount).replace(",", ".")) || 0) : 0;
  const resteACharge = Math.max(Number((totalPrice - cafAmountNum).toFixed(2)), 0);
  const alreadyPaid = Number(item.alreadyPaid || 0);
  const amountDueNow = Math.max(Number((resteACharge - alreadyPaid).toFixed(2)), 0);

  // Réduction groupe (-5% à partir de 2 enfants, -10% à partir de 3) — appliquée sur le
  // prix de base par enfant tel que défini sur le séjour au moment de la réservation.
  const discountFactor = siblingDiscountFactor(childCount);
  const discountPercent = Math.round((1 - discountFactor) * 100);
  const basePerChildMax = item.basePricePerChildMax ?? item.basePricePerChildMin ?? null;
  const basePerChildMin = item.basePricePerChildMin ?? item.basePricePerChildMax ?? null;
  const hasBasePrice = basePerChildMax != null;
  const baseTotalBeforeDiscount = hasBasePrice ? Number((basePerChildMax * childCount).toFixed(2)) : null;
  const suggestedSejourPrice = hasBasePrice ? Number((baseTotalBeforeDiscount * discountFactor).toFixed(2)) : null;

  const save = async () => {
    if (!sejourPrice) { showToast("Renseignez le prix du séjour", "warning"); return; }
    setSaving(true);
    try {
      const remainingValue = amountDueNow;
      const nextPaymentStatus = remainingValue === 0 ? "paid" : alreadyPaid > 0 ? "in_progress" : "not_paid";

      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        finalPrice: totalPrice,
        "transport.fee": transportAmountNum,
        "payment.totalPrice": totalPrice,
        "payment.validatedPrice": totalPrice,
        "payment.priceStatus": "validated",
        "payment.cafEligible": cafEligible,
        "payment.cafAmount": cafEligible ? cafAmountNum : null,
        "payment.resteACharge": resteACharge,
        "payment.remainingValue": remainingValue,
        "payment.paymentStatus": nextPaymentStatus,
        updatedAt: serverTimestamp(),
      });
      onSave({
        ...item,
        finalPrice: totalPrice,
        transportFee: transportAmountNum,
        cafEligible,
        cafAmount: cafEligible ? cafAmountNum : null,
        resteACharge,
        remainingValue,
        paymentStatus: nextPaymentStatus,
      });
      showToast("Prix du séjour enregistré", "success");
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement du prix", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rp-tarif-tab">
      <div className="rp-price-calc">
        <div className="rp-price-calc-summary" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="rp-price-calc-summary-row"><span>Séjour</span><span>{item.sejourName}</span></div>
          <div className="rp-price-calc-summary-row"><span>Dates</span><span>{fmtDate(item.sejourStartDate) || "—"} → {fmtDate(item.sejourEndDate) || "—"}</span></div>
          <div className="rp-price-calc-summary-row"><span>Enfant{childCount > 1 ? "s" : ""}</span><span>{childCount}</span></div>
          {(item.estimatedMin !== null || item.estimatedMax !== null) && (
            <div className="rp-price-calc-summary-row">
              <span>Estimation</span>
              <span>{item.estimatedMin === item.estimatedMax ? fmtCur(item.estimatedMin) : `${fmtCur(item.estimatedMin)} – ${fmtCur(item.estimatedMax)}`}</span>
            </div>
          )}
        </div>
      </div>

      {hasBasePrice && (
        <div className="rp-price-calc">
          <div className="rp-price-calc-title">Réduction groupe</div>
          <div className="rp-price-calc-summary" style={{ borderTop: "none", paddingTop: 0 }}>
            <div className="rp-price-calc-summary-row">
              <span>Prix de base / enfant</span>
              <span>{basePerChildMin === basePerChildMax ? fmtCur(basePerChildMax) : `${fmtCur(basePerChildMin)} – ${fmtCur(basePerChildMax)}`}</span>
            </div>
            <div className="rp-price-calc-summary-row">
              <span>{childCount} enfant{childCount > 1 ? "s" : ""} × prix de base</span>
              <span>{fmtCur(baseTotalBeforeDiscount)}</span>
            </div>
            <div className="rp-price-calc-summary-row">
              <span>Réduction groupe</span>
              <span>
                {discountPercent > 0
                  ? <span className="dash-occ-badge dash-occ-badge-green">−{discountPercent}%</span>
                  : "Aucune (1 enfant)"}
              </span>
            </div>
            <div className="rp-price-calc-summary-row is-total">
              <span>Prix séjour suggéré</span>
              <span>{fmtCur(suggestedSejourPrice)}</span>
            </div>
          </div>
          <button type="button" className="dash-btn" onClick={() => setSejourPrice(String(suggestedSejourPrice))}>
            Utiliser ce montant →
          </button>
        </div>
      )}

      <div className="rp-price-calc">
        <div className="rp-price-calc-title">{isPriceDefined ? "✅ Prix défini" : "⚠️ Prix à définir"}</div>

        <div className="rp-price-calc-grid">
          <label className="rp-email-label">
            <span>Prix du séjour (€) — fourchette haute préremplie</span>
            <input className="dash-input" type="number" min="0" value={sejourPrice}
              onChange={e => setSejourPrice(e.target.value)} placeholder="ex : 590" />
          </label>
          <label className="rp-email-label">
            <span>Montant transport (€)</span>
            <input className="dash-input" type="number" min="0" value={transportAmount}
              onChange={e => setTransportAmount(e.target.value)} placeholder="ex : 60" />
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--dash-muted)" }}>
              {item.departureCity || "Sur place"} → {item.returnCity || (item.departureCity ? "—" : "Sur place")}
            </span>
          </label>
        </div>

        <label className="rp-price-calc-checkbox">
          <input type="checkbox" checked={cafEligible} onChange={e => setCafEligible(e.target.checked)} />
          Éligible à une prise en charge CAF
        </label>

        {cafEligible && (
          <label className="rp-email-label">
            <span>Montant pris en charge par la CAF (€)</span>
            <input className="dash-input" type="number" min="0" value={cafAmount}
              onChange={e => setCafAmount(e.target.value)} placeholder="ex : 150" />
          </label>
        )}

        <div className="rp-price-calc-summary">
          <div className="rp-price-calc-summary-row"><span>Prix total</span><span>{fmtCur(totalPrice)}</span></div>
          {cafEligible && (
            <div className="rp-price-calc-summary-row"><span>Pris en charge CAF</span><span>− {fmtCur(cafAmountNum)}</span></div>
          )}
          <div className="rp-price-calc-summary-row"><span>Reste à charge</span><span>{fmtCur(resteACharge)}</span></div>
          {alreadyPaid > 0 && (
            <div className="rp-price-calc-summary-row"><span>Déjà réglé</span><span>− {fmtCur(alreadyPaid)}</span></div>
          )}
          <div className="rp-price-calc-summary-row is-total"><span>À régler maintenant</span><span>{fmtCur(amountDueNow)}</span></div>
        </div>

        <div className="rp-price-calc-actions">
          <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer le prix"}
          </button>
          {isPriceDefined && (
            <button type="button" className="dash-btn" onClick={onGoToEmail}>
              Préparer l'email →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailComposer({ item, onGoToTarif }) {
  const { showToast } = useToast();
  const [tplKey, setTplKey] = useState("suite_reservation");
  const [sending, setSending] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [stripeLink, setStripeLink] = useState("");
  const [depositLink, setDepositLink] = useState("");
  const [payOnceEnabled, setPayOnceEnabled] = useState(false);
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState("3");

  const priceTxt = fmtCur(item.finalPrice ?? item.requestedPrice);
  const nom = item.nom !== "—" ? item.nom.split(" ")[0] : "Madame/Monsieur";

  // Le prix est défini une seule fois dans l'onglet Tarif ; l'email se base uniquement sur les valeurs enregistrées.
  const isPriceDefined = item.finalPrice > 0;
  const transportAmountNum = item.transportFee || 0;
  const totalPrice = item.finalPrice ?? 0;
  const sejourPriceNum = Math.max(totalPrice - transportAmountNum, 0);
  const cafEligible = !!item.cafEligible;
  const cafAmountNum = item.cafAmount || 0;
  const alreadyPaid = item.alreadyPaid || 0;
  const resteACharge = isPriceDefined
    ? (item.resteACharge != null ? item.resteACharge : Math.max(totalPrice - cafAmountNum, 0))
    : 0;
  // On recalcule toujours à partir de l'acompte réellement payé (alreadyPaid) : le champ
  // remainingValue stocké peut être obsolète (le webhook Stripe ne le met pas à jour
  // après un paiement d'acompte, voir app/api/stripe-webhook/route.js).
  const amountDueNow = isPriceDefined ? Math.max(Number((resteACharge - alreadyPaid).toFixed(2)), 0) : 0;
  const installmentsCountNum = Math.max(Math.round(Number(installmentsCount)) || 0, 2);
  const childCount = reservationChildCount(item);
  const discountPercent = Math.round((1 - siblingDiscountFactor(childCount)) * 100);
  const missingCafNumber = !String(item.cafOrSecu || "").trim() || item.cafOrSecu === "—";
  const isFinancialEmail = tplKey === "suite_reservation" || tplKey === "payment_failed";
  const isPaymentFailedEmail = tplKey === "payment_failed";

  const initFromTpl = (key) => {
    const t = EMAIL_TEMPLATES.find(x => x.key === key) || EMAIL_TEMPLATES[0];
    return {
      subject: t.subject(nom, item.sejourName, item.numeroDeReservation, priceTxt),
      body:    t.body(nom, item.sejourName, item.numeroDeReservation, priceTxt),
    };
  };

  const [to, setTo]         = useState(item.email !== "—" ? item.email : "");
  const [subject, setSubject] = useState(() =>
    EMAIL_TEMPLATES.find(t => t.key === "suite_reservation").subject(nom, item.sejourName));
  const [body, setBody]       = useState("");
  const [introText, setIntroText] = useState(
    `Voici le récapitulatif financier de votre réservation pour le séjour "${item.sejourName}".`
  );

  // L'email "Suite réservation" est rendu en HTML (devis + RIB + boutons) : le texte
  // libre (introText) et les valeurs chiffrées sont combinés à la volée, pas de snapshot
  // à rafraîchir manuellement — l'aperçu reflète toujours l'état courant.
  const previewHtml = buildSuiteEmailHtml({
    nom, sejour: item.sejourName, ref: item.numeroDeReservation, introText,
    sejourPriceNum, transportAmountNum, cafEligible, cafAmountNum, resteACharge,
    alreadyPaid, amountDueNow, discountPercent, childCount,
    link: stripeLink, installmentsEnabled, installmentsCount: installmentsCountNum, depositLink,
    priceDefined: isPriceDefined,
    missingCafNumber,
    paymentFailed: isPaymentFailedEmail,
  });

  const applyTpl = (key) => {
    setTplKey(key);
    if (key === "suite_reservation" || key === "payment_failed") {
      setSubject(EMAIL_TEMPLATES.find(t => t.key === key).subject(nom, item.sejourName));
      setIntroText(key === "payment_failed"
        ? `Nous revenons vers vous concernant votre réservation pour le séjour "${item.sejourName}". Le prélèvement par carte bancaire n'a pas fonctionné ; vous pouvez régler le solde restant ci-dessous, en une fois ou en plusieurs fois.`
        : `Voici le récapitulatif financier de votre réservation pour le séjour "${item.sejourName}".`
      );
      return;
    }
    const { subject: s, body: b } = initFromTpl(key);
    setSubject(s);
    setBody(b);
  };

  const generateStripeLink = async (mode, opts = {}) => {
    const installmentsOn = opts.installmentsOn ?? installmentsEnabled;
    const amount = mode === "deposit" ? 100 : amountDueNow;
    if (mode !== "deposit" && (!isPriceDefined || !amount || amount <= 0)) {
      showToast("Définissez d'abord le prix dans l'onglet Tarif", "warning");
      return false;
    }
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/create-stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUnique: item.tokenUnique,
          amount,
          currency: "eur",
          sejourTitle: item.sejourName,
          ageGroup: item.sejourAgeGroup,
          startDate: item.sejourStartDate,
          endDate: item.sejourEndDate,
          transportFee: transportAmountNum,
          insuranceOpted: item.insuranceFee > 0,
          paymentOption: mode === "deposit" ? "deposit" : "oneTime",
          installments: mode === "full" && installmentsOn ? installmentsCountNum : undefined,
          customer_email: item.email !== "—" ? item.email : undefined,
          metadata: {
            numeroDeReservation: item.numeroDeReservation,
            ...(mode === "deposit" ? { paymentType: "deposit" } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error();
      if (!isFinancialEmail) {
        setTplKey("suite_reservation");
        setSubject(EMAIL_TEMPLATES.find(t => t.key === "suite_reservation").subject(nom, item.sejourName));
      }
      if (mode === "deposit") setDepositLink(data.url);
      else setStripeLink(data.url);
      return true;
    } catch {
      showToast("Erreur lors de la génération du lien Stripe", "error");
      return false;
    } finally {
      setGeneratingLink(false);
    }
  };

  const togglePayOnce = async (checked) => {
    setPayOnceEnabled(checked);
    if (checked) {
      setInstallmentsEnabled(false);
      setStripeLink("");
      const ok = await generateStripeLink("full", { installmentsOn: false });
      if (!ok) setPayOnceEnabled(false);
    } else {
      setStripeLink("");
    }
  };

  const toggleInstallments = async (checked) => {
    setInstallmentsEnabled(checked);
    if (checked) {
      setPayOnceEnabled(false);
      setStripeLink("");
      const ok = await generateStripeLink("full", { installmentsOn: true });
      if (!ok) setInstallmentsEnabled(false);
    } else {
      setStripeLink("");
    }
  };

  const toggleDeposit = async (checked) => {
    setDepositEnabled(checked);
    if (checked) {
      const ok = await generateStripeLink("deposit");
      if (!ok) setDepositEnabled(false);
    } else {
      setDepositLink("");
    }
  };

  const refreshInstallmentsLink = () => {
    if (installmentsEnabled) generateStripeLink("full", { installmentsOn: true });
  };

  const send = async () => {
    if (!to || !subject || (isFinancialEmail ? false : !body)) { showToast("Remplissez tous les champs", "warning"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/send-admin-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isFinancialEmail ? { to, subject, bodyHtml: previewHtml } : { to, subject, body }),
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

      {isFinancialEmail && (
        <div className="rp-price-calc">
          <div className="rp-price-calc-title">
            {isPaymentFailedEmail ? "Relance paiement CB échoué" : "Récapitulatif (défini dans l'onglet Tarif)"}
          </div>

          {!isPriceDefined ? (
            <div className="rp-price-calc-summary" style={{ borderTop: "none", paddingTop: 0 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--dash-muted)" }}>
                Le prix du séjour n'a pas encore été défini. Vous pouvez tout de même envoyer un lien d'acompte de 100€ ci-dessous.
              </p>
              <button type="button" className="dash-btn" onClick={onGoToTarif}>
                Définir le prix dans l'onglet Tarif →
              </button>
            </div>
          ) : (
            <div className="rp-price-calc-summary" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="rp-price-calc-summary-row"><span>Prix du séjour</span><span>{fmtCur(sejourPriceNum)}</span></div>
              <div className="rp-price-calc-summary-row"><span>Transport</span><span>{fmtCur(transportAmountNum)}</span></div>
              {cafEligible && (
                <div className="rp-price-calc-summary-row"><span>Pris en charge CAF</span><span>− {fmtCur(cafAmountNum)}</span></div>
              )}
              <div className="rp-price-calc-summary-row"><span>Reste à charge</span><span>{fmtCur(resteACharge)}</span></div>
              {alreadyPaid > 0 && (
                <div className="rp-price-calc-summary-row"><span>Déjà réglé</span><span>− {fmtCur(alreadyPaid)}</span></div>
              )}
              <div className="rp-price-calc-summary-row is-total"><span>À régler maintenant</span><span>{fmtCur(amountDueNow)}</span></div>
            </div>
          )}

          <div className="rp-price-calc-checkbox-group">
            <label className="rp-price-calc-checkbox">
              <input type="checkbox" checked={payOnceEnabled} disabled={!isPriceDefined || generatingLink}
                onChange={e => togglePayOnce(e.target.checked)} />
              Paiement en une fois{isPriceDefined ? ` (${fmtCur(amountDueNow)})` : ""}
            </label>

            <label className="rp-price-calc-checkbox">
              <input type="checkbox" checked={installmentsEnabled} disabled={!isPriceDefined || generatingLink}
                onChange={e => toggleInstallments(e.target.checked)} />
              Paiement en plusieurs fois
            </label>
            {installmentsEnabled && (
              <label className="rp-email-label" style={{ marginLeft: 26 }}>
                <span>Nombre de fois</span>
                <input className="dash-input" type="number" min="2" max="12" value={installmentsCount}
                  onChange={e => setInstallmentsCount(e.target.value)}
                  onBlur={refreshInstallmentsLink}
                  style={{ maxWidth: 100 }} />
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--dash-muted)" }}>
                  Soit {fmtCur(amountDueNow / installmentsCountNum)} / mois — abonnement Stripe avec prélèvement mensuel automatique
                </span>
              </label>
            )}

            <label className="rp-price-calc-checkbox">
              <input type="checkbox" checked={depositEnabled} disabled={generatingLink}
                onChange={e => toggleDeposit(e.target.checked)} />
              Proposer en plus un acompte de 100€ (second choix)
            </label>
          </div>

          {generatingLink && <p className="rp-link-status">Génération du lien…</p>}
          {!generatingLink && (stripeLink || depositLink) && (
            <p className="rp-link-status">
              {stripeLink && "✅ Lien de paiement généré"}
              {stripeLink && depositLink && " · "}
              {depositLink && "✅ Lien d'acompte généré"}
              {" — inséré dans l'aperçu ci-dessous."}
            </p>
          )}
        </div>
      )}

      <label className="rp-email-label">
        <span>Destinataire</span>
        <input className="dash-input" type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemple.com" />
      </label>
      <label className="rp-email-label">
        <span>Objet</span>
        <input className="dash-input" value={subject} onChange={e => setSubject(e.target.value)} />
      </label>

      {isFinancialEmail ? (
        <>
          <label className="rp-email-label">
            <span>Message d'introduction (optionnel)</span>
            <textarea className="dash-input" rows={3} style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
              value={introText} onChange={e => setIntroText(e.target.value)} />
          </label>
          <div className="rp-email-label">
            <span>Aperçu de l'email</span>
            <div className="rp-email-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </>
      ) : (
        <label className="rp-email-label">
          <span>Message</span>
          <textarea className="dash-input" rows={10} style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
            value={body} onChange={e => setBody(e.target.value)} />
        </label>
      )}

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

function DocumentsTab({ item, onSave }) {
  const { showToast } = useToast();
  const [docType, setDocType] = useState("convocation");
  const saved = item.raw?.familyConvocation || {};
  const [extra, setExtra] = useState({
    departureCity:       saved.departureCity || item.departureCity || "",
    returnCity:          saved.returnCity || item.returnCity || "",
    meetingPoint:        saved.meetingPoint || item.departureCity || "",
    meetingTime:         saved.meetingTime || "",
    departureTime:       saved.departureTime || "",
    trainType:           saved.trainType || "",
    trainNumber:         saved.trainNumber || "",
    returnTime:          saved.returnTime || "",
    returnMeetingPoint:  saved.returnMeetingPoint || item.returnCity || "",
    convoyeur:           saved.convoyeur || "",
    convoyeurPhone:      saved.convoyeurPhone || "",
    urgency:             saved.urgency || "ColoCrew — 06 87 91 68 97 / 06 11 91 37 64",
    toBring:             "Carte nationale d'identité ou passeport\nCarnet de santé\nOrdonnances médicales (si nécessaire)\nVêtements adaptés à la météo\nMaillot de bain, crème solaire\nArgent de poche",
    notes:               saved.notes || "",
    ...saved,
  });
  const [loadingTransport, setLoadingTransport] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);

  const set = (k, v) => setExtra(p => ({ ...p, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    const loadTransport = async () => {
      setLoadingTransport(true);
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
        const assigned = snap.docs
          .map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }))
          .filter((transport) => (transport.passengers || []).some((passenger) => passenger.reservationId === item.id));
        const aller = assigned.find((transport) => transport.direction === "aller");
        const retour = assigned.find((transport) => transport.direction === "retour");
        if (cancelled || (!aller && !retour)) return;

        const allerPassenger = aller?.passengers?.find((passenger) => passenger.reservationId === item.id);
        const retourPassenger = retour?.passengers?.find((passenger) => passenger.reservationId === item.id);
        const routeEntryForCity = (transport, city, direction) => {
          const normalizedCity = normalizePlace(city);
          if (!transport || !normalizedCity) return null;
          for (const segment of [...(transport.segments || []), ...(transport.branches || [])]) {
            const endpoint = direction === "aller" ? segment.from : segment.to;
            if (normalizePlace(endpoint) === normalizedCity) return { segment, stop: null };
            const stop = (segment.stops || []).find((candidate) =>
              normalizePlace(candidate.city) === normalizedCity
            );
            if (stop) return { segment, stop };
          }
          return null;
        };
        const allerEntry = routeEntryForCity(aller, allerPassenger?.pickupCity || item.departureCity, "aller");
        const retourEntry = routeEntryForCity(retour, retourPassenger?.pickupCity || item.returnCity, "retour");
        const allerSegment = allerEntry?.segment || aller?.segments?.[0];
        const allerStop = allerEntry?.stop || null;
        const retourSegment = retourEntry?.segment || retour?.segments?.at(-1);
        const retourStop = retourEntry?.stop || null;
        const convoyeur = convoyageLeadForSegment(aller, allerSegment);

        setExtra((current) => ({
          ...current,
          departureCity: saved.departureCity || allerPassenger?.pickupCity || item.departureCity || current.departureCity,
          returnCity: saved.returnCity || retourPassenger?.pickupCity || item.returnCity || current.returnCity,
          meetingPoint: saved.meetingPoint || (allerStop && !isRoadTransportMode(allerSegment?.mode) ? STAGE_QUAI_RDV : allerStop?.meetingPoint) || allerSegment?.meetingPoint || current.meetingPoint,
          meetingTime: saved.meetingTime || (allerStop ? allerStop.meetingTime || "" : allerSegment?.meetingTime || current.meetingTime),
          departureTime: saved.departureTime || allerStop?.departureTime || allerSegment?.departureTime || current.departureTime,
          trainType: saved.trainType || allerStop?.mode || allerSegment?.mode || current.trainType,
          trainNumber: saved.trainNumber || allerStop?.number || allerSegment?.number || current.trainNumber,
          returnMeetingPoint: saved.returnMeetingPoint || (retourStop && !isRoadTransportMode(retourSegment?.mode) ? STAGE_QUAI_RDV : retourStop?.meetingPoint) || retourSegment?.meetingPoint || current.returnMeetingPoint,
          returnTime: saved.returnTime || retourStop?.arrivalTime || retourSegment?.arrivalTime || current.returnTime,
          convoyeur: convoyeur?.name || saved.convoyeur || current.convoyeur,
          convoyeurPhone: convoyeur?.phone || saved.convoyeurPhone || current.convoyeurPhone,
        }));
      } catch (error) {
        console.error(error);
        showToast("Impossible de récupérer automatiquement le trajet", "warning");
      } finally {
        if (!cancelled) setLoadingTransport(false);
      }
    };
    loadTransport();
    return () => { cancelled = true; };
  }, [item.id]);

  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        familyConvocation: extra,
        updatedAt: serverTimestamp(),
      });
      onSave?.({ ...item, raw: { ...item.raw, familyConvocation: extra } });
      showToast("Convocation enregistrée", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de l’enregistrement", "error");
    } finally {
      setSavingDraft(false);
    }
  };

  const openDoc = () => {
    const html = docType === "convocation"
      ? buildConvocationHTML(item, extra)
      : buildConvoyageHTML(item, extra);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "width=900,height=760");
    if (!win) {
      URL.revokeObjectURL(url);
      showToast("Le navigateur a bloqué l’ouverture du document", "warning");
      return;
    }
    win.focus();
    setTimeout(() => {
      win.print();
      URL.revokeObjectURL(url);
    }, 800);
  };

  const sendFamilyConvocation = async () => {
    if (!item.email || item.email === "—") {
      showToast("Aucune adresse email famille", "warning");
      return;
    }
    setSending(true);
    try {
      const pdfBytes = await buildConvocationPdf(item, extra);
      const childFirstName = item.children?.[0]?.firstName || item.childName || "votre enfant";
      const trainLabel = [extra.trainType, extra.trainNumber].filter(Boolean).join(" ");
      const reminderLines = reservationTransportReminderLines(extra).join("\n");
      const trainLines = [
        trainLabel ? `Train : ${trainLabel}` : null,
        extra.departureTime ? `Départ prévu : ${extra.departureTime}` : null,
        extra.returnTime ? `Retour / arrivée prévue : ${extra.returnTime}` : null,
      ].filter(Boolean).join("\n");
      const familyMailBody = `Bonjour ${item.nom},

Vous trouverez en pièce jointe la convocation de transport de ${childFirstName} pour le séjour « ${item.sejourName} ».

${trainLines ? `${trainLines}\n\n` : ""}Merci de vérifier les horaires et le point de rendez-vous.

À prévoir :
${reminderLines}

La décharge de responsabilité est également jointe à cet email.

En cas de question ou d'empêchement, contactez-nous rapidement.

Cordialement,
L'équipe ColoCrew`;
      const response = await fetch("/api/send-admin-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: item.email,
          subject: `ColoCrew — Convocation transport ${item.sejourName}`,
          body: `Bonjour ${item.nom},\n\nVous trouverez en pièce jointe la convocation de transport de ${childFirstName} pour le séjour « ${item.sejourName} ».\n\nMerci de vérifier les horaires et le point de rendez-vous. En cas de question ou d’empêchement, contactez-nous rapidement.\n\nCordialement,\nL’équipe ColoCrew`,
          attachment: {
            filename: `Convocation-${item.numeroDeReservation || item.id}.pdf`,
            contentBase64: bytesToBase64(pdfBytes),
            contentType: "application/pdf",
          },
          body: familyMailBody,
          includeDecharge: true,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        familyConvocation: extra,
        familyConvocationSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Convocation envoyée à ${item.email}`, "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de l’envoi de la convocation", "error");
    } finally {
      setSending(false);
    }
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
        <div className="rp-doc-section-title">
          Informations de transport {loadingTransport ? "— récupération du trajet…" : "— préremplies depuis le trajet"}
        </div>
        <div className="rp-doc-grid">
          <label className="rp-edit-field">
            <span>Ville de départ</span>
            <input className="dash-input" value={extra.departureCity} onChange={e => set("departureCity", e.target.value)} placeholder="ex : Paris" />
          </label>
          <label className="rp-edit-field">
            <span>Ville de retour</span>
            <input className="dash-input" value={extra.returnCity} onChange={e => set("returnCity", e.target.value)} placeholder="ex : Paris" />
          </label>
          <label className="rp-edit-field">
            <span>Point de RDV départ</span>
            <input className="dash-input" value={extra.meetingPoint} onChange={e => set("meetingPoint", e.target.value)} placeholder="ex : Gare du Nord, voie 3" />
          </label>
          <label className="rp-edit-field">
            <span>Heure de RDV famille</span>
            <input className="dash-input" type="time" value={extra.meetingTime} onChange={e => set("meetingTime", e.target.value)} />
          </label>
          <label className="rp-edit-field">
            <span>Heure de départ</span>
            <input className="dash-input" type="time" value={extra.departureTime} onChange={e => set("departureTime", e.target.value)} />
          </label>
          <label className="rp-edit-field">
            <span>Train / car</span>
            <input className="dash-input" value={extra.trainType} onChange={e => set("trainType", e.target.value)} placeholder="TGV, TER, car…" />
          </label>
          <label className="rp-edit-field">
            <span>Numéro</span>
            <input className="dash-input" value={extra.trainNumber} onChange={e => set("trainNumber", e.target.value)} placeholder="N° train / car" />
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
      <div className="rp-doc-actions">
        <button type="button" className="dash-btn" onClick={saveDraft} disabled={savingDraft}>
          {savingDraft ? "Enregistrement…" : "Enregistrer les compléments"}
        </button>
        <button type="button" className="dash-btn dash-btn-primary" onClick={sendFamilyConvocation} disabled={sending || loadingTransport}>
          {sending ? "Envoi en cours…" : `Envoyer le mail + PDF à ${item.email}`}
        </button>
      </div>
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

function ConvoyageInfoTab({ item }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
        const rows = reservationTransports(snap.docs.map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() })), item.id)
          .map((transport) => {
            const passenger = (transport.passengers || []).find((entry) => entry.reservationId === item.id);
            const segment = findPassengerSegment(transport, passenger, item);
            const city = passengerTransportCity(transport, passenger, item);
            const staffIds = new Set(segment?.assignedStaffIds || []);
            const leadStaff = convoyageLeadForSegment(transport, segment);
            const staff = leadStaff ? [leadStaff] : (transport.staff || []).filter((member) => staffIds.has(member.id));
            const tickets = (transport.tickets || []).filter((ticket) =>
              ticket.segmentId === segment?.id
              && (
                !ticket.coveredReservationIds?.length
                || ticket.coveredReservationIds.includes(item.id)
                || ticket.missingReservationIds?.includes(item.id)
              )
            );
            return { transport, passenger, segment, city, staff, tickets };
          });
        if (!cancelled) setAssignments(rows);
      } catch (error) {
        console.error(error);
        showToast("Impossible de charger les informations de convoyage", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [item.id, showToast]);

  if (loading) return <p className="dash-muted">Chargement du convoyage...</p>;
  if (!assignments.length) {
    return (
      <div className="rp-empty-state">
        <strong>Aucun trajet associe</strong>
        <span>Cette reservation n'est pas encore rattachee a un transport.</span>
      </div>
    );
  }

  return (
    <div className="rp-convoyage-tab">
      <p className="res27-readonly-note">Lecture seule — les trajets se modifient dans Convoyages.</p>
      {assignments.map(({ transport, segment, city, staff, tickets }) => (
        <article key={transport.id} className="rp-convoyage-card">
          <div className="rp-convoyage-head">
            <span className={`rp-convoyage-dir is-${transport.direction}`}>{transport.direction === "retour" ? "Retour" : "Aller"}</span>
            <strong>{transport.departureCity || "Départ"} &gt; {transport.arrivalCity || "Arrivée"}</strong>
            <small>{[fmtDate(transport.date), transport.week].filter(Boolean).join(" · ")}</small>
          </div>
          <div className="rp-convoyage-grid">
            <InfoRow label="Ville enfant" value={city || (transport.direction === "retour" ? item.returnCity : item.departureCity)} />
            <InfoRow label="Portion" value={segment ? `${segment.from || "-"} > ${segment.to || "-"}` : "A completer"} />
            <InfoRow label="Point RDV" value={segment?.meetingPoint || (segment?.stopType === "quai" ? "Sur le quai" : "") || "A completer"} />
            <InfoRow label="Heure RDV" value={segment?.meetingTime || ""} />
            <InfoRow label="Départ" value={segment?.departureTime || ""} />
            <InfoRow label="Arrivée" value={segment?.arrivalTime || ""} />
            <InfoRow label="Train" value={[segment?.mode, segment?.number].filter(Boolean).join(" ")} />
            <InfoRow label="Quai / voie" value={segment?.platform || ""} />
            <InfoRow label="Convoyeur" value={staff.length ? staff.map((member) => `${member.name || "Equipe"}${member.phone ? ` (${member.phone})` : ""}`).join(", ") : transport.convoyeur || ""} />
          </div>
          <div className="rp-convoyage-tickets">
            <strong>Billets</strong>
            {tickets.length ? tickets.map((ticket) => (
              <span key={ticket.id} className={`rp-convoyage-ticket${ticket.purchased ? " is-ok" : " is-missing"}`}>
                {ticket.purchased ? "Acheté" : "Manquant"} · {ticketSegmentLabelForReservation(ticket, transport.segments)} · {ticket.seats || 1} place{Number(ticket.seats || 1) > 1 ? "s" : ""}
              </span>
            )) : <span className="rp-convoyage-ticket is-missing">Aucun billet rattache a cette portion</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Status choices allowed from `current` (see RESERVATION_TRANSITIONS). */
function StatusOptions({ current, withIcons = false }) {
  const icons = { pending: "🟠", validated: "🟢", waitlist: "🟣", cancelled: "⚫" };
  return STATUS_ORDER
    .filter((status) => !current || canTransition(current, status))
    .map((status) => (
      <option key={status} value={status}>
        {withIcons ? `${icons[status]} ` : ""}{RESERVATION_STATUS_META[status].label}
      </option>
    ));
}

/** Session picker grouped by season then séjour. Free dates are no longer typed by hand. */
function SessionSelect({ sessions, value, onChange, currentLabel = "", placeholder = "— Choisir une session —" }) {
  const groups = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((session) => {
      const key = `${session.season} · ${session.sejourName}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(session);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0], "fr"));
  }, [sessions]);

  return (
    <select className="dash-input" value={value || ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">{currentLabel || placeholder}</option>
      {groups.map(([label, entries]) => (
        <optgroup key={label} label={label}>
          {entries.map((session) => (
            <option key={session.id} value={session.id}>
              {session.week} · {formatDateRange(session.startDate, session.endDate)}{session.capacity ? ` · ${session.capacity} places` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function EditTab({ item, onSave }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status:          item.status,
    sessionId:       item.sessionId || "",
    sejourId:        item.sejourId || "",
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
    finalPrice:      item.finalPrice      !== null ? String(item.finalPrice) : "",
    cafOrSecu: item.cafOrSecu || "",
    qf:        item.qf ? String(item.qf) : "",
  });

  const [children, setChildren] = useState(() =>
    (item.children?.length
      ? item.children
      : [{ firstName: item.childName || "", lastName: "", birthDate: "" }]
    ).map((c) => ({ firstName: c.firstName || "", lastName: c.lastName || "", birthDate: c.birthDate || "", birthPlace: c.birthPlace || "" })),
  );

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setChild = (idx, key, val) =>
    setChildren((prev) => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));

  const catalog = useBookableSessions();
  const selectedSession = catalog.byId.get(form.sessionId) || null;
  const sejourForForm = catalog.sejours.find((sejour) => sejour.id === (selectedSession?.sejourId || form.sejourId))
    || catalog.sejours.find((sejour) => sejour.name === form.sejourName)
    || null;

  const chooseSession = (sessionId) => {
    const session = catalog.byId.get(sessionId);
    if (!session) return;
    const sejour = catalog.sejours.find((entry) => entry.id === session.sejourId);
    setForm((previous) => ({
      ...previous,
      sessionId: session.id,
      sejourId: session.sejourId,
      sejourName: session.sejourName,
      sejourStartDate: session.startDate,
      sejourEndDate: session.endDate,
      sejourAgeGroup: sejour?.ageGroups?.includes(previous.sejourAgeGroup) ? previous.sejourAgeGroup : (sejour?.ageGroups?.[0] || previous.sejourAgeGroup),
    }));
  };

  const save = async () => {
    if (form.status !== item.status && !canTransition(item.status, form.status)) {
      showToast("Ce changement de statut n'est pas prévu : repassez d'abord par « Demande reçue »", "warning");
      return;
    }
    setSaving(true);
    try {
      const finalPrice   = Number(String(form.finalPrice).replace(",", "."));
      const transportFee = Number(String(form.transportFee).replace(",", "."));
      const qf = Number(String(form.qf).replace(",", "."));
      const hasFinalPrice = Number.isFinite(finalPrice) && form.finalPrice !== "";
      const alreadyPaid = Number(item.alreadyPaid || 0);
      const remainingValue = hasFinalPrice ? Math.max(Number((finalPrice - alreadyPaid).toFixed(2)), 0) : null;
      const nextPaymentStatus = !hasFinalPrice
        ? (item.paymentStatus || "not_paid")
        : remainingValue === 0
          ? "paid"
          : alreadyPaid > 0
            ? "in_progress"
            : "not_paid";
      const syncData = reservationDataForSync(item, {
        status: form.status,
        legalFirstName: form.nom.split(" ")[0] || form.nom,
        legalLastName: form.nom.split(" ").slice(1).join(" ") || "",
        email: form.email,
        phone: form.phone,
        sejourId: selectedSession?.sejourId,
        sessionId: selectedSession?.id,
        sejourName: form.sejourName,
        sejourStartDate: form.sejourStartDate,
        sejourEndDate: form.sejourEndDate,
        sejourAgeGroup: form.sejourAgeGroup,
        departureCity: form.departureCity,
        returnCity: form.returnCity,
      });

      const childrenPayload = children.map((c) => ({
        firstName:  c.firstName,
        lastName:   c.lastName,
        birthDate:  c.birthDate,
        birthPlace: c.birthPlace,
      }));
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        status: form.status,
        finalPrice: hasFinalPrice ? finalPrice : null,
        "payment.totalPrice": hasFinalPrice ? finalPrice : 0,
        "payment.validatedPrice": hasFinalPrice ? finalPrice : 0,
        "payment.priceStatus": hasFinalPrice ? "validated" : "estimated",
        "payment.remainingValue": remainingValue,
        "payment.paymentStatus": nextPaymentStatus,
        "payment.basePrice": hasFinalPrice ? finalPrice : (item.raw?.payment?.basePrice || 0),
        "legal.firstName": form.nom.split(" ")[0] || form.nom,
        "legal.lastName":  form.nom.split(" ").slice(1).join(" ") || "",
        "legal.email": form.email,
        "legal.phone": form.phone,
        "legal.cafOrSecu": form.cafOrSecu,
        "legal.qf": Number.isFinite(qf) && form.qf !== "" ? qf : null,
        // A catalog session rewrites the whole séjour block; an older file left on its
        // original dates keeps them untouched.
        ...(selectedSession
          ? sessionPatch(selectedSession, form.sejourAgeGroup)
          : { "sejour.ageGroup": form.sejourAgeGroup }),
        "transport.departureCity": form.departureCity,
        "transport.returnCity":    form.returnCity,
        "transport.fee": Number.isFinite(transportFee) && form.transportFee !== "" ? transportFee : null,
        "minor.children": childrenPayload,
        updatedAt: serverTimestamp(),
        ...(form.status === "validated" ? { validatedAt: serverTimestamp() } : {}),
      });
      if (form.status === "validated" || item.status === "validated") {
        await resyncReservationTransports(item.id, syncData);
      }
      onSave({
        ...item,
        ...form,
        season: selectedSession?.season || item.season,
        sessionLabel: selectedSession ? sessionOptionLabel(selectedSession) : item.sessionLabel,
        week: selectedSession?.week || item.week,
        children: childrenPayload,
        finalPrice: hasFinalPrice ? finalPrice : null,
        totalPrice: hasFinalPrice ? finalPrice : 0,
        remainingValue,
        paymentStatus: nextPaymentStatus,
      });
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
          <StatusOptions current={item.status} />
        </select>
      </div>

      <div className="rp-edit-section">
        <div className="rp-edit-section-title">Enfant{children.length > 1 ? "s" : ""}</div>
        {children.map((child, idx) => (
          <div key={idx} className="rp-edit-child-block">
            {children.length > 1 && <div className="rp-edit-child-num">Enfant {idx + 1}</div>}
            <div className="rp-edit-grid">
              <label className="rp-edit-field">
                <span>Prénom</span>
                <input className="dash-input" value={child.firstName} onChange={(e) => setChild(idx, "firstName", e.target.value)} />
              </label>
              <label className="rp-edit-field">
                <span>Nom</span>
                <input className="dash-input" value={child.lastName} onChange={(e) => setChild(idx, "lastName", e.target.value)} />
              </label>
              <label className="rp-edit-field">
                <span>Date de naissance</span>
                <input className="dash-input" type="date" value={child.birthDate} onChange={(e) => setChild(idx, "birthDate", e.target.value)} />
              </label>
              <label className="rp-edit-field">
                <span>Lieu de naissance</span>
                <input className="dash-input" value={child.birthPlace} onChange={(e) => setChild(idx, "birthPlace", e.target.value)} placeholder="Ville" />
              </label>
            </div>
          </div>
        ))}
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
            <span>Session</span>
            <SessionSelect
              sessions={catalog.sessions}
              value={selectedSession ? form.sessionId : ""}
              onChange={chooseSession}
              currentLabel={selectedSession ? "" : `${form.sejourName || "Séjour"} · ${formatDateRange(form.sejourStartDate, form.sejourEndDate) || "dates inconnues"} (hors catalogue)`}
            />
          </label>
          {sejourForForm?.ageGroups?.length > 0 ? (
            <label className="rp-edit-field">
              <span>Tranche d'âge</span>
              <select className="dash-input" value={form.sejourAgeGroup} onChange={e => set("sejourAgeGroup", e.target.value)}>
                <option value="">—</option>
                {sejourForForm.ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </label>
          ) : (
            <F label="Tranche d'âge" k="sejourAgeGroup" />
          )}
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
  { key: "tarif",  label: "Tarif" },
  { key: "info",   label: "Infos" },
  { key: "convoyage", label: "Convoyage" },
  { key: "docs",   label: "Documents" },
  { key: "email",  label: "Email" },
  { key: "edit",   label: "Modifier" },
  { key: "notes",  label: "Notes" },
];

export function ReservationPanel({ item: externalItem, onClose, onSave, onDelete, onStatusChange, initialTab = "tarif", sessionState = null }) {
  const { showToast } = useToast();
  const [item, setItem]         = useState(externalItem);
  const [panelTab, setPanelTab] = useState(initialTab);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setItem(externalItem), [externalItem]);

  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const updateStatus = async (newStatus) => {
    if (newStatus === item.status) return;
    if (!canTransition(item.status, newStatus)) {
      showToast("Changement de statut non prévu", "warning");
      return;
    }
    // `sessionState` is only passed by the Reservations page; other callers skip this check.
    if (newStatus === "validated" && sessionState?.capacity) {
      const after = sessionState.validated + reservationChildCount(item);
      if (after > sessionState.capacity && !window.confirm(
        `La session est complète (${sessionState.validated}/${sessionState.capacity} enfants validés). Valider quand même cette réservation ?`,
      )) return;
    }
    try {
      const syncData = reservationDataForSync(item, { status: newStatus });
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, item.id), {
        status: newStatus, updatedAt: serverTimestamp(),
        ...(newStatus === "validated" ? { validatedAt: serverTimestamp() } : {}),
      });
      const syncedTransports = await resyncReservationTransports(item.id, syncData);
      const updated = { ...item, status: newStatus };
      setItem(updated);
      onStatusChange(updated);
      showToast(newStatus === "validated" ? `Réservation validée, ${syncedTransports} trajet(s) synchronisé(s)` : `Statut : ${RESERVATION_STATUS_META[newStatus]?.label}`, "success");
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

  const sc = RESERVATION_STATUS_META[item.status]?.color || "#94a3b8";
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
              <span className="rp-header-sejour">{item.sessionLabel || (item.sejourName !== "—" ? item.sejourName : "")}</span>
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
            <StatusOptions current={item.status} withIcons />
          </select>

          {item.status !== "validated" && canTransition(item.status, "validated") && (
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
        {panelTab === "tarif" && <PanelTarifTab item={item} onSave={handleSave} onGoToEmail={() => setPanelTab("email")} />}
        {panelTab === "info"  && <PanelInfoTab item={item} />}
        {panelTab === "convoyage" && <ConvoyageInfoTab item={item} />}
        {panelTab === "docs"  && <DocumentsTab item={item} onSave={handleSave} />}
        {panelTab === "email" && <EmailComposer item={item} onGoToTarif={() => setPanelTab("tarif")} />}
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
  // session (catalogue)
  sessionId: "", sejourAgeGroup: "",
  // transport
  departureCity: "", returnCity: "", transportFee: "",
  // payment
  paymentMethod: "chequeVirement", estimatedMin: "", estimatedMax: "",
  // notes
  notes: "",
};

function NewReservationModal({ onClose, onCreated, initialSessionId = "", occupancyFor }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, sessionId: initialSessionId });
  const [step, setStep] = useState(1); // 1=Séjour, 2=Enfant, 3=Parent, 4=Transport+Paiement
  const catalog = useBookableSessions();
  const session = catalog.byId.get(form.sessionId) || null;
  const sejour = session ? catalog.sejours.find((entry) => entry.id === session.sejourId) : null;
  const fill = session && occupancyFor ? occupancyFor(session) : null;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!session) {
      showToast("Choisissez la session de la réservation", "warning"); setStep(1); return;
    }
    if (!form.lastName && !form.firstName) {
      showToast("Le nom du responsable légal est requis", "warning"); return;
    }
    if (form.status === "validated" && fill?.full && !window.confirm(
      `La session est complète (${fill.validated}/${fill.capacity}). Créer quand même une réservation validée ?`,
    )) return;
    setSaving(true);
    try {
      const ref = generateRef();
      const data = {
        numeroDeReservation: ref,
        status: form.status,
        season: session.season,
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
          id:        session.sejourId,
          sessionId: session.id,
          name:      session.sejourName,
          startDate: session.startDate,
          endDate:   session.endDate,
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
      const syncedTransports = await syncReservationToMatchingTransports(docRef.id, data);
      showToast(`Réservation ${ref} créée${syncedTransports ? ` et ajoutée à ${syncedTransports} transport(s)` : ""} !`, "success");
      onCreated({ ...mapReservation({ id: docRef.id, data: () => data }), id: docRef.id, dateMs: Date.now() });
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
                <span>Session <span style={{ color: "var(--dash-accent)" }}>*</span></span>
                <SessionSelect
                  sessions={catalog.sessions}
                  value={form.sessionId}
                  onChange={(sessionId) => {
                    const next = catalog.byId.get(sessionId);
                    const nextSejour = next ? catalog.sejours.find((entry) => entry.id === next.sejourId) : null;
                    setForm((previous) => ({ ...previous, sessionId, sejourAgeGroup: nextSejour?.ageGroups?.[0] || "" }));
                  }}
                />
                {catalog.loading && <small className="res27-hint">Chargement du catalogue…</small>}
                {!catalog.loading && !catalog.sessions.length && (
                  <small className="res27-hint">Aucune session ouverte : ajoutez d'abord des dates dans Séjours.</small>
                )}
                {fill && (
                  <small className={`res27-hint${fill.full ? " is-full" : ""}`}>
                    {fill.capacity
                      ? `${fill.validated}/${fill.capacity} enfants validés${fill.full ? " — session complète, préférez la liste d'attente" : ""}`
                      : `${fill.validated} enfant(s) validé(s) · capacité non renseignée`}
                  </small>
                )}
              </label>
              {sejour?.ageGroups?.length > 0 ? (
                <label className="rp-edit-field">
                  <span>Tranche d'âge</span>
                  <select className="dash-input" value={form.sejourAgeGroup} onChange={e => set("sejourAgeGroup", e.target.value)}>
                    <option value="">—</option>
                    {sejour.ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                </label>
              ) : (
                <F label="Tranche d'âge" k="sejourAgeGroup" placeholder="ex : 12-17 ans" />
              )}
              <div className="rp-edit-field">
                <span>Statut initial</span>
                <select className="dash-input" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="pending">{RESERVATION_STATUS_META.pending.label}</option>
                  <option value="validated">{RESERVATION_STATUS_META.validated.label}</option>
                  <option value="waitlist">{RESERVATION_STATUS_META.waitlist.label}</option>
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
                  placeholder="Observations, contexte de cette réservation manuelle…" />
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

/* ── Season / session views ─────────────────────────────────────────────── */

const VIEWS = [
  { key: "sessions",  label: "Sessions" },
  { key: "pending",   label: "Demandes" },
  { key: "validated", label: "Validées" },
  { key: "waitlist",  label: "Liste d'attente" },
  { key: "all",       label: "Toutes" },
  { key: "cancelled", label: "Annulées", muted: true },
];

const NO_SESSION = "__none__";

function transportFilterValue(item) {
  return item.departureCity ? "__transport__" : "__sur_place__";
}

/** Attaches a mapped reservation to its catalog session (week, label, séjour id). */
function withSession(item, sessions, byId) {
  const sessionId = reservationSessionId(item.raw, sessions) || item.sessionId;
  const session = byId.get(sessionId) || null;
  return {
    ...item,
    sessionId: session ? session.id : (sessionId || ""),
    sejourId: session?.sejourId || item.sejourId,
    week: session?.week || item.week || "",
    sessionLabel: session ? sessionOptionLabel(session) : "",
    sessionDates: session ? formatDateRange(session.startDate, session.endDate) : formatDateRange(item.sejourStartDate, item.sejourEndDate),
    inCatalog: Boolean(session),
  };
}

function SessionsOverview({ rows, orphan, onOpen, onCreate }) {
  if (!rows.length && !orphan) {
    return (
      <div className="dash-section" style={{ padding: 24 }}>
        <p className="dash-muted">Aucune session pour cette saison. Les sessions se créent dans les dates de chaque séjour.</p>
      </div>
    );
  }
  return (
    <section className="dash-section res27-sessions">
      <div className="hr-table-scroll">
        <table className="res27-session-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Validés / capacité</th>
              <th>Demandes</th>
              <th>Liste d'attente</th>
              <th>CA estimé</th>
              <th>CA validé</th>
              <th>Encaissé</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ session, occupancy, fill }) => (
              <tr key={session.id} className={fill.full ? "is-full" : ""}>
                <td>
                  <button type="button" className="res27-session-link" onClick={() => onOpen(session.id)}>
                    <strong>{session.sejourName}</strong>
                    <span>{session.week} · {formatDateRange(session.startDate, session.endDate)}</span>
                  </button>
                  {!session.bookingOpen && <span className="res27-chip is-closed">Réservations fermées</span>}
                  {session.availabilityStatus === "full" && <span className="res27-chip is-closed">Marquée complète</span>}
                </td>
                <td>
                  <div className="res27-fill">
                    <span className="res27-fill-count">
                      {occupancy.validated}{fill.capacity ? ` / ${fill.capacity}` : ""}
                    </span>
                    {fill.capacity ? (
                      <span className="res27-fill-bar" aria-hidden="true">
                        <span style={{ width: `${fill.rate}%` }} className={fill.full ? "is-full" : fill.rate >= 80 ? "is-high" : ""} />
                      </span>
                    ) : <small className="res27-hint">capacité non renseignée</small>}
                    {fill.full && <span className="res27-chip is-full">Complet</span>}
                  </div>
                </td>
                <td>{occupancy.pending || "—"}</td>
                <td>{occupancy.waitlist || "—"}</td>
                <td>{occupancy.revenueEstimated ? fmtCur(Math.round(occupancy.revenueEstimated)) : "—"}</td>
                <td>{occupancy.revenueValidated ? fmtCur(Math.round(occupancy.revenueValidated)) : "—"}</td>
                <td>{occupancy.collected ? fmtCur(Math.round(occupancy.collected)) : "—"}</td>
                <td className="res27-session-actions">
                  <button type="button" className="dash-btn" onClick={() => onOpen(session.id)}>
                    Réservations ({occupancy.files})
                  </button>
                  <button type="button" className="dash-btn" onClick={() => onCreate(session.id)} title="Nouvelle réservation sur cette session">+</button>
                </td>
              </tr>
            ))}
            {orphan && (
              <tr className="is-orphan">
                <td>
                  <button type="button" className="res27-session-link" onClick={() => onOpen(NO_SESSION)}>
                    <strong>Hors catalogue</strong>
                    <span>Réservations dont la session n'existe plus dans les séjours</span>
                  </button>
                </td>
                <td>{orphan.validated}</td>
                <td>{orphan.pending || "—"}</td>
                <td>{orphan.waitlist || "—"}</td>
                <td>{orphan.revenueEstimated ? fmtCur(Math.round(orphan.revenueEstimated)) : "—"}</td>
                <td>{orphan.revenueValidated ? fmtCur(Math.round(orphan.revenueValidated)) : "—"}</td>
                <td>{orphan.collected ? fmtCur(Math.round(orphan.collected)) : "—"}</td>
                <td className="res27-session-actions">
                  <button type="button" className="dash-btn" onClick={() => onOpen(NO_SESSION)}>Réservations ({orphan.files})</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export default function Reservations() {
  const [items, setItems]               = useState([]);
  const [convoys, setConvoys]           = useState([]);
  const [view, setView]                 = useState("sessions");
  const [filters, setFilters]           = useState({ sejour: "all", session: "all", transport: "all" });
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [newSessionId, setNewSessionId] = useState(null); // null = modal closed
  const [pickedSeason, setPickedSeason] = useState("");
  const { showToast } = useToast();
  const { activeSeason, archivedSeasons, seasons } = useSeasons();
  const season = pickedSeason && !archivedSeasons.has(pickedSeason) ? pickedSeason : activeSeason;
  const catalog = useSessionCatalog(season);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, transportsSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
        getDocs(collection(db, COLLECTIONS.TRANSPORTS)).catch(() => null),
      ]);
      setItems(snap.docs.map(mapReservation));
      setConvoys(transportsSnap ? transportsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })) : []);
    } catch { showToast("Erreur de chargement", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  /* Saisons ouvertes : celles des réservations et des documents `seasons`, sans les archivées. */
  const seasonOptions = useMemo(() => {
    const keys = new Set([activeSeason]);
    items.forEach((item) => item.season && keys.add(item.season));
    seasons.forEach((entry) => keys.add(entry.id));
    return [...keys].filter((key) => key && !archivedSeasons.has(key)).sort((a, b) => b.localeCompare(a));
  }, [items, seasons, activeSeason, archivedSeasons]);

  /* Réservations de la saison choisie, archivées exclues, rattachées à leur session. */
  const seasonItems = useMemo(() => items
    .filter((item) => !isArchivedRecord(item.raw || item, archivedSeasons))
    .filter((item) => item.season === season || (!item.season && season === activeSeason))
    .map((item) => withSession(item, catalog.sessions, catalog.byId)),
  [items, archivedSeasons, season, activeSeason, catalog.sessions, catalog.byId]);

  const occupancy = useMemo(
    () => computeSessionOccupancy(seasonItems.map((item) => ({ ...item.raw, status: item.status, sejour: { ...(item.raw?.sejour || {}), sessionId: item.sessionId } })), catalog.sessions),
    [seasonItems, catalog.sessions],
  );

  const sessionRows = useMemo(() => catalog.sessions
    .filter((session) => filters.sejour === "all" || session.sejourId === filters.sejour)
    .map((session) => {
      const entry = occupancy.get(session.id) || { validated: 0, pending: 0, waitlist: 0, files: 0, revenueEstimated: 0, revenueValidated: 0, collected: 0 };
      return { session, occupancy: entry, fill: sessionFillState(session.capacity, entry) };
    }), [catalog.sessions, occupancy, filters.sejour]);

  const orphanOccupancy = useMemo(() => {
    const orphans = seasonItems.filter((item) => !item.inCatalog);
    if (!orphans.length) return null;
    return computeSessionOccupancy(orphans.map((item) => ({ ...item.raw, status: item.status, sejour: { sessionId: NO_SESSION } }))).get(NO_SESSION);
  }, [seasonItems]);

  const fillFor = useCallback((sessionLike) => {
    const session = catalog.byId.get(sessionLike?.id || sessionLike?.sessionId);
    if (!session) return null;
    return sessionFillState(session.capacity, occupancy.get(session.id));
  }, [catalog.byId, occupancy]);

  /* Convois (aller / retour) de chaque réservation, en lecture seule. */
  const convoysByReservation = useMemo(() => {
    const map = new Map();
    convoys.forEach((transport) => (transport.passengers || []).forEach((passenger) => {
      if (!passenger.reservationId) return;
      if (!map.has(passenger.reservationId)) map.set(passenger.reservationId, {});
      map.get(passenger.reservationId)[transport.direction === "retour" ? "retour" : "aller"] = transport;
    }));
    return map;
  }, [convoys]);

  const sejourOptions = useMemo(() => {
    const map = new Map();
    catalog.sessions.forEach((session) => map.set(session.sejourId, session.sejourName));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [catalog.sessions]);

  const sessionOptions = useMemo(
    () => catalog.sessions.filter((session) => filters.sejour === "all" || session.sejourId === filters.sejour),
    [catalog.sessions, filters.sejour],
  );

  /* Filtres séjour → session → transport, communs à toutes les listes. */
  const scopedItems = useMemo(() => seasonItems.filter((item) => {
    if (filters.session === NO_SESSION) return !item.inCatalog;
    if (filters.session !== "all" && item.sessionId !== filters.session) return false;
    if (filters.sejour !== "all" && item.sejourId !== filters.sejour) return false;
    if (filters.transport !== "all" && transportFilterValue(item) !== filters.transport) return false;
    return true;
  }), [seasonItems, filters]);

  const buckets = useMemo(() => {
    const result = { pending: [], validated: [], waitlist: [], cancelled: [] };
    scopedItems.forEach((item) => (result[item.status] || result.pending).push(item));
    return result;
  }, [scopedItems]);

  const childCounts = useMemo(() => {
    const count = (list) => list.reduce((total, item) => total + reservationChildCount(item), 0);
    return {
      all: count(scopedItems.filter((item) => item.status !== "cancelled")),
      pending: count(buckets.pending),
      validated: count(buckets.validated),
      waitlist: count(buckets.waitlist),
      cancelled: count(buckets.cancelled),
    };
  }, [scopedItems, buckets]);

  /* Sous-filtre "Prix défini" / "À traiter" pour les demandes */
  const [priceFilter, setPriceFilter] = useState("all"); // "all" | "defined" | "todo"
  const pricingCounts = useMemo(() => ({
    defined: buckets.pending.filter(x => x.finalPrice > 0).length,
    todo:    buckets.pending.filter(x => !(x.finalPrice > 0)).length,
  }), [buckets.pending]);

  const viewItems = useMemo(() => {
    if (view === "all") return scopedItems;
    if (view === "pending") {
      if (priceFilter === "defined") return buckets.pending.filter(x => x.finalPrice > 0);
      if (priceFilter === "todo")    return buckets.pending.filter(x => !(x.finalPrice > 0));
      return buckets.pending;
    }
    return buckets[view] || [];
  }, [view, scopedItems, buckets, priceFilter]);

  const setFilter = (key, value) => {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      // Changer de séjour réinitialise la session choisie.
      ...(key === "sejour" ? { session: "all" } : {}),
    }));
    setSelectedItem(null);
  };

  const changeSeason = (value) => {
    setPickedSeason(value);
    setFilters({ sejour: "all", session: "all", transport: "all" });
    setSelectedItem(null);
  };

  const changeView = (next) => {
    setView(next);
    setSelectedItem(null);
    setPriceFilter("all");
  };

  const openSession = (sessionId) => {
    const session = catalog.byId.get(sessionId);
    setFilters((previous) => ({ ...previous, sejour: session ? session.sejourId : "all", session: sessionId }));
    setView("all");
    setSelectedItem(null);
  };

  const handleSave = (updated) => {
    setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    if (selectedItem?.id === updated.id) setSelectedItem(prev => ({ ...prev, ...updated }));
  };

  // Le statut change aussi `raw.status`, utilisé pour l'occupation des sessions.
  const handleStatusChange = (updated) => {
    const patch = { ...updated, raw: { ...(updated.raw || {}), status: updated.status } };
    setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...patch } : x));
    if (selectedItem?.id === updated.id) setSelectedItem(prev => ({ ...prev, ...patch }));
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
    if (newItem.season && newItem.season !== season) setPickedSeason(newItem.season);
    setSelectedItem(withSession(newItem, catalog.sessions, catalog.byId));
  };

  const seasonTotals = useMemo(() => {
    let revenueValidated = 0;
    let collected = 0;
    occupancy.forEach((entry) => {
      revenueValidated += entry.revenueValidated;
      collected += entry.collected;
    });
    return { revenueValidated, collected };
  }, [occupancy]);

  const selectedSessionState = selectedItem ? fillFor(selectedItem) : null;

  const columns = useMemo(() => [
    {
      key: "numeroDeReservation",
      label: "Réservation",
      sortValue: row => row.dateMs || 0,
      render: row => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{row.numeroDeReservation || "Sans référence"}</div>
          <div style={{ fontSize: 10.5, color: "var(--dash-muted)", marginTop: 1 }}>{fmt(row.dateMs)}</div>
        </div>
      ),
    },
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
    {
      key: "sessionLabel",
      label: "Session",
      sortValue: row => `${row.sejourStartDate || "9999"}|${row.sejourName}`,
      render: row => (
        <div className="res-week-cell">
          <strong>{row.week || "?"}</strong>
          <span>{row.sejourName !== "—" ? row.sejourName : ""}{row.sessionDates ? ` · ${row.sessionDates}` : ""}</span>
          {!row.inCatalog && <span className="res27-chip is-closed">Hors catalogue</span>}
        </div>
      ),
    },
    {
      key: "departureCity",
      label: "Transport",
      sortValue: row => row.departureCity || "",
      render: row => {
        const assigned = convoysByReservation.get(row.id) || {};
        return row.departureCity ? (
          <div style={{ fontSize: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>↑ {row.departureCity}</span>
            {row.returnCity && <span style={{ background: "#fff7f0", color: "#c2410c", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>↓ {row.returnCity}</span>}
            {(assigned.aller || assigned.retour) && (
              <span className="res27-chip is-convoy" title="Inscrit sur un convoi (voir l'onglet Convoyage)">
                Convoi {assigned.aller ? "aller" : ""}{assigned.aller && assigned.retour ? " + " : ""}{assigned.retour ? "retour" : ""}
              </span>
            )}
          </div>
        ) : <span style={{ color: "var(--dash-muted)", fontSize: 12 }}>Sur place</span>;
      },
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
      key: "alreadyPaid",
      label: "Payé",
      sortValue: row => Number(row.alreadyPaid || 0),
      render: row => (
        <span style={{ fontWeight: 700, fontSize: 12, color: Number(row.alreadyPaid || 0) > 0 ? "#15803d" : "var(--dash-muted)" }}>
          {fmtCur(Number(row.alreadyPaid || 0))}
        </span>
      ),
    },
    {
      key: "remainingValue",
      label: "Restant",
      sortValue: row => {
        const base = row.resteACharge ?? row.finalPrice ?? row.totalPrice ?? 0;
        const remaining = row.remainingValue ?? Math.max(Number(base || 0) - Number(row.alreadyPaid || 0), 0);
        return Number(remaining || 0);
      },
      render: row => {
        const base = row.resteACharge ?? row.finalPrice ?? row.totalPrice ?? 0;
        const remaining = row.remainingValue ?? Math.max(Number(base || 0) - Number(row.alreadyPaid || 0), 0);
        return (
          <span style={{ fontWeight: 800, fontSize: 12, color: Number(remaining || 0) > 0 ? "#b45309" : "#15803d" }}>
            {fmtCur(remaining)}
          </span>
        );
      },
    },
    {
      key: "dateMs",
      label: "Date inscription",
      sortValue: row => row.dateMs || 0,
      render: row => <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>{fmt(row.dateMs)}</span>,
    },
    {
      key: "status",
      label: "Statut",
      sortable: false,
      render: row => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <Badge label={STATUS_LABEL[row.status] || row.status} variant={STATUS_BADGE[row.status] || "neutral"} />
          {row.depositPaid && <span className="res27-chip is-deposit">Acompte</span>}
        </div>
      ),
    },
  ], [convoysByReservation]);

  const emptyLabels = {
    all: "Aucune réservation pour ces filtres.",
    pending: "Aucune demande en attente.",
    validated: "Aucune inscription validée pour ces filtres.",
    waitlist: "Personne en liste d'attente.",
    cancelled: "Aucune réservation annulée.",
  };
  const filteredSession = catalog.byId.get(filters.session);

  return (
    <>
      <div className={`res-page-layout${selectedItem ? " has-panel" : ""}`}>
        <div className="res-main">
          <div className="dash-page">
            <header className="dash-page-header dash-page-header-row">
              <div>
                <h1>Réservations</h1>
                <p>Saison {season} · séjour → session → réservations. Les saisons clôturées se consultent dans les archives.</p>
              </div>
              <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
                <label className="res27-season-picker">
                  <span>Saison</span>
                  <select className="dash-input" value={season} onChange={(event) => changeSeason(event.target.value)}>
                    {seasonOptions.map((key) => (
                      <option key={key} value={key}>{key}{key === activeSeason ? " (active)" : ""}</option>
                    ))}
                  </select>
                </label>
                <div className="res-stat-badge res-stat-green">
                  <span className="res-stat-value">{childCounts.validated}</span>
                  <span className="res-stat-label">enfants validés</span>
                </div>
                <div className="res-stat-badge res-stat-orange">
                  <span className="res-stat-value">{childCounts.pending}</span>
                  <span className="res-stat-label">enfants en attente</span>
                </div>
                {childCounts.waitlist > 0 && (
                  <div className="res-stat-badge res27-stat-indigo">
                    <span className="res-stat-value">{childCounts.waitlist}</span>
                    <span className="res-stat-label">liste d'attente</span>
                  </div>
                )}
                {seasonTotals.revenueValidated > 0 && (
                  <div className="res-stat-badge res-stat-pink">
                    <span className="res-stat-value" style={{ fontSize: 13 }}>{fmtCur(Math.round(seasonTotals.revenueValidated))}</span>
                    <span className="res-stat-label">CA validé</span>
                  </div>
                )}
                <button type="button" className="dash-btn" onClick={load}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.5 15A9 9 0 1 1 21 9" />
                  </svg>
                  Actualiser
                </button>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setNewSessionId(filteredSession?.id || "")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Nouvelle réservation
                </button>
              </div>
            </header>

            {/* Sélecteur de vue */}
            <div className="res-view-selector">
              {VIEWS.map((entry) => (
                <button key={entry.key} type="button"
                  className={`res-view-btn${entry.muted ? " res-view-btn-muted" : ""}${view === entry.key ? " is-active" : ""}`}
                  onClick={() => changeView(entry.key)}>
                  {entry.label}
                  <span className="res-view-count">
                    {entry.key === "sessions" ? sessionRows.length : childCounts[entry.key]}
                  </span>
                </button>
              ))}
            </div>

            {/* Filtres séjour → session → transport */}
            <div className="res27-filters">
              <select className="dash-input" value={filters.sejour} onChange={(event) => setFilter("sejour", event.target.value)}>
                <option value="all">Tous les séjours</option>
                {sejourOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              {view !== "sessions" && (
                <>
                  <select className="dash-input" value={filters.session} onChange={(event) => setFilter("session", event.target.value)}>
                    <option value="all">Toutes les sessions</option>
                    {sessionOptions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {filters.sejour === "all" ? `${session.sejourCode} ` : ""}{session.week} · {formatDateRange(session.startDate, session.endDate)}
                      </option>
                    ))}
                    {orphanOccupancy && <option value={NO_SESSION}>Hors catalogue</option>}
                  </select>
                  <select className="dash-input" value={filters.transport} onChange={(event) => setFilter("transport", event.target.value)}>
                    <option value="all">Tous les transports</option>
                    <option value="__transport__">Avec transport</option>
                    <option value="__sur_place__">Sur place</option>
                  </select>
                </>
              )}
              {(filters.sejour !== "all" || filters.session !== "all" || filters.transport !== "all") && (
                <button type="button" className="dash-btn" onClick={() => setFilters({ sejour: "all", session: "all", transport: "all" })}>
                  Réinitialiser
                </button>
              )}
            </div>

            {view !== "sessions" && filteredSession && (() => {
              const fill = fillFor(filteredSession);
              return (
                <div className="res27-session-banner">
                  <strong>{sessionOptionLabel(filteredSession)}</strong>
                  <span>
                    {fill.validated}{fill.capacity ? ` / ${fill.capacity}` : ""} enfants validés
                    {fill.remaining !== null ? ` · ${fill.remaining} place(s) restante(s)` : ""}
                  </span>
                  {fill.full && <span className="res27-chip is-full">Complet — nouvelles demandes en liste d'attente</span>}
                </div>
              );
            })()}

            {/* Sous-filtre : prix défini ou à traiter */}
            {view === "pending" && (
              <div className="res-view-selector" style={{ marginTop: 6 }}>
                <button type="button"
                  className={`res-view-btn${priceFilter === "all" ? " is-active" : ""}`}
                  onClick={() => setPriceFilter("all")}>
                  Toutes
                  <span className="res-view-count">{buckets.pending.length}</span>
                </button>
                <button type="button"
                  className={`res-view-btn${priceFilter === "todo" ? " is-active" : ""}`}
                  onClick={() => setPriceFilter("todo")}>
                  ⚠️ À traiter
                  <span className="res-view-count">{pricingCounts.todo}</span>
                </button>
                <button type="button"
                  className={`res-view-btn${priceFilter === "defined" ? " is-active" : ""}`}
                  onClick={() => setPriceFilter("defined")}>
                  ✅ Prix défini
                  <span className="res-view-count">{pricingCounts.defined}</span>
                </button>
              </div>
            )}

            {loading || catalog.loading ? (
              <div className="dash-section" style={{ padding: 24 }}>
                <p className="dash-muted">Chargement…</p>
              </div>
            ) : view === "sessions" ? (
              <SessionsOverview
                rows={sessionRows}
                orphan={filters.sejour === "all" ? orphanOccupancy : null}
                onOpen={openSession}
                onCreate={(sessionId) => setNewSessionId(sessionId)}
              />
            ) : (
              <DataTable
                columns={columns}
                data={viewItems}
                searchableKeys={["nom","email","childName","sejourName","departureCity","returnCity","numeroDeReservation","week"]}
                defaultSortKey="numeroDeReservation"
                defaultSortDirection="desc"
                onRowClick={row => setSelectedItem(prev => prev?.id === row.id ? null : row)}
                selectedRowId={selectedItem?.id}
                emptyLabel={emptyLabels[view] || "Aucune réservation."}
                toolsInline
              />
            )}
          </div>
        </div>

        {selectedItem && (
          <ReservationPanel
            item={selectedItem}
            sessionState={selectedSessionState}
            onClose={() => setSelectedItem(null)}
            onSave={handleSave}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {newSessionId !== null && (
        <NewReservationModal
          initialSessionId={newSessionId}
          occupancyFor={fillFor}
          onClose={() => setNewSessionId(null)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
