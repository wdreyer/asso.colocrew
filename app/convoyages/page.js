"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_INFO = {
  S1: { label: "Semaine 1", dates: "6 — 17 juillet", color: "#B8336A", bg: "#fff0f6" },
  S2: { label: "Semaine 2", dates: "20 — 31 juillet", color: "#7c3aed", bg: "#f5f0ff" },
  S3: { label: "Semaine 3", dates: "3 — 14 août",    color: "#0891b2", bg: "#f0f9ff" },
  S4: { label: "Semaine 4", dates: "17 — 28 août",   color: "#16a34a", bg: "#f0fdf4" },
};

const CONSIGNES_ITEMS = [
  "Mettre son tee shirt Colocrew et son Hydroflamme si vous en avez un",
  "Être à l'heure au lieu de RDV",
  "Être souriant, répondre aux questions des parents (n'inventez rien, si vous ne savez pas, demandez nous)",
  "Faire l'appel des enfants et les cocher au fur et à mesure",
  "Demander uniquement régime alimentaire et traitement — notez les, mais ne récupérez ni ordonnance ni médicaments (l'AS s'en chargera). Vérifier pic-nic si départ avant 12h",
  "Si vous êtes 2 ou plus, répartissez-vous les tâches",
  "Dès que les parents partent vous êtes entièrement responsable des enfants (les emmener aux toilettes, faire connaissance)",
  "Attitude exemplaire et professionnelle (scrolling, messages, utilisation du téléphone, vocabulaire)",
  "Parler de Kidizz et de la communication avec les familles",
  "Commencer à appeler les familles en retard 30 min avant le départ du train",
  "Partez sur le quai au moins 20 min avant le départ du train — passé ce délai les familles en retard vous rejoignent directement sur le quai",
  "À l'entrée du train, comptez les enfants avant, pendant et après — faites-les monter en premier et restez en dernière place",
  "Sur le parcours, s'il manque des pic-nics, de l'eau ou quoi que ce soit, vous pouvez acheter et nous vous remboursons (gardez les tickets)",
];

const COMMUNICATION_ITEMS = [
  "Envoyez nous un message quand vous avez tous les enfants, que vous êtes partis, en cas de retard ou tout autre problème non urgent",
  "Si il manque un enfant, si les numéros parents ne fonctionnent pas, si il y a un problème urgent — appelez nous : 06 87 91 68 97 & 06 11 91 37 64",
];

const EMERGENCY_PHONES = [
  { label: "William", number: "0687916897", display: "06 87 91 68 97" },
  { label: "ColoCrew", number: "0611913764", display: "06 11 91 37 64" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function childFullName(c) {
  return `${c?.firstName || ""} ${c?.lastName || ""}`.trim();
}

function shortStayCode(value) {
  const normalized = normalizePlace(value);
  if (normalized.includes("eaux vives") || normalized.includes("eaux-vives")) return "EVCC";
  if (normalized.includes("surf") || normalized.includes("my creative")) return "MCSC";
  return String(value || "Séjour").trim();
}

function legalName(legal = {}) {
  return `${legal.firstName || legal.prenom || ""} ${legal.lastName || legal.nom || ""}`.trim();
}

function mapReservationPassenger(snap) {
  const data = snap.data() || {};
  const children = Array.isArray(data.minor?.children) ? data.minor.children : [];
  const first = children[0] || {};
  return {
    id: snap.id,
    numeroDeReservation: data.numeroDeReservation || "",
    nom: legalName(data.legal || {}),
    email: data.legal?.email || "",
    phone: data.legal?.phone || "",
    children,
    childName: childFullName(first),
    sejourName: data.sejour?.name || "",
    departureCity: data.transport?.departureCity || "",
    returnCity: data.transport?.returnCity || "",
    status: data.status || "",
  };
}

function hydrateTransportPassengers(transport, reservations = []) {
  const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  return {
    ...transport,
    passengers: (transport.passengers || []).map((passenger) => {
      const reservation = byId.get(passenger.reservationId);
      if (!reservation) return passenger;
      return {
        ...passenger,
        numeroDeReservation: reservation.numeroDeReservation,
        nom: reservation.nom,
        email: reservation.email,
        phone: reservation.phone,
        children: reservation.children,
        childName: reservation.childName,
        sejourName: reservation.sejourName,
        departureCity: reservation.departureCity,
        returnCity: reservation.returnCity,
        status: reservation.status,
        pickupCity: passenger.pickupCity || (transport.direction === "retour" ? reservation.returnCity : reservation.departureCity) || "",
      };
    }),
  };
}

function countChildren(passengers) {
  return (passengers || []).reduce((s, p) => s + Math.max(p.children?.length || 0, 1), 0);
}

function segmentPathLabel(segment) {
  return [segment?.from, ...(segment?.stops || []).map((stop) => stop.city), segment?.to]
    .filter(Boolean)
    .filter((city, index, items) => index === 0 || normalizePlace(city) !== normalizePlace(items[index - 1]))
    .join(" → ");
}

function effectiveLeadStaffId(transport) {
  const assignedIds = [...new Set([
    ...(transport?.segments || []),
    ...(transport?.branches || []),
  ].flatMap((segment) => segment.assignedStaffIds || []).filter(Boolean))];
  if (assignedIds.length === 1) return assignedIds[0];
  return assignedIds.includes(transport?.leadStaffId) ? transport.leadStaffId : "";
}

function leadStaffMember(transport) {
  const leadId = effectiveLeadStaffId(transport);
  return (transport?.staff || []).find((member) => member.id === leadId) || null;
}

function normalizePlace(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Où un embranchement se raccorde au tronc commun : index du segment principal juste
// APRÈS lequel il doit apparaître (ou mainSegments.length si le raccord se fait au tout
// dernier arrêt, ex. Toulouse -> Marseille/Lyon, Paris -> Lille/Nantes en S2).
function branchJoinIndex(transport, branch) {
  const segments = transport.segments || [];
  const joinKey = normalizePlace(branch.joinsAt || (transport.direction === "retour" ? branch.from : branch.to));
  if (!joinKey) return transport.direction === "retour" ? segments.length - 1 : 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (normalizePlace(segment.from) === joinKey) return index;
    if (normalizePlace(segment.to) === joinKey) return Math.min(index + 1, segments.length);
  }
  return transport.direction === "retour" ? segments.length - 1 : segments.length;
}

function portionScheduleMinutes(portion) {
  const value = portion?.departureTime || portion?.arrivalTime || "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function orderedTransportPortions(transport) {
  const mainSegments = (transport.segments || []).map((segment, index) => ({
    ...segment,
    _index: index,
    _type: "segment",
    _fallbackOrder: index * 2,
  }));
  const branches = (transport.branches || []).map((branch, index) => ({
    ...branch,
    _index: index,
    _type: "branch",
    _fallbackOrder: branchJoinIndex(transport, branch) * 2 - 0.5 + index / 100,
  }));
  return [...mainSegments, ...branches].sort((left, right) => {
    const leftMinutes = portionScheduleMinutes(left);
    const rightMinutes = portionScheduleMinutes(right);
    if (leftMinutes !== null && rightMinutes !== null && leftMinutes !== rightMinutes) {
      return leftMinutes - rightMinutes;
    }
    if (leftMinutes !== null && rightMinutes === null) return -1;
    if (leftMinutes === null && rightMinutes !== null) return 1;
    return left._fallbackOrder - right._fallbackOrder;
  });
}

function transportRouteCities(transport) {
  const cities = [];
  const append = (city) => {
    if (!city || normalizePlace(cities.at(-1)) === normalizePlace(city)) return;
    cities.push(city);
  };
  (transport?.segments || []).forEach((segment) => {
    append(segment.from);
    (segment.stops || []).forEach((stop) => append(stop.city));
    append(segment.to);
  });
  return cities;
}

function transportStageCities(transport) {
  const route = transportRouteCities(transport);
  return route.length > 2 ? route.slice(1, -1) : [];
}

function journeyStageOrder(transport) {
  if (!transport?.sharedConnection) return 1;
  return transport.direction === "retour" ? 0 : 2;
}

function passengerBoardingCity(transport, passenger) {
  return (
    passenger.pickupCity ||
    (transport.direction === "aller" ? passenger.departureCity : passenger.returnCity) ||
    ""
  );
}

function groupPassengersByCity(transport) {
  const groups = new Map();
  (transport.passengers || []).forEach((p) => {
    const city = passengerBoardingCity(transport, p) || "Ville inconnue";
    const key = normalizePlace(city);
    if (!groups.has(key)) groups.set(key, { city, passengers: [] });
    groups.get(key).passengers.push(p);
  });
  return [...groups.values()];
}

function segmentBoardingCity(transport, segment) {
  return transport.direction === "aller" ? segment.from : segment.to;
}

function passengersAtStop(transport, segment) {
  const city = normalizePlace(segmentBoardingCity(transport, segment));
  const subCities = (segment.stops || []).map((s) => normalizePlace(s.city));
  return (transport.passengers || []).filter((p) => {
    const pCity = normalizePlace(passengerBoardingCity(transport, p));
    return pCity === city || subCities.includes(pCity);
  });
}

function passengersDroppingAt(transport, city) {
  const target = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(
      transport.direction === "retour"
        ? passenger.dropoffCity || passenger.returnCity || passenger.pickupCity
        : passenger.dropoffCity,
    ) === target,
  );
}

function passengersBoardingAt(transport, city) {
  if (transport.direction === "retour" && !transport.sharedConnection) return [];
  const target = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(passengerBoardingCity(transport, passenger)) === target,
  );
}

