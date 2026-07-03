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
import { siblingDiscountFactor } from "@/src/lib/pricing";

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
    key: "suite_reservation",
    label: "Suite réservation",
    subject: (_n, sejour) =>
      `ColoCrew — Suite à donner pour votre réservation "${sejour}"`,
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

function weekFromStartDate(value) {
  const date = String(value || "").slice(0, 10);
  return { "2026-07-06": "S1", "2026-07-20": "S2", "2026-08-03": "S3", "2026-08-17": "S4" }[date] || "";
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
    normalizePlace(segmentStopCityForReservation(transport, segment)) === city,
  ) || null;
}

function ticketSegmentLabelForReservation(ticket, segments = []) {
  const segment = segments.find((item) => item.id === ticket.segmentId);
  return segment ? `${segment.from || "Départ"} > ${segment.to || "Arrivée"}` : ticket.segmentLabel || "";
}

const WEEK_DATES = {
  S1: { startDate: "2026-07-06", endDate: "2026-07-17", label: "S1 — 6 au 17 juil." },
  S2: { startDate: "2026-07-20", endDate: "2026-07-31", label: "S2 — 20 au 31 juil." },
  S3: { startDate: "2026-08-03", endDate: "2026-08-14", label: "S3 — 3 au 14 août" },
  S4: { startDate: "2026-08-17", endDate: "2026-08-28", label: "S4 — 17 au 28 août" },
};

function transportStopCities(transport) {
  const cities = new Set();
  [...(transport.segments || []), ...(transport.branches || [])].forEach((segment) => {
    [segment.from, segment.to].filter(Boolean).forEach((city) => cities.add(city));
    (segment.stops || []).forEach((stop) => stop.city && cities.add(stop.city));
  });
  if (transport.departureCity) cities.add(transport.departureCity);
  if (transport.arrivalCity) cities.add(transport.arrivalCity);
  return [...cities];
}