function transportCityRecap(transport) {
  const isReturn = transport.direction === "retour";
  const rows = [];
  const seen = new Set();
  const addRow = (portion, point, pointIndex, action, passengers) => {
    if (!passengers.length || !point.city) return;
    const key = `${normalizePlace(point.city)}|${action}`;
    if (seen.has(key)) return;
    seen.add(key);
    const isBoarding = action === "boarding";
    const meetingTime = isBoarding
      ? point.meetingTime || portion.meetingTime || ""
      : point.arrivalTime || portion.arrivalTime || "";
    const meetingPoint = isBoarding
      ? point.meetingPoint || portion.meetingPoint || point.city
      : isReturn && !transport.sharedConnection
        ? "À la descente du quai — l’animateur·ice vous contactera"
        : point.meetingPoint || `Arrivée à ${point.city}`;
    rows.push({
      city: point.city,
      action: isBoarding
        ? (isReturn ? "Prise en charge au centre" : "Prise en charge")
        : (isReturn && !transport.sharedConnection ? "Remise aux familles" : "Descente"),
      childCount: countChildren(passengers),
      meetingPoint,
      meetingTime,
      arrivalTime: point.arrivalTime || (pointIndex === 2 ? portion.arrivalTime || "" : ""),
      departureTime: point.departureTime || (pointIndex === 0 ? portion.departureTime || "" : ""),
      order: rows.length,
    });
  };

  orderedTransportPortions(transport).forEach((portion) => {
    const points = [
      { city: portion.from, meetingPoint: portion.meetingPoint, meetingTime: portion.meetingTime, departureTime: portion.departureTime },
      ...(portion.stops || []).map((stop) => ({ ...stop })),
      { city: portion.to, arrivalTime: portion.arrivalTime },
    ];
    points.forEach((point, index) => {
      addRow(portion, point, index === 0 ? 0 : index === points.length - 1 ? 2 : 1, "boarding", passengersBoardingAt(transport, point.city));
      addRow(portion, point, index === 0 ? 0 : index === points.length - 1 ? 2 : 1, "dropoff", passengersDroppingAt(transport, point.city));
    });
  });
  return rows.sort((left, right) => left.order - right.order);
}

function timeMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

function citySchedule(transport, city, direction = transport.direction) {
  const target = normalizePlace(city);
  for (const portion of orderedTransportPortions(transport)) {
    if (direction !== "retour" && normalizePlace(portion.from) === target) {
      return { time: portion.meetingTime || portion.departureTime || "", segment: segmentPathLabel(portion) };
    }
    for (const stop of portion.stops || []) {
      if (normalizePlace(stop.city) === target) {
        return {
          time: direction === "retour" ? stop.arrivalTime || stop.departureTime || "" : stop.meetingTime || stop.arrivalTime || stop.departureTime || "",
          segment: segmentPathLabel(portion),
        };
      }
    }
    if (direction === "retour" && normalizePlace(portion.to) === target) {
      return { time: portion.arrivalTime || "", segment: segmentPathLabel(portion) };
    }
  }
  return { time: direction === "retour" ? transport.arrivalTime || "" : transport.departureTime || "", segment: "" };
}