async function syncReservationToMatchingTransports(reservationId, data) {
  if (normalizePlace(data.status) !== "validated") return 0;
  const week = weekFromStartDate(data.sejour?.startDate);
  if (!week) return 0;
  const departureCity = data.transport?.departureCity || "";
  const returnCity = data.transport?.returnCity || "";
  const transportsSnap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
  const transports = transportsSnap.docs.map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }));
  let synced = 0;

  for (const direction of ["aller", "retour"]) {
    const city = direction === "retour" ? returnCity : departureCity;
    if (!city || normalizePlace(city) === "sur place") continue;
    const matches = transports.filter((transport) =>
      transport.week === week
      && transport.direction === direction
      && normalizePlace(transport.status) !== "annule"
      && transportStopCities(transport).some((stopCity) => normalizePlace(stopCity) === normalizePlace(city))
    );
    if (matches.length !== 1) continue;
    const transport = matches[0];
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

function useSejours() {
  const [sejours, setSejours] = useState([]);
  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.SEJOURS), orderBy("name", "asc")))
      .then(snap => setSejours(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);
  return sejours;
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
    sejourName:      canonicalStayName(sejour.name || d.sejourName) || "—",
    sejourStartDate: sejour.startDate || "",
    sejourEndDate:   sejour.endDate   || "",
    sejourAgeGroup:  sejour.ageGroup  || "",
    week:            weekFromStartDate(sejour.startDate || d.sejourStartDate || ""),
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
}) {
  const parts = [];
  parts.push(`<p style="font-size:14px;color:#1e1535;line-height:1.6;margin:0 0 10px;">Bonjour ${escapeHtml(nom)},</p>`);
  if (introText.trim()) {
    parts.push(`<p style="font-size:14px;color:#1e1535;line-height:1.6;margin:0 0 10px;">${escapeHtml(introText).replace(/\n/g, "<br>")}</p>`);
  }

  if (priceDefined) {
    const rows = [
      suiteEmailRow("Prix du séjour", fmtCur(sejourPriceNum)),
      discountPercent > 0 ? suiteEmailRow(`Réduction groupe (${childCount} enfants)`, `−${discountPercent}%`) : "",
      suiteEmailRow("Transport", fmtCur(transportAmountNum)),
      cafEligible ? suiteEmailRow("Pris en charge CAF", `− ${fmtCur(cafAmountNum)}`) : "",
      suiteEmailRow("Reste à charge", fmtCur(resteACharge)),
      alreadyPaid > 0 ? suiteEmailRow("Déjà réglé (acompte)", `− ${fmtCur(alreadyPaid)}`) : "",
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

  if (link) {
    const label = installmentsEnabled && installmentsCount > 1
      ? `Payer en ${installmentsCount} fois →`
      : "Payer en ligne par carte →";
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
            <div className="rp-price-calc-summary-row"><span>Déjà réglé (acompte)</span><span>− {fmtCur(alreadyPaid)}</span></div>
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
  });

  const applyTpl = (key) => {
    setTplKey(key);
    if (key === "suite_reservation") {
      setSubject(EMAIL_TEMPLATES.find(t => t.key === key).subject(nom, item.sejourName));
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
      setTplKey("suite_reservation");
      setSubject(EMAIL_TEMPLATES.find(t => t.key === "suite_reservation").subject(nom, item.sejourName));
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
    const isSuite = tplKey === "suite_reservation";
    if (!to || !subject || (isSuite ? false : !body)) { showToast("Remplissez tous les champs", "warning"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/send-admin-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSuite ? { to, subject, bodyHtml: previewHtml } : { to, subject, body }),
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

      {tplKey === "suite_reservation" && (
        <div className="rp-price-calc">
          <div className="rp-price-calc-title">Récapitulatif (défini dans l'onglet Tarif)</div>

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
                <div className="rp-price-calc-summary-row"><span>Déjà réglé (acompte)</span><span>− {fmtCur(alreadyPaid)}</span></div>
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

      {tplKey === "suite_reservation" ? (
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
        const assignedStaffIds = new Set(allerSegment?.assignedStaffIds || []);
        const convoyeur = aller?.staff?.find((member) => assignedStaffIds.has(member.id)) || aller?.staff?.[0];

        setExtra((current) => ({
          ...current,
          departureCity: saved.departureCity || allerPassenger?.pickupCity || item.departureCity || current.departureCity,
          returnCity: saved.returnCity || retourPassenger?.pickupCity || item.returnCity || current.returnCity,
          meetingPoint: saved.meetingPoint || allerStop?.meetingPoint || allerSegment?.meetingPoint || current.meetingPoint,
          meetingTime: saved.meetingTime || allerStop?.meetingTime || allerStop?.arrivalTime || allerSegment?.meetingTime || current.meetingTime,
          departureTime: saved.departureTime || allerStop?.departureTime || allerSegment?.departureTime || current.departureTime,
          trainType: saved.trainType || allerStop?.mode || allerSegment?.mode || current.trainType,
          trainNumber: saved.trainNumber || allerStop?.number || allerSegment?.number || current.trainNumber,
          returnMeetingPoint: saved.returnMeetingPoint || retourStop?.meetingPoint || retourSegment?.meetingPoint || current.returnMeetingPoint,
          returnTime: saved.returnTime || retourStop?.arrivalTime || retourSegment?.arrivalTime || current.returnTime,
          convoyeur: saved.convoyeur || convoyeur?.name || current.convoyeur,
          convoyeurPhone: saved.convoyeurPhone || convoyeur?.phone || current.convoyeurPhone,
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
        const rows = snap.docs
          .map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }))
          .filter((transport) => (transport.passengers || []).some((passenger) => passenger.reservationId === item.id))
          .map((transport) => {
            const passenger = (transport.passengers || []).find((entry) => entry.reservationId === item.id);
            const segment = findPassengerSegment(transport, passenger, item);
            const city = passengerTransportCity(transport, passenger, item);
            const staffIds = new Set(segment?.assignedStaffIds || []);
            const staff = (transport.staff || []).filter((member) => staffIds.has(member.id));
            const tickets = (transport.tickets || []).filter((ticket) =>
              ticket.segmentId === segment?.id
              && (
                !ticket.coveredReservationIds?.length
                || ticket.coveredReservationIds.includes(item.id)
                || ticket.missingReservationIds?.includes(item.id)
              )
            );
            return { transport, passenger, segment, city, staff, tickets };
          })
          .sort((a, b) => (a.transport.direction === "aller" ? -1 : 1) - (b.transport.direction === "aller" ? -1 : 1));
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
      {assignments.map(({ transport, segment, city, staff, tickets }) => (
        <article key={transport.id} className="rp-convoyage-card">
          <div className="rp-convoyage-head">
            <span className={`rp-convoyage-dir is-${transport.direction}`}>{transport.direction === "retour" ? "Retour" : "Aller"}</span>
            <strong>{transport.departureCity || "Départ"} &gt; {transport.arrivalCity || "Arrivée"}</strong>
            <small>{fmtDate(transport.date)} · {transport.week || ""}</small>
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

  const sejours = useSejours();
  const sejourForForm = sejours.find(x => x.name === form.sejourName) || null;

  const save = async () => {
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
        "sejour.name":      form.sejourName,
        "sejour.startDate": form.sejourStartDate,
        "sejour.endDate":   form.sejourEndDate,
        "sejour.ageGroup":  form.sejourAgeGroup,
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
          <option value="pending">En cours</option>
          <option value="validated">Validée</option>
          <option value="deleted">Passée</option>
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
            <span>Nom du séjour</span>
            <select className="dash-input" value={form.sejourName} onChange={e => {
              const s = sejours.find(x => x.name === e.target.value);
              set("sejourName", e.target.value);
              if (s?.ageGroups?.[0]) set("sejourAgeGroup", s.ageGroups[0]);
            }}>
              {form.sejourName && !sejours.some(x => x.name === form.sejourName) && (
                <option value={form.sejourName}>{form.sejourName}</option>
              )}
              <option value="">— Sélectionner un séjour —</option>
              {sejours.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label className="rp-edit-field">
            <span>Semaine</span>
            <select className="dash-input" value={weekFromStartDate(form.sejourStartDate)} onChange={e => {
              const w = WEEK_DATES[e.target.value];
              if (!w) return;
              set("sejourStartDate", w.startDate);
              set("sejourEndDate", w.endDate);
            }}>
              <option value="">— Semaine —</option>
              {Object.entries(WEEK_DATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <F label="Date début" k="sejourStartDate" type="date" />
          <F label="Date fin"   k="sejourEndDate"   type="date" />
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

export function ReservationPanel({ item: externalItem, onClose, onSave, onDelete, onStatusChange, initialTab = "tarif" }) {
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
      showToast(newStatus === "validated" ? `Reservation validee, ${syncedTransports} trajet(s) synchronise(s)` : "Statut mis a jour", "success");
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
  const sejours = useSejours();

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
      const syncedTransports = await syncReservationToMatchingTransports(docRef.id, data);
      showToast(`Réservation ${ref} créée${syncedTransports ? ` et ajoutée à ${syncedTransports} transport(s)` : ""} !`, "success");
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
                <select className="dash-input" value={form.sejourName} onChange={e => {
                  const s = sejours.find(x => x.name === e.target.value);
                  set("sejourName", e.target.value);
                  if (s?.ageGroups?.[0]) set("sejourAgeGroup", s.ageGroups[0]);
                }}>
                  <option value="">— Sélectionner un séjour —</option>
                  {sejours.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label className="rp-edit-field">
                <span>Semaine</span>
                <select className="dash-input" value={weekFromStartDate(form.sejourStartDate)} onChange={e => {
                  const w = WEEK_DATES[e.target.value];
                  if (!w) return;
                  set("sejourStartDate", w.startDate);
                  set("sejourEndDate", w.endDate);
                }}>
                  <option value="">— Semaine —</option>
                  {Object.entries(WEEK_DATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <F label="Date de début" k="sejourStartDate" type="date" />
              <F label="Date de fin"   k="sejourEndDate"   type="date" />
              {(() => {
                const s = sejours.find(x => x.name === form.sejourName);
                return s?.ageGroups?.length > 0 ? (
                  <label className="rp-edit-field">
                    <span>Tranche d'âge</span>
                    <select className="dash-input" value={form.sejourAgeGroup} onChange={e => set("sejourAgeGroup", e.target.value)}>
                      <option value="">—</option>
                      {s.ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </label>
                ) : (
                  <F label="Tranche d'âge" k="sejourAgeGroup" placeholder="ex : 12-17 ans" />
                );
              })()}
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

/* ── Validated view helpers ─────────────────────────────────────────────── */

const RES_WEEK_INFO = {
  S1: { label: "Semaine 1", dates: "6 – 17 juil." },
  S2: { label: "Semaine 2", dates: "20 – 31 juil." },
  S3: { label: "Semaine 3", dates: "3 – 14 août" },
  S4: { label: "Semaine 4", dates: "17 – 28 août" },
};

function validSelectValue(value, fallback = "__empty__") {
  return value && value !== "—" ? value : fallback;
}

function validSelectLabel(value) {
  if (value === "__empty__") return "Non renseigné";
  if (value === "__transport__") return "Avec transport";
  if (value === "__sur_place__") return "Sur place";
  return value;
}

function uniqueOptions(items, getter) {
  return Array.from(new Set((items || []).map(getter).filter(Boolean))).sort((a, b) =>
    validSelectLabel(a).localeCompare(validSelectLabel(b), "fr", { sensitivity: "base" }),
  );
}

function ValidatedOverview({ items, filters, onFilterChange, onReset }) {
  const weekCounts = useMemo(() => {
    const result = { all: countReservationChildren(items), S1: 0, S2: 0, S3: 0, S4: 0, autre: 0 };
    for (const item of items) {
      const count = reservationChildCount(item);
      if (item.week && result[item.week] !== undefined) result[item.week] += count;
      else result.autre += count;
    }
    return result;
  }, [items]);

  const sejourOptions = useMemo(
    () => uniqueOptions(items, (item) => validSelectValue(item.sejourName)),
    [items],
  );
  const transportOptions = useMemo(
    () => uniqueOptions(items, (item) => item.departureCity ? "__transport__" : "__sur_place__"),
    [items],
  );

  return (
    <section className="res-valid-panel">
      <div className="res-valid-summary">
        <div className="res-valid-total">
          <span>{weekCounts.all}</span>
          <small>enfants validés</small>
        </div>
        <div className="res-valid-week-strip">
          {["S1", "S2", "S3", "S4"].map((week) => (
            <button
              key={week}
              type="button"
              className={`res-valid-week${filters.week === week ? " is-active" : ""}`}
              onClick={() => onFilterChange("week", filters.week === week ? "all" : week)}
            >
              <strong>{week}</strong>
              <span>{weekCounts[week] || 0}</span>
              <small>{RES_WEEK_INFO[week]?.dates}</small>
            </button>
          ))}
          {(weekCounts.autre || 0) > 0 && (
            <button
              type="button"
              className={`res-valid-week${filters.week === "autre" ? " is-active" : ""}`}
              onClick={() => onFilterChange("week", filters.week === "autre" ? "all" : "autre")}
            >
              <strong>?</strong>
              <span>{weekCounts.autre}</span>
              <small>Sans semaine</small>
            </button>
          )}
        </div>
      </div>

      <div className="res-valid-filters">
        <select
          className="dash-input"
          value={filters.sejour}
          onChange={(event) => onFilterChange("sejour", event.target.value)}
        >
          <option value="all">Tous les séjours</option>
          {sejourOptions.map((option) => (
            <option key={option} value={option}>{validSelectLabel(option)}</option>
          ))}
        </select>
        <select
          className="dash-input"
          value={filters.transport}
          onChange={(event) => onFilterChange("transport", event.target.value)}
        >
          <option value="all">Tous les transports</option>
          {transportOptions.map((option) => (
            <option key={option} value={option}>{validSelectLabel(option)}</option>
          ))}
        </select>
        <button type="button" className="dash-btn" onClick={onReset}>Réinitialiser</button>
      </div>
    </section>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export default function Reservations() {
  const [items, setItems]                   = useState([]);
  const [mainView, setMainView]             = useState("reservations"); // "reservations" | "validees" | "passees"
  const [validatedFilters, setValidatedFilters] = useState({ week: "all", sejour: "all", transport: "all" });
  const [selectedItem, setSelectedItem]     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showNew, setShowNew]               = useState(false);
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
    pending:   items.filter(x => x.status === "pending"),
    validated: items.filter(x => x.status === "validated"),
    deleted:   items.filter(x => x.status === "deleted"),
  }), [items]);
  const childCounts = useMemo(() => ({
    total: countReservationChildren(items),
    pending: countReservationChildren(buckets.pending),
    validated: countReservationChildren(buckets.validated),
    deleted: countReservationChildren(buckets.deleted),
  }), [items, buckets]);

  /* Sous-filtre "Prix défini" / "À traiter" pour les réservations en cours */
  const [priceFilter, setPriceFilter] = useState("all"); // "all" | "defined" | "todo"
  const pricingCounts = useMemo(() => ({
    defined: buckets.pending.filter(x => x.finalPrice > 0).length,
    todo:    buckets.pending.filter(x => !(x.finalPrice > 0)).length,
  }), [buckets.pending]);
  const pendingFiltered = useMemo(() => {
    if (priceFilter === "defined") return buckets.pending.filter(x => x.finalPrice > 0);
    if (priceFilter === "todo")    return buckets.pending.filter(x => !(x.finalPrice > 0));
    return buckets.pending;
  }, [buckets.pending, priceFilter]);

  /* Items de la vue courante */
  const viewItems = useMemo(() => {
    if (mainView === "validees") return buckets.validated;
    if (mainView === "passees")  return buckets.deleted;
    return pendingFiltered;
  }, [mainView, buckets, pendingFiltered]);

  const validatedFiltered = useMemo(() => {
    return buckets.validated.filter((item) => {
      if (validatedFilters.week !== "all") {
        if (validatedFilters.week === "autre") {
          if (item.week) return false;
        } else if (item.week !== validatedFilters.week) return false;
      }
      if (validatedFilters.sejour !== "all" && validSelectValue(item.sejourName) !== validatedFilters.sejour) return false;
      if (validatedFilters.transport !== "all") {
        const transportValue = item.departureCity ? "__transport__" : "__sur_place__";
        if (transportValue !== validatedFilters.transport) return false;
      }
      return true;
    });
  }, [buckets.validated, validatedFilters]);

  const handleValidatedFilterChange = (key, value) => {
    setValidatedFilters((prev) => ({ ...prev, [key]: value }));
    setSelectedItem(null);
  };

  const changeView = (view) => {
    setMainView(view);
    setSelectedItem(null);
    setPriceFilter("all");
  };

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
  };

  const totalRevenue = useMemo(
    () => buckets.validated.reduce((sum, item) => sum + (Number(item.raw?.finance?.grossAmount) || item.finalPrice || 0), 0),
    [buckets.validated],
  );

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
      render: row => <Badge label={STATUS_LABEL[row.status] || row.status} variant={STATUS_BADGE[row.status] || "neutral"} />,
    },
  ], []);

  const validatedColumns = useMemo(() => [
    ...columns.slice(0, 3),
    {
      key: "week",
      label: "Semaine",
      sortValue: row => row.week || "ZZ",
      render: row => (
        <div className="res-week-cell">
          <strong>{row.week || "?"}</strong>
          <span>{row.week ? RES_WEEK_INFO[row.week]?.dates : "Sans semaine"}</span>
        </div>
      ),
    },
    ...columns.slice(3),
  ], [columns]);

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
                  <span className="res-stat-value">{childCounts.total}</span>
                  <span className="res-stat-label">enfants au total</span>
                </div>
                <div className="res-stat-badge res-stat-green">
                  <span className="res-stat-value">{childCounts.validated}</span>
                  <span className="res-stat-label">enfants validés</span>
                </div>
                <div className="res-stat-badge res-stat-orange">
                  <span className="res-stat-value">{childCounts.pending}</span>
                  <span className="res-stat-label">enfants en attente</span>
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

            {/* Sélecteur de vue */}
            <div className="res-view-selector">
              <button type="button"
                className={`res-view-btn${mainView === "reservations" ? " is-active" : ""}`}
                onClick={() => changeView("reservations")}>
                Réservations en cours
                <span className="res-view-count">{childCounts.pending}</span>
              </button>
              <button type="button"
                className={`res-view-btn${mainView === "validees" ? " is-active" : ""}`}
                onClick={() => changeView("validees")}>
                Validées
                <span className="res-view-count">{childCounts.validated}</span>
              </button>
              <button type="button"
                className={`res-view-btn res-view-btn-muted${mainView === "passees" ? " is-active" : ""}`}
                onClick={() => changeView("passees")}>
                Passées
                <span className="res-view-count">{childCounts.deleted}</span>
              </button>
            </div>

            {/* Sous-filtre : prix défini ou à traiter */}
            {mainView === "reservations" && (
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

            {loading ? (
              <div className="dash-section" style={{ padding: 24 }}>
                <p className="dash-muted">Chargement…</p>
              </div>
            ) : mainView === "reservations" || mainView === "passees" ? (
              /* Réservations en cours et passées : tableau direct */
              <DataTable
                columns={columns}
                data={viewItems}
                searchableKeys={["nom","email","childName","sejourName","departureCity","returnCity","numeroDeReservation"]}
                defaultSortKey="numeroDeReservation"
                defaultSortDirection="desc"
                onRowClick={row => setSelectedItem(prev => prev?.id === row.id ? null : row)}
                selectedRowId={selectedItem?.id}
                emptyLabel={mainView === "reservations" ? "Aucune réservation en cours." : "Aucune réservation passée."}
                toolsInline
              />
            ) : (
              <>
                <ValidatedOverview
                  items={buckets.validated}
                  filters={validatedFilters}
                  onFilterChange={handleValidatedFilterChange}
                  onReset={() => setValidatedFilters({ week: "all", sejour: "all", transport: "all" })}
                />
                <DataTable
                  columns={validatedColumns}
                  data={validatedFiltered}
                  searchableKeys={["nom","email","childName","sejourName","departureCity","returnCity","numeroDeReservation","week"]}
                  defaultSortKey="week"
                  defaultSortDirection="asc"
                  onRowClick={row => setSelectedItem(prev => prev?.id === row.id ? null : row)}
                  selectedRowId={selectedItem?.id}
                  emptyLabel="Aucune inscription validée pour ces filtres."
                  toolsInline
                />
              </>
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