function meetingTimeOrOneHourBefore(meetingTime, departureTime) {
  if (meetingTime) return meetingTime;
  const match = String(departureTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const minutes = ((Number(match[1]) * 60 + Number(match[2]) - 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function recapMeetingInfo(transport, city, isReturnConnection = false) {
  const target = normalizePlace(city);
  const isFamilyReturn = transport.direction === "retour" && !isReturnConnection;

  for (const portion of orderedTransportPortions(transport)) {
    if (!isFamilyReturn && normalizePlace(portion.from) === target) {
      const trainTime = portion.departureTime || "";
      return {
        meetingTime: meetingTimeOrOneHourBefore(portion.meetingTime, trainTime),
        trainTime,
        meetingPoint: portion.meetingPoint || city || "",
      };
    }

    for (const stop of portion.stops || []) {
      if (normalizePlace(stop.city) !== target) continue;
      if (isFamilyReturn) {
        const arrivalTime = stop.arrivalTime || stop.departureTime || "";
        return {
          meetingTime: arrivalTime,
          trainTime: arrivalTime,
          meetingPoint: stop.meetingPoint || "À la descente du quai — l’animateur·ice vous contactera",
        };
      }
      const trainTime = stop.departureTime || stop.arrivalTime || "";
      return {
        meetingTime: meetingTimeOrOneHourBefore(stop.meetingTime, trainTime),
        trainTime,
        meetingPoint: stop.meetingPoint || portion.meetingPoint || city || "",
      };
    }

    if (isFamilyReturn && normalizePlace(portion.to) === target) {
      return {
        meetingTime: portion.arrivalTime || "",
        trainTime: portion.arrivalTime || "",
        meetingPoint: "À la descente du quai — l’animateur·ice vous contactera",
      };
    }
  }

  const trainTime = isFamilyReturn ? transport.arrivalTime || "" : transport.departureTime || "";
  return {
    meetingTime: isFamilyReturn ? trainTime : meetingTimeOrOneHourBefore(transport.meetingTime, trainTime),
    trainTime,
    meetingPoint: isFamilyReturn
      ? "À la descente du quai — l’animateur·ice vous contactera"
      : transport.meetingPoint || city || "",
  };
}

function staffNames(transport, ids = []) {
  const wanted = new Set(ids.filter(Boolean));
  return (transport.staff || []).filter((member) => wanted.has(member.id)).map((member) => member.name).filter(Boolean);
}

function staffCoordinationEvents(transport) {
  const groups = new Map();
  (transport.branches || []).forEach((branch) => {
    const city = branch.joinsAt || (transport.direction === "retour" ? branch.from : branch.to);
    const key = normalizePlace(city);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { city, branches: [] });
    groups.get(key).branches.push(branch);
  });

  return [...groups.values()].map(({ city, branches }) => {
    const mainBefore = (transport.segments || []).find((segment) => normalizePlace(segment.to) === normalizePlace(city));
    const mainAfter = (transport.segments || []).find((segment) => normalizePlace(segment.from) === normalizePlace(city));
    const isReturn = transport.direction === "retour";
    const relevant = [mainBefore, ...branches];
    const ids = relevant.filter(Boolean).flatMap((portion) => portion.assignedStaffIds || []);
    const names = staffNames(transport, ids);
    const time = isReturn
      ? mainBefore?.arrivalTime || mainAfter?.departureTime || branches[0]?.departureTime || ""
      : [...[mainBefore, ...branches].filter(Boolean).map((portion) => portion.arrivalTime).filter(Boolean)].sort((a, b) => timeMinutes(b) - timeMinutes(a))[0] || mainAfter?.departureTime || "";
    return {
      city,
      time,
      title: isReturn ? "Séparation des équipes" : "Regroupement des équipes",
      detail: isReturn
        ? `Les embranchements repartent ensuite à ${branches.map((branch) => `${branch.to} ${branch.departureTime || "heure à confirmer"}`).join(" · ")}.`
        : `Le trajet commun repart à ${mainAfter?.departureTime || "une heure à confirmer"}.`,
      names,
    };
  }).sort((left, right) => timeMinutes(left.time) - timeMinutes(right.time));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function passengerRecapRows(transport) {
  const isReturn = transport.direction === "retour";
  const isReturnConnection = isReturn && transport.sharedConnection;
  return (transport.passengers || []).flatMap((passenger) => {
    const city = isReturnConnection
      ? passenger.pickupCity || "Centre à confirmer"
      : isReturn
      ? passenger.dropoffCity || passenger.returnCity || passenger.pickupCity || "Ville à confirmer"
      : passenger.pickupCity || passenger.departureCity || "Ville à confirmer";
    const schedule = citySchedule(transport, city, isReturnConnection ? "aller" : transport.direction);
    const meeting = recapMeetingInfo(transport, city, isReturnConnection);
    const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
    return children.map((child) => ({
      time: schedule.time,
      meetingTime: meeting.meetingTime,
      trainTime: meeting.trainTime,
      meetingPoint: meeting.meetingPoint,
      city,
      action: isReturnConnection ? "Prise en charge au centre" : isReturn ? "Descente / remise à la famille" : "Montée / prise en charge",
      child: childFullName(child) || passenger.childName || "—",
      stay: passenger.stayCode || shortStayCode(passenger.sejourName),
      parent: passenger.nom || "—",
      phone: passenger.phone || "—",
      segment: schedule.segment,
    }));
  }).sort((left, right) => timeMinutes(left.meetingTime || left.trainTime || left.time) - timeMinutes(right.meetingTime || right.trainTime || right.time) || left.city.localeCompare(right.city, "fr"));
}

function openPassengerRecapPdf(transport) {
  const rows = passengerRecapRows(transport);
  const coordination = staffCoordinationEvents(transport);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Récap convoyage</title><style>
    @page{size:A4 landscape;margin:7mm}body{font:9px Arial,sans-serif;color:#1e1040;margin:0}h1{font-size:17px;margin:0 0 4px;color:#B8336A}p{margin:0 0 8px}.events{margin:7px 0 10px;padding:6px 8px;background:#f5f0ff;border:1px solid #d8c9ef}.events div{margin:2px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8d8df;padding:4px 5px;vertical-align:top}th{background:#1e1040;color:#fff;text-align:left;font-size:8px}tr:nth-child(even){background:#faf8fc}.num{width:20px;text-align:center}.time{width:38px;font-weight:bold;text-align:center;white-space:nowrap}.city{font-weight:bold}.meeting{min-width:190px;white-space:normal;line-height:1.35}.action{width:95px}.phone{white-space:nowrap}.no-print{margin-bottom:8px}@media print{.no-print{display:none}}
  </style></head><body><button class="no-print" onclick="window.print()">Imprimer / enregistrer en PDF</button>
  <h1>ColoCrew · ${escapeHtml(transport.week)} · ${transport.direction === "retour" ? "Retour" : "Aller"}</h1>
  <p><strong>${escapeHtml(transport.departureCity)} → ${escapeHtml(transport.arrivalCity)}</strong> · ${escapeHtml(fmtDate(transport.date))} · ${rows.length} enfant(s)</p>
  ${coordination.length ? `<div class="events"><strong>Coordination des équipes</strong>${coordination.map((event) => `<div>${escapeHtml(event.time || "—")} · ${escapeHtml(event.title)} à ${escapeHtml(event.city)}${event.names.length ? ` · ${escapeHtml(event.names.join(", "))}` : ""}</div>`).join("")}</div>` : ""}
  <table><thead><tr><th class="num">#</th><th>RDV</th><th>Train</th><th>Ville</th><th>Lieu de RDV complet</th><th>Action</th><th>Enfant</th><th>Séjour</th><th>Responsable</th><th>Téléphone</th><th>Segment</th></tr></thead><tbody>
  ${rows.map((row, index) => `<tr><td class="num">${index + 1}</td><td class="time">${escapeHtml(row.meetingTime || "—")}</td><td class="time">${escapeHtml(row.trainTime || "—")}</td><td class="city">${escapeHtml(row.city)}</td><td class="meeting">${escapeHtml(row.meetingPoint || "À confirmer")}</td><td class="action">${escapeHtml(row.action)}</td><td>${escapeHtml(row.child)}</td><td>${escapeHtml(row.stay)}</td><td>${escapeHtml(row.parent)}</td><td class="phone">${escapeHtml(row.phone)}</td><td>${escapeHtml(row.segment)}</td></tr>`).join("")}
  </tbody></table></body></html>`;
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

function childNamesForPassengers(passengers) {
  return passengers.flatMap((passenger) => {
    if (passenger.children?.length) {
      return passenger.children.map((child) => childFullName(child)).filter(Boolean);
    }
    return [passenger.childName].filter(Boolean);
  });
}

function ticketSegmentLabel(ticket, segments) {
  const seg = (segments || []).find((s) => s.id === ticket.segmentId);
  return seg ? `${seg.from || "?"} → ${seg.to || "?"}` : (ticket.segmentLabel || "");
}

function firstNameOf(fullName) {
  return (fullName || "").split(" ")[0] || fullName || "vous";
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function BackBtn({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", padding: "4px 0",
        fontSize: 14, color: "#7c3aed", fontWeight: 700, cursor: "pointer",
        marginBottom: 24, display: "flex", alignItems: "center", gap: 4,
      }}
    >
      ← {label}
    </button>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
      <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: 11, minWidth: 96, textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 2 }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#1e1040", fontSize: 13, flex: 1 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children, color = "#B8336A" }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
      color, margin: "24px 0 12px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ height: 2, width: 28, background: `${color}40`, flexShrink: 0 }} />
      {children}
      <div style={{ height: 2, flex: 1, background: `${color}20` }} />
    </div>
  );
}

function Collapse({ title, icon, defaultOpen = false, printAlwaysOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14, borderRadius: 14, overflow: "hidden", border: "1.5px solid #e5e7eb" }}>
      <style>{printAlwaysOpen ? `.print-collapse-content { display: block !important; }` : ""}</style>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 18px", background: "#f9fafb", border: "none", cursor: "pointer", gap: 10,
        }}
        className="no-print"
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", display: "flex", gap: 8, alignItems: "center" }}>
          {icon && <span>{icon}</span>}
          {title}
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{open ? "▲" : "▼"}</span>
      </button>
      <div style={{ display: open ? "block" : "none", padding: "14px 16px" }} className="print-collapse-content">
        {children}
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepWeek({ onSelect }) {
  return (
    <div style={wrap}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={logo}>ColoCrew</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, fontWeight: 500 }}>Espace convoyage — Été 2026</div>
      </div>
      <h2 style={stepTitle}>Quelle est votre semaine ?</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(WEEK_INFO).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 20px", background: info.bg,
              border: `2px solid ${info.color}35`,
              borderRadius: 14, cursor: "pointer", textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: info.color }}>{key} — {info.label}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{info.dates} 2026</div>
            </div>
            <span style={{ fontSize: 18, color: info.color }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTransport({ week, transports, weekInfo, onBack, onSelect }) {
  if (!transports.length) {
    return (
      <div style={wrap}>
        <BackBtn onClick={onBack} label={`${week} — ${weekInfo?.dates}`} />
        <h2 style={stepTitle}>Aucun trajet disponible</h2>
        <p style={{ fontSize: 14, color: "#94a3b8" }}>
          Aucun transport n&apos;est encore configuré pour {week}. Contacte l&apos;équipe ColoCrew.
        </p>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <BackBtn onClick={onBack} label={`${week} — ${weekInfo?.dates}`} />
      <h2 style={stepTitle}>Choisissez votre trajet</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...transports]
          .sort((a, b) =>
            (a.date || "").localeCompare(b.date || "")
            || (a.direction || "").localeCompare(b.direction || "")
            || journeyStageOrder(a) - journeyStageOrder(b)
            || (a.departureTime || "").localeCompare(b.departureTime || ""),
          )
          .map((t) => {
            const isAller = t.direction !== "retour";
            const dirColor = isAller ? "#16a34a" : "#ea580c";
            const staffCount = (t.staff || []).length;
            const childCount = countChildren(t.passengers || []);
            const stageCities = transportStageCities(t);
            const branches = t.branches || [];
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "15px 18px", background: "#fff",
                  border: "2px solid #e5e7eb", borderRadius: 14, cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontSize: 26, color: dirColor, flexShrink: 0, lineHeight: 1 }}>{isAller ? "↑" : "↓"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1e1040" }}>
                    {t.departureCity || "?"} → {t.arrivalCity || "?"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    <strong style={{ color: dirColor }}>{isAller ? "Aller" : "Retour"}</strong> · {fmtDate(t.date)}
                    {t.meetingTime ? ` · RDV ${t.meetingTime}` : ""}
                  </div>
                  {stageCities.length > 0 && (
                    <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 5, fontWeight: 700 }}>
                      Étapes : {stageCities.join(" → ")}
                    </div>
                  )}
                  {branches.map((branch) => (
                    <div key={branch.id || `${branch.from}-${branch.to}`} style={{ fontSize: 11, color: "#B8336A", marginTop: 3, fontWeight: 700 }}>
                      Embranchement : {segmentPathLabel(branch) || "?"}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {staffCount > 0 && (
                      <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>
                        {staffCount} anim.
                      </span>
                    )}
                    {childCount > 0 && (
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        {childCount} enfant{childCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "#94a3b8" }}>→</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

function StepStaff({ transport, weekInfo, onBack, onSelect }) {
  const staff = transport?.staff || [];
  const isAller = transport?.direction !== "retour";
  const leadId = effectiveLeadStaffId(transport);
  return (
    <div style={wrap}>
      <BackBtn onClick={onBack} label={`${transport?.departureCity} → ${transport?.arrivalCity}`} />
      <h2 style={stepTitle}>Qui êtes-vous ?</h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "-16px 0 20px" }}>
        {isAller ? "Aller" : "Retour"} · {fmtDate(transport?.date)}
      </p>
      <button
        onClick={() => onSelect("__all__")}
        style={{ width: "100%", marginBottom: 14, padding: "13px 16px", border: "2px solid #B8336A", borderRadius: 12, background: "#fff0f6", color: "#B8336A", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
      >
        Voir le trajet complet et toutes les listes
      </button>
      {staff.length === 0 ? (
        <div style={{ padding: "24px 20px", background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🙋</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>Aucun animateur affecté</div>
          <div style={{ fontSize: 13, color: "#78350f", marginTop: 4 }}>
            Aucun animateur n&apos;est encore assigné à ce trajet.<br />
            Contacte l&apos;équipe ColoCrew.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {EMERGENCY_PHONES.map((p) => (
              <a key={p.number} href={`tel:${p.number}`} style={{ ...callBtn, background: "#B8336A" }}>
                📞 {p.display}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((member) => (
            <button
              key={member.id}
              onClick={() => onSelect(member.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 18px", background: "#fff",
                border: "2px solid #e5e7eb", borderRadius: 12, cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "#f3eef8", color: "#7c3aed",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800, flexShrink: 0,
                letterSpacing: "-0.02em",
              }}>
                {(member.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e1040" }}>
                  {member.name || "Animateur"}{member.id === leadId ? " · Chef de convoi" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{member.role || "Animateur convoyeur"}</div>
              </div>
              <span style={{ fontSize: 16, color: "#94a3b8" }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Briefing view ────────────────────────────────────────────────────────────

function BriefingView({ transport, staff, mySegments, myTickets, weekInfo, onBack }) {
  const isAller = transport.direction !== "retour";
  const dirColor = isAller ? "#16a34a" : "#ea580c";
  const totalChildren = countChildren(transport.passengers || []);
  const passengerGroups = groupPassengersByCity(transport);
  const firstName = firstNameOf(staff?.name);
  const leadMember = leadStaffMember(transport);
  const stageCities = transportStageCities(transport);
  const coordinationEvents = staffCoordinationEvents(transport);
  const cityRecap = transportCityRecap(transport);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 60 }}>
      {/* Global print styles */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { padding-top: 0 !important; }
          .print-show { display: block !important; }
          .print-page-break { page-break-before: always; }
          .print-collapse-content { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Sticky top bar */}
      <div
        className="no-print"
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "#B8336A", color: "#fff",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 12px rgba(184,51,106,0.35)",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>ColoCrew · Convoyage</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            {isAller ? "↑" : "↓"} {transport.departureCity} → {transport.arrivalCity} · {weekInfo?.label}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onBack}
            style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ← Changer
          </button>
          <button
            onClick={() => openPassengerRecapPdf(transport)}
            style={{ background: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", color: "#B8336A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Récap PDF 🖨️
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ── Welcome card ── */}
        <div style={{
          marginBottom: 18, padding: "20px 22px",
          background: "linear-gradient(135deg, #fff0f6 0%, #f5f0ff 100%)",
          borderRadius: 18, border: "1.5px solid #f3d0e6",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#B8336A", marginBottom: 8 }}>
            Bonjour {firstName} ! 👋
          </div>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            Merci de ton implication chez Colocrew. Le convoyage est un moment stressant et important du séjour — c&apos;est souvent notre seul contact avec les parents et responsables.{" "}
            <strong>Il faut être exemplaire et rassurant.</strong>
          </div>
        </div>

        {/* ── Transport summary card ── */}
        <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 16, overflow: "hidden", marginBottom: 18 }}>
          <div style={{
            padding: "13px 18px",
            background: isAller ? "#f0fdf4" : "#fff7ed",
            borderBottom: "1px solid #e5e7eb",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 28, color: dirColor, lineHeight: 1 }}>{isAller ? "↑" : "↓"}</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: "#1e1040" }}>
                {transport.departureCity || "?"} → {transport.arrivalCity || "?"}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                {isAller ? "Aller" : "Retour"} · {weekInfo?.label} ({weekInfo?.dates} 2026)
              </div>
              {stageCities.length > 0 && (
                <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 4, fontWeight: 700 }}>
                  Étapes : {stageCities.join(" → ")}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {[
              ["Date", fmtDate(transport.date)],
              ["Train", `${transport.trainType || ""} ${transport.trainNumber || ""}`.trim() || null],
              ["Point de RDV", transport.meetingPoint || transport.departureCity || null],
              ["Heure de RDV", transport.meetingTime || null],
              ["Voie / quai", transport.platform || null],
              ["Départ train", transport.departureTime || null],
              ["Arrivée", transport.arrivalTime || null],
              ["Passagers", `${totalChildren} enfant${totalChildren > 1 ? "s" : ""}`],
              ["Chef de convoi", leadMember?.name || "À désigner"],
            ]
              .filter(([, v]) => v)
              .map(([label, value], i, arr) => (
                <div
                  key={i}
                  style={{
                    padding: "11px 16px",
                    borderBottom: i < arr.length - 2 ? "1px solid #f0f0f0" : "none",
                    borderRight: i % 2 === 0 ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1040" }}>{value}</div>
                </div>
              ))}
          </div>
        </div>

        {cityRecap.length > 0 && (
          <>
            <SectionTitle color="#1e1040">Récapitulatif par ville</SectionTitle>
            <div style={{ overflowX: "auto", marginBottom: 18, border: "1.5px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#1e1040", color: "#fff" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Ville / action</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Enfants</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Point de rendez-vous</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>RDV famille</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Départ</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Arrivée</th>
                  </tr>
                </thead>
                <tbody>
                  {cityRecap.map((row, index) => (
                    <tr key={`${row.city}-${row.action}`} style={{ background: index % 2 ? "#faf8fc" : "#fff", borderTop: "1px solid #eeeaf3" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 900, color: "#1e1040" }}>{row.city}</div>
                        <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: row.action.includes("Remise") || row.action === "Descente" ? "#ea580c" : "#16a34a", textTransform: "uppercase" }}>{row.action}</div>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900, color: "#7c3aed" }}>{row.childCount}</td>
                      <td style={{ padding: "8px 10px", color: "#374151", lineHeight: 1.4 }}>{row.meetingPoint || "À confirmer"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900, color: "#B8336A", whiteSpace: "nowrap" }}>{row.meetingTime || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900, color: "#16a34a", whiteSpace: "nowrap" }}>{row.departureTime || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900, color: "#ea580c", whiteSpace: "nowrap" }}>{row.arrivalTime || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {coordinationEvents.length > 0 && (
          <>
            <SectionTitle color="#B8336A">Coordination des équipes</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {coordinationEvents.map((event) => (
                <div key={`${event.city}-${event.title}`} style={{ padding: "11px 14px", background: "#fff0f6", border: "1.5px solid #f3d0e6", borderRadius: 11 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, color: "#B8336A" }}>
                    {event.time || "Heure à confirmer"} · {event.title} à {event.city}
                  </div>
                  {event.names.length > 0 && <div style={{ marginTop: 3, fontSize: 12, color: "#1e1040", fontWeight: 700 }}>{event.names.join(", ")}</div>}
                  <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>{event.detail}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── My segments ── */}
        <SectionTitle color="#7c3aed">
          Mes segments {mySegments.length > 0 ? `(${mySegments.length})` : ""}
        </SectionTitle>

        {mySegments.length === 0 ? (
          <div style={{ padding: "18px 20px", background: "#f5f0ff", border: "1.5px solid #d4c0e8", borderRadius: 12, marginBottom: 18, fontSize: 14, color: "#7c3aed" }}>
            Aucun arrêt ne t&apos;est encore affecté sur ce trajet. Contacte l&apos;équipe pour confirmation.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {mySegments.map((seg, i) => {
              const stopPassengers = passengersAtStop(transport, seg);
              const childCount = Number(seg.sharedChildrenCount || 0) || countChildren(stopPassengers);
              const finalDropoffs = passengersDroppingAt(transport, seg.to);
              return (
                <details key={seg.id || i} style={{ background: "#fff", border: "1.5px solid #ddd5f5", borderRadius: 14, overflow: "hidden" }}>
                  {/* Segment header */}
                  <summary style={{
                    padding: "11px 16px", background: "#7c3aed",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    listStyle: "none", cursor: "pointer",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>
                      Segment {i + 1}{seg._type === "branch" ? " · Embranchement" : ""} — {segmentPathLabel(seg) || "?"}
                    </div>
                    <div style={{
                      background: "rgba(255,255,255,0.2)", borderRadius: 100,
                      padding: "2px 10px", fontSize: 12, color: "#fff", fontWeight: 700,
                    }}>
                      {childCount} enfant{childCount > 1 ? "s" : ""}
                    </div>
                  </summary>

                  {/* Segment details */}
                  <div style={{ padding: "14px 16px" }}>
                    <InfoRow label="Point de RDV" value={seg.meetingPoint || "À définir"} />
                    <InfoRow label="Heure de RDV" value={seg.meetingTime} />
                    <InfoRow label="Voie / quai" value={seg.platform} />
                    <InfoRow label="Départ" value={seg.departureTime} />
                    <InfoRow label="Arrivée" value={seg.arrivalTime} />
                    <InfoRow label="Train" value={`${seg.mode || ""} ${seg.number || ""}`.trim() || null} />

                    {seg.instructions && (
                      <div style={{
                        marginTop: 10, padding: "10px 14px",
                        background: "#fff7ed", border: "1px solid #fed7aa",
                        borderRadius: 8, fontSize: 13, color: "#92400e", lineHeight: 1.6,
                      }}>
                        📋 {seg.instructions}
                      </div>
                    )}
                    {Number(seg.capacityShortage || 0) > 0 && (
                      <div style={{ marginTop: 10, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 800 }}>
                        Capacité insuffisante : {seg.sharedCapacity} places pour {seg.sharedChildrenCount} enfants, soit {seg.capacityShortage} places manquantes avant les animateurs.
                      </div>
                    )}

                    {/* Sub-stops */}
                    {(seg.stops || []).length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>
                          Villes étapes
                        </div>
                        {seg.stops.map((stop, si) => {
                          const boardings = passengersBoardingAt(transport, stop.city);
                          const dropoffs = passengersDroppingAt(transport, stop.city);
                          const boardingNames = childNamesForPassengers(boardings);
                          const dropoffNames = childNamesForPassengers(dropoffs);
                          return (
                          <div key={si} style={{ padding: "8px 12px", background: "#f9f7ff", border: "1px solid #e9e0f8", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: "#1e1040" }}>{stop.city || "Ville inconnue"}</div>
                            {(stop.arrivalTime || stop.departureTime) && (
                              <div style={{ color: "#7c3aed", marginTop: 2, fontSize: 12 }}>
                                {stop.arrivalTime && `Arr. ${stop.arrivalTime}`}
                                {stop.departureTime && ` · Dép. ${stop.departureTime}`}
                              </div>
                            )}
                            {stop.meetingPoint && <div style={{ color: "#64748b", marginTop: 2, fontSize: 12 }}>RDV : {stop.meetingPoint}</div>}
                            {boardings.length > 0 && (
                              <div style={{ marginTop: 7, padding: "7px 9px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, color: "#1d4ed8", fontSize: 12 }}>
                                <strong>{isAller ? "↑ Montent ici" : "Prise en charge au centre"} ({countChildren(boardings)}) :</strong>{" "}
                                {boardingNames.join(", ") || "Noms à compléter"}
                              </div>
                            )}
                            {dropoffs.length > 0 && (
                              <div style={{ marginTop: 7, padding: "7px 9px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 7, color: "#b45309", fontSize: 12 }}>
                                <strong>↓ Descendent ici ({countChildren(dropoffs)}) :</strong>{" "}
                                {dropoffNames.join(", ") || "Noms à compléter"}
                              </div>
                            )}
                          </div>
                          );
                        })}
                        {finalDropoffs.length > 0 && (
                          <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: "#166534" }}>{seg.to}</div>
                            <div style={{ marginTop: 3, color: "#166534", fontSize: 12 }}>
                              <strong>↓ Descendent ici ({countChildren(finalDropoffs)}) :</strong>{" "}
                              {childNamesForPassengers(finalDropoffs).join(", ") || "Noms à compléter"}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Children at this stop */}
                    {stopPassengers.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", marginBottom: 8 }}>
                          {isAller || transport.sharedConnection ? "Enfants à prendre en charge" : "Enfants qui descendent / à remettre aux familles"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {stopPassengers.map((p, pi) => {
                            const children = p.children?.length
                              ? p.children
                              : [{ firstName: p.childName, lastName: "" }];
                            return (
                              <div key={pi} style={{
                                padding: "10px 12px", background: "#fff",
                                border: "1.5px solid #e9e0f8", borderRadius: 10,
                              }}>
                                <div style={{ fontWeight: 800, fontSize: 14, color: "#1e1040" }}>
                                  {children.map((c) => childFullName(c)).filter(Boolean).join(", ") || p.childName || "—"}
                                </div>
                                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#B8336A" }}>
                                  Séjour : {p.stayCode || shortStayCode(p.sejourName)}{p.dropoffCity ? ` · Descente ${p.dropoffCity}` : ""}
                                </div>
                                <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                                  <strong>{p.nom}</strong>
                                </div>
                                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                                  <a
                                    href={`tel:${(p.phone || "").replace(/\s/g, "")}`}
                                    style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600, textDecoration: "none" }}
                                  >
                                    📞 {p.phone || "—"}
                                  </a>
                                  {p.numeroDeReservation && (
                                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                                      {p.numeroDeReservation}
                                    </span>
                                  )}
                                </div>
                                {/* Children birth dates */}
                                {children.some((c) => c.birthDate) && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                                    {children.filter((c) => c.birthDate).map((c, ci) => (
                                      <span key={ci}>
                                        {childFullName(c)} — né·e le{" "}
                                        {new Date(c.birthDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                                      </span>
                                    )).reduce((acc, el, ci) => ci === 0 ? [el] : [...acc, " · ", el], [])}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {stopPassengers.length === 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                        Aucun enfant affecté à cet arrêt.
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {/* ── Tickets ── */}
        {myTickets.length > 0 && (
          <>
            <SectionTitle color="#0891b2">Billets de transport ({myTickets.length})</SectionTitle>
            <Collapse title={`${myTickets.length} billet${myTickets.length > 1 ? "s" : ""} de transport`} icon="🎫" defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myTickets.map((ticket, i) => (
                <div key={ticket.id || i} style={{
                  padding: "14px 16px", background: "#f0f9ff",
                  border: "1.5px solid #bae6fd", borderRadius: 12,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#0c4a6e" }}>{ticket.name || "Billet"}</div>
                  <div style={{ fontSize: 12, color: "#0369a1", marginTop: 3 }}>
                    {ticketSegmentLabel(ticket, transport.segments || [])}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                    {ticket.departureTime && (
                      <span style={{ fontSize: 13, color: "#0c4a6e", fontWeight: 600 }}>🕐 Dép. {ticket.departureTime}</span>
                    )}
                    {ticket.arrivalTime && (
                      <span style={{ fontSize: 13, color: "#0c4a6e", fontWeight: 600 }}>🏁 Arr. {ticket.arrivalTime}</span>
                    )}
                    {ticket.seats > 0 && (
                      <span style={{ fontSize: 13, color: "#0c4a6e" }}>💺 {ticket.seats} place{ticket.seats > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {ticket.bookingReference && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", fontFamily: "monospace", background: "#e0f2fe", display: "inline-block", padding: "2px 8px", borderRadius: 4 }}>
                      Réf : {ticket.bookingReference}
                    </div>
                  )}
                  {ticket.url && (
                    <a
                      href={ticket.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        marginTop: 12, padding: "9px 18px",
                        background: "#0891b2", color: "#fff",
                        borderRadius: 8, textDecoration: "none",
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      📄 Ouvrir le PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
            </Collapse>
          </>
        )}

        {/* ── Consignes (collapsible) ── */}
        <SectionTitle color="#92400e">Consignes</SectionTitle>
        <Collapse title="Consignes convoyage ColoCrew" icon="📋" defaultOpen={false}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Consignes :</p>
          <ul style={{ paddingLeft: 18, margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 7 }}>
            {CONSIGNES_ITEMS.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{item}</li>
            ))}
          </ul>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Communication :</p>
          <ul style={{ paddingLeft: 18, margin: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            {COMMUNICATION_ITEMS.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{item}</li>
            ))}
          </ul>
        </Collapse>

        {/* ── All passengers (collapsible) ── */}
        <SectionTitle color="#374151">
          Tous les passagers ({totalChildren} enfant{totalChildren > 1 ? "s" : ""})
        </SectionTitle>
        <Collapse title={`Liste complète — ${totalChildren} enfant${totalChildren > 1 ? "s" : ""}`} icon="👥" defaultOpen={false}>
          {passengerGroups.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>Aucun passager configuré.</p>
          ) : (
            passengerGroups.map((group, gi) => {
              const groupCount = countChildren(group.passengers);
              return (
                <div key={gi} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em",
                    color: "#B8336A", marginBottom: 8, paddingBottom: 5,
                    borderBottom: "2px solid #f3eef8",
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>{group.city}</span>
                    <span>{groupCount} enfant{groupCount > 1 ? "s" : ""}</span>
                  </div>
                  {group.passengers.map((p, pi) => {
                    const children = p.children?.length
                      ? p.children
                      : [{ firstName: p.childName, lastName: "" }];
                    return (
                      <div key={pi} style={{
                        padding: "9px 0", borderBottom: pi < group.passengers.length - 1 ? "1px solid #f5f3ff" : "none",
                        display: "flex", gap: 10, alignItems: "flex-start",
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: "#f3eef8", color: "#7c3aed",
                          fontSize: 11, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, marginTop: 2,
                        }}>
                          {pi + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e1040" }}>
                            {children.map((c) => childFullName(c)).filter(Boolean).join(", ") || p.childName || "—"}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: "#B8336A" }}>
                            Séjour : {p.stayCode || shortStayCode(p.sejourName)}{p.dropoffCity ? ` · Descente ${p.dropoffCity}` : ""}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                            {p.nom} ·{" "}
                            <a href={`tel:${(p.phone || "").replace(/\s/g, "")}`} style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
                              {p.phone || "—"}
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </Collapse>

        {/* ── Emergency contacts ── */}
        <SectionTitle color="#b91c1c">Urgences</SectionTitle>
        <div style={{
          padding: "16px 18px", background: "#fef2f2",
          border: "1.5px solid #fecaca", borderRadius: 14, marginBottom: 20,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#b91c1c", marginBottom: 12 }}>
            🚨 Contacts d&apos;urgence ColoCrew
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {EMERGENCY_PHONES.map((p) => (
              <a
                key={p.number}
                href={`tel:${p.number}`}
                style={callBtn}
              >
                📞 {p.display}
              </a>
            ))}
          </div>
          {(transport.emergencyContact || transport.emergencyPhone) && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(185,28,28,0.08)", borderRadius: 8, fontSize: 13, color: "#991b1b" }}>
              <strong>{transport.emergencyContact || "Urgence"}</strong>
              {transport.emergencyPhone && ` · ${transport.emergencyPhone}`}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        {transport.notes && (
          <>
            <SectionTitle color="#64748b">Notes du trajet</SectionTitle>
            <div style={{
              padding: "14px 16px", background: "#fff7ed",
              border: "1.5px solid #fed7aa", borderRadius: 12, marginBottom: 20,
              fontSize: 13, color: "#78350f", lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {transport.notes}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrap = {
  maxWidth: 460,
  margin: "0 auto",
  padding: "28px 16px 60px",
};

const logo = {
  fontSize: 30,
  fontWeight: 900,
  color: "#B8336A",
  letterSpacing: "-0.02em",
};

const stepTitle = {
  margin: "0 0 22px",
  fontSize: 22,
  fontWeight: 900,
  color: "#1e1040",
  letterSpacing: "-0.01em",
};

const callBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "11px 20px",
  background: "#b91c1c",
  color: "#fff",
  borderRadius: 100,
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 700,
  boxShadow: "0 4px 12px rgba(185,28,28,0.3)",
};

// ─── Page export ──────────────────────────────────────────────────────────────

export default function ConvoyagePage() {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [week, setWeek] = useState(null);
  const [transportId, setTransportId] = useState(null);
  const [staffId, setStaffId] = useState(null);

  useEffect(() => {
    let rawTransports = [];
    let reservations = [];
    let transportsReady = false;
    let reservationsReady = false;
    const sync = () => {
      if (!transportsReady || !reservationsReady) return;
      setTransports(rawTransports.map((transport) => hydrateTransportPassengers(transport, reservations)));
      setLoading(false);
    };
    const onError = (error) => {
      console.error(error);
      setLoading(false);
    };
    const unsubscribeTransports = onSnapshot(
      query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "asc")),
      (snapshot) => {
        rawTransports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        transportsReady = true;
        sync();
      },
      onError,
    );
    const unsubscribeReservations = onSnapshot(
      collection(db, COLLECTIONS.RESERVATIONS),
      (snapshot) => {
        reservations = snapshot.docs.map(mapReservationPassenger);
        reservationsReady = true;
        sync();
      },
      onError,
    );
    return () => {
      unsubscribeTransports();
      unsubscribeReservations();
    };
  }, []);

  const weekTransports = useMemo(
    () => transports.filter((t) => t.week === week && normalizePlace(t.status || "") !== "annule"),
    [transports, week],
  );

  const selectedTransport = useMemo(
    () => transports.find((t) => t.id === transportId) || null,
    [transports, transportId],
  );

  const selectedStaff = useMemo(
    () => staffId === "__all__"
      ? { id: "__all__", name: "Équipe", role: "Vue complète" }
      : (selectedTransport?.staff || []).find((m) => m.id === staffId) || null,
    [selectedTransport, staffId],
  );

  const mySegments = useMemo(() => {
    if (!selectedTransport || !selectedStaff) return [];
    return orderedTransportPortions(selectedTransport)
      .filter((seg) => selectedStaff.id === "__all__" || (seg.assignedStaffIds || []).includes(selectedStaff.id));
  }, [selectedTransport, selectedStaff]);

  const myTickets = useMemo(() => {
    if (!selectedTransport || !mySegments.length) return [];
    const ids = new Set(mySegments.map((s) => s.id).filter(Boolean));
    return (selectedTransport.tickets || []).filter((t) => t.purchased && t.segmentId && ids.has(t.segmentId));
  }, [selectedTransport, mySegments]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 16px", color: "#94a3b8", fontSize: 15 }}>
        Chargement en cours…
      </div>
    );
  }

  if (!week) return <StepWeek onSelect={setWeek} />;

  if (!transportId) {
    return (
      <StepTransport
        week={week}
        transports={weekTransports}
        weekInfo={WEEK_INFO[week]}
        onBack={() => setWeek(null)}
        onSelect={setTransportId}
      />
    );
  }

  if (!staffId) {
    return (
      <StepStaff
        transport={selectedTransport}
        weekInfo={WEEK_INFO[week]}
        onBack={() => setTransportId(null)}
        onSelect={setStaffId}
      />
    );
  }

  return (
    <BriefingView
      transport={selectedTransport}
      staff={selectedStaff}
      mySegments={mySegments}
      myTickets={myTickets}
      weekInfo={WEEK_INFO[week]}
      onBack={() => setStaffId(null)}
    />
  );
}
