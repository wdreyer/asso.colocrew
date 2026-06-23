"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc, collection, deleteDoc, doc, getDoc,
  getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Badge from "@/src/components/dashboard/ui/Badge";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { ReservationPanel, mapReservation } from "@/src/components/dashboard/Reservations";

/* Constants */

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
  S1: { label: "Semaine 1", dates: "6 - 17 juil.",  aller: "2026-07-06", retour: "2026-07-17" },
  S2: { label: "Semaine 2", dates: "20 - 31 juil.", aller: "2026-07-20", retour: "2026-07-31" },
  S3: { label: "Semaine 3", dates: "3 - 14 août",   aller: "2026-08-03", retour: "2026-08-14" },
  S4: { label: "Semaine 4", dates: "17 - 28 août",  aller: "2026-08-17", retour: "2026-08-28" },
};

const STATUS_CFG = {
  brouillon: { label: "Brouillon",  variant: "neutral"  },
  "confirmé":  { label: "Confirmé",   variant: "success"  },
  "annulé":    { label: "Annulé",     variant: "error"    },
};

const EMERGENCY_PHONES = ["06 87 91 68 97", "06 11 91 37 64"];
const CC_EMAIL = "equipe@colocrew.com";

/* Utilities */

/** Strips week/route info from sejourName: "Été 2026 - S1 - Convoi Sud" -> "Été 2026" */
function shortSejourName(name) {
  if (!name || name === "") return name;
  return name.replace(/\s*-\s*S[1-4]\b.*$/i, "").trim() || name;
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

function tsToMs(v) {
  if (v?.toMillis) return v.toMillis();
  if (typeof v === "number") return v;
  const p = Date.parse(String(v || ""));
  return Number.isNaN(p) ? 0 : p;
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtDateLong(iso) {
  if (!iso) return "-";
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

function cityStopDocId(value) {
  return normalizePlace(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ville";
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isOnSiteTransportCity(value) {
  const normalized = normalizePlace(value);
  return !normalized || normalized === "sur place";
}

function normalizeSearchKey(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function editDistance(a, b) {
  const left = normalizeSearchKey(a);
  const right = normalizeSearchKey(b);
  if (!left || !right) return Math.max(left.length, right.length);
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        prevDiagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      prevDiagonal = temp;
    }
  }
  return previous[right.length];
}

function childFullName(child) {
  return `${child?.firstName || ""} ${child?.lastName || ""}`.trim();
}

function legalPassengerName(legal, children = []) {
  const name = `${legal?.firstName || legal?.prenom || ""} ${legal?.lastName || legal?.nom || ""}`.trim();
  if (!name) return "";
  const childNames = children.map(childFullName).filter(Boolean);
  return childNames.some((childName) => normalizeSearchText(childName) === normalizeSearchText(name)) ? "" : name;
}

function reservationSearchNames(reservation) {
  const children = reservation.children?.length ? reservation.children : [{ firstName: reservation.childName, lastName: "" }];
  return [
    reservation.childName,
    reservation.nom,
    ...children.map(childFullName),
  ].filter(Boolean);
}

function passengerSearchNames(passenger) {
  const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
  return [
    passenger.childName,
    passenger.nom,
    ...children.map(childFullName),
  ].filter(Boolean);
}

function scoreReservationMatch(target, reservation, transport) {
  if (!target || !reservation) return 0;
  let score = 0;
  if (target.reservationId && target.reservationId === reservation.id) score += 200;
  if (
    target.numeroDeReservation
    && reservation.numeroDeReservation
    && normalizeSearchKey(target.numeroDeReservation) === normalizeSearchKey(reservation.numeroDeReservation)
  ) score += 160;
  if (transport?.week && reservation.week === transport.week) score += 25;
  const targetCity = transport?.direction === "aller" ? target.departureCity : target.returnCity;
  const reservationCity = transport?.direction === "aller" ? reservation.departureCity : reservation.returnCity;
  if (targetCity && reservationCity && normalizePlace(targetCity) === normalizePlace(reservationCity)) score += 15;

  const targetNames = passengerSearchNames(target);
  const reservationNames = reservationSearchNames(reservation);
  for (const left of targetNames) {
    for (const right of reservationNames) {
      const leftKey = normalizeSearchKey(left);
      const rightKey = normalizeSearchKey(right);
      if (!leftKey || !rightKey) continue;
      if (leftKey === rightKey) score += 120;
      else if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) score += 80;
      else {
        const distance = editDistance(leftKey, rightKey);
        const tolerance = Math.max(1, Math.floor(Math.max(leftKey.length, rightKey.length) * 0.24));
        if (distance <= tolerance) score += 65 - distance * 8;
      }
    }
  }
  return score;
}

function resolveReservationFromPassenger(target, reservations, transport) {
  if (!target) return null;
  const exactId = target.reservationId && reservations.find((reservation) => reservation.id === target.reservationId);
  if (exactId) return exactId;
  const exactReference = target.numeroDeReservation && reservations.find((reservation) =>
    normalizeSearchKey(reservation.numeroDeReservation) === normalizeSearchKey(target.numeroDeReservation),
  );
  if (exactReference) return exactReference;
  const scored = reservations
    .map((reservation) => ({ reservation, score: scoreReservationMatch(target, reservation, transport) }))
    .filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored[1] && scored[0].score - scored[1].score < 15) return null;
  return scored[0].reservation;
}

function reservationMatchesQuery(reservation, query) {
  const q = normalizeSearchKey(query);
  if (!q) return true;
  const values = [
    reservation.numeroDeReservation,
    reservation.sejourName,
    reservation.week,
    reservation.departureCity,
    reservation.returnCity,
    ...reservationSearchNames(reservation),
  ].filter(Boolean);
  return values.some((value) => {
    const key = normalizeSearchKey(value);
    if (!key) return false;
    if (key.includes(q) || q.includes(key)) return true;
    const distance = editDistance(key, q);
    const tolerance = Math.max(1, Math.floor(Math.max(key.length, q.length) * 0.26));
    return distance <= tolerance;
  });
}

function passengerCity(transport, passenger) {
  return passenger.pickupCity
    || (transport.direction === "aller" ? passenger.departureCity : passenger.returnCity)
    || "Ville à préciser";
}

function segmentStopCity(transport, segment) {
  return transport.direction === "retour" ? segment?.to : segment?.from;
}

function segmentSubStops(segment) {
  return Array.isArray(segment?.stops) ? segment.stops : [];
}

function segmentStopType(segment) {
  return segment?.stopType || "rdv";
}

function stopTypeLabel(segment) {
  return segmentStopType(segment) === "quai" ? "Quai uniquement" : "RDV organisé";
}

function segmentMeetingLabel(segment) {
  if (segmentStopType(segment) === "quai") {
    return [
      segment.meetingPoint || "",
      segment.platform ? `Quai / voie ${segment.platform}` : "",
    ].filter(Boolean).join(" · ") || "Sur le quai";
  }
  return segment.meetingPoint || "Point de rendez-vous à compléter";
}

function transportStopCities(transport) {
  const cities = new Set();
  (transport.segments || []).forEach((segment) => {
    [segment.from, segment.to].filter(Boolean).forEach((city) => cities.add(city));
    segmentSubStops(segment).forEach((stop) => stop.city && cities.add(stop.city));
  });
  if (transport.departureCity) cities.add(transport.departureCity);
  if (transport.arrivalCity) cities.add(transport.arrivalCity);
  return [...cities];
}

function routeBoardingStops(transport) {
  const stops = [];
  (transport.segments || []).forEach((segment, segmentIndex) => {
    const addMainStop = () => {
      const mainCity = segmentStopCity(transport, segment);
      if (!mainCity) return;
      stops.push({
        city: mainCity,
        segment,
        segmentIndex,
        stopIndex: -1,
        type: "main",
        order: stops.length,
      });
    };
    const addSubStops = () => {
      segmentSubStops(segment).forEach((stop, stopIndex) => {
        if (!stop.city) return;
        stops.push({
          city: stop.city,
          segment,
          segmentIndex,
          stopIndex,
          stop,
          type: "sub",
          order: stops.length,
        });
      });
    };
    if (transport.direction === "retour") {
      addSubStops();
      addMainStop();
      return;
    }
    addMainStop();
    addSubStops();
  });
  return stops;
}

function routeStopTime(stop, transport, kind = "arrival") {
  if (!stop) return "";
  if (stop.type === "sub") {
    return kind === "departure"
      ? stop.stop?.departureTime || stop.stop?.arrivalTime || ""
      : stop.stop?.arrivalTime || stop.stop?.departureTime || "";
  }
  if (transport?.direction === "retour") {
    return stop.segment?.arrivalTime || stop.segment?.departureTime || "";
  }
  return kind === "departure"
    ? stop.segment?.departureTime || ""
    : stop.segment?.arrivalTime || "";
}

function routeStopMeetingPoint(stop) {
  if (!stop) return "";
  return stop.type === "sub" ? segmentMeetingLabel(stop.stop) : segmentMeetingLabel(stop.segment);
}

function stopActionLabel(transport) {
  return transport.direction === "retour" ? "Descendent ici" : "Montent ici";
}

function stopActionText(transport, city) {
  return transport.direction === "retour"
    ? `Descendent à ${city || "cette étape"}`
    : `Montent à ${city || "cette étape"}`;
}

function routeStopForCity(transport, city) {
  const normalizedCity = normalizePlace(city);
  if (!normalizedCity) return null;
  return routeBoardingStops(transport).find((stop) => normalizePlace(stop.city) === normalizedCity) || null;
}

function passengerRouteStop(transport, passenger) {
  return routeStopForCity(transport, passengerCity(transport, passenger));
}

function passengersAfterStop(transport, stopOrder) {
  return (transport.passengers || []).filter((passenger) => {
    const boarding = passengerBoardingStop(transport, passenger);
    if (!boarding) return false;
    return transport.direction === "retour"
      ? boarding.order > stopOrder
      : boarding.order <= stopOrder;
  });
}

function stopRowsForSegment(transport, segment, index) {
  const mainStop = routeBoardingStops(transport).find((stop) =>
    stop.type === "main" && stop.segmentIndex === index,
  );
  const subStops = segmentSubStops(segment).map((stop, stopIndex) => ({
    stop,
    stopIndex,
    routeStop: routeBoardingStops(transport).find((item) =>
      item.type === "sub" && item.segmentIndex === index && item.stopIndex === stopIndex,
    ),
  }));
  return transport.direction === "retour"
    ? [...subStops, { stop: null, stopIndex: -1, routeStop: mainStop }]
    : [{ stop: null, stopIndex: -1, routeStop: mainStop }, ...subStops];
}

function passengerBoardingStop(transport, passenger) {
  const city = normalizePlace(passengerCity(transport, passenger));
  if (!city) return null;
  return routeStopForCity(transport, city);
}

function passengerStopSegment(transport, passenger) {
  return passengerBoardingStop(transport, passenger)?.segment || null;
}

function cityStopSegment(transport, city) {
  const normalizedCity = normalizePlace(city);
  if (!normalizedCity) return null;
  return routeBoardingStops(transport).find((stop) => normalizePlace(stop.city) === normalizedCity)?.segment || null;
}

function isQuaiCity(transport, city) {
  const normalizedCity = normalizePlace(city);
  const stop = routeBoardingStops(transport).find((item) => normalizePlace(item.city) === normalizedCity);
  if (stop?.type === "sub") return segmentStopType(stop.stop) === "quai";
  return segmentStopType(stop?.segment) === "quai";
}

function cityRouteOrder(transport, city) {
  const normalizedCity = normalizePlace(city);
  const stop = routeBoardingStops(transport).find((item) => normalizePlace(item.city) === normalizedCity);
  if (!stop) return Number.MAX_SAFE_INTEGER;
  return stop.order;
}

function groupPassengersByCity(transport, passengers = transport.passengers || []) {
  const groups = new Map();
  passengers.forEach((passenger) => {
    const city = passengerCity(transport, passenger);
    const key = normalizePlace(city) || "ville-a-preciser";
    if (!groups.has(key)) groups.set(key, { city, passengers: [] });
    groups.get(key).passengers.push(passenger);
  });
  return [...groups.values()].sort((a, b) => {
    const order = cityRouteOrder(transport, a.city) - cityRouteOrder(transport, b.city);
    if (order !== 0) return order;
    return a.city.localeCompare(b.city, "fr", { sensitivity: "base" });
  });
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
    normalizePlace(passengerCity(transport, passenger)) === normalizedCity,
  );
}

function passengersBeforeStop(transport, stopOrder) {
  return (transport.passengers || []).filter((passenger) => {
    const boarding = passengerBoardingStop(transport, passenger);
    if (!boarding) return false;
    return transport.direction === "retour"
      ? boarding.order >= stopOrder
      : boarding.order < stopOrder;
  });
}

function passengersOnSegment(transport, segmentIndex) {
  const segments = transport.segments || [];
  if (!segments[segmentIndex]) return [];

  return (transport.passengers || []).filter((passenger) => {
    const boarding = passengerBoardingStop(transport, passenger);
    if (!boarding) return false;
    return transport.direction === "retour"
      ? segmentIndex <= boarding.segmentIndex
      : segmentIndex >= boarding.segmentIndex;
  });
}

function purchasedTicketsForSegment(tickets, segmentId) {
  return (tickets || []).filter((ticket) => ticket.segmentId === segmentId && ticket.purchased);
}

function ticketsLinkedToSegments(transport) {
  const segmentIds = new Set((transport.segments || []).map((segment) => segment.id).filter(Boolean));
  return (transport.tickets || []).filter((ticket) => ticket.segmentId && segmentIds.has(ticket.segmentId));
}

function segmentRouteLabel(segment) {
  return `${segment?.from || "Départ"} → ${segment?.to || "Arrivée"}`;
}

function transportRouteLabel(transport) {
  return `${transport?.departureCity || "Départ"} → ${transport?.arrivalCity || "Arrivée"}`;
}

function directionIcon(direction) {
  return direction === "retour" ? "↓" : "↑";
}

function requiredSeatsForSegment(transport, segment, segmentIndex) {
  if (!segment) return 0;
  return countChildren(passengersOnSegment(transport, segmentIndex)) + (segment.assignedStaffIds || []).length;
}

function purchasedSeatsForSegmentTickets(tickets) {
  return (tickets || [])
    .filter((ticket) => ticket.purchased)
    .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
}

function missingSeatsForSegment(transport, segment, segmentIndex, segmentTickets = []) {
  const neededSeats = requiredSeatsForSegment(transport, segment, segmentIndex);
  const purchasedSeats = purchasedSeatsForSegmentTickets(segmentTickets);
  return Math.max(0, neededSeats - purchasedSeats);
}

function normalizeSegmentLabel(value) {
  return normalizePlace(String(value || "").replace(/\s*(?:→|>)\s*/g, ">"));
}

function displayTicketForSegment(ticket, transport, segment, segmentIndex, segmentTickets = []) {
  if (!ticket || ticket.purchased || !segment) return ticket;
  if (ticket.segmentLabel && normalizeSegmentLabel(ticket.segmentLabel) !== normalizeSegmentLabel(segmentRouteLabel(segment))) {
    return ticket;
  }
  const missingSeats = missingSeatsForSegment(transport, segment, segmentIndex, segmentTickets);
  if (missingSeats <= 0) return ticket;
  return {
    ...ticket,
    seats: missingSeats,
    name: `À vérifier - ${missingSeats} place${missingSeats > 1 ? "s" : ""} manquante${missingSeats > 1 ? "s" : ""} - ${segmentRouteLabel(segment)}`,
  };
}

function ticketRowsForTransport(transport, { includeMissingSegments = true } = {}) {
  const segments = transport.segments || [];
  const linkedTickets = ticketsLinkedToSegments(transport);
  const rows = linkedTickets.map((ticket) => {
    const segmentIndex = segments.findIndex((segment) => segment.id === ticket.segmentId);
    const seg = segmentIndex >= 0 ? segments[segmentIndex] : null;
    const segmentTickets = seg ? linkedTickets.filter((item) => item.segmentId === seg.id) : [];
    return {
      type: "ticket",
      ticket: displayTicketForSegment(ticket, transport, seg, segmentIndex, segmentTickets),
      transport,
      seg,
    };
  });

  if (!includeMissingSegments) return rows;

  segments.forEach((segment, segmentIndex) => {
    const segmentTickets = linkedTickets.filter((ticket) => ticket.segmentId === segment.id);
    const hasPendingTicket = segmentTickets.some((ticket) => !ticket.purchased);
    const purchasedSeats = purchasedSeatsForSegmentTickets(segmentTickets);
    const neededSeats = requiredSeatsForSegment(transport, segment, segmentIndex);
    if (neededSeats <= 0) return;
    if (segmentTickets.length > 0 && (purchasedSeats >= neededSeats || hasPendingTicket)) return;

    rows.push({
      type: "segment-missing-ticket",
      transport,
      seg: segment,
      ticket: {
        id: `segment-missing-${transport.id}-${segment.id}`,
        name: `Billet à acheter - ${segmentRouteLabel(segment)}`,
        segmentId: segment.id,
        seats: Math.max(1, neededSeats - purchasedSeats),
        price: "",
        departureTime: segment.departureTime || "",
        arrivalTime: segment.arrivalTime || "",
        bookingReference: "",
        purchased: false,
        url: "",
        virtual: true,
      },
    });
  });

  return rows;
}

function ticketUsedSeats(ticket, segmentPassengers = [], segmentStaff = []) {
  if (!ticket?.purchased) return 0;
  const seats = Number(ticket.seats || 0);
  const coveredIds = new Set(ticket.coveredReservationIds || []);
  const isSharedTicket = seats > 1;
  if (coveredIds.size > 0) {
    const coveredChildren = countChildren(segmentPassengers.filter((passenger) => coveredIds.has(passenger.reservationId)));
    const coveredStaff = isSharedTicket ? Math.min(segmentStaff.length, Math.max(0, seats - coveredChildren)) : 0;
    return Math.min(seats, coveredChildren + coveredStaff);
  }
  const usedChildren = countChildren(segmentPassengers);
  const usedStaff = isSharedTicket ? segmentStaff.length : 0;
  return Math.min(seats, usedChildren + usedStaff);
}

function ticketFreeSeats(ticket, segmentPassengers = [], segmentStaff = []) {
  if (!ticket?.purchased) return 0;
  return Math.max(0, Number(ticket.seats || 0) - ticketUsedSeats(ticket, segmentPassengers, segmentStaff));
}

function ticketSegmentLabel(ticket, segments) {
  if (ticket?.segmentLabel) return String(ticket.segmentLabel).replace(/\s*>\s*/g, " → ");
  const segment = (segments || []).find((item) => item.id === ticket.segmentId);
  return segment ? segmentRouteLabel(segment) : "";
}

function accountingTicketLabel(ticket, transport) {
  const segmentLabel = ticketSegmentLabel(ticket, transport.segments || []);
  const directionLabel = transport.direction === "retour" ? "Retour" : "Aller";
  return `${segmentLabel || transportRouteLabel(transport)} (${directionLabel} ${fmtDate(transport.date)})`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatDurationFromMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

function durationBetween(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes == null || endMinutes == null) return "";
  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;
  return formatDurationFromMinutes(diff);
}

function timelineActionInfo(transport, city, { isFirst = false } = {}) {
  if (transport.direction === "retour" && isFirst) {
    const count = countChildren(transport.passengers || []);
    return count > 0 ? { label: "À bord", count, tone: "neutral" } : null;
  }
  const count = countChildren(passengersAtStop(transport, city));
  if (!count) return null;
  return {
    label: transport.direction === "retour" ? "Descendent" : "Montent",
    count,
    tone: transport.direction === "retour" ? "down" : "up",
  };
}

function mapTransport(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    sejourName:      d.sejourName      || "-",
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

function mapCityStop(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    city: d.city || "",
    meetingPoint: d.meetingPoint || "",
    meetingTime: d.meetingTime || "",
    platform: d.platform || "",
    stopType: d.stopType || "rdv",
    instructions: d.instructions || "",
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
  const legalName = legalPassengerName(legal, children);
  return {
    id:   snap.id,
    numeroDeReservation: d.numeroDeReservation || "",
    nom:  legalName,
    email: legal.email || "-",
    phone: legal.phone || "-",
    children,
    childName: `${first.firstName || ""} ${first.lastName || ""}`.trim() || "-",
    sejourName:    sejour.name       || "-",
    sejourStartDate: sejour.startDate || "",
    week: weekFromStartDate(sejour.startDate),
    departureCity: transport.departureCity || "",
    returnCity:    transport.returnCity    || "",
    transportAmount: Number(finance.transportAmount ?? transport.fee ?? 0) || 0,
    financeNetAmount: Number(finance.netAmount || 0) || 0,
    financeStayAmount: Number(finance.stayAmount || 0) || 0,
    status: d.status || "pending",
    convocationSent: Boolean(d.convocationSent),
    convocationSentAt: d.convocationSentAt || null,
    isImported2026: d.validationSource === "ete26_validated_workbook",
    childCount: Math.max(children.length, 1),
  };
}

function compactTransportPassengers(passengers = []) {
  return passengers
    .filter((passenger) => passenger?.reservationId)
    .map((passenger) => {
      const entry = { reservationId: passenger.reservationId };
      if (passenger.pickupCity) entry.pickupCity = passenger.pickupCity;
      if (typeof passenger.convocationSent === "boolean") entry.convocationSent = passenger.convocationSent;
      if (passenger.convocationSentAt) entry.convocationSentAt = passenger.convocationSentAt;
      return entry;
    });
}

function hydrateTransportPassenger(passenger, reservation, transport) {
  if (!reservation) return passenger;
  return {
    ...passenger,
    numeroDeReservation: reservation.numeroDeReservation,
    nom: reservation.nom || "",
    email: reservation.email || "",
    phone: reservation.phone || "",
    children: reservation.children || [],
    childName: reservation.childName || "",
    sejourName: reservation.sejourName || "",
    departureCity: reservation.departureCity || "",
    returnCity: reservation.returnCity || "",
    transportAmount: reservation.transportAmount || 0,
    financeNetAmount: reservation.financeNetAmount || 0,
    financeStayAmount: reservation.financeStayAmount || 0,
    status: reservation.status,
    convocationSent: Boolean(reservation.convocationSent ?? passenger.convocationSent),
    convocationSentAt: reservation.convocationSentAt || passenger.convocationSentAt || null,
    pickupCity: passenger.pickupCity || (transport.direction === "retour" ? reservation.returnCity : reservation.departureCity) || "",
  };
}

function hydrateTransportPassengers(transport, reservations = []) {
  const byId = reservations instanceof Map ? reservations : new Map(reservations.map((reservation) => [reservation.id, reservation]));
  return {
    ...transport,
    passengers: (transport.passengers || []).map((passenger) =>
      hydrateTransportPassenger(passenger, byId.get(passenger.reservationId), transport),
    ),
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

/* Document generators. All return an HTML string opened in a new window for print/PDF. */

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
      const childStr = children.length > 0 ? children.map(c => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join("<br>") : (p.childName || "-");
      const birthStr = children.length > 0 ? children.map(c => fmtBirthDate(c.birthDate) || "-").join("<br>") : "-";
      return `<tr>
        <td style="text-align:center;font-weight:800;color:${dirColor}">${rowNumber}</td>
        <td><strong>${p.nom}</strong></td>
        <td><strong>${p.phone}</strong></td>
        <td>${childStr}</td>
        <td>${birthStr}</td>
        <td style="font-family:monospace;font-size:11.5px;color:#888">${p.numeroDeReservation || "-"}</td>
        <td style="text-align:center;font-size:16px">→</td>
      </tr>`;
    }).join("")}
  `).join("") || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa;font-style:italic">Aucun passager assigné</td></tr>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Liste passagers - ${transport.sejourName}</title>
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
      <div style="color:${dirColor};font-weight:800">${dirLabel} - ${transport.sejourName}</div>
      <div>Édité le ${today}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card"><div class="ic-label">Trajet</div><div class="ic-val">${transport.departureCity || "-"} → ${transport.arrivalCity || "-"}</div></div>
    <div class="info-card"><div class="ic-label">Date</div><div class="ic-val">${fmtDateLong(transport.date)}</div></div>
    <div class="info-card"><div class="ic-label">Train</div><div class="ic-val">${transport.trainType || ""} ${transport.trainNumber || ""}</div></div>
    <div class="info-card"><div class="ic-label">Départ / Arrivée</div><div class="ic-val">${transport.departureTime || "-"} → ${transport.arrivalTime || "-"}</div></div>
    <div class="info-card"><div class="ic-label">Point de RDV</div><div class="ic-val">${transport.meetingPoint || transport.departureCity || "-"}</div>${transport.meetingTime ? `<div class="ic-sub">RDV à ${transport.meetingTime}</div>` : ""}${transport.platform ? `<div class="ic-sub">Voie ${transport.platform}</div>` : ""}</div>
    <div class="info-card"><div class="ic-label">Convoyeur</div><div class="ic-val">${transport.convoyeur || "-"}</div>${transport.convoyeurPhone ? `<div class="ic-sub">${transport.convoyeurPhone}</div>` : ""}</div>
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
  <div class="print-btn"><button onclick="window.print()">Imprimer / Télécharger PDF</button></div>
</body></html>`;
}

function buildGroupConvocHTML(transport) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const isAller   = transport.direction === "aller";
  const dirColor  = isAller ? "#16a34a" : "#ea580c";
  const dirBg     = isAller ? "#f0fdf4" : "#fff7ed";
  const dirLabel  = isAller ? "↑ ALLER" : "↓ RETOUR";
  const weekInfo  = WEEK_INFO[transport.week] || null;
  const sejourDates = weekInfo ? `du ${weekInfo.aller ? fmtDateLong(weekInfo.aller) : "?"} au ${weekInfo.retour ? fmtDateLong(weekInfo.retour) : "?"}` : "";

  /* Retour trips: generate a simple arrival notice */
  if (!isAller) {
    const sortedPassengers = groupPassengersByCity(transport).flatMap((group) => group.passengers);
    const pages = sortedPassengers.map((p, idx) => {
      const children = p.children || [];
      const city = passengerCity(transport, p);
      const routeStop = passengerRouteStop(transport, p);
      const stopSeg = routeStop?.segment || null;
      const arrivalTime = routeStopTime(routeStop, transport, "arrival") || transport.arrivalTime || "";
      const arrivalCity = routeStop?.city || stopSeg?.to || transport.arrivalCity || "";
      const isQuai = routeStop?.type === "sub" ? segmentStopType(routeStop.stop) === "quai" : segmentStopType(stopSeg) === "quai";
      const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : (stopSeg ? segmentMeetingLabel(stopSeg) : transport.meetingPoint || "");
      const platform = routeStop?.stop?.platform || stopSeg?.platform || transport.platform || "";
      const trainType = routeStop?.stop?.mode || stopSeg?.mode || transport.trainType || "";
      const trainNumber = routeStop?.stop?.number || stopSeg?.number || transport.trainNumber || "";
      const childNames = children.length > 0
        ? children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean).join(", ")
        : (p.childName || "-");
      const isLast = idx === sortedPassengers.length - 1;
      return `<div class="page${isLast ? "" : " pb"}">
        <div class="doc-header">
          <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
          <div class="hdr-right"><div>Réf. <strong>${p.numeroDeReservation || p.reservationId?.slice(0,8) || "-"}</strong></div><div>${today}</div></div>
        </div>
        <div class="doc-title" style="border-color:#ea580c;color:#ea580c">AVIS DE RETOUR</div>
        <div class="dir-badge" style="background:#fff7ed;border-color:#ea580c;color:#ea580c">
          ↓ RETOUR - ${transport.sejourName}${sejourDates ? `<br><span style="font-size:12px;font-weight:600">${sejourDates}</span>` : ""}
        </div>
        <div class="city-badge">ARRIVÉE : ${arrivalCity || city}</div>
        <div class="sec">Participant(s)</div>
        <table><tbody>
          <tr><td>Jeune(s)</td><td><strong>${childNames}</strong></td></tr>
          <tr><td>Responsable</td><td>${p.nom} · <strong>${p.phone}</strong></td></tr>
        </tbody></table>
        <div class="sec">Informations d'arrivée</div>
        <div class="transport-card" style="border-color:#ea580c;background:#fff7ed">
          <div class="tr-row"><span class="tr-lbl">Date</span><strong>${fmtDateLong(transport.date)}</strong></div>
          <div class="tr-row"><span class="tr-lbl">Arrivée prévue</span><strong>${arrivalTime || "À préciser"}</strong> à ${arrivalCity || "-"}</div>
          <div class="tr-row"><span class="tr-lbl">${isQuai ? "Lieu" : "Point de RDV"}</span><strong>${meetingPoint || arrivalCity || "-"}</strong></div>
          ${platform ? `<div class="tr-row"><span class="tr-lbl">Voie / Quai</span><strong>${platform}</strong></div>` : ""}
          ${trainType || trainNumber ? `<div class="tr-row"><span class="tr-lbl">Train</span><strong>${trainType} ${trainNumber}</strong></div>` : ""}
        </div>
        <p style="font-size:13px;color:#555;margin-top:18px;padding:12px;background:#fef9f0;border-left:3px solid #ea580c;border-radius:4px">
          Merci de venir chercher votre enfant à la gare à l'heure indiquée. En cas de retard ou d'imprévu,
          contactez-nous immédiatement.
        </p>
      </div>`;
    });
    if (pages.length === 0) {
      pages.push(`<div class="page"><p style="text-align:center;padding:60px;color:#aaa">Aucun passager assigné à ce transport.</p></div>`);
    }
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Avis de retour - ${transport.sejourName}</title>
<style>${SHARED_CSS}
  .page{max-width:760px;margin:0 auto;padding:36px 32px}
  .pb{page-break-after:always}
  .doc-title{font-size:21px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;text-align:center;border:2px solid;padding:12px 20px;margin:0 0 18px;border-radius:6px}
  .dir-badge{text-align:center;font-weight:800;font-size:13.5px;border:1.5px solid;border-radius:8px;padding:10px;margin-bottom:18px;letter-spacing:0.04em}
  .city-badge{text-align:center;font-weight:900;font-size:14px;color:#5f3374;background:#f3edf9;border-radius:8px;padding:9px 12px;margin:-8px 0 18px}
</style></head><body>
${pages.join("\n")}
<div class="print-btn"><button onclick="window.print()">Imprimer les avis de retour (${transport.passengers.length})</button></div>
</body></html>`;
  }

  /* Aller trips: full convocation */
  const transportCard = `
    <div class="transport-card" style="border-color:${dirColor};background:${dirBg};margin-bottom:4px">
      <div class="tr-row"><span class="tr-lbl">Date</span><strong>${fmtDateLong(transport.date)}</strong></div>
      ${transport.meetingTime ? `<div class="tr-row"><span class="tr-lbl">⏰ Heure de RDV</span><strong>${transport.meetingTime}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">Point de RDV</span><strong>${transport.meetingPoint || transport.departureCity || "-"}</strong></div>
      ${transport.platform ? `<div class="tr-row"><span class="tr-lbl">Voie / Quai</span><strong>${transport.platform}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">Train</span><strong>${transport.trainType || ""} ${transport.trainNumber || ""}</strong></div>
      <div class="tr-row"><span class="tr-lbl">Départ</span><strong>${transport.departureTime || "-"}</strong> depuis ${transport.departureCity || "-"}</div>
      ${transport.arrivalTime ? `<div class="tr-row"><span class="tr-lbl">Arrivée prévue</span><strong>${transport.arrivalTime}</strong> à ${transport.arrivalCity || "-"}</div>` : ""}
    </div>`;

  const transportCardForPassenger = (passenger) => {
    const routeStop = passengerRouteStop(transport, passenger);
    const stopSegment = routeStop?.segment || null;
    if (!stopSegment) return transportCard;
    const stopCity = passengerCity(transport, passenger);
    const isQuai = routeStop?.type === "sub" ? segmentStopType(routeStop.stop) === "quai" : segmentStopType(stopSegment) === "quai";
    const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : segmentMeetingLabel(stopSegment);
    const time = routeStopTime(routeStop, transport, "departure") || stopSegment.meetingTime || transport.meetingTime || "";
    return `
    <div class="transport-card" style="border-color:${dirColor};background:${dirBg};margin-bottom:4px">
      <div class="tr-row"><span class="tr-lbl">Date</span><strong>${fmtDateLong(transport.date)}</strong></div>
      <div class="tr-row"><span class="tr-lbl">Ville</span><strong>${stopCity || "-"}</strong>${isQuai ? " · montée sur le quai" : ""}</div>
      ${time ? `<div class="tr-row"><span class="tr-lbl">Heure</span><strong>${time}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">${isQuai ? "Lieu" : "Point de RDV"}</span><strong>${meetingPoint}</strong></div>
      ${((routeStop?.stop?.platform || stopSegment.platform || transport.platform)) ? `<div class="tr-row"><span class="tr-lbl">Voie / Quai</span><strong>${routeStop?.stop?.platform || stopSegment.platform || transport.platform}</strong></div>` : ""}
      <div class="tr-row"><span class="tr-lbl">Train</span><strong>${routeStop?.stop?.mode || stopSegment.mode || transport.trainType || ""} ${routeStop?.stop?.number || stopSegment.number || transport.trainNumber || ""}</strong></div>
      <div class="tr-row"><span class="tr-lbl">Départ</span><strong>${routeStopTime(routeStop, transport, "departure") || stopSegment.departureTime || transport.departureTime || "-"}</strong> depuis ${stopSegment.from || transport.departureCity || "-"}</div>
      ${(stopSegment.arrivalTime || transport.arrivalTime) ? `<div class="tr-row"><span class="tr-lbl">Arrivée prévue</span><strong>${stopSegment.arrivalTime || transport.arrivalTime}</strong> à ${stopSegment.to || transport.arrivalCity || "-"}</div>` : ""}
    </div>`;
  };

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
      : `<tr><td>Jeune</td><td><strong>${p.childName || "-"}</strong></td></tr>`;

    const city = passengerCity(transport, p);
    const isLast = idx === sortedPassengers.length - 1;

    return `<div class="page${isLast ? "" : " pb"}">
      <div class="doc-header">
        <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
        <div class="hdr-right"><div>Réf. <strong>${p.numeroDeReservation || p.reservationId?.slice(0,8) || "-"}</strong></div><div>${today}</div></div>
      </div>
      <div class="doc-title">CONVOCATION</div>
      <div class="dir-badge" style="background:${dirBg};border-color:${dirColor};color:${dirColor}">
        ${dirLabel} - ${transport.sejourName}${sejourDates ? `<br><span style="font-size:12px;font-weight:600;letter-spacing:0">${sejourDates}</span>` : ""}
      </div>
      <div class="city-badge">VILLE DE DÉPART : ${city}</div>
      <div class="sec">Participant(s)</div>
      <table><tbody>${childRows}</tbody></table>
      <div class="sec">Responsable légal</div>
      <table><tbody>
        <tr><td>Nom</td><td>${p.nom}</td></tr>
        <tr><td>Téléphone</td><td><strong>${p.phone}</strong></td></tr>
        <tr><td>Email</td><td>${p.email}</td></tr>
      </tbody></table>
      <div class="sec">Informations de transport</div>
      ${transportCardForPassenger(p)}
      ${transport.convoyeur ? `
      <div class="sec">Accompagnateur</div>
      <table><tbody>
        <tr><td>Nom</td><td><strong>${transport.convoyeur}</strong></td></tr>
        ${transport.convoyeurPhone ? `<tr><td>Téléphone</td><td>${transport.convoyeurPhone}</td></tr>` : ""}
        <tr><td>Urgences</td><td><strong>${EMERGENCY_PHONES.join(" / ")}</strong></td></tr>
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
<title>Convocations - ${transport.sejourName} ${transport.direction}</title>
<style>
  ${SHARED_CSS}
  .page{max-width:760px;margin:0 auto;padding:36px 32px}
  .pb{page-break-after:always}
  .doc-title{font-size:21px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#B8336A;text-align:center;border:2px solid #B8336A;padding:12px 20px;margin:0 0 18px;border-radius:6px}
  .dir-badge{text-align:center;font-weight:800;font-size:13.5px;border:1.5px solid;border-radius:8px;padding:10px;margin-bottom:18px;letter-spacing:0.04em}
  .city-badge{text-align:center;font-weight:900;font-size:14px;color:#5f3374;background:#f3edf9;border-radius:8px;padding:9px 12px;margin:-8px 0 18px}
</style></head><body>
${pages.join("\n")}
<div class="print-btn"><button onclick="window.print()">Imprimer toutes les convocations (${transport.passengers.length} page${transport.passengers.length > 1 ? "s" : ""})</button></div>
</body></html>`;
}

function buildSingleConvocHTML(transport, passenger) {
  return buildGroupConvocHTML({ ...transport, passengers: [passenger] });
}

function buildOnSiteConvocHTML(reservations, week, options = {}) {
  const weekInfo = WEEK_INFO[week] || {};
  const today = new Date().toLocaleDateString("fr-FR");
  const arrivalTime = options.arrivalTime || "À compléter";
  const returnTime = options.returnTime || "À compléter";
  const arrivalPoint = options.arrivalPoint || "Lieu du séjour";
  const returnPoint = options.returnPoint || arrivalPoint;
  const sejourLabel = reservations[0]?.sejourName && reservations[0].sejourName !== "-"
    ? shortSejourName(reservations[0].sejourName)
    : "Séjour ColoCrew";

  const pages = reservations.map((reservation, idx) => {
    const children = reservation.children || [];
    const childRows = children.length > 0
      ? children.map((child, childIndex) => `<tr>
          <td>${children.length > 1 ? `Enfant ${childIndex + 1}` : "Jeune"}</td>
          <td><strong>${child.firstName || ""} ${child.lastName || ""}</strong>
          ${child.birthDate ? `<br><span class="sub">Né(e) le ${fmtBirthDate(child.birthDate)}</span>` : ""}
          ${child.birthPlace ? `<br><span class="sub">à ${child.birthPlace}</span>` : ""}
          </td></tr>`).join("")
      : `<tr><td>Jeune</td><td><strong>${reservation.childName || "-"}</strong></td></tr>`;
    const isLast = idx === reservations.length - 1;

    return `<div class="page${isLast ? "" : " pb"}">
      <div class="doc-header">
        <div><div class="logo">ColoCrew</div><div class="logo-sub">Association de séjours éducatifs</div></div>
        <div class="hdr-right"><div>Réf. <strong>${reservation.numeroDeReservation || reservation.id?.slice(0, 8) || "-"}</strong></div><div>${today}</div></div>
      </div>
      <div class="doc-title">CONVOCATION SUR PLACE</div>
      <div class="dir-badge">
        ${sejourLabel}${weekInfo.dates ? `<br><span style="font-size:12px;font-weight:600;letter-spacing:0">${weekInfo.dates}</span>` : ""}
      </div>
      <div class="city-badge">MODE DE RENDEZ-VOUS : SUR PLACE</div>
      <div class="sec">Participant(s)</div>
      <table><tbody>${childRows}</tbody></table>
      <div class="sec">Responsable légal</div>
      <table><tbody>
        <tr><td>Nom</td><td>${reservation.nom}</td></tr>
        <tr><td>Téléphone</td><td><strong>${reservation.phone}</strong></td></tr>
        <tr><td>Email</td><td>${reservation.email}</td></tr>
      </tbody></table>
      <div class="sec">Rendez-vous aller</div>
      <div class="transport-card" style="border-color:#16a34a;background:#f0fdf4;margin-bottom:12px">
        <div class="tr-row"><span class="tr-lbl">Date</span><strong>${fmtDateLong(weekInfo.aller)}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Heure de RDV</span><strong>${arrivalTime}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Lieu</span><strong>${arrivalPoint}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Consigne</span>Remise de l'enfant directement à l'équipe ColoCrew sur le lieu du séjour.</div>
      </div>
      <div class="sec">Rendez-vous retour</div>
      <div class="transport-card" style="border-color:#ea580c;background:#fff7ed;margin-bottom:12px">
        <div class="tr-row"><span class="tr-lbl">Date</span><strong>${fmtDateLong(weekInfo.retour)}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Heure de RDV</span><strong>${returnTime}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Lieu</span><strong>${returnPoint}</strong></div>
        <div class="tr-row"><span class="tr-lbl">Consigne</span>Reprise de l'enfant directement auprès de l'équipe ColoCrew sur le lieu du séjour.</div>
      </div>
      <div class="sec">Contacts utiles</div>
      <table><tbody>
        <tr><td>Urgences</td><td><strong>${EMERGENCY_PHONES.join(" / ")}</strong></td></tr>
      </tbody></table>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><h4>Signature responsable légal<br>(remise de l'enfant)</h4></div>
        <div class="sig-box"><h4>Signature responsable légal<br>(reprise de l'enfant)</h4></div>
      </div>
    </div>`;
  });

  if (pages.length === 0) {
    pages.push(`<div class="page"><p style="text-align:center;padding:60px;color:#aaa">Aucun enfant sur place pour cette semaine.</p></div>`);
  }

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Convocations sur place - ${week}</title>
<style>
  ${SHARED_CSS}
  .page{max-width:760px;margin:0 auto;padding:36px 32px}
  .pb{page-break-after:always}
  .doc-title{font-size:21px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#166534;text-align:center;border:2px solid #16a34a;padding:12px 20px;margin:0 0 18px;border-radius:6px}
  .dir-badge{text-align:center;font-weight:800;font-size:13.5px;border:1.5px solid #16a34a;color:#166534;background:#f0fdf4;border-radius:8px;padding:10px;margin-bottom:18px;letter-spacing:0.04em}
  .city-badge{text-align:center;font-weight:900;font-size:14px;color:#166534;background:#dcfce7;border-radius:8px;padding:9px 12px;margin:-8px 0 18px}
</style></head><body>
${pages.join("\n")}
<div class="print-btn"><button onclick="window.print()">Imprimer les convocations sur place (${reservations.length} page${reservations.length > 1 ? "s" : ""})</button></div>
</body></html>`;
}

function buildOnSiteEmailHtml(reservation, week, options = {}, customIntro = "") {
  const weekInfo = WEEK_INFO[week] || {};
  const arrivalTime = options.arrivalTime || "À confirmer";
  const returnTime = options.returnTime || arrivalTime;
  const arrivalPoint = options.arrivalPoint || "Lieu du séjour";
  const returnPoint = options.returnPoint || arrivalPoint;
  const sejourLabel = reservation.sejourName && reservation.sejourName !== "-"
    ? shortSejourName(reservation.sejourName)
    : "Séjour ColoCrew";
  const children = reservation.children?.length
    ? reservation.children.map((child) => `${child.firstName || ""} ${child.lastName || ""}`.trim()).filter(Boolean)
    : [reservation.childName || "votre enfant"];
  const childLabel = children.join(", ");
  const parentFirstName = (reservation.nom || "").split(" ")[0] || "Madame, Monsieur";
  const intro = customIntro?.trim()
    ? customIntro.trim().split(/\n{2,}/).map((part) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">${part.replace(/\n/g, "<br>")}</p>`).join("")
    : `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">Bonjour ${parentFirstName},</p>
       <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">Nous vous transmettons les informations de rendez-vous sur place pour ${childLabel}.</p>`;
  const row = (label, aller, retour, last = false) => `
    <tr>
      <td style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;">${label}</td>
      <td style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;">${aller}</td>
      <td style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;">${retour}</td>
    </tr>`;

  return `
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,16,64,0.12);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="padding:20px 28px 16px;border-bottom:3px solid #16a34a;">
    <div style="font-size:19px;font-weight:900;color:#B8336A;letter-spacing:-0.02em;">ColoCrew</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:1px;">réinventons les colos !</div>
  </div>
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#166534;">Convocation sur place</h1>
    <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#1e1040;">${childLabel} — ${sejourLabel}${weekInfo.dates ? ` (${weekInfo.dates})` : ""}</p>
    ${intro}
  </div>
  <div style="padding:0 28px 22px;">
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead>
        <tr>
          <td style="padding:11px 16px;background:#f8f9fa;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;width:27%;"></td>
          <th style="padding:12px 16px;background:#f0fdf4;color:#16a34a;font-weight:900;font-size:14px;text-align:center;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;">ARRIVÉE</th>
          <th style="padding:12px 16px;background:#fff7ed;color:#ea580c;font-weight:900;font-size:14px;text-align:center;border-left:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;">DÉPART</th>
        </tr>
      </thead>
      <tbody>
        ${row("Date", `<strong>${fmtDateLong(weekInfo.aller)}</strong>`, `<strong>${fmtDateLong(weekInfo.retour)}</strong>`)}
        ${row("Heure de RDV", `<strong style="color:#16a34a;">${arrivalTime}</strong>`, `<strong style="color:#ea580c;">${returnTime}</strong>`)}
        ${row("Lieu", `<strong>${arrivalPoint}</strong>`, `<strong>${returnPoint}</strong>`)}
        ${row("Consigne", "Remise de l'enfant directement à l'équipe ColoCrew sur le lieu du séjour.", "Reprise de l'enfant directement auprès de l'équipe ColoCrew sur le lieu du séjour.", true)}
      </tbody>
    </table>
    <p style="margin:18px 0 0;font-size:13px;line-height:1.65;color:#64748b;">En cas d'imprévu, contactez-nous rapidement : <strong>${EMERGENCY_PHONES.join(" / ")}</strong>.</p>
  </div>
</div>`;
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
          <td>${passenger.nom || "-"}</td><td>${passenger.phone || "-"}</td><td>→</td>
        </tr>`);
    }).join("")}
  `).join("");
  const stopSections = segments.map((segment, index) => {
    const stopPassengers = passengersOnSegment(transport, index);
    const assignedStaff = staff.filter((member) => (segment.assignedStaffIds || []).includes(member.id));
    const sortedStopPassengers = [...stopPassengers].sort((a, b) => {
      const oa = cityRouteOrder(transport, passengerCity(transport, a));
      const ob = cityRouteOrder(transport, passengerCity(transport, b));
      if (oa !== ob) return oa - ob;
      return passengerCity(transport, a).localeCompare(passengerCity(transport, b), "fr", { sensitivity: "base" });
    });
    const childRows = groupPassengersByCity(transport, sortedStopPassengers).flatMap(({ city, passengers: cp }) => {
      const hdr = `<tr class="city-row"><td colspan="6">` + city + ` — ${countChildren(cp)} enfant${countChildren(cp) !== 1 ? "s" : ""}</td></tr>`;
      const rows = cp.flatMap((passenger) => {
        const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
        return children.map((child) => `
          <tr><td><strong>${child.firstName || ""} ${child.lastName || ""}</strong></td>
          <td>${city}</td>
          <td>${passenger.nom || "-"}</td><td><strong>${passenger.phone || "-"}</strong></td>
          <td>${passenger.numeroDeReservation || "-"}</td><td>→</td></tr>
        `);
      });
      return [hdr, ...rows];
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
        <table><thead><tr><th>Enfant</th><th>Ville</th><th>Responsable</th><th>Téléphone</th><th>Dossier</th><th>Présent</th></tr></thead>
        <tbody>${childRows || "<tr><td colspan='6'>Aucun enfant affecté à cet arrêt.</td></tr>"}</tbody></table>
      </section>`;
  }).join("");
  const staffRows = staff.map((member) => `
    <tr><td><strong>${member.name || "-"}</strong></td><td>${member.role || "Animateur convoyeur"}</td>
    <td>${member.phone || "-"}</td><td>${member.boardingCity || "-"}</td></tr>`).join("");
  const ticketRows = tickets.map((ticket) => `
    <li><strong>${ticket.name || "Billet"}</strong> - ${ticketSegmentLabel(ticket, segments) || "segment non affecté"}
    - ${formatMoney(ticket.price)} - ${ticket.departureTime || "?"} / ${ticket.arrivalTime || "?"}
    - <strong>${ticket.purchased ? "ACHETÉ" : "À ACHETER"}</strong>${ticket.url ? ` - <a href="${ticket.url}">ouvrir</a>` : ""}</li>
  `).join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Convocation équipe - ${transport.sejourName}</title>
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
    <div class="alert"><strong>${transport.departureCity || "-"} → ${transport.arrivalCity || "-"}</strong> · ${fmtDateLong(transport.date)} · RDV ${transport.meetingTime || "à compléter"} à ${transport.meetingPoint || "lieu à compléter"}</div>
    <div class="sec">Équipe de convoyage</div>
    <table><thead><tr><th>Nom</th><th>Rôle</th><th>Téléphone</th><th>Prise de service</th></tr></thead><tbody>${staffRows || "<tr><td colspan='4'>Équipe à compléter</td></tr>"}</tbody></table>
    <div class="sec">Arrêts et prises en charge</div>
    ${stopSections || "<p>Arrêts à compléter.</p>"}
    <div class="sec">Liste générale des jeunes (${(transport.passengers || []).reduce((sum, p) => sum + Math.max(p.children?.length || 0, 1), 0)})</div>
    <table><thead><tr><th>Jeune</th><th>Ville</th><th>Responsable</th><th>Téléphone</th><th>Présent</th></tr></thead><tbody>${passengerRows || "<tr><td colspan='5'>Aucun jeune assigné</td></tr>"}</tbody></table>
    <div class="sec">Billets et pièces de voyage</div>${ticketRows ? `<ul>${ticketRows}</ul>` : "<p>Aucun billet téléversé.</p>"}
    <div class="sec">Contacts et consignes</div><p><strong>Urgence :</strong> ${transport.emergencyContact || "ColoCrew"} ${transport.emergencyPhone || "-"}</p>
    ${transport.notes ? `<p style="margin-top:8px">${transport.notes}</p>` : ""}
    <div class="print-btn"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  </body></html>`;
}

/* Shared panel sub-components */

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
                    <span className={`tr-all-dir is-${direction}`}>{direction === "aller" ? "?" : "?"} {label}</span>
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

/* WeeksOverview */

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
                { dir: "aller",  date: info.aller,  label: "Aller",  icon: "?" },
                { dir: "retour", date: info.retour, label: "Retour", icon: "?" },
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
                                {!isOk && tripMissing > 0 && `⚠ ${tripMissing} manquant${tripMissing > 1 ? "s" : ""}`}
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

/* TripTimeline */

function TripTimeline({ transport, onToggleStaff }) {
  const segments  = transport.segments || [];
  const staffPool = transport.staff    || [];
  if (segments.length === 0) return null;

  const last = segments[segments.length - 1];
  const finalAction = timelineActionInfo(transport, last?.to);

  return (
    <div className="tl-wrap">
      <div className="tl-track">
        {segments.flatMap((seg, i) => {
          const assignedIds = seg.assignedStaffIds || [];
          const previous = i > 0 ? segments[i - 1] : null;
          const action = timelineActionInfo(transport, seg.from, { isFirst: i === 0 });
          const connectionDuration = previous ? durationBetween(previous.arrivalTime, seg.departureTime) : "";
          const trainDuration = durationBetween(seg.departureTime, seg.arrivalTime);

          return [
            /* Stop node */
            <div key={`stop-${seg.id}`} className="tl-stop" style={{ "--i": i }}>
              <div className="tl-dot" />
              <div className="tl-stop-info">
                <span className="tl-city">{seg.from}</span>
                {seg.meetingTime && <span className="tl-rdv">RDV {seg.meetingTime}</span>}
                <div className="tl-times">
                  {previous?.arrivalTime && <span>Arr. {previous.arrivalTime}</span>}
                  {seg.departureTime && <span>Dép. {seg.departureTime}</span>}
                  {!previous?.arrivalTime && !seg.departureTime && <span>-</span>}
                </div>
                {connectionDuration && <span className="tl-connection">Corresp. {connectionDuration}</span>}
                {action && (
                  <span className={`tl-count is-${action.tone}`}>
                    {action.count} {action.label}
                  </span>
                )}
              </div>
            </div>,

            /* Leg */
            <div key={`leg-${seg.id}`} className="tl-leg" style={{ "--i": i }}>
              <div className="tl-leg-line" />
              {segmentSubStops(seg).length > 0 && (
                <div className="tl-substops">
                  {segmentSubStops(seg).map((stop, stopIndex) => {
                    const stopAction = timelineActionInfo(transport, stop.city);
                    return (
                      <span key={stop.id || `${stop.city}-${stopIndex}`} className="tl-substop">
                        <strong>{stop.city || "Étape"}</strong>
                        <small className="tl-substop-times">
                          {stop.arrivalTime && <span>Arr. {stop.arrivalTime}</span>}
                          {stop.departureTime && <span>Dép. {stop.departureTime}</span>}
                          {!stop.arrivalTime && !stop.departureTime && <span>horaire à compléter</span>}
                        </small>
                        {stopAction && (
                          <small className={`tl-substop-count is-${stopAction.tone}`}>
                            {stopAction.count} {stopAction.label}
                          </small>
                        )}
                        <em>quai</em>
                      </span>
                    );
                  })}
                </div>
              )}
              {(seg.mode || trainDuration) && (
                <span className="tl-train">
                  {seg.mode && <strong>{seg.mode}{seg.number ? ` ${seg.number}` : ""}</strong>}
                  {trainDuration && <em>{trainDuration}</em>}
                </span>
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
            <div className="tl-times">
              {last?.arrivalTime ? <span>Arr. {last.arrivalTime}</span> : <span>-</span>}
            </div>
            {finalAction && (
              <span className={`tl-count is-${finalAction.tone}`}>
                {finalAction.count} {finalAction.label}
              </span>
            )}
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

function TransportHomeHeader({ reservations, transports, onCreate }) {
  const stats = useMemo(() => {
    const valid = reservations.filter((reservation) => reservation.status === "validated" && reservation.isImported2026);
    const transportChildren = valid.reduce((sum, reservation) => {
      const needsAller = normalizePlace(reservation.departureCity) !== "sur place";
      const needsRetour = normalizePlace(reservation.returnCity) !== "sur place";
      return sum + (needsAller || needsRetour ? reservation.childCount : 0);
    }, 0);
    const surPlace = valid.reduce((sum, reservation) => {
      const bothOnSite = normalizePlace(reservation.departureCity) === "sur place"
        && normalizePlace(reservation.returnCity) === "sur place";
      return sum + (bothOnSite ? reservation.childCount : 0);
    }, 0);
    const ticketCost = transports.reduce((sum, transport) =>
      sum + (transport.tickets || []).reduce((ticketSum, ticket) => ticketSum + Number(ticket.price || 0), 0), 0);
    const purchasedTickets = transports.reduce((sum, transport) =>
      sum + (transport.tickets || []).filter((ticket) => ticket.purchased).length, 0);
    const totalTickets = transports.reduce((sum, transport) => sum + (transport.tickets || []).length, 0);
    return {
      validChildren: valid.reduce((sum, reservation) => sum + reservation.childCount, 0),
      transportChildren,
      surPlace,
      trips: transports.length,
      ticketCost,
      purchasedTickets,
      totalTickets,
    };
  }, [reservations, transports]);

  const weekRows = useMemo(() => WEEKS.map((week) => {
    const info = WEEK_INFO[week];
    const weekReservations = reservations.filter((reservation) =>
      reservation.status === "validated" && reservation.isImported2026 && reservation.week === week,
    );
    const children = weekReservations.reduce((sum, reservation) => sum + reservation.childCount, 0);
    const aller = weekReservations.reduce((sum, reservation) =>
      sum + (normalizePlace(reservation.departureCity) !== "sur place" ? reservation.childCount : 0), 0);
    const retour = weekReservations.reduce((sum, reservation) =>
      sum + (normalizePlace(reservation.returnCity) !== "sur place" ? reservation.childCount : 0), 0);
    const trips = transports.filter((transport) => transport.week === week);
    const missingTickets = trips.reduce((sum, transport) =>
      sum + (transport.segments || []).filter((segment) =>
        !(transport.tickets || []).some((ticket) => ticket.segmentId === segment.id),
      ).length, 0);
    return { week, info, children, aller, retour, trips: trips.length, missingTickets };
  }), [reservations, transports]);

  return (
    <section className="tr-home">
      <div className="tr-home-main">
        <div className="tr-home-title">
          <span>Organisation transport</span>
          <h2>Vue opérationnelle été 2026</h2>
          <p>Suivi des enfants à transporter, des trajets créés et des billets à acheter.</p>
        </div>
        <div className="tr-home-actions">
          <button type="button" className="dash-btn dash-btn-primary" onClick={onCreate}>Nouveau transport</button>
          <Link href="/dashboard/transport/billets" className="dash-btn">Billets</Link>
        </div>
      </div>

      <div className="tr-home-metrics">
        <article><span>Enfants validés</span><strong>{stats.validChildren}</strong><small>Source Excel</small></article>
        <article><span>À transporter</span><strong>{stats.transportChildren}</strong><small>Aller ou retour</small></article>
        <article><span>Sur place</span><strong>{stats.surPlace}</strong><small>Sans billet</small></article>
        <article><span>Trajets</span><strong>{stats.trips}</strong><small>Créés</small></article>
        <article><span>Billets</span><strong>{stats.purchasedTickets}/{stats.totalTickets}</strong><small>{formatMoney(stats.ticketCost)}</small></article>
      </div>

      <div className="tr-home-weeks">
        {weekRows.map((row) => (
          <article key={row.week} className="tr-home-week">
            <div className="tr-home-week-head">
              <strong>{row.week}</strong>
              <span>{row.info.dates}</span>
            </div>
            <div className="tr-home-week-stats">
              <span>{row.children}<small> enfants</small></span>
              <span>{row.aller}<small> aller</small></span>
              <span>{row.retour}<small> retour</small></span>
              <span>{row.trips}<small> trajets</small></span>
            </div>
            <div className="tr-home-week-links">
              <Link href={`/dashboard/transport/${row.info.aller}`}>Aller</Link>
              <Link href={`/dashboard/transport/${row.info.retour}`}>Retour</Link>
              {row.missingTickets > 0 && <em>{row.missingTickets} billet{row.missingTickets > 1 ? "s" : ""} manquant{row.missingTickets > 1 ? "s" : ""}</em>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TransportBudgetOverview({ reservations, transports }) {
  const [openLedgerGroups, setOpenLedgerGroups] = useState(new Set());
  const [openLedgerTrips,  setOpenLedgerTrips]  = useState(new Set());
  const weekData = useMemo(() => {
    const byWeek = new Map();
    const ensure = (week) => {
      const label = week || "Sans semaine";
      if (!byWeek.has(label)) byWeek.set(label, { week: label, revenue: 0, children: 0, days: new Map(), tickets: [] });
      return byWeek.get(label);
    };
    const ensureDay = (week, transport) => {
      const weekRow = ensure(week);
      const dayKey = transport.date || "Sans date";
      if (!weekRow.days.has(dayKey)) {
        weekRow.days.set(dayKey, { date: dayKey, trips: new Map(), tickets: [] });
      }
      return weekRow.days.get(dayKey);
    };

    reservations
      .filter((r) => r.status === "validated" && r.isImported2026)
      .forEach((r) => {
        const d = ensure(r.week);
        d.revenue += Number(r.transportAmount || 0);
        d.children += Number(r.childCount || 1);
      });

    transports.forEach((t) => {
      const d = ensure(t.week);
      const day = ensureDay(t.week, t);
      if (!day.trips.has(t.id)) {
        day.trips.set(t.id, { transport: t, tickets: [] });
      }
      const trip = day.trips.get(t.id);
      ticketRowsForTransport(t).forEach(({ ticket, seg, type }) => {
        const row = {
          id: ticket.id,
          name: ticket.name || "Billet",
          price: Number(ticket.price || 0),
          purchased: !!ticket.purchased,
          bookingReference: ticket.bookingReference || "",
          label: accountingTicketLabel(ticket, t),
          url: ticket.url || null,
          virtual: Boolean(ticket.virtual),
          type,
          segmentLabel: seg ? segmentRouteLabel(seg) : ticketSegmentLabel(ticket, t.segments || []),
          sortKey: `${seg ? (t.segments || []).findIndex((segment) => segment.id === seg.id) : 999}-${ticket.name || ""}`,
        };
        d.tickets.push(row);
        day.tickets.push(row);
        trip.tickets.push(row);
      });
    });

    return [...byWeek.values()]
      .map((week) => ({
        ...week,
        days: [...week.days.values()]
          .map((day) => ({
            ...day,
            trips: [...day.trips.values()].sort((a, b) => transportRouteLabel(a.transport).localeCompare(transportRouteLabel(b.transport), "fr")),
          }))
          .sort((a, b) => a.date.localeCompare(b.date, "fr")),
      }))
      .sort((a, b) => a.week.localeCompare(b.week, "fr"));
  }, [reservations, transports]);

  const toggleLedgerTrip = (id) => {
    setOpenLedgerTrips((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleLedgerGroup = (key) => {
    setOpenLedgerGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totals = weekData.reduce((acc, w) => {
    const cost = w.tickets.reduce((s, t) => s + t.price, 0);
    return {
      revenue: acc.revenue + w.revenue,
      cost: acc.cost + cost,
      children: acc.children + w.children,
      total: acc.total + w.tickets.length,
      purchased: acc.purchased + w.tickets.filter((t) => t.purchased).length,
    };
  }, { revenue: 0, cost: 0, children: 0, total: 0, purchased: 0 });

  return (
    <section className="tr-ledger-page">
      <div className="tr-ledger-kpis">
        <div className="tr-ledger-kpi">
          <span className="tr-ledger-kpi-label">CA transport</span>
          <strong className="tr-ledger-kpi-val">{formatMoney(totals.revenue)}</strong>
          <small>Facturé aux familles</small>
        </div>
        <div className="tr-ledger-kpi is-debit">
          <span className="tr-ledger-kpi-label">Coût billets</span>
          <strong className="tr-ledger-kpi-val">{formatMoney(totals.cost)}</strong>
          <small>{totals.purchased}/{totals.total} acheté{totals.purchased !== 1 ? "s" : ""}</small>
        </div>
        <div className={`tr-ledger-kpi${totals.revenue - totals.cost >= 0 ? " is-credit" : " is-debit"}`}>
          <span className="tr-ledger-kpi-label">Marge nette</span>
          <strong className="tr-ledger-kpi-val">{formatMoney(totals.revenue - totals.cost)}</strong>
          <small>CA - billets</small>
        </div>
        <div className="tr-ledger-kpi">
          <span className="tr-ledger-kpi-label">Enfants transport</span>
          <strong className="tr-ledger-kpi-val">{totals.children}</strong>
          <small>validés importés</small>
        </div>
      </div>

      {weekData.map((week) => {
        const weekCost = week.tickets.reduce((s, t) => s + t.price, 0);
        const margin = week.revenue - weekCost;
        const purchased = week.tickets.filter((t) => t.purchased).length;
        return (
          <div key={week.week} className="tr-ledger-week">
            <div className="tr-ledger-week-hd">
              <span className="tr-ledger-week-badge">{week.week}</span>
              <span className="tr-ledger-week-info">{week.children} enfant{week.children !== 1 ? "s" : ""}</span>
              <span className="tr-ledger-week-info">{purchased}/{week.tickets.length} billet{week.tickets.length !== 1 ? "s" : ""} acheté{purchased !== 1 ? "s" : ""}</span>
              <span className={`tr-ledger-week-margin${margin >= 0 ? " is-pos" : " is-neg"}`}>
                Marge : {formatMoney(margin)}
              </span>
            </div>

            <table className="tr-ledger-table">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Détail</th>
                  <th className="tr-ledger-th-credit">Recettes</th>
                  <th className="tr-ledger-th-debit">Dépenses</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr className="tr-ledger-section">
                  <td colSpan="5">RECETTES</td>
                </tr>
                <tr className="tr-ledger-row is-credit">
                  <td>CA transport familles {week.week}</td>
                  <td className="tr-ledger-detail">{week.children} enfant{week.children !== 1 ? "s" : ""} · inscriptions validées</td>
                  <td className="tr-ledger-credit-val">{formatMoney(week.revenue)}</td>
                  <td></td>
                  <td><span className="tr-ledger-badge is-ok">Encaissé</span></td>
                </tr>

                {week.tickets.length > 0 && (
                  <tr className="tr-ledger-section">
                    <td colSpan="5">DÉPENSES - BILLETS</td>
                  </tr>
                )}
                {week.days.map((day) => (
                  <Fragment key={`${week.week}-${day.date}`}>
                    {day.trips.map(({ transport, tickets }) => {
                      const tripCost = tickets.reduce((sum, ticket) => sum + ticket.price, 0);
                      const tripPurchased = tickets.filter((ticket) => ticket.purchased).length;
                      const tripOpen = openLedgerTrips.has(transport.id);
                      return (
                        <Fragment key={transport.id}>
                          <tr className="tr-ledger-trip-row tr-ledger-trip-clickable" onClick={() => toggleLedgerTrip(transport.id)}>
                            <td>
                              <span className="tr-ledger-trip-chevron">{tripOpen ? "▾" : "▸"}</span>
                              <span className={`tr-days-dir is-${transport.direction}`}>{directionIcon(transport.direction)}</span>
                              <strong>{transportRouteLabel(transport)}</strong>
                            </td>
                            <td className="tr-ledger-detail">{fmtDate(day.date)}</td>
                            <td></td>
                            <td className="tr-ledger-debit-val">{formatMoney(tripCost)}</td>
                            <td>
                              <span className={`tr-ledger-badge${tripPurchased === tickets.length ? " is-ok" : " is-warn"}`}>
                                {tripPurchased}/{tickets.length}
                              </span>
                            </td>
                          </tr>
                          {tripOpen && groupTicketRows([...tickets].sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr")).map((ticket) => ({ ticket }))).map((group) => {
                            const groupKey = `${week.week}-${day.date}-${transport.id}-${group.key}`;
                            const isOpen = openLedgerGroups.has(groupKey);
                            if (group.isGroup) {
                              return (
                                <Fragment key={groupKey}>
                                  <tr className="tr-ledger-row is-debit tr-ledger-folder-row">
                                    <td>
                                      <button type="button" className="tr-ledger-folder-btn" onClick={() => toggleLedgerGroup(groupKey)}>
                                        <span>{isOpen ? "▾" : "▸"}</span>
                                        <strong>{group.name}</strong>
                                      </button>
                                    </td>
                                    <td className="tr-ledger-detail">{group.rows.length} billets individuels · ref {group.bookingReference || "-"}</td>
                                    <td></td>
                                    <td className="tr-ledger-debit-val">{formatMoney(group.total)}</td>
                                    <td><span className={`tr-ledger-badge${group.purchased === group.rows.length ? " is-ok" : " is-warn"}`}>{group.purchased}/{group.rows.length} achetés</span></td>
                                  </tr>
                                  {isOpen && group.rows.map(({ ticket }) => (
                                    <tr key={ticket.id} className={`tr-ledger-row is-debit is-folder-child${ticket.purchased ? "" : " is-pending"}`}>
                                      <td>{ticket.url ? <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-ledger-link">{ticket.name}</a> : ticket.name}</td>
                                      <td className="tr-ledger-detail">{ticket.label}</td>
                                      <td></td>
                                      <td className="tr-ledger-debit-val">{formatMoney(ticket.price)}</td>
                                      <td><span className={`tr-ledger-badge${ticket.purchased ? " is-ok" : " is-warn"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span></td>
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            }
                            const ticket = group.rows[0].ticket;
                            return (
                              <tr key={ticket.id} className={`tr-ledger-row is-debit${ticket.purchased ? "" : " is-pending"}`}>
                                <td>{ticket.url ? <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-ledger-link">{ticket.name}</a> : ticket.name}</td>
                                <td className="tr-ledger-detail">{ticket.label}</td>
                                <td></td>
                                <td className="tr-ledger-debit-val">{formatMoney(ticket.price)}</td>
                                <td><span className={`tr-ledger-badge${ticket.purchased ? " is-ok" : " is-warn"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span></td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}

                <tr className="tr-ledger-total">
                  <td colSpan="2">Solde {week.week}</td>
                  <td colSpan="2" className={margin >= 0 ? "tr-ledger-credit-val" : "tr-ledger-debit-val"}>
                    {margin >= 0 ? "+" : ""}{formatMoney(margin)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

function SegmentSummaryTable({ transport, onEditSegment }) {
  const segments = transport.segments || [];
  const isRetour = transport.direction === "retour";
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
              <th>À bord avant arrêt</th>
              <th>{isRetour ? "Descendent ici" : "Montent ici"}</th>
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
            {segments.flatMap((segment, index) => {
              const city = transport.direction === "retour" ? segment.to : segment.from;
              const stopPassengers = passengersAtStop(transport, city);
              const mainStop = routeBoardingStops(transport).find((stop) =>
                stop.type === "main" && stop.segmentIndex === index,
              );
              const alreadyPassengers = passengersBeforeStop(transport, mainStop?.order ?? index);
              const onboardPassengers = passengersOnSegment(transport, index);
              const segmentTickets = purchasedTicketsForSegment(transport.tickets, segment.id);
              const assignedStaff = (transport.staff || []).filter((member) =>
                (segment.assignedStaffIds || []).includes(member.id),
              );
              const isQuaiStop = segmentStopType(segment) === "quai";
              const rows = [(
                <tr key={segment.id} className={isQuaiStop ? "is-quai-stop" : ""} onClick={() => onEditSegment(transport, segment.id)}>
                  <td><span className="tr-segment-step">{index + 1}</span></td>
                  <td>
                    <strong>{city || "Ville à compléter"}</strong>
                    <small>{isQuaiStop ? "Étape quai" : stopTypeLabel(segment)} · {segmentMeetingLabel(segment)}</small>
                  </td>
                  <td><strong>{segment.from || "-"} → {segment.to || "-"}</strong></td>
                  <td><strong>{countChildren(alreadyPassengers)}</strong></td>
                  <td><strong>{countChildren(stopPassengers)}</strong></td>
                  <td><strong>{countChildren(onboardPassengers)}</strong></td>
                  <td>{isQuaiStop ? "Quai" : (segment.meetingTime || "-")}</td>
                  <td>{segment.departureTime || "-"}</td>
                  <td>{segment.arrivalTime || "-"}</td>
                  <td>
                    <span>{segment.mode || "-"} {segment.number || ""}</span>
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
              )];

              segmentSubStops(segment).forEach((stop, stopIndex) => {
                const stopCity = stop.city;
                const stopPassengersAtCity = passengersAtStop(transport, stopCity);
                const routeStop = routeBoardingStops(transport).find((item) =>
                  item.type === "sub" && item.segmentIndex === index && item.stopIndex === stopIndex,
                );
                const alreadyAtSubStop = passengersBeforeStop(transport, routeStop?.order ?? index);
                const onboardAfterSubStop = passengersAfterStop(transport, routeStop?.order ?? index);
                rows.push(
                  <tr key={`${segment.id}-stop-${stop.id || stop.city || stopIndex}`} className="is-quai-stop is-sub-stop" onClick={() => onEditSegment(transport, segment.id)}>
                    <td><span className="tr-segment-step is-small">{index + 1}.{stopIndex + 1}</span></td>
                    <td>
                      <strong>{stopCity || "Ville à compléter"}</strong>
                      <small>Étape quai · {segmentMeetingLabel(stop)}</small>
                    </td>
                    <td><span className="tr-summary-empty">Sous-étape du billet {segment.from || "-"} → {segment.to || "-"}</span></td>
                    <td><strong>{countChildren(alreadyAtSubStop)}</strong></td>
                    <td><strong>{countChildren(stopPassengersAtCity)}</strong></td>
                    <td><strong>{countChildren(onboardAfterSubStop)}</strong></td>
                    <td>Quai</td>
                    <td>{stop.departureTime || "-"}</td>
                    <td>{stop.arrivalTime || "-"}</td>
                    <td>
                      <span>{stop.mode || segment.mode || "-"} {stop.number || segment.number || ""}</span>
                      {stop.platform && <small>Voie {stop.platform}</small>}
                    </td>
                    <td><span className="tr-summary-ticket is-neutral">Même billet</span></td>
                    <td>
                      {assignedStaff.length
                        ? assignedStaff.map((member) => member.name || "Animateur").join(", ")
                        : <span className="tr-summary-empty">Non affecté</span>}
                    </td>
                  </tr>,
                );
              });
              return isRetour ? [...rows.slice(1), rows[0]] : rows;
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
                <div><strong>{trip.departureTime || "-"}</strong><span>départ</span></div>
                <div><strong>{trip.arrivalTime || "-"}</strong><span>arrivée</span></div>
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

/* Panel tabs */

const TRANSPORT_HOME_VIEWS = [
  { key: "organisation", label: "Organisation" },
  { key: "jours", label: "Jour par jour" },
  { key: "cities", label: "Villes/RDV" },
  { key: "budget", label: "Budget" },
  { key: "recap", label: "Récap" },
];

function TransportHomeTabs({ value, onChange }) {
  return (
    <nav className="tr-home-tabs">
      {TRANSPORT_HOME_VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          className={value === view.key ? "is-active" : ""}
          onClick={() => onChange(view.key)}
        >
          {view.label}
        </button>
      ))}
    </nav>
  );
}

function DayByDayOverview({ transports, selectedId, onSelectTrip, onEditSegment }) {
  return (
    <section className="tr-days-page">
      {KEY_DATES.map((day) => {
        const dayTransports = transports.filter((transport) => transport.date === day.date);
        return (
          <article key={day.date} className="tr-days-block">
            <div className="tr-days-head">
              <div>
                <span className={`tr-days-dir is-${day.direction}`}>{day.direction === "aller" ? "Aller" : "Retour"}</span>
                <h2>{day.label}</h2>
                <time>{fmtDateLong(day.date)}</time>
              </div>
              <Link href={`/dashboard/transport/${day.date}`} className="dash-btn">Ouvrir en page dédiée</Link>
            </div>
            {dayTransports.length ? (
              <>
                <DaySummary transports={dayTransports} date={day.date} />
                <DateTripCards
                  transports={dayTransports}
                  selectedId={selectedId}
                  onSelectTrip={onSelectTrip}
                  onEditSegment={onEditSegment}
                />
              </>
            ) : (
              <div className="tr-day-empty">
                <strong>Aucun trajet configuré</strong>
                <span>Créez les trajets nécessaires pour cette journée.</span>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function PassengerEditModal({ passenger, transport, onSave, onClose }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    nom:   passenger.nom || "",
    email: passenger.email || "",
    phone: passenger.phone || "",
    children: (passenger.children?.length
      ? passenger.children
      : [{ firstName: passenger.childName || "", lastName: "", birthDate: "" }]
    ).map((c) => ({ firstName: c.firstName || "", lastName: c.lastName || "", birthDate: c.birthDate || "" })),
  });
  const [saving, setSaving] = useState(false);

  const setChild = (idx, key, val) =>
    setForm((f) => ({ ...f, children: f.children.map((c, i) => i === idx ? { ...c, [key]: val } : c) }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = transport.passengers.map((p) =>
        p.reservationId === passenger.reservationId
          ? { ...p, nom: form.nom, email: form.email, phone: form.phone, children: form.children }
          : p,
      );
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), { passengers: updated, updatedAt: serverTimestamp() });
      onSave({ ...transport, passengers: updated });
      showToast("Passager mis à jour", "success");
      onClose();
    } catch {
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tr-pedit-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tr-pedit-modal">
        <div className="tr-pedit-hd">
          <strong>Modifier le passager</strong>
          <button type="button" className="tr-pedit-close" onClick={onClose}>×</button>
        </div>
        <div className="tr-pedit-body">
          <div className="tr-pedit-section">Informations famille</div>
          <div className="tr-pedit-row">
            <label><span>Responsable légal</span><input className="dash-input" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} /></label>
            <label><span>Email</span><input className="dash-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
            <label><span>Téléphone</span><input className="dash-input" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></label>
          </div>
          <div className="tr-pedit-section">Enfant{form.children.length > 1 ? "s" : ""}</div>
          {form.children.map((child, idx) => (
            <div key={idx} className="tr-pedit-child">
              {form.children.length > 1 && <div className="tr-pedit-child-num">Enfant {idx + 1}</div>}
              <div className="tr-pedit-row">
                <label><span>Prénom</span><input className="dash-input" value={child.firstName} onChange={(e) => setChild(idx, "firstName", e.target.value)} /></label>
                <label><span>Nom</span><input className="dash-input" value={child.lastName} onChange={(e) => setChild(idx, "lastName", e.target.value)} /></label>
                <label><span>Date de naissance</span><input className="dash-input" type="date" value={child.birthDate} onChange={(e) => setChild(idx, "birthDate", e.target.value)} /></label>
              </div>
            </div>
          ))}
        </div>
        <div className="tr-pedit-footer">
          <button type="button" className="dash-btn" onClick={onClose}>Annuler</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PassengersTab({ transport, allReservations, onUpdate }) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [resModal, setResModal] = useState(null); // { item } | null

  const openReservationById = async (reservationId) => {
    if (!reservationId) return;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId));
      if (snap.exists()) setResModal({ item: mapReservation(snap) });
      else showToast("Réservation introuvable", "error");
    } catch { showToast("Erreur de chargement", "error"); }
  };

  const patchPassengerReservationId = async (passenger, reservation) => {
    if (!passenger || !reservation || passenger.reservationId === reservation.id) return;
    const updated = compactTransportPassengers(transport.passengers.map((item) =>
      item === passenger || (
        item.numeroDeReservation
        && passenger.numeroDeReservation
        && normalizeSearchKey(item.numeroDeReservation) === normalizeSearchKey(passenger.numeroDeReservation)
      )
        ? { ...item, reservationId: reservation.id, numeroDeReservation: reservation.numeroDeReservation || item.numeroDeReservation }
        : item,
    ));
    try {
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated,
        updatedAt: serverTimestamp(),
      });
      onUpdate(hydrateTransportPassengers({ ...transport, passengers: updated }, allReservations));
    } catch {
      // Le lien reste utilisable pour cette ouverture, même si la correction du passager échoue.
    }
  };

  const openReservation = async (passenger) => {
    const resolved = resolveReservationFromPassenger(passenger, allReservations, transport);
    if (!resolved) {
      showToast("Réservation introuvable pour ce passager", "error");
      return;
    }
    await patchPassengerReservationId(passenger, resolved);
    return openReservationById(resolved.id);
  };

  const assignedIds = useMemo(
    () => new Set(transport.passengers.map(p => p.reservationId)),
    [transport.passengers],
  );

  const cityKey  = transport.direction === "aller" ? "departureCity" : "returnCity";
  const cityVal  = (transport.direction === "aller" ? transport.departureCity : transport.arrivalCity)?.toLowerCase() || "";
  const stopCityKeys = useMemo(
    () => new Set(transportStopCities(transport).map(normalizePlace).filter(Boolean)),
    [transport],
  );

  const allCandidates = useMemo(() => {
    return allReservations.filter(r =>
      !assignedIds.has(r.id) &&
      r.status === "validated" &&
      (!transport.week || r.week === transport.week) &&
      (showAll || stopCityKeys.has(normalizePlace(r[cityKey]))),
    ).sort((a, b) => {
      const aCity = (a[cityKey] || "").toLowerCase();
      const bCity = (b[cityKey] || "").toLowerCase();
      const aMatch = stopCityKeys.has(normalizePlace(a[cityKey])) || (cityVal && aCity.includes(cityVal)) ? 0 : 1;
      const bMatch = stopCityKeys.has(normalizePlace(b[cityKey])) || (cityVal && bCity.includes(cityVal)) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [allReservations, assignedIds, cityKey, cityVal, showAll, stopCityKeys, transport.week]);

  const candidates = useMemo(
    () => (search ? allCandidates.filter(r => reservationMatchesQuery(r, search)) : allCandidates),
    [allCandidates, search],
  );

  const hiddenCount = useMemo(() => {
    if (showAll) return 0;
    return allReservations.filter(r =>
      !assignedIds.has(r.id) &&
      r.status === "validated" &&
      (!transport.week || r.week === transport.week) &&
      !stopCityKeys.has(normalizePlace(r[cityKey])),
    ).length;
  }, [allReservations, assignedIds, cityKey, showAll, stopCityKeys, transport.week]);

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const toAdd = allReservations
        .filter(r => selected.has(r.id))
        .map(r => ({
          reservationId:       r.id,
          pickupCity: transport.direction === "aller" ? r.departureCity : r.returnCity,
        }));
      const updated = compactTransportPassengers([...transport.passengers, ...toAdd]);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated,
        updatedAt: serverTimestamp(),
      });
      onUpdate(hydrateTransportPassengers({ ...transport, passengers: updated }, allReservations));
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
    const updated = compactTransportPassengers(transport.passengers.filter(p => p.reservationId !== reservationId));
    try {
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated, updatedAt: serverTimestamp(),
      });
      onUpdate(hydrateTransportPassengers({ ...transport, passengers: updated }, allReservations));
      showToast("Passager retiré", "success");
    } catch {
      showToast("Erreur", "error");
    }
  };

  const updatePickupCity = async (reservationId, pickupCity) => {
    const updated = compactTransportPassengers(transport.passengers.map((passenger) =>
      passenger.reservationId === reservationId ? { ...passenger, pickupCity } : passenger,
    ));
    try {
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        passengers: updated,
        updatedAt: serverTimestamp(),
      });
      onUpdate(hydrateTransportPassengers({ ...transport, passengers: updated }, allReservations));
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
              placeholder="Chercher par nom, enfant…" />
          </div>
          <div className="tr-add-filter-bar">
            <span className="tr-add-filter-info">
              {showAll
                ? <>Toutes les réservations validées{transport.sejourName && transport.sejourName !== "-" ? ` du séjour « ${transport.sejourName} »` : ""}</>
                : <>Réservations validées · séjour {transport.sejourName !== "-" ? `« ${transport.sejourName} »` : "?"} · villes du trajet</>}
            </span>
            {hiddenCount > 0 && !showAll && (
              <button type="button" className="dash-btn tr-add-showall-btn" onClick={() => setShowAll(true)}>
                + {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} (autres villes)
              </button>
            )}
            {showAll && (
              <button type="button" className="dash-btn tr-add-showall-btn" onClick={() => setShowAll(false)}>
                Réduire au trajet
              </button>
            )}
          </div>
          <div className="tr-add-list">
            {candidates.length === 0 ? (
              <p className="tr-add-empty">
                {search ? "Aucun résultat pour cette recherche" : "Aucune réservation correspondante"}
              </p>
            ) : candidates.map(r => {
              const cityMatch = stopCityKeys.has(normalizePlace(r[cityKey]));
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
          {groupPassengersByCity(transport).map(({ city, passengers }) => {
            const stopSegment = cityStopSegment(transport, city);
            const isQuaiStop = segmentStopType(stopSegment) === "quai";
            return (
            <section key={normalizePlace(city)} className={`tr-pax-city-group${isQuaiStop ? " is-quai-stop" : ""}`}>
              <div className="tr-pax-city-header">
                <div>
                  <strong>{city}</strong>
                  {isQuaiStop && (
                    <small className="tr-quai-mini">
                      Étape quai uniquement{stopSegment?.platform ? ` · ${stopSegment.platform}` : ""}
                    </small>
                  )}
                </div>
                <span>{countChildren(passengers)} enfant{countChildren(passengers) !== 1 ? "s" : ""}</span>
              </div>
              {passengers.map((p, i) => {
                const kids = p.children?.length > 0 ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }];
                return (
                  <div key={p.reservationId || i} className="tr-pax-row">
                    <div className="tr-pax-num">{i + 1}</div>
                    <div className="tr-pax-info">
                      {kids.map((c, ci) => (
                        <span key={ci} className="tr-pax-child-row">
                          <span className="tr-pax-child">{`${c.firstName || ""} ${c.lastName || ""}`.trim() || "Enfant"}</span>
                          {c.birthDate && <span className="tr-pax-dob">{fmtBirthDate(c.birthDate)}</span>}
                        </span>
                      ))}
                      <span className="tr-pax-parent">{p.nom} · {p.phone}</span>
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
                      ].filter(Boolean))].map((optionCity) => (
                        <option key={optionCity} value={optionCity}>
                          {optionCity}{isQuaiCity(transport, optionCity) ? " · quai" : ""}
                        </option>
                      ))}
                    </select>
                    <div className="tr-pax-ref">{p.numeroDeReservation}</div>
                    <button type="button" className="tr-pax-open-res" title="Ouvrir la réservation"
                      onClick={() => openReservation(p)} style={{ marginLeft: 2 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </button>
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
            );
          })}
        </div>
      )}

      {/* Reservation modal */}
      {resModal && (
        <div className="tr-res-overlay" onClick={(e) => { if (e.target === e.currentTarget) setResModal(null); }}>
          <div className="tr-res-modal">
            <ReservationPanel
              item={resModal.item}
              initialTab="edit"
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

function OperationsTab({ transport, allReservations, staffMembers, staffContracts, onUpdate, focusSegmentId, cityOptions = [] }) {
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

  const openReservationById = async (reservationId) => {
    if (!reservationId) return;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId));
      if (snap.exists()) setResModal({ item: mapReservation(snap) });
      else showToast("Réservation introuvable", "error");
    } catch { showToast("Erreur de chargement", "error"); }
  };

  const openReservation = async (child) => {
    const passenger = (transport.passengers || []).find((item) => item.reservationId === child?.reservationId)
      || (transport.passengers || []).find((item) =>
        passengerSearchNames(item).some((name) => normalizeSearchKey(name) === normalizeSearchKey(childFullName(child))),
      )
      || {
        reservationId: child?.reservationId,
        childName: childFullName(child),
        children: [child],
      };
    const resolved = resolveReservationFromPassenger(passenger, allReservations, transport);
    if (!resolved) {
      showToast("Réservation introuvable pour cet enfant", "error");
      return;
    }
    return openReservationById(resolved.id);
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

  const cityChoicesFor = (...currentValues) => {
    const choices = new Map();
    [...cityOptions, ...currentValues].filter(Boolean).forEach((city) => {
      const key = normalizePlace(city);
      if (!key || choices.has(key)) return;
      choices.set(key, city);
    });
    return [...choices.values()];
  };

  const defaultCityPair = (items) => {
    const previousTo = items.at(-1)?.to || transport.departureCity || "";
    const choices = cityChoicesFor(previousTo, transport.departureCity, transport.arrivalCity);
    const from = choices.find((city) => normalizePlace(city) === normalizePlace(previousTo)) || choices[0] || "";
    const to = choices.find((city) => normalizePlace(city) !== normalizePlace(from)) || "";
    return { from, to };
  };

  const addSubStop = (segmentId) => {
    setSegments((items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const stops = segmentSubStops(segment);
      return {
        ...segment,
        stops: [...stops, {
          id: crypto.randomUUID(),
          city: "",
          stopType: "quai",
          meetingPoint: "",
          meetingTime: "",
          departureTime: "",
          arrivalTime: "",
          platform: "",
          instructions: "Montée/descente sur le quai uniquement, pas de rendez-vous organisé.",
        }],
      };
    }));
  };

  const updateSubStop = (segmentId, stopId, key, value) => {
    setSegments((items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      return {
        ...segment,
        stops: segmentSubStops(segment).map((stop) => stop.id === stopId ? { ...stop, [key]: value } : stop),
      };
    }));
  };

  const removeSubStop = (segmentId, stopId) => {
    setSegments((items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      return {
        ...segment,
        stops: segmentSubStops(segment).filter((stop) => stop.id !== stopId),
      };
    }));
  };

  const addSegment = () => {
    const newId = crypto.randomUUID();
    setSegments((items) => {
      const { from, to } = defaultCityPair(items);
      return [...items, {
        id: newId,
        from,
        to,
        meetingTime: "",
        meetingPoint: "",
        departureTime: "",
        arrivalTime: "",
        mode: "TGV",
        number: "",
        platform: "",
        stopType: "rdv",
        instructions: "",
        assignedStaffIds: [],
      }];
    });
    setEditingSegmentId(newId);
  };

  const moveSegment = (segmentId, direction) => {
    setSegments((items) => {
      const index = items.findIndex((segment) => segment.id === segmentId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeSegment = (segmentId) => {
    setSegments((items) => items.filter((segment) => segment.id !== segmentId));
    setTickets((items) => items.filter((ticket) => ticket.segmentId !== segmentId));
    if (editingSegmentId === segmentId) setEditingSegmentId("__bilan__");
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
    const firstSegment = segments[0];
    setTickets((items) => [...items, {
      id: newId,
      name: firstSegment ? `Billet à acheter - ${segmentRouteLabel(firstSegment)}` : "Billet à acheter",
      segmentId: firstSegment?.id || "",
      seats: firstSegment ? requiredSeatsForSegment({ ...transport, segments }, firstSegment, 0) || 1 : 1,
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
      const knownCityKeys = new Set(cityChoicesFor(transport.departureCity, transport.arrivalCity).map((city) => normalizePlace(city)).filter(Boolean));
      const invalidSegment = segments.find((segment) =>
        !knownCityKeys.has(normalizePlace(segment.from)) || !knownCityKeys.has(normalizePlace(segment.to)),
      );
      const invalidStop = segments.flatMap((segment) => segmentSubStops(segment)).find((stop) =>
        !knownCityKeys.has(normalizePlace(stop.city)),
      );
      if (invalidSegment || invalidStop) {
        showToast("Chaque segment doit utiliser une ville présente dans Points de RDV.", "error");
        return;
      }

      const first = segments[0];
      const last = segments.at(-1);
      const segmentIds = new Set(segments.map((segment) => segment.id).filter(Boolean));
      const linkedTickets = tickets.filter((ticket) => ticket.segmentId && segmentIds.has(ticket.segmentId));
      const patch = {
        ...meta,
        segments,
        staff,
        tickets: linkedTickets,
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
    const segmentTickets = tickets.filter((ticket) => ticket.segmentId === segmentId);
    const autoSeats = segIdx >= 0
      ? missingSeatsForSegment(activeT, segments[segIdx], segIdx, segmentTickets)
      : 1;
    setTickets((items) => [...items, {
      id: newId, name: `Billet à acheter - ${segIdx >= 0 ? segmentRouteLabel(segments[segIdx]) : "segment"}`, segmentId, seats: autoSeats || 1,
      price: "", departureTime: "", arrivalTime: "", bookingReference: "", purchased: false, url: "",
    }]);
    setEditingTicketId(newId);
  };

  return (
    <div className="tr-ops-simple">

      {/* Segments */}
      {segments.length === 0 && (
        <div className="tr-seg-empty">Aucun segment. Cliquez sur "+ Segment" pour commencer.</div>
      )}

      {segments.map((seg, i) => {
        const isRetour = activeT.direction === "retour";
        const rawSegTix = tickets.filter((t) => t.segmentId === seg.id);
        const segTix = rawSegTix.map((ticket) => displayTicketForSegment(ticket, activeT, seg, i, rawSegTix));
        const segPassengers = passengersOnSegment(activeT, i);
        const mainStop = routeBoardingStops(activeT).find((stop) => stop.type === "main" && stop.segmentIndex === i);
        const mainStopOrder = mainStop?.order ?? i;
        const passengersAlreadyHere = isRetour
          ? passengersAfterStop(activeT, mainStopOrder)
          : passengersBeforeStop(activeT, mainStopOrder);
        const passengersBoardingHere = passengersAtStop(activeT, segmentStopCity(activeT, seg));
        const segKids = segPassengers.flatMap(p =>
          (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
            .map(c => ({ ...c, reservationId: p.reservationId }))
        );
        const kidsAlreadyHere = passengersAlreadyHere.flatMap(p =>
          (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
            .map(c => ({ ...c, reservationId: p.reservationId }))
        );
        const kidsBoardingHere = passengersBoardingHere.flatMap(p =>
          (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
            .map(c => ({ ...c, reservationId: p.reservationId }))
        );
        const childCount = segKids.length;
        const assignedStaff = staff.filter(m => (seg.assignedStaffIds || []).includes(m.id));
        const staffCount = assignedStaff.length;
        const needed = childCount + staffCount;
        const bought = purchasedSeatsForSegmentTickets(rawSegTix);
        const seatsOk = needed === 0 || bought >= needed;
        const missingTicketIds = new Set(segTix.flatMap((ticket) => ticket.missingReservationIds || []));
        const segmentStops = segmentSubStops(seg);
        const trainLabel = `${seg.mode || "Transport"}${seg.number ? ` ${seg.number}` : ""}`;
        const segmentCityChoices = cityChoicesFor(seg.from, seg.to);

        return (
          <div key={seg.id} className="tr-ops-seg">
            <div className="tr-ops-seg-head">
              <span className="tr-ops-seg-num">{i + 1}</span>
              <div className="tr-ops-seg-order" aria-label="Ordre du segment">
                <button type="button" onClick={() => moveSegment(seg.id, -1)} disabled={i === 0} title="Monter le segment">↑</button>
                <button type="button" onClick={() => moveSegment(seg.id, 1)} disabled={i === segments.length - 1} title="Descendre le segment">↓</button>
              </div>
              <div className="tr-ops-seg-main">
                <span className="tr-ops-seg-title">{seg.from || "Départ"} → {seg.to || "Arrivée"}</span>
                <div className="tr-ops-seg-summary">
                  <span><strong>{seg.departureTime || "--:--"}</strong> → <strong>{seg.arrivalTime || "--:--"}</strong></span>
                  <span>{trainLabel}</span>
                  <span>{childCount} enfant{childCount !== 1 ? "s" : ""}</span>
                  <span>{staffCount} anim.</span>
                  <span className={seatsOk ? "is-ok" : "is-short"}>Billets {bought}/{needed || 0}</span>
                  {segmentStops.length > 0 && <span>{segmentStops.length} étape{segmentStops.length > 1 ? "s" : ""}</span>}
                </div>
              </div>
              <button type="button" className="tr-ops-seg-del"
                onClick={() => removeSegment(seg.id)}>
                Supprimer
              </button>
            </div>

            {/* Train info inline */}
            <details className="tr-ops-details">
              <summary>Détails du segment</summary>
              <div className="tr-ops-train-row">
              <label className="tr-ops-field-sm">
                <span>De</span>
                <select className="dash-input" value={seg.from || ""} onChange={(e) => updateItem(setSegments, seg.id, "from", e.target.value)}>
                  <option value="">Ville RDV...</option>
                  {segmentCityChoices.map((city) => <option key={`from-${seg.id}-${city}`} value={city}>{city}</option>)}
                </select>
              </label>
              <label className="tr-ops-field-sm">
                <span>À</span>
                <select className="dash-input" value={seg.to || ""} onChange={(e) => updateItem(setSegments, seg.id, "to", e.target.value)}>
                  <option value="">Ville RDV...</option>
                  {segmentCityChoices.map((city) => <option key={`to-${seg.id}-${city}`} value={city}>{city}</option>)}
                </select>
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
              <label className="tr-ops-field-sm">
                <span>Type arrêt</span>
                <select className="dash-input" value={segmentStopType(seg)} onChange={(e) => updateItem(setSegments, seg.id, "stopType", e.target.value)}>
                  <option value="rdv">RDV organisé</option>
                  <option value="quai">Quai uniquement</option>
                </select>
              </label>
              </div>
            </details>

            <details className="tr-ops-details">
              <summary>
                Villes étapes
                {segmentStops.length > 0 && <span>{segmentStops.length}</span>}
              </summary>
              <div className="tr-ops-substops">
              <div className="tr-ops-substops-head">
                <span>Villes étapes</span>
                <small>Arrêt sur le quai, sans RDV séparé et sans billet de continuation.</small>
                <button type="button" className="dash-btn" onClick={() => addSubStop(seg.id)}>+ Ville étape</button>
              </div>
              {segmentSubStops(seg).length === 0 && (
                <p className="tr-add-empty">Aucune ville étape sur ce segment.</p>
              )}
              {segmentSubStops(seg).map((stop) => (
                <div key={stop.id} className="tr-ops-substop-row">
                  <label>
                    <span>Ville</span>
                    <select className="dash-input" value={stop.city || ""} onChange={(e) => updateSubStop(seg.id, stop.id, "city", e.target.value)}>
                      <option value="">Ville RDV...</option>
                      {cityChoicesFor(stop.city, seg.from, seg.to).map((city) => (
                        <option key={`stop-${stop.id}-${city}`} value={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Arrivée</span>
                    <input className="dash-input" type="time" value={stop.arrivalTime || ""} onChange={(e) => updateSubStop(seg.id, stop.id, "arrivalTime", e.target.value)} />
                  </label>
                  <label>
                    <span>Départ</span>
                    <input className="dash-input" type="time" value={stop.departureTime || ""} onChange={(e) => updateSubStop(seg.id, stop.id, "departureTime", e.target.value)} />
                  </label>
                  <label>
                    <span>Quai / voie</span>
                    <input className="dash-input" value={stop.platform || ""} onChange={(e) => updateSubStop(seg.id, stop.id, "platform", e.target.value)} placeholder="Voie 3" />
                  </label>
                  <button type="button" className="tr-pax-remove" title="Supprimer la ville étape" onClick={() => removeSubStop(seg.id, stop.id)}>×</button>
                </div>
              ))}
              </div>
            </details>

            {/* Animateurs - direct checkboxes + quick-add from contracts */}
            <details className="tr-ops-details">
              <summary>
                Animateurs
                {staffCount > 0 && <span>{staffCount}</span>}
              </summary>
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
            </details>

            {/* Enfants sur ce segment */}
            {(segKids.length > 0 || segmentSubStops(seg).length > 0) && (
              <details className="tr-ops-details">
                <summary>
                  Enfants
                  <span>{segKids.length}</span>
                </summary>
                <div className="tr-ops-enfants">
                <span className="tr-ops-anims-label">
                  Enfants
                  <span className="tr-ops-anims-count">{segKids.length}</span>
                </span>
                {kidsAlreadyHere.length > 0 && (
                  <div className="tr-ops-stop-group" style={{ order: isRetour ? 3 : 1 }}>
                    <span className="tr-ops-stop-title">{isRetour ? "Restent après l'arrêt" : "Déjà présents dans le train"}</span>
                    <div className="tr-ops-stop-kids">
                      {kidsAlreadyHere.map((c, ci) => (
                        <ChildChip key={`already-${ci}`} child={c} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                      ))}
                    </div>
                  </div>
                )}
                {kidsBoardingHere.length > 0 && (
                  <div className="tr-ops-stop-group" style={{ order: isRetour ? 2 : 2 }}>
                    <span className="tr-ops-stop-title">{stopActionText(activeT, segmentStopCity(activeT, seg))}</span>
                    <div className="tr-ops-stop-kids">
                      {kidsBoardingHere.map((c, ci) => (
                        <ChildChip key={`boarding-${ci}`} child={c} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                      ))}
                    </div>
                  </div>
                )}
                {segmentSubStops(seg).map((stop, stopIndex) => {
                  const routeStop = routeBoardingStops(activeT).find((item) =>
                    item.type === "sub" && item.segmentIndex === i && item.stopIndex === stopIndex,
                  );
                  const stopOrder = routeStop?.order ?? i;
                  const alreadyAtStopPassengers = isRetour
                    ? passengersAfterStop(activeT, stopOrder)
                    : passengersBeforeStop(activeT, stopOrder);
                  const alreadyAtStop = alreadyAtStopPassengers.flatMap(p =>
                    (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
                      .map(c => ({ ...c, reservationId: p.reservationId }))
                  );
                  const boardingAtStop = passengersAtStop(activeT, stop.city).flatMap(p =>
                    (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
                      .map(c => ({ ...c, reservationId: p.reservationId }))
                  );
                  const stopTimes = [
                    stop.arrivalTime ? `Arrivée ${stop.arrivalTime}` : null,
                    stop.departureTime ? `Départ ${stop.departureTime}` : null,
                    stop.platform ? `Voie ${stop.platform}` : null,
                  ].filter(Boolean);
                  return (
                    <div key={stop.id || `${stop.city}-${stopIndex}`} className="tr-ops-stop-group is-quai-stop is-inline" style={{ order: isRetour ? 1 : 3 }}>
                      <div className="tr-ops-stop-main">
                        <span className="tr-ops-stop-badge">Étape quai</span>
                        <strong>{stop.city || "Ville à compléter"}</strong>
                        <span className="tr-ops-stop-time">{stopTimes.join(" · ") || "Horaires à compléter"}</span>
                      </div>
                      <div className="tr-ops-stop-counts">
                        <span>{isRetour ? "Restent après" : "Déjà présents"} <strong>{alreadyAtStop.length}</strong></span>
                        <span>{stopActionLabel(activeT)} <strong>{boardingAtStop.length}</strong></span>
                      </div>
                      {boardingAtStop.length > 0 && (
                        <div className="tr-ops-stop-kids">
                          {boardingAtStop.map((c, ci) => (
                            <ChildChip key={`stop-${stopIndex}-${ci}`} child={c} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </details>
            )}

            {/* Billets */}
            <details className="tr-ops-details">
              <summary>
                Billets
                <span className={seatsOk ? "is-ok" : "is-short"}>{bought}/{needed || 0}</span>
              </summary>
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
              {segTix.map((ticket) => {
                const usedSeats = ticketUsedSeats(ticket, segPassengers, assignedStaff);
                const freeSeats = ticketFreeSeats(ticket, segPassengers, assignedStaff);
                return (
                  <div key={ticket.id} className={`tr-ticket-card${ticket.purchased ? " is-bought" : " is-missing"}`} onClick={() => setEditingTicketId(ticket.id)}>
                    <span className={`tr-ticket-status${ticket.purchased ? " is-bought" : " is-missing"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span>
                    <div className="tr-ticket-card-info">
                      <span className="tr-ticket-card-name">{ticket.name || "Billet sans titre"}</span>
                      <div className="tr-ticket-card-meta">
                        {ticket.seats > 0 && <span>{ticket.seats} place{ticket.seats !== 1 ? "s" : ""}</span>}
                        {ticket.purchased && ticket.seats > 1 && <span>{usedSeats} utilisée{usedSeats !== 1 ? "s" : ""} ({childCount} enf. + {staffCount} anim.)</span>}
                        {ticket.purchased && ticket.seats > 1 && <span className={freeSeats > 0 ? "tr-ticket-free-seats" : ""}>{freeSeats} libre{freeSeats !== 1 ? "s" : ""}</span>}
                        {ticket.price ? <span>{formatMoney(Number(ticket.price))}</span> : null}
                        {ticket.bookingReference && <span>{ticket.bookingReference}</span>}
                      </div>
                    </div>
                    {ticket.url && <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-ticket-card-pdf" onClick={(e) => e.stopPropagation()}>PDF</a>}
                    <button type="button" className="tr-pax-remove" title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); setTickets((items) => items.filter((it) => it.id !== ticket.id)); }}>×</button>
                  </div>
                );
              })}
              </div>
            </details>
          </div>
        );
      })}

      <button type="button" className="tr-ops-add-seg" onClick={addSegment}>+ Ajouter un segment</button>

      {/* Équipe du convoi */}
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

      {/* Reservation modal */}
      {resModal && (
        <div className="tr-res-overlay" onClick={(e) => { if (e.target === e.currentTarget) setResModal(null); }}>
          <div className="tr-res-modal">
            <ReservationPanel
              item={resModal.item}
              initialTab="edit"
              onClose={() => setResModal(null)}
              onSave={(updated) => setResModal({ item: updated })}
              onDelete={() => setResModal(null)}
              onStatusChange={(updated) => setResModal({ item: updated })}
            />
          </div>
        </div>
      )}

      {/* Ticket detail modal */}
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
                      ? <span><a href={ticket.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Voir le billet</a> · Cliquer pour remplacer</span>
                      : <span>{uploading ? "Téléversement…" : "Déposer le PDF - les champs seront remplis automatiquement"}</span>
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
                      <option value="">- Affecter à une portion -</option>
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

function ChildChip({ child, missingTicketIds, openReservation }) {
  const missingTicket = child.reservationId && missingTicketIds.has(child.reservationId);
  return (
    <button
      type="button"
      className={`tr-ops-enfant-chip${missingTicket ? " is-ticket-missing" : ""}`}
      onClick={() => openReservation(child)}
      title={missingTicket ? "Billet manquant" : "Ouvrir la réservation"}
    >
      {`${child.firstName || ""} ${child.lastName || ""}`.trim() || "Enfant"}
      {child.birthDate && <span className="tr-ops-enfant-dob">{fmtBirthDate(child.birthDate)}</span>}
      {missingTicket && <span className="tr-ops-enfant-ticket-warn">Billet manquant</span>}
      <svg className="tr-ops-enfant-link" width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </button>
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
        <div className="tr-doc-card-icon">PDF</div>
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
        <div className="tr-doc-card-icon">Billets</div>
        <div className="tr-doc-card-body">
          <div className="tr-doc-card-title">Liste des passagers</div>
          <div className="tr-doc-card-desc">
            Tableau interne pour le convoyeur - noms, téléphones, enfants, numéros de réservation.
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
        <div className="tr-doc-card-icon">✉</div>
        <div className="tr-doc-card-body">
          <div className="tr-doc-card-title">Convocations groupées</div>
          <div className="tr-doc-card-desc">
            Une page de convocation par famille - {transport.passengers.length} page{transport.passengers.length !== 1 ? "s" : ""}. Prêt pour impression et découpe.
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
                  {p.nom} - {p.children?.length > 0 ? p.children.map(c => `${c.firstName||""} ${c.lastName||""}`.trim()).join(", ") : p.childName}
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
  const sejours = useSejours();
  const [form, setForm] = useState({
    sejourName:    transport.sejourName !== "-" ? transport.sejourName : "",
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
            <select className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)}>
              {form.sejourName && !sejours.some(x => x.name === form.sejourName) && (
                <option value={form.sejourName}>{form.sejourName}</option>
              )}
              <option value="">- Sélectionner un séjour -</option>
              {sejours.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
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

/* Right panel */

function cityRowsFromTransport(transport) {
  const rows = new Map();
  (transport.segments || []).forEach((segment) => {
    const city = segmentStopCity(transport, segment);
    const key = normalizePlace(city);
    if (!key || rows.has(key)) return;
    rows.set(key, {
      city,
      meetingPoint: segment.meetingPoint || "",
      meetingTime: segment.meetingTime || "",
      platform: segment.platform || "",
      stopType: segmentStopType(segment),
      instructions: segment.instructions || "",
    });
  });
  return [...rows.values()].sort((a, b) => cityRouteOrder(transport, a.city) - cityRouteOrder(transport, b.city));
}

function CityStopsTab({ transport, onUpdate }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => cityRowsFromTransport(transport));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(cityRowsFromTransport(transport));
  }, [transport]);

  const updateRow = (city, key, value) => {
    setRows((items) => items.map((item) => item.city === city ? { ...item, [key]: value } : item));
  };

  const patchSegmentsWithRows = (targetTransport, cityMap) => ({
    ...targetTransport,
    segments: (targetTransport.segments || []).map((segment) => {
      const city = segmentStopCity(targetTransport, segment);
      const patch = cityMap.get(normalizePlace(city));
      return patch ? { ...segment, ...patch } : segment;
    }),
  });

  const save = async () => {
    setSaving(true);
    try {
      const cityMap = new Map(rows.map((row) => [normalizePlace(row.city), {
        meetingPoint: row.meetingPoint || "",
        meetingTime: row.meetingTime || "",
        platform: row.platform || "",
        stopType: row.stopType || "rdv",
        instructions: row.instructions || "",
      }]));
      const snap = await getDocs(collection(db, COLLECTIONS.TRANSPORTS));
      let updatedCount = 0;
      let updatedCurrent = transport;

      for (const transportDoc of snap.docs) {
        const current = { id: transportDoc.id, ...transportDoc.data() };
        const patched = patchSegmentsWithRows(current, cityMap);
        if (JSON.stringify(current.segments || []) === JSON.stringify(patched.segments || [])) continue;
        await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, current.id), {
          segments: patched.segments,
          updatedAt: serverTimestamp(),
        });
        updatedCount += 1;
        if (current.id === transport.id) updatedCurrent = { ...transport, segments: patched.segments };
      }

      onUpdate(updatedCurrent);
      showToast(`Points de RDV enregistres sur ${updatedCount} trajet(s)`, "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de l'enregistrement des villes", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tr-city-tab">
      <div className="tr-city-head">
        <div>
          <strong>Villes et points de RDV</strong>
          <small>Une modification est appliquée à tous les trajets qui utilisent la même ville.</small>
        </div>
        <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving}>
          {saving ? "Replication..." : "Repliquer partout"}
        </button>
      </div>
      <div className="tr-city-list">
        {rows.map((row) => (
          <article key={row.city} className="tr-city-card">
            <div className="tr-city-card-title">
              <strong>{row.city}</strong>
              <span>{row.stopType === "quai" ? "Quai uniquement" : "RDV organisé"}</span>
            </div>
            <div className="tr-city-simple">
              <label>
                <span>Type d'arrêt</span>
                <select className="dash-input" value={row.stopType} onChange={(event) => updateRow(row.city, "stopType", event.target.value)}>
                  <option value="rdv">RDV organisé</option>
                  <option value="quai">Quai uniquement</option>
                </select>
              </label>
              <label style={{ flex: 2 }}>
                <span>Lieu de RDV</span>
                <input className="dash-input" value={row.meetingPoint} onChange={(event) => updateRow(row.city, "meetingPoint", event.target.value)} placeholder="Ex : Hall principal de la gare, côté boulevard..." />
              </label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function cityRowsFromAllTransports(transports, cityStops = []) {
  const rows = new Map();
  const ingestCity = (transport, segment, city, useStopDetails = false) => {
    const key = normalizePlace(city);
    if (!key) return;
    const canReadStopDetails = useStopDetails
      || normalizePlace(city) === normalizePlace(segmentStopCity(transport, segment));
    const previous = rows.get(key);
    const row = previous || {
      city,
      meetingPoint: canReadStopDetails ? segment.meetingPoint || "" : "",
      meetingTime: canReadStopDetails ? segment.meetingTime || "" : "",
      platform: canReadStopDetails ? segment.platform || "" : "",
      stopType: canReadStopDetails ? segmentStopType(segment) : "rdv",
      instructions: canReadStopDetails ? segment.instructions || "" : "",
      tripCount: 0,
      order: Number.MAX_SAFE_INTEGER,
    };
    row.tripCount += 1;
    row.order = Math.min(row.order, cityRouteOrder(transport, city));
    if (canReadStopDetails) {
      if (!row.meetingPoint && segment.meetingPoint) row.meetingPoint = segment.meetingPoint;
      if (!row.meetingTime && segment.meetingTime) row.meetingTime = segment.meetingTime;
      if (!row.platform && segment.platform) row.platform = segment.platform;
      if (!row.instructions && segment.instructions) row.instructions = segment.instructions;
      if (segmentStopType(segment) === "quai") row.stopType = "quai";
    }
    rows.set(key, row);
  };
  (transports || []).forEach((transport) => {
    const transportSegments = transport.segments || [];
    if (!transportSegments.length) {
      const fallbackSegment = {
        meetingPoint: transport.meetingPoint || "",
        meetingTime: transport.meetingTime || "",
        platform: transport.platform || "",
        stopType: transport.stopType || "rdv",
        instructions: transport.instructions || "",
      };
      ingestCity(transport, fallbackSegment, transport.departureCity);
      ingestCity(transport, fallbackSegment, transport.arrivalCity);
    }
    transportSegments.forEach((segment) => {
      ingestCity(transport, segment, segment.from);
      ingestCity(transport, segment, segment.to);
      segmentSubStops(segment).forEach((stop) => ingestCity(transport, { ...segment, ...stop }, stop.city, true));
    });
  });
  (cityStops || []).forEach((stop) => {
    const key = normalizePlace(stop.city);
    if (!key || key === "sur place") return;
    const previous = rows.get(key) || {
      city: stop.city,
      meetingPoint: "",
      meetingTime: "",
      platform: "",
      stopType: "rdv",
      instructions: "",
      tripCount: 0,
      order: Number.MAX_SAFE_INTEGER,
    };
    rows.set(key, {
      ...previous,
      city: stop.city || previous.city,
      meetingPoint: stop.meetingPoint || "",
      meetingTime: stop.meetingTime || "",
      platform: stop.platform || "",
      stopType: stop.stopType || "rdv",
      instructions: stop.instructions || "",
      isReference: true,
    });
  });
  return [...rows.values()].sort((a, b) => {
    const order = a.order - b.order;
    if (order !== 0) return order;
    return a.city.localeCompare(b.city, "fr", { sensitivity: "base" });
  });
}

function cityOptionsFromTransports(transports, cityStops = []) {
  return cityRowsFromAllTransports(transports, cityStops).map((row) => row.city).filter(Boolean);
}

/* BilletsTab */

function ticketEditDraft(ticket) {
  return {
    name: ticket.name || "",
    segmentId: ticket.segmentId || "",
    seats: ticket.seats || 1,
    price: ticket.price ?? "",
    departureTime: ticket.departureTime || "",
    arrivalTime: ticket.arrivalTime || "",
    bookingReference: ticket.bookingReference || "",
    purchased: Boolean(ticket.purchased),
  };
}

function ticketGroupKey(ticket) {
  const ref = String(ticket.bookingReference || "").trim();
  if (ref) return `ref:${ref.toLowerCase()}`;
  return `ticket:${ticket.id}`;
}

function groupTicketRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = ticketGroupKey(row.ticket);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        bookingReference: row.ticket.bookingReference || "",
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map((group) => {
    const total = group.rows.reduce((sum, row) => sum + Number(row.ticket.price || 0), 0);
    const purchased = group.rows.filter((row) => row.ticket.purchased).length;
    const seats = group.rows.reduce((sum, row) => sum + Number(row.ticket.seats || 1), 0);
    const first = group.rows[0];
    return {
      ...group,
      total,
      purchased,
      seats,
      isGroup: group.rows.length > 1,
      name: group.rows.length > 1
        ? `Dossier ${group.bookingReference || "billets individuels"}`
        : first.ticket.name,
    };
  });
}

function BilletsTab({ transports, onBulkUpdate }) {
  const { showToast } = useToast();
  const [filterWeek, setFilterWeek]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingKey, setEditingKey]     = useState("");
  const [ticketDraft, setTicketDraft]   = useState(null);
  const [savingTicket, setSavingTicket] = useState(false);
  const [openTicketGroups, setOpenTicketGroups] = useState(new Set());

  const allRows = useMemo(() => {
    const out = [];
    for (const transport of transports) {
      out.push(...ticketRowsForTransport(transport));
    }
    const weekOrder = { S1: 0, S2: 1, S3: 2, S4: 3 };
    return out.sort((a, b) => {
      const wa = weekOrder[a.transport.week] ?? 99;
      const wb = weekOrder[b.transport.week] ?? 99;
      if (wa !== wb) return wa - wb;
      const dateOrder = (a.transport.date || "").localeCompare(b.transport.date || "");
      if (dateOrder !== 0) return dateOrder;
      const routeOrder = transportRouteLabel(a.transport).localeCompare(transportRouteLabel(b.transport), "fr");
      if (routeOrder !== 0) return routeOrder;
      const aSegmentIndex = (a.transport.segments || []).findIndex((segment) => segment.id === a.ticket.segmentId);
      const bSegmentIndex = (b.transport.segments || []).findIndex((segment) => segment.id === b.ticket.segmentId);
      return aSegmentIndex - bSegmentIndex;
    });
  }, [transports]);

  const filtered = useMemo(() => allRows.filter(({ ticket, transport }) => {
    if (filterWeek !== "all" && transport.week !== filterWeek) return false;
    if (filterStatus === "purchased" && !ticket.purchased) return false;
    if (filterStatus === "pending"   &&  ticket.purchased) return false;
    return true;
  }), [allRows, filterWeek, filterStatus]);

  const totalCost     = allRows.reduce((s, r) => s + Number(r.ticket.price || 0), 0);
  const purchasedRows = allRows.filter((r) => r.ticket.purchased);
  const pendingRows   = allRows.filter((r) => !r.ticket.purchased);

  const startTicketEdit = (transport, ticket) => {
    setEditingKey(`${transport.id}-${ticket.id}`);
    setTicketDraft(ticketEditDraft(ticket));
  };

  const cancelTicketEdit = () => {
    setEditingKey("");
    setTicketDraft(null);
  };

  const setTicketField = (key, value) => {
    setTicketDraft((current) => ({ ...current, [key]: value }));
  };

  const saveTicketEdit = async (transport, ticket) => {
    if (!ticketDraft) return;
    if (!ticketDraft.segmentId) {
      showToast("Choisis une portion avant d'enregistrer le billet", "warning");
      return;
    }
    setSavingTicket(true);
    try {
      const { virtual, ...ticketBase } = ticket;
      const updatedTicket = {
        ...ticketBase,
        ...ticketDraft,
        id: virtual ? crypto.randomUUID() : ticket.id,
        seats: Math.max(1, parseInt(ticketDraft.seats, 10) || 1),
        price: ticketDraft.price === "" ? "" : Number(String(ticketDraft.price).replace(",", ".")),
      };
      const nextTickets = virtual
        ? [...(transport.tickets || []), updatedTicket]
        : (transport.tickets || []).map((item) => item.id === ticket.id ? updatedTicket : item);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        tickets: nextTickets,
        updatedAt: serverTimestamp(),
      });
      onBulkUpdate([{ ...transport, tickets: nextTickets }]);
      cancelTicketEdit();
      showToast("Billet mis à jour", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la mise à jour du billet", "error");
    } finally {
      setSavingTicket(false);
    }
  };

  const deleteTicket = async (transport, ticket) => {
    if (ticket.virtual) return;
    if (!window.confirm(`Supprimer le billet "${ticket.name || "sans titre"}" ?`)) return;
    setSavingTicket(true);
    try {
      const nextTickets = (transport.tickets || []).filter((item) => item.id !== ticket.id);
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
        tickets: nextTickets,
        updatedAt: serverTimestamp(),
      });
      onBulkUpdate([{ ...transport, tickets: nextTickets }]);
      if (editingKey === `${transport.id}-${ticket.id}`) cancelTicketEdit();
      showToast("Billet supprimé", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la suppression du billet", "error");
    } finally {
      setSavingTicket(false);
    }
  };

  const toggleTicketGroup = (key) => {
    setOpenTicketGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const days = new Map();
    for (const row of filtered) {
      const day = row.transport.date || "Sans date";
      if (!days.has(day)) days.set(day, new Map());
      const trips = days.get(day);
      if (!trips.has(row.transport.id)) trips.set(row.transport.id, { transport: row.transport, rows: [] });
      trips.get(row.transport.id).rows.push(row);
    }
    return days;
  }, [filtered]);

  return (
    <div className="tr-bil-tab">
      <div className="tr-bil-kpis">
        <div className="tr-bil-kpi">
          <span>Total billets</span>
          <strong>{allRows.length}</strong>
          <small>{formatMoney(totalCost)}</small>
        </div>
        <div className="tr-bil-kpi is-ok">
          <span>Achetés</span>
          <strong>{purchasedRows.length}</strong>
          <small>{formatMoney(purchasedRows.reduce((s, r) => s + Number(r.ticket.price || 0), 0))}</small>
        </div>
        <div className={`tr-bil-kpi${pendingRows.length > 0 ? " is-warn" : " is-ok"}`}>
          <span>À acheter</span>
          <strong>{pendingRows.length}</strong>
          <small>{formatMoney(pendingRows.reduce((s, r) => s + Number(r.ticket.price || 0), 0))}</small>
        </div>
      </div>

      <div className="tr-bil-filter-bar">
        <div className="dash-subtabs">
          <button type="button" className={`dash-subtab${filterWeek === "all" ? " is-active" : ""}`} onClick={() => setFilterWeek("all")}>Toutes semaines</button>
          {WEEKS.map((w) => (
            <button key={w} type="button" className={`dash-subtab${filterWeek === w ? " is-active" : ""}`} onClick={() => setFilterWeek(w)}>{w}</button>
          ))}
        </div>
        <div className="dash-subtabs">
          {[["all", "Tous"], ["purchased", "Achetés"], ["pending", "À acheter"]].map(([val, label]) => (
            <button key={val} type="button" className={`dash-subtab${filterStatus === val ? " is-active" : ""}`} onClick={() => setFilterStatus(val)}>{label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="dash-empty-state" style={{ marginTop: 32 }}>
          <p>{allRows.length === 0 ? "Aucun billet saisi dans les trajets." : "Aucun billet ne correspond aux filtres."}</p>
        </div>
      )}

      {[...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "fr")).map(([day, trips]) => (
        <div key={day} className="tr-bil-week">
          <div className="tr-bil-week-hd">
            <span>{fmtDate(day)}</span>
            <small>{[...trips.values()][0]?.transport.week || ""}</small>
          </div>
          {[...trips.values()].sort((a, b) => transportRouteLabel(a.transport).localeCompare(transportRouteLabel(b.transport), "fr")).map(({ transport, rows }) => {
            const tripCost      = rows.reduce((s, r) => s + Number(r.ticket.price || 0), 0);
            const tripPurchased = rows.filter((r) => r.ticket.purchased).length;
            return (
              <div key={transport.id} className="tr-bil-trip-group">
                <div className="tr-bil-trip-hd">
                  <span className={`tr-days-dir is-${transport.direction}`}>{directionIcon(transport.direction)}</span>
                  <span className="tr-bil-trip-route">{transportRouteLabel(transport)}</span>
                  <span className="tr-bil-trip-date">{fmtDate(transport.date)}</span>
                  <span className={`tr-bil-trip-stat${tripPurchased === rows.length ? " is-ok" : " is-warn"}`}>
                    {tripPurchased}/{rows.length} acheté{rows.length !== 1 ? "s" : ""}
                  </span>
                  <span className="tr-bil-trip-cost">{formatMoney(tripCost)}</span>
                </div>
                <table className="tr-bil-table">
                  <thead>
                    <tr>
                      <th>Statut</th>
                      <th>Billet</th>
                      <th>Portion</th>
                      <th>Prix</th>
                      <th>PDF</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupTicketRows(rows).map((group) => {
                      const groupKey = `${transport.id}-${group.key}`;
                      const isOpen = openTicketGroups.has(groupKey);
                      const visibleRows = group.isGroup && !isOpen ? [] : group.rows;
                      return (
                        <Fragment key={groupKey}>
                          {group.isGroup && (
                            <tr className="tr-bil-row tr-bil-folder-row">
                              <td>
                                <span className={`tr-bil-badge${group.purchased === group.rows.length ? " is-ok" : " is-warn"}`}>
                                  {group.purchased}/{group.rows.length} billets
                                </span>
                              </td>
                              <td>
                                <button type="button" className="tr-bil-folder-btn" onClick={() => toggleTicketGroup(groupKey)}>
                                  <span>{isOpen ? "▾" : "▸"}</span>
                                  <strong>{group.name}</strong>
                                </button>
                                <span className="tr-bil-ref">{group.rows.length} billets individuels · {group.seats} place{group.seats > 1 ? "s" : ""}</span>
                              </td>
                              <td><span className="tr-bil-seg">Dossier d'achat</span></td>
                              <td className="tr-bil-price">{formatMoney(group.total)}</td>
                              <td>{group.rows.some((row) => row.ticket.url) ? "PDFs" : "—"}</td>
                              <td>
                                <button type="button" className="bil-edit-btn" onClick={() => toggleTicketGroup(groupKey)}>
                                  {isOpen ? "Masquer" : "Voir"}
                                </button>
                              </td>
                            </tr>
                          )}
                          {visibleRows.map(({ ticket, seg }) => {
                            const rowKey = `${transport.id}-${ticket.id}`;
                            const editing = editingKey === rowKey;
                            return (
                              <Fragment key={rowKey}>
                                <tr className={`tr-bil-row${ticket.purchased ? " is-bought" : " is-pending"}${group.isGroup ? " is-folder-child" : ""}`}>
                                  <td>
                                    <span className={`tr-bil-badge${ticket.purchased ? " is-ok" : " is-warn"}`}>
                                      {ticket.purchased ? "Acheté" : "À acheter"}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="tr-bil-name">{ticket.name || <em style={{ color: "var(--dash-muted)" }}>Sans titre</em>}</span>
                                    {ticket.bookingReference && <span className="tr-bil-ref">{ticket.bookingReference}</span>}
                                    {ticket.virtual && <span className="tr-bil-ref">Créé depuis le segment</span>}
                                  </td>
                                  <td>
                                    {seg
                                      ? <span className="tr-bil-seg">{segmentRouteLabel(seg)}</span>
                                      : <span className="tr-bil-seg-miss">Non définie</span>}
                                  </td>
                                  <td className="tr-bil-price">{ticket.price ? formatMoney(Number(ticket.price)) : "—"}</td>
                                  <td>
                                    {ticket.url
                                      ? <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-bil-pdf">PDF</a>
                                      : "—"}
                                  </td>
                                  <td>
                                    <div className="bil-actions">
                                      <button type="button" className="bil-edit-btn" onClick={() => editing ? cancelTicketEdit() : startTicketEdit(transport, ticket)}>
                                        {editing ? "Fermer" : ticket.virtual ? "Créer" : "Modifier"}
                                      </button>
                                      {!ticket.virtual && (
                                        <button type="button" className="bil-edit-btn is-danger" onClick={() => deleteTicket(transport, ticket)} disabled={savingTicket}>
                                          Supprimer
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {editing && (
                                  <tr className="tr-bil-edit-row">
                                    <td colSpan={6}>
                                      <div className="bil-edit-grid">
                                        <label className="bil-edit-span2">
                                          <span>Nom / référence</span>
                                          <input className="dash-input" value={ticketDraft?.name || ""} onChange={(event) => setTicketField("name", event.target.value)} />
                                        </label>
                                        <label>
                                          <span>Portion</span>
                                          <select className="dash-input" value={ticketDraft?.segmentId || ""} onChange={(event) => setTicketField("segmentId", event.target.value)}>
                                            <option value="">Non définie</option>
                                            {(transport.segments || []).map((segment) => (
                                              <option key={segment.id} value={segment.id}>{segmentRouteLabel(segment)}</option>
                                            ))}
                                          </select>
                                        </label>
                                        <label>
                                          <span>Places</span>
                                          <input className="dash-input" type="number" min="1" step="1" value={ticketDraft?.seats ?? 1} onChange={(event) => setTicketField("seats", event.target.value)} />
                                        </label>
                                        <label>
                                          <span>Prix (€)</span>
                                          <input className="dash-input" type="number" min="0" step="0.01" value={ticketDraft?.price ?? ""} onChange={(event) => setTicketField("price", event.target.value)} />
                                        </label>
                                        <label>
                                          <span>Départ</span>
                                          <input className="dash-input" type="time" value={ticketDraft?.departureTime || ""} onChange={(event) => setTicketField("departureTime", event.target.value)} />
                                        </label>
                                        <label>
                                          <span>Arrivée</span>
                                          <input className="dash-input" type="time" value={ticketDraft?.arrivalTime || ""} onChange={(event) => setTicketField("arrivalTime", event.target.value)} />
                                        </label>
                                        <label className="bil-edit-span2">
                                          <span>Référence achat / dossier</span>
                                          <input className="dash-input" value={ticketDraft?.bookingReference || ""} onChange={(event) => setTicketField("bookingReference", event.target.value)} />
                                        </label>
                                        <label className="bil-edit-check">
                                          <input type="checkbox" checked={Boolean(ticketDraft?.purchased)} onChange={(event) => setTicketField("purchased", event.target.checked)} />
                                          <span>Billet acheté</span>
                                        </label>
                                        <div className="bil-edit-actions">
                                          <button type="button" className="dash-btn" onClick={cancelTicketEdit} disabled={savingTicket}>Annuler</button>
                                          <button type="button" className="dash-btn dash-btn-primary" onClick={() => saveTicketEdit(transport, ticket)} disabled={savingTicket}>
                                            {savingTicket ? "Enregistrement..." : ticket.virtual ? "Créer le billet" : "Enregistrer"}
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* GlobalCityStopsTab */

function sortCityRows(rows) {
  return [...rows].sort((a, b) => {
    const order = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    if (order !== 0) return order;
    return a.city.localeCompare(b.city, "fr", { sensitivity: "base" });
  });
}

function GlobalCityStopsTab({ transports, cityStops, onBulkUpdate, onCityStopsChange }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => cityRowsFromAllTransports(transports, cityStops));
  const [newCity, setNewCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingCity, setDeletingCity] = useState("");

  useEffect(() => {
    setRows(cityRowsFromAllTransports(transports, cityStops));
  }, [transports, cityStops]);

  const updateRow = (city, key, value) => {
    setRows((items) => items.map((item) => item.city === city ? { ...item, [key]: value } : item));
  };

  const addCity = () => {
    const city = newCity.trim();
    if (!city) {
      showToast("Indique une ville à ajouter.", "warning");
      return;
    }
    if (normalizePlace(city) === "sur place") {
      showToast("Sur place reste géré séjour par séjour.", "warning");
      return;
    }
    if (rows.some((row) => normalizePlace(row.city) === normalizePlace(city))) {
      showToast("Cette ville existe déjà dans les points de RDV.", "warning");
      return;
    }
    setRows((items) => sortCityRows([...items, {
      id: cityStopDocId(city),
      city,
      meetingPoint: "",
      meetingTime: "",
      platform: "",
      stopType: "rdv",
      instructions: "",
      tripCount: 0,
      order: Number.MAX_SAFE_INTEGER,
      isReference: true,
    }]));
    setNewCity("");
  };

  const deleteCity = async (row) => {
    const cityKey = normalizePlace(row.city);
    if (!cityKey) return;
    if (row.tripCount > 0) {
      showToast("Cette ville est utilisée dans des segments. Retire-la des trajets avant de la supprimer.", "warning");
      return;
    }
    if (!window.confirm(`Supprimer le point de RDV "${row.city}" ?`)) return;
    setDeletingCity(cityKey);
    try {
      await deleteDoc(doc(db, COLLECTIONS.TRANSPORT_RDV_POINTS, cityStopDocId(row.city)));
      setRows((items) => items.filter((item) => normalizePlace(item.city) !== cityKey));
      onCityStopsChange((cityStops || []).filter((item) => normalizePlace(item.city) !== cityKey));
      showToast("Point de RDV supprimé", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la suppression du point de RDV", "error");
    } finally {
      setDeletingCity("");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const cityMap = new Map(rows.map((row) => [normalizePlace(row.city), {
        meetingPoint: row.meetingPoint || "",
        stopType: row.stopType || "rdv",
      }]));
      const updatedTransports = [];
      let updatedCount = 0;

      const referenceRows = rows.filter((row) => normalizePlace(row.city) && normalizePlace(row.city) !== "sur place");
      await Promise.all(referenceRows.map((row) => setDoc(
        doc(db, COLLECTIONS.TRANSPORT_RDV_POINTS, cityStopDocId(row.city)),
        {
          city: row.city.trim(),
          meetingPoint: row.meetingPoint || "",
          meetingTime: row.meetingTime || "",
          platform: row.platform || "",
          stopType: row.stopType || "rdv",
          instructions: row.instructions || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )));

      for (const transport of transports) {
        const patchedSegments = (transport.segments || []).map((segment) => {
          let patchedSegment = segment;
          const patch = cityMap.get(normalizePlace(segmentStopCity(transport, segment)));
          if (patch) {
            patchedSegment = { ...patchedSegment, meetingPoint: patch.meetingPoint, stopType: patch.stopType };
          }

          const patchedStops = segmentSubStops(segment).map((stop) => {
            const stopPatch = cityMap.get(normalizePlace(stop.city));
            return stopPatch ? { ...stop, meetingPoint: stopPatch.meetingPoint, stopType: stopPatch.stopType } : stop;
          });
          if (patchedStops.length) patchedSegment = { ...patchedSegment, stops: patchedStops };
          return patchedSegment;
        });
        if (JSON.stringify(transport.segments || []) === JSON.stringify(patchedSegments)) continue;
        await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
          segments: patchedSegments,
          updatedAt: serverTimestamp(),
        });
        updatedTransports.push({ ...transport, segments: patchedSegments });
        updatedCount += 1;
      }

      onBulkUpdate(updatedTransports);
      onCityStopsChange(referenceRows.map((row) => ({
        id: cityStopDocId(row.city),
        city: row.city.trim(),
        meetingPoint: row.meetingPoint || "",
        meetingTime: row.meetingTime || "",
        platform: row.platform || "",
        stopType: row.stopType || "rdv",
        instructions: row.instructions || "",
      })));
      showToast(`Points de RDV répliqués sur ${updatedCount} trajet(s)`, "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la réplication des villes", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tr-city-tab">
      <div className="tr-city-head">
        <div>
          <strong>Villes et points de RDV</strong>
          <small>Ces réglages sont globaux pour tous les trajets qui utilisent la ville.</small>
        </div>
        <button type="button" className="dash-btn dash-btn-primary" onClick={save} disabled={saving || rows.length === 0}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
      <div className="tr-city-add">
        <label>
          <span>Nouvelle ville</span>
          <input
            className="dash-input"
            value={newCity}
            onChange={(event) => setNewCity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCity();
              }
            }}
            placeholder="Ex : Saint-Chamond"
          />
        </label>
        <button type="button" className="dash-btn" onClick={addCity}>+ Ajouter la ville</button>
      </div>
      <div className="tr-city-list">
        {rows.map((row) => (
          <article key={row.city} className="tr-city-card">
            <div className="tr-city-card-title">
              <strong>{row.city}</strong>
              <div className="tr-city-card-actions">
                <span>{row.stopType === "quai" ? "Quai uniquement" : "RDV organisé"} · {row.tripCount} trajet{row.tripCount > 1 ? "s" : ""}</span>
                {row.isReference && (
                  <button
                    type="button"
                    className="tr-city-delete"
                    onClick={() => deleteCity(row)}
                    disabled={row.tripCount > 0 || deletingCity === normalizePlace(row.city)}
                    title={row.tripCount > 0 ? "Ville utilisée dans des segments" : "Supprimer ce point de RDV"}
                  >
                    {deletingCity === normalizePlace(row.city) ? "..." : "Supprimer"}
                  </button>
                )}
              </div>
            </div>
            <div className="tr-city-simple">
              <label>
                <span>Type d'arrêt</span>
                <select className="dash-input" value={row.stopType} onChange={(event) => updateRow(row.city, "stopType", event.target.value)}>
                  <option value="rdv">RDV organisé</option>
                  <option value="quai">Quai uniquement</option>
                </select>
              </label>
              <label style={{ flex: 2 }}>
                <span>Lieu de RDV</span>
                <input className="dash-input" value={row.meetingPoint} onChange={(event) => updateRow(row.city, "meetingPoint", event.target.value)} placeholder="Ex : Hall principal de la gare, côté boulevard..." />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* TripDetail - accordion inline (remplace le panel latéral) */

const TRIP_DETAIL_TABS = [
  { key: "segments",  label: "Segments & Billets" },
  { key: "enfants",   label: "Enfants" },
  { key: "documents", label: "Documents" },
  { key: "infos",     label: "Infos trajet" },
];

function TripDetail({
  transport: ext,
  allReservations,
  staffMembers,
  staffContracts,
  cityOptions = [],
  onClose,
  onSave,
  onDelete,
  onCreated,
}) {
  const { showToast } = useToast();
  const [transport, setTransport] = useState(ext);
  const [tab, setTab]             = useState("segments");
  const [deleting, setDeleting]   = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setTransport(ext), [ext]);

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
    } catch {
      showToast("Erreur lors de la suppression", "error");
    } finally {
      setDeleting(false);
    }
  };

  const confirmTrip = async () => {
    setConfirming(true);
    try {
      const patch = { status: "confirmé", updatedAt: serverTimestamp() };
      await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), patch);
      handleUpdate({ ...transport, ...patch });
      showToast("Trajet confirmé", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la confirmation", "error");
    } finally {
      setConfirming(false);
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
        departureTime: "", arrivalTime: "",
        trainType: transport.trainType, trainNumber: "",
        meetingPoint: "", meetingTime: "", platform: "",
        convoyeur: transport.convoyeur, convoyeurPhone: transport.convoyeurPhone,
        emergencyContact: transport.emergencyContact, emergencyPhone: transport.emergencyPhone,
        capacity: transport.capacity, status: "brouillon",
        notes: `Copie depuis le trajet ${transport.direction}. Horaires à compléter.`,
        passengers: compactTransportPassengers(transport.passengers.map((p) => ({
          ...p, pickupCity: p.returnCity || transport.arrivalCity,
        }))),
        segments: [...(transport.segments || [])].reverse().map((s) => ({
          ...s, id: crypto.randomUUID(), from: s.to, to: s.from,
          departureTime: "", arrivalTime: "", platform: "",
        })),
        staff: transport.staff || [], tickets: [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      const created = await addDoc(collection(db, COLLECTIONS.TRANSPORTS), payload);
      onCreated({ ...payload, id: created.id, dateMs: Date.now() });
      showToast("Trajet inverse créé en brouillon", "success");
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la duplication", "error");
    }
  };

  const isAller  = transport.direction === "aller";
  const dirColor = isAller ? "#16a34a" : "#ea580c";
  const sCfg     = STATUS_CFG[transport.status] || STATUS_CFG.brouillon;
  const childCount = countChildren(transport.passengers);

  return (
    <div className="tr-trip-detail">
      {/* Header */}
      <div className="tr-trip-detail-hd">
        <div className="tr-trip-detail-hd-row">
          <span className="tr-trip-dir-pill" style={{ background: `${dirColor}18`, color: dirColor, borderColor: `${dirColor}44` }}>
            {isAller ? "↑ Aller" : "↓ Retour"}
          </span>
          <strong className="tr-trip-detail-route">
            {transport.departureCity || "-"} → {transport.arrivalCity || "-"}
          </strong>
          <Badge label={sCfg.label} variant={sCfg.variant} />
          {transport.week && <span className="tr-train-chip">{transport.week}</span>}
          {transport.routeGroup && (
            <span className="tr-train-chip">{ROUTE_GROUPS.find(g => g.value === transport.routeGroup)?.label}</span>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="dash-btn" onClick={createReverseTrip} title="Dupliquer en trajet inverse">
            Dupliquer inverse
          </button>
          {transport.status !== "confirmé" && (
            <button type="button" className="dash-btn dash-btn-primary" onClick={confirmTrip} disabled={confirming}>
              {confirming ? "Confirmation…" : "Confirmer"}
            </button>
          )}
          <button type="button" className="dash-btn dash-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "…" : "Supprimer"}
          </button>
          <button type="button" className="tr-trip-close" onClick={onClose} title="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="tr-trip-detail-meta">
          {transport.date && <span>{fmtDate(transport.date)}</span>}
          {transport.departureTime && <span>Départ {transport.departureTime}</span>}
          {transport.arrivalTime && <span>Arrivée {transport.arrivalTime}</span>}
          {transport.convoyeur && <span>Convoyeur : {transport.convoyeur}</span>}
          {transport.trainType && transport.trainNumber && <span>Train : {transport.trainType} {transport.trainNumber}</span>}
          <span className="tr-trip-pax-chip">{childCount} enfant{childCount !== 1 ? "s" : ""}{transport.capacity ? ` / ${transport.capacity}` : ""}</span>
        </div>
        {(transport.segments || []).length > 0 && <TripTimeline transport={transport} />}
      </div>

      {/* Sub-tabs */}
      <nav className="tr-trip-detail-tabs">
        {TRIP_DETAIL_TABS.map((t) => (
          <button key={t.key} type="button"
            className={`tr-trip-detail-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "enfants" && <span className="tr-trip-tab-count">{childCount}</span>}
          </button>
        ))}
      </nav>

      {/* Body */}
      <div className="tr-trip-detail-body">
        {tab === "segments" && (
          <OperationsTab
            transport={transport}
            allReservations={allReservations}
            staffMembers={staffMembers}
            staffContracts={staffContracts}
            cityOptions={cityOptions}
            onUpdate={handleUpdate}
            focusSegmentId={null}
          />
        )}
        {tab === "enfants" && (
          <PassengersTab transport={transport} allReservations={allReservations} onUpdate={handleUpdate} />
        )}
        {tab === "documents" && <DocumentsTab transport={transport} />}
        {tab === "infos" && <TransportEditTab transport={transport} onSave={handleUpdate} />}
      </div>
    </div>
  );
}

/* TrajetsTab */

function TripCard({ trip, isExpanded, onToggle, reservations, staffMembers, staffContracts, cityOptions, onSave, onDelete, onCreated, zoneName }) {
  const childCount  = countChildren(trip.passengers);
  const segCount    = (trip.segments || []).length;
  const totalTix    = (trip.tickets || []).length;
  const boughtTix   = (trip.tickets || []).filter((tk) => tk.purchased).length;
  const missingTix  = (trip.segments || []).filter(
    (seg) => !(trip.tickets || []).some((tk) => tk.segmentId === seg.id),
  ).length;
  const sCfg = STATUS_CFG[trip.status] || STATUS_CFG.brouillon;

  return (
    <div className={`tr-trip-card-wrap${isExpanded ? " is-expanded" : ""}`}>
      <button type="button" className={`tr-trip-card${isExpanded ? " is-active" : ""}`} onClick={onToggle}>
        <div className="tr-trip-card-left">
          {zoneName && <span className="tr-trip-card-zone">{zoneName}</span>}
          <span className="tr-trip-card-route">
            {trip.departureCity || "?"} → {trip.arrivalCity || "?"}
          </span>
          <div className="tr-trip-card-meta">
            {trip.departureTime && <span>{trip.departureTime}</span>}
            <span>{childCount} enfant{childCount !== 1 ? "s" : ""}</span>
            {segCount > 0 && <span>{segCount} étape{segCount !== 1 ? "s" : ""}</span>}
            {trip.convoyeur && <span>Convoyeur : {trip.convoyeur}</span>}
          </div>
        </div>
        <div className="tr-trip-card-right">
          {missingTix > 0 ? (
            <span className="tr-tix-badge is-missing">⚠ {missingTix} billet{missingTix > 1 ? "s" : ""} manquant{missingTix > 1 ? "s" : ""}</span>
          ) : totalTix > 0 ? (
            <span className="tr-tix-badge is-ok">✓ {boughtTix}/{totalTix} billets</span>
          ) : (
            <span className="tr-tix-badge is-none">Aucun billet</span>
          )}
          <Badge label={sCfg.label} variant={sCfg.variant} />
          <span className="tr-trip-chevron">{"›"}</span>
        </div>
      </button>

      {isExpanded && (
        <TripDetail
          transport={trip}
          allReservations={reservations}
          staffMembers={staffMembers}
          staffContracts={staffContracts}
          cityOptions={cityOptions}
          onClose={() => onToggle()}
          onSave={onSave}
          onDelete={onDelete}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function TrajetsTab({ transports, reservations, staffMembers, staffContracts, cityStops, onSave, onDelete, onCreated, onCreate }) {
  const [selectedWeek, setSelectedWeek] = useState("S1");
  const [expandedId, setExpandedId]     = useState(null);
  const cityOptions = useMemo(() => cityOptionsFromTransports(transports, cityStops), [transports, cityStops]);

  const weekTransports = useMemo(
    () => transports.filter((t) => t.week === selectedWeek),
    [transports, selectedWeek],
  );

  const toggle = (tripId) => setExpandedId((prev) => (prev === tripId ? null : tripId));

  return (
    <div className="tr-trajets-tab">
      {/* Semaine selector */}
      <div className="tr-trajets-toolbar">
        <nav className="dash-subtabs">
          {WEEKS.map((week) => {
            const info = WEEK_INFO[week];
            const count = transports.filter((t) => t.week === week).length;
            return (
              <button key={week} type="button"
                className={`dash-subtab${selectedWeek === week ? " is-active" : ""}`}
                onClick={() => { setSelectedWeek(week); setExpandedId(null); }}>
                {info.label}&nbsp;<em>{info.dates}</em>
                {count > 0 && <span className="tr-week-count">{count}</span>}
              </button>
            );
          })}
        </nav>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onCreate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nouveau trajet
        </button>
      </div>

      {/* Aller + Retour de la semaine sélectionnée */}
      {[
        { dir: "aller",  date: WEEK_INFO[selectedWeek].aller,  label: "Premier jour - Aller" },
        { dir: "retour", date: WEEK_INFO[selectedWeek].retour, label: "Dernier jour - Retour" },
      ].map(({ dir, date, label }) => {
        const dayTrips  = weekTransports.filter((t) => t.date === date);
        const dayKids   = dayTrips.reduce((s, t) => s + countChildren(t.passengers), 0);
        const missingSegTix = dayTrips.reduce((s, t) =>
          s + (t.segments || []).filter((seg) => !(t.tickets || []).some((tk) => tk.segmentId === seg.id)).length, 0);

        return (
          <section key={dir} className={`tr-day-section tr-day-${dir}`}>
            <div className="tr-day-section-head">
              <div className="tr-day-section-label">
                <span className={`tr-days-dir is-${dir}`}>{dir === "aller" ? "↑ Aller" : "↓ Retour"}</span>
                <strong>{label}</strong>
                <time>{fmtDateLong(date)}</time>
              </div>
              <div className="tr-day-section-stats">
                {dayKids > 0 && <span className="tr-day-stat">{dayKids} enfants</span>}
                <span className="tr-day-stat">{dayTrips.length} trajet{dayTrips.length !== 1 ? "s" : ""}</span>
                {missingSegTix > 0 && (
                  <span className="tr-day-stat is-warn">{missingSegTix} billet{missingSegTix > 1 ? "s" : ""} manquant{missingSegTix > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>

            <div className="tr-day-trips">
              {ROUTE_GROUPS.filter((g) => g.value !== "direct").map((group) => {
                const trip = dayTrips.find((t) => t.routeGroup === group.value);
                if (!trip) {
                  return (
                    <div key={group.value} className="tr-trip-card is-missing">
                      <span className="tr-trip-card-zone">{group.label}</span>
                      <span className="tr-trip-card-empty">Trajet à créer</span>
                      <button type="button" className="dash-btn" onClick={onCreate}>+ Créer</button>
                    </div>
                  );
                }
                return (
                  <TripCard key={trip.id} trip={trip} zoneName={group.label}
                    isExpanded={expandedId === trip.id}
                    onToggle={() => toggle(trip.id)}
                    reservations={reservations} staffMembers={staffMembers}
                    staffContracts={staffContracts} cityOptions={cityOptions} onSave={onSave}
                    onDelete={(id) => { setExpandedId(null); onDelete(id); }}
                    onCreated={onCreated}
                  />
                );
              })}
              {dayTrips.filter((t) => t.routeGroup === "direct").map((trip) => (
                <TripCard key={trip.id} trip={trip} zoneName="Direct / autre"
                  isExpanded={expandedId === trip.id}
                  onToggle={() => toggle(trip.id)}
                  reservations={reservations} staffMembers={staffMembers}
                  staffContracts={staffContracts} cityOptions={cityOptions} onSave={onSave}
                  onDelete={(id) => { setExpandedId(null); onDelete(id); }}
                  onCreated={onCreated}
                />
              ))}
            </div>
          </section>
        );
      })}

      {weekTransports.length === 0 && (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--dash-muted)" }}>
          Aucun trajet pour {WEEK_INFO[selectedWeek].label}.
          <br />
          <button type="button" className="dash-btn dash-btn-primary" style={{ marginTop: 12 }} onClick={onCreate}>
            + Créer un trajet
          </button>
        </div>
      )}
    </div>
  );
}

/* ConvocationsTab */

function ConvocIndividuelle({ transport }) {
  const [idx, setIdx] = useState(0);
  const passengers = transport.passengers || [];
  if (!passengers.length) return null;

  const openDoc = (html) => {
    const win = openPrintableDocument(html);
    if (!win) return;
    win.focus();
    setTimeout(() => win.print(), 800);
  };

  return (
    <div className="tr-convoc-individual">
      <div className="tr-convoc-section-title">Convocation individuelle</div>
      <div className="tr-convoc-ind-row">
        <select className="dash-input" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {passengers.map((p, i) => (
            <option key={p.reservationId || i} value={i}>
              {p.nom} - {p.children?.length > 0 ? p.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ") : p.childName}
            </option>
          ))}
        </select>
        <button type="button" className="dash-btn dash-btn-primary"
          onClick={() => openDoc(buildSingleConvocHTML(transport, passengers[idx]))}>
          Générer PDF
        </button>
      </div>
    </div>
  );
}

function getEmailRdvInfo(transport, passenger) {
  const city = passengerCity(transport, passenger);
  const routeStop = routeStopForCity(transport, city);
  const seg = routeStop?.segment || null;
  const trainTime = routeStopTime(routeStop, transport, transport.direction === "retour" ? "arrival" : "departure")
    || seg?.departureTime
    || transport.departureTime
    || null;
  let rdvTime = seg?.meetingTime || null;
  if (!rdvTime && trainTime) {
    const [h, m] = trainTime.split(":").map(Number);
    const total = ((h * 60 + m - 60) % 1440 + 1440) % 1440;
    rdvTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : seg?.meetingPoint || transport.meetingPoint || "";
  const stopType = routeStop?.type === "sub" ? routeStop.stop?.stopType || "quai" : seg?.stopType || transport.stopType || "rdv";
  const platform = routeStop?.stop?.platform || seg?.platform || transport.platform || "";
  return { city, rdvTime, trainTime, meetingPoint, stopType, platform };
}

function getRetourInfo(transport, passenger, allTransports) {
  if (!allTransports) return null;
  const retourCity = normalizePlace(passenger.returnCity || passenger.pickupCity || "");
  const retourTransports = allTransports.filter(
    (t) => t.direction === "retour" && t.week === transport.week &&
      (!transport.sejourName || transport.sejourName === "-" || t.sejourName === transport.sejourName),
  );
  for (const rt of retourTransports) {
    const stopCities = new Set(transportStopCities(rt).map(normalizePlace).filter(Boolean));
    if (!retourCity || stopCities.has(retourCity) || stopCities.size === 0) {
      const routeStop = retourCity ? routeStopForCity(rt, retourCity) : null;
      const seg = routeStop?.segment || null;
      const arrivalTime = routeStopTime(routeStop, rt, "arrival") || seg?.arrivalTime || rt.arrivalTime || "";
      const arrivalCity = routeStop?.city || seg?.to || rt.arrivalCity || passenger.returnCity || "";
      const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : seg?.meetingPoint || rt.meetingPoint || "";
      const stopType = routeStop?.type === "sub" ? routeStop.stop?.stopType || "quai" : seg?.stopType || rt.stopType || "rdv";
      const platform = routeStop?.stop?.platform || seg?.platform || rt.platform || "";
      return { date: rt.date, arrivalTime, arrivalCity, meetingPoint, stopType, platform };
    }
  }
  return null;
}

function buildEmailBody(transport, passenger, rdvInfo, allTransports) {
  const children = passenger.children?.length
    ? passenger.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ")
    : passenger.childName;
  const { city, rdvTime, trainTime, meetingPoint, stopType, platform } = rdvInfo;
  const weekInfo = WEEK_INFO[transport.week] || null;
  const sejourShort = shortSejourName(transport.sejourName);
  const sejourDatesStr = weekInfo
    ? `du ${fmtDateLong(weekInfo.aller)} au ${fmtDateLong(weekInfo.retour)}`
    : "";
  const retourInfo = getRetourInfo(transport, passenger, allTransports);

  const lines = [
    `Bonjour,`,
    ``,
    `Nous vous adressons la convocation de transport pour ${children} dans le cadre du séjour « ${sejourShort} »${sejourDatesStr ? ` (${sejourDatesStr})` : ""}.`,
    ``,
    `- CONVOCATION ALLER -`,
    `Date : ${fmtDateLong(transport.date)}`,
    `Trajet : ${transport.departureCity} → ${transport.arrivalCity}`,
    `Ville d'embarquement : ${city}`,
    rdvTime ? `Heure de RDV : ${rdvTime}${trainTime ? ` (départ train prévu ${trainTime})` : ""}` : null,
    stopType === "quai" ? `Rendez-vous directement sur le quai${platform ? ` - voie ${platform}` : ""}.` : (meetingPoint ? `Lieu de RDV : ${meetingPoint}` : null),
    ``,
    retourInfo ? `- RETOUR -` : null,
    retourInfo ? `Date de retour : ${fmtDateLong(retourInfo.date)}` : null,
    retourInfo?.arrivalTime ? `Arrivée prévue : ${retourInfo.arrivalTime}${retourInfo.arrivalCity ? ` à ${retourInfo.arrivalCity}` : ""}` : null,
    retourInfo?.meetingPoint ? `Lieu de récupération : ${retourInfo.meetingPoint}` : null,
    retourInfo ? `` : null,
    `- CONSIGNES -`,
    `• Merci d'être présent(e) à l'heure de RDV, le train ne peut pas vous attendre.`,
    `• Munissez-vous d'une pièce d'identité et du numéro de réservation.`,
    `" En cas d'urgence ou d'imprévu, contactez-nous immédiatement :`,
    ...EMERGENCY_PHONES.map((n) => `  ${n}`),
    ``,
    `La convocation individuelle est jointe à cet email (document PDF à imprimer).`,
    ``,
    `Cordialement,`,
    `L'équipe ColoCrew`,
  ].filter((l) => l !== null);
  return lines.join("\n");
}

function buildConvocEmailHtml(transport, passenger, rdvInfo, allTransports, customIntro) {
  const children = passenger.children?.length
    ? passenger.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ")
    : passenger.childName || "";
  const firstNames = passenger.children?.length
    ? passenger.children.map((c) => c.firstName || "").filter(Boolean).join(" et ")
    : passenger.childName || "";
  const nbChildren = passenger.children?.length || 0;
  const { city, rdvTime, trainTime, meetingPoint, stopType, platform } = rdvInfo;
  const weekInfo = WEEK_INFO[transport.week] || null;
  // Use the real séjour name from the reservation, not the transport doc (which may say "Été 2026")
  const sejourReal = (passenger.sejourName && passenger.sejourName !== "-")
    ? passenger.sejourName
    : shortSejourName(transport.sejourName);
  const sejourShort = sejourReal;
  const retourInfo = getRetourInfo(transport, passenger, allTransports);

  const TBC = `<span style="color:#94a3b8;font-style:italic;">À confirmer</span>`;

  const allerRdv = (() => {
    if (stopType === "quai" && platform) return `<strong>Voie / Quai ${platform}</strong><br><span style="font-size:12px;color:#64748b;">Gare de ${city}</span>`;
    if (meetingPoint) return `<strong>${meetingPoint}</strong>${city ? `<br><span style="font-size:12px;color:#64748b;">Gare de ${city}</span>` : ""}`;
    if (city) return `<strong>${city}</strong>`;
    return TBC;
  })();

  const allerDate = transport.date
    ? `<strong>${fmtDateLong(transport.date)}</strong>${rdvTime ? `<br><span style="color:#16a34a;font-weight:700;">RDV à ${rdvTime}</span>` : ""}`
    : TBC;

  const allerTrain = trainTime ? `Départ train : <strong>${trainTime}</strong>` : TBC;
  const retourDate = retourInfo?.date ? `<strong>${fmtDateLong(retourInfo.date)}</strong>` : TBC;
  const retourArrivee = retourInfo?.arrivalTime
    ? `Arrivée <strong>${retourInfo.arrivalTime}</strong>${retourInfo.arrivalCity ? ` à <strong>${retourInfo.arrivalCity}</strong>` : ""}`
    : TBC;
  const retourLieu = (() => {
    if (!retourInfo) return TBC;
    const place = retourInfo.meetingPoint || retourInfo.arrivalCity || "";
    if (!place) return TBC;
    const quai = retourInfo.platform && !place.includes(retourInfo.platform)
      ? `<br><span style="font-size:12px;color:#64748b;">Quai / voie ${retourInfo.platform}</span>`
      : "";
    return `<strong>${place}</strong>${quai}`;
  })();

  const td0 = (last) => `style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;"`;
  const td1 = (last) => `style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;
  const td2 = (last) => `style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;

  const phones = EMERGENCY_PHONES.join(" / ");
  const introHtml = customIntro && customIntro.trim()
    ? customIntro.trim().split(/\n\n+/).map((para) => `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.75;">${para.replace(/\n/g, "<br/>")}</p>`).join("")
    : `<p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.75;"><strong>${firstNames || children}</strong> ${nbChildren > 1 ? "sont inscrits" : "est inscrit(e)"} au séjour <strong>${sejourShort}</strong>${weekInfo ? ` du <strong>${fmtDateLong(weekInfo.aller)}</strong> au <strong>${fmtDateLong(weekInfo.retour)}</strong>` : ""}.</p>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Convocation transport</title></head>
<body style="margin:0;padding:20px 8px;background:#f0ebff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,16,64,0.12);">
  <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #B8336A;"><tr>
    <td style="padding:20px 28px 16px;vertical-align:middle;">
      <table style="border-collapse:collapse;"><tr>
        <td style="padding:0 10px 0 0;vertical-align:middle;">
          <div style="background:#B8336A;border-radius:8px;width:38px;height:38px;text-align:center;line-height:38px;">
            <span style="color:#fff;font-weight:900;font-size:16px;">CC</span>
          </div>
        </td>
        <td style="vertical-align:middle;">
          <div style="font-size:19px;font-weight:900;color:#B8336A;">ColoCrew</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px;">réinventons les colos !</div>
        </td>
      </tr></table>
    </td>
    <td style="padding:20px 28px 16px;text-align:right;vertical-align:top;font-size:12px;color:#64748b;line-height:1.9;">
      <div>info@colocrew.com</div><div>01 84 21 02 30</div><div>colocrew.com</div>
    </td>
  </tr></table>
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#B8336A;">Convocation de transport — ${sejourShort}</h1>
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1e1040;">${passenger.nom}</p>
    ${introHtml}
  </div>
  <div style="padding:0 28px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead><tr>
        <td style="padding:11px 16px;background:#f8f9fa;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;width:27%;"></td>
        <th style="padding:12px 16px;background:#f0fdf4;color:#16a34a;font-weight:900;font-size:14px;text-align:center;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;">ALLER</th>
        <th style="padding:12px 16px;background:#fff7ed;color:#ea580c;font-weight:900;font-size:14px;text-align:center;border-bottom:2px solid #e5e7eb;">RETOUR</th>
      </tr></thead>
      <tbody>
        <tr>
          <td ${td0(false)}>Lieu de rendez-vous</td>
          <td ${td1(false)}>${allerRdv}</td>
          <td ${td2(false)}>${retourLieu}</td>
        </tr>
        <tr>
          <td ${td0(false)}>Date et heure RDV</td>
          <td ${td1(false)}>${allerDate}</td>
          <td ${td2(false)}>${retourDate}</td>
        </tr>
        <tr>
          <td ${td0(true)}>Infos train</td>
          <td ${td1(true)}>${allerTrain}</td>
          <td ${td2(true)}>${retourArrivee}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div style="margin:0 28px 20px;padding:14px 20px;background:linear-gradient(135deg,#fff0f6,#f5f0ff);border:1.5px solid #f3d0e6;border-radius:10px;text-align:center;">
    <p style="margin:0;font-size:15px;font-weight:800;color:#B8336A;">Permanence transport : ${phones}</p>
  </div>
  <div style="padding:0 28px 28px;">
    <h2 style="font-size:14px;font-weight:900;color:#1e1040;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f5f0ff;">Déroulement du transport encadré</h2>
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#374151;line-height:1.9;">
      <li>Le rendez-vous est fixe <strong>1h avant le départ du train.</strong></li>
      <li>Un animateur vous attendra avec un <strong>écriteau COLOCREW.</strong></li>
      <li>Merci de vous présenter à l'animateur.</li>
      <li>En cas d'urgence : <strong>${phones}</strong></li>
    </ul>
  </div>
  <div style="border-top:2px solid #f5f0ff;padding:16px 28px;text-align:center;background:#fdf8fc;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Association ColoCrew — SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">@_colocrew / ColoCrew</p>
  </div>
</div></body></html>`;
}

function ConvocEmailSender({ transport, allTransports }) {
  const { showToast } = useToast();
  const passengers = transport.passengers || [];

  const [sentStatus, setSentStatus] = useState(() => {
    const m = {};
    passengers.forEach((p) => { if (p.convocationSent) m[p.reservationId] = true; });
    return m;
  });
  const [preview, setPreview]           = useState(null);
  const [sendingId, setSendingId]       = useState(null);
  const [sendingAll, setSendingAll]     = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: [] });
  const [showEditor, setShowEditor]     = useState(false);
  const [customIntro, setCustomIntro]   = useState("");

  const emailSubject = (() => {
    const short = shortSejourName(transport.sejourName);
    const wi = WEEK_INFO[transport.week];
    const dates = wi ? ` (${wi.dates})` : "";
    return `Convocation transport - ${short}${dates} - ${fmtDateLong(transport.date)}`;
  })();

  const markSent = useCallback(async (reservationId) => {
    if (!reservationId) return;
    await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId), {
      convocationSent: true,
      convocationSentAt: serverTimestamp(),
    });
    setSentStatus((prev) => ({ ...prev, [reservationId]: true }));
  }, []);

  const markUnsent = useCallback(async (reservationId) => {
    if (!reservationId) return;
    await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, reservationId), {
      convocationSent: false,
      convocationSentAt: null,
    });
    setSentStatus((prev) => ({ ...prev, [reservationId]: false }));
  }, []);

  const doSend = useCallback(async (p) => {
    const rdvInfo = getEmailRdvInfo(transport, p);
    const html = buildConvocEmailHtml(transport, p, rdvInfo, allTransports, customIntro);
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: p.email,
        subject: emailSubject,
        html,
        from_name: "ColoCrew Inscriptions",
        from_email: "inscriptions@colocrew.com",
      }),
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t || `HTTP ${resp.status}`); }
    await markSent(p.reservationId);
  }, [transport, allTransports, emailSubject, customIntro, markSent]);

  const handleSendAll = useCallback(async () => {
    const toSend = passengers.filter((p) => !sentStatus[p.reservationId] && p.email && p.email !== "-");
    if (!toSend.length) { showToast("Toutes les convocations ont été envoyées", "info"); return; }
    setSendingAll(true);
    setSendProgress({ done: 0, total: toSend.length, errors: [] });
    const errors = [];
    for (let i = 0; i < toSend.length; i++) {
      try { await doSend(toSend[i]); } catch (e) { errors.push({ email: toSend[i].email, error: e.message }); }
      setSendProgress({ done: i + 1, total: toSend.length, errors: [...errors] });
      if (i < toSend.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    setSendingAll(false);
    if (errors.length === 0) showToast(`${toSend.length} convocation(s) envoyée(s)`, "success");
    else showToast(`${toSend.length - errors.length} succès · ${errors.length} erreur(s)`, "error");
  }, [passengers, sentStatus, doSend, showToast]);

  if (!passengers.length) {
    return <p className="tr-convoc-empty-msg">Aucun passager assigné à ce trajet.</p>;
  }

  const pendingCount = passengers.filter((p) => !sentStatus[p.reservationId] && p.email && p.email !== "-").length;
  const sentCount = passengers.length - pendingCount;

  return (
    <div className="tr-convoc-email-list">

      {/* ── Barre d'actions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "#64748b", flex: 1 }}>
          <span style={{ fontWeight: 700, color: "#1e1040" }}>{passengers.length}</span> famille{passengers.length > 1 ? "s" : ""}
          {sentCount > 0 && <span style={{ color: "#16a34a", marginLeft: 8, fontWeight: 600 }}>· {sentCount} envoyee{sentCount > 1 ? "s" : ""}</span>}
          {pendingCount > 0 && <span style={{ color: "#ef4444", marginLeft: 8, fontWeight: 600 }}>· {pendingCount} en attente</span>}
        </div>
        <button
          type="button"
          className="dash-btn"
          onClick={() => setShowEditor((v) => !v)}
          style={{ fontSize: 12, gap: 5, display: "inline-flex", alignItems: "center" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {showEditor ? "Fermer éditeur" : "Éditer le message"}
        </button>
        {sendingAll ? (
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 3 }}>
              Envoi {sendProgress.done}/{sendProgress.total}
              {sendProgress.errors.length > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>- {sendProgress.errors.length} err.</span>}
            </div>
            <div style={{ height: 4, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#B8336A", borderRadius: 999, transition: "width 0.3s", width: `${Math.round((sendProgress.done / sendProgress.total) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <button type="button" className="dash-btn dash-btn-primary" onClick={handleSendAll} disabled={pendingCount === 0} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Envoyer tout ({pendingCount})
          </button>
        )}
      </div>

      {/* ── Editeur de message global ── */}
      {showEditor && (
        <div style={{ marginBottom: 16, padding: "14px 16px", background: "#fdf8fc", border: "1.5px solid #e8d5f0", borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Message d'introduction (optionnel)
          </div>
          <textarea
            value={customIntro}
            onChange={(e) => setCustomIntro(e.target.value)}
            placeholder={`Bonjour,\n\nNous avons le plaisir de vous transmettre les informations de transport pour le sejour de votre enfant.\n\n(Laisser vide pour utiliser le texte par defaut)`}
            rows={5}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d4c0e8", borderRadius: 8, fontSize: 13, color: "#374151", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
          />
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            Ce texte remplace l'introduction par defaut dans tous les emails de ce trajet. Le tableau ALLER/RETOUR reste genere automatiquement.
          </div>
        </div>
      )}

      {/* ── Tableau ── */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e5e7eb" }}>
              <th style={thS}>Famille</th>
              <th style={thS}>Enfants</th>
              <th style={thS}>Ville RDV</th>
              <th style={thS}>Heure RDV</th>
              <th style={thS}>Email</th>
              <th style={{ ...thS, textAlign: "center" }}>Envoyee</th>
              <th style={{ ...thS, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {passengers.map((p, i) => {
              const isSent    = Boolean(sentStatus[p.reservationId]);
              const isSending = sendingId === p.reservationId;
              const children  = p.children?.length
                ? p.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ")
                : p.childName || "-";
              const city     = passengerCity(transport, p);
              const hasEmail = p.email && p.email !== "-";
              const rdvInfo  = getEmailRdvInfo(transport, p);

              return (
                <tr key={p.reservationId || i} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: i === 0 ? "none" : "1px solid #f0f0f0" }}>

                  {/* Famille */}
                  <td style={tdS}>
                    <div style={{ fontWeight: 600, color: "#1e1040" }}>{p.nom}</div>
                  </td>

                  {/* Enfants */}
                  <td style={tdS}>
                    <div style={{ color: "#7c3aed", fontSize: 12 }}>{children}</div>
                  </td>

                  {/* Ville RDV */}
                  <td style={tdS}>
                    <div style={{ color: "#374151" }}>{rdvInfo.meetingPoint || city || "-"}</div>
                  </td>

                  {/* Heure */}
                  <td style={tdS}>
                    {rdvInfo.rdvTime
                      ? <span style={{ fontWeight: 700, color: "#16a34a" }}>{rdvInfo.rdvTime}</span>
                      : <span style={{ color: "#94a3b8" }}>-</span>}
                  </td>

                  {/* Email */}
                  <td style={tdS}>
                    {hasEmail
                      ? <span style={{ color: "#374151", fontSize: 12 }}>{p.email}</span>
                      : <span style={{ color: "#ef4444", fontSize: 12, fontStyle: "italic" }}>Manquant</span>}
                  </td>

                  {/* Checkbox envoyee */}
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => isSent ? markUnsent(p.reservationId) : markSent(p.reservationId)}
                      title={isSent ? "Cliquer pour annuler" : "Marquer envoyee"}
                      style={{
                        width: 24, height: 24, borderRadius: 6,
                        border: `2px solid ${isSent ? "#86efac" : "#d1d5db"}`,
                        background: isSent ? "#dcfce7" : "#fff",
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {isSent && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ ...tdS, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="dash-btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => setPreview(preview?.reservationId === p.reservationId ? null : { ...p, _rdvInfo: rdvInfo })}
                      >
                        Aperçu
                      </button>
                      <button
                        type="button"
                        className={`dash-btn${isSent ? "" : " dash-btn-primary"}`}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        disabled={!hasEmail || isSending || sendingAll}
                        onClick={async () => {
                          setSendingId(p.reservationId);
                          try {
                            await doSend(p);
                            showToast(`Convocation envoyée à ${p.email}`, "success");
                          } catch (e) {
                            showToast(`Erreur : ${e.message}`, "error");
                          } finally {
                            setSendingId(null);
                          }
                        }}
                      >
                        {isSending ? "..." : isSent ? "Renvoyer" : "Envoyer"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal Aperçu ── */}
      {preview && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0e8f5", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1040" }}>{preview.nom}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{preview.email} &middot; {emailSubject}</div>
              </div>
              <button type="button" onClick={() => setPreview(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#f5f0ff" }}>
              <div dangerouslySetInnerHTML={{ __html: buildConvocEmailHtml(transport, preview, preview._rdvInfo, allTransports, customIntro) }} />
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fff" }}>
              <button type="button" onClick={() => setPreview(null)} style={{ padding: "8px 16px", background: "#f1f5f9", border: "none", borderRadius: 8, color: "#64748b", fontWeight: 600, cursor: "pointer" }}>Fermer</button>
              <button
                type="button"
                disabled={!!sendingId}
                onClick={async () => {
                  setSendingId(preview.reservationId);
                  try {
                    await doSend(preview);
                    showToast(`Convocation envoyée à ${preview.email}`, "success");
                    setPreview(null);
                  } catch (e) {
                    showToast(`Erreur : ${e.message}`, "error");
                  } finally {
                    setSendingId(null);
                  }
                }}
                style={{ padding: "8px 16px", background: sendingId ? "#f1f5f9" : "#B8336A", border: "none", borderRadius: 8, color: sendingId ? "#94a3b8" : "#fff", fontWeight: 700, cursor: sendingId ? "not-allowed" : "pointer" }}
              >
                {sendingId ? "Envoi..." : "Envoyer cette convocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thS = { padding: "9px 12px", fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left" };
const tdS = { padding: "10px 12px", verticalAlign: "middle" };

// Group passengers by email (family) within a trip
function groupPassengersByFamily(passengers) {
  const map = new Map();
  (passengers || []).forEach((p) => {
    const key = (p.email && p.email !== "-") ? p.email : (p.reservationId || p.nom);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return Array.from(map.values());
}

function mergeFamily(passengers) {
  const primary = passengers[0];
  const allChildren = passengers.flatMap((p) => p.children?.length ? p.children : [{ firstName: p.childName || "", lastName: "" }]).filter((c) => c.firstName || c.lastName);
  return { ...primary, children: allChildren };
}

function ConvocationsTab({ transports, reservations }) {
  const { showToast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState("S1");
  const [sentStatus, setSentStatus]     = useState({});
  const [sendingKey, setSendingKey]     = useState(null);
  const [sendingAll, setSendingAll]     = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: [] });
  const [preview, setPreview]           = useState(null);
  const [showEditor, setShowEditor]     = useState(false);
  const [customIntro, setCustomIntro]   = useState("");
  const [onSiteConfigs, setOnSiteConfigs] = useState({});

  const weekTrips = useMemo(
    () => transports.filter((t) => t.week === selectedWeek && t.status !== "annulé" && t.direction === "aller"),
    [transports, selectedWeek],
  );

  const onSiteReservations = useMemo(
    () => reservations
      .filter((r) => r.week === selectedWeek && r.status === "validated" && isOnSiteTransportCity(r.departureCity) && isOnSiteTransportCity(r.returnCity))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })),
    [reservations, selectedWeek],
  );

  const onSiteBySejourMap = useMemo(() => {
    const map = new Map();
    onSiteReservations.forEach((r) => {
      const key = r.sejourName || "Séjour";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [onSiteReservations]);

  const onSiteSejourNames = useMemo(() => Array.from(onSiteBySejourMap.keys()), [onSiteBySejourMap]);

  const getOnSiteConfig = useCallback((sejourName) => ({
    time: onSiteConfigs[sejourName]?.time || "14:00",
    lieu: onSiteConfigs[sejourName]?.lieu || "",
  }), [onSiteConfigs]);

  const setOnSiteConfig = useCallback((sejourName, field, value) => {
    setOnSiteConfigs((prev) => ({ ...prev, [sejourName]: { ...prev[sejourName], [field]: value } }));
  }, []);

  useEffect(() => {
    const m = {};
    onSiteReservations.forEach((r) => { if (r.convocationSent) m[r.id] = true; });
    weekTrips.forEach((t) => (t.passengers || []).forEach((p) => { if (p.convocationSent) m[p.reservationId] = true; }));
    setSentStatus(m);
  }, [selectedWeek, onSiteReservations, weekTrips]);

  const openDoc = (html) => {
    const win = openPrintableDocument(html);
    if (!win) return;
    win.focus();
    setTimeout(() => win.print(), 800);
  };

  const markAllSent = useCallback(async (ids) => {
    await Promise.all(ids.filter(Boolean).map((id) =>
      updateDoc(doc(db, COLLECTIONS.RESERVATIONS, id), { convocationSent: true, convocationSentAt: serverTimestamp() })
    ));
    setSentStatus((prev) => {
      const next = { ...prev };
      ids.filter(Boolean).forEach((id) => { next[id] = true; });
      return next;
    });
  }, []);

  const markAllUnsent = useCallback(async (ids) => {
    await Promise.all(ids.filter(Boolean).map((id) =>
      updateDoc(doc(db, COLLECTIONS.RESERVATIONS, id), { convocationSent: false, convocationSentAt: null })
    ));
    setSentStatus((prev) => {
      const next = { ...prev };
      ids.filter(Boolean).forEach((id) => { next[id] = false; });
      return next;
    });
  }, []);

  const doSendFamily = useCallback(async (trip, passengers) => {
    const primary  = passengers[0];
    const merged   = mergeFamily(passengers);
    const rdvInfo  = getEmailRdvInfo(trip, primary);
    const html     = buildConvocEmailHtml(trip, merged, rdvInfo, transports, customIntro);
    const sejourReal = (primary.sejourName && primary.sejourName !== "-") ? primary.sejourName : shortSejourName(trip.sejourName);
    const wi = WEEK_INFO[trip.week];
    const subject  = `Convocation transport — ${sejourReal}${wi ? ` (${wi.dates})` : ""} — ${fmtDateLong(trip.date)}`;
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: primary.email, subject, html, from_name: "ColoCrew Inscriptions", from_email: "inscriptions@colocrew.com" }),
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t || `HTTP ${resp.status}`); }
    await markAllSent(passengers.map((p) => p.reservationId));
  }, [transports, customIntro, markAllSent]);

  const doSendOnSite = useCallback(async (reservation) => {
    const cfg = getOnSiteConfig(reservation.sejourName || "Séjour");
    const html = buildOnSiteEmailHtml(reservation, selectedWeek, {
      arrivalTime: cfg.time,
      returnTime: cfg.time,
      arrivalPoint: cfg.lieu || "Lieu du séjour",
      returnPoint: cfg.lieu || "Lieu du séjour",
    }, customIntro);
    const wi = WEEK_INFO[selectedWeek];
    const sejourReal = reservation.sejourName && reservation.sejourName !== "-" ? shortSejourName(reservation.sejourName) : "Séjour ColoCrew";
    const subject = `Convocation sur place — ${sejourReal}${wi ? ` (${wi.dates})` : ""}`;
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: reservation.email, subject, html, from_name: "ColoCrew Inscriptions", from_email: "inscriptions@colocrew.com" }),
    });
    if (!resp.ok) { const text = await resp.text(); throw new Error(text || `HTTP ${resp.status}`); }
    await markAllSent([reservation.id]);
  }, [customIntro, getOnSiteConfig, markAllSent, selectedWeek]);

  // Pending = one entry per unique family (email) that hasn't been fully sent
  const pendingFamilies = useMemo(() => {
    const seen = new Set();
    const rows = [];
    weekTrips.forEach((trip) => {
      groupPassengersByFamily(trip.passengers).forEach((passengers) => {
        const primary = passengers[0];
        const emailKey = (primary.email && primary.email !== "-") ? primary.email : primary.reservationId;
        if (seen.has(emailKey)) return;
        const allIds = passengers.map((p) => p.reservationId).filter(Boolean);
        const allSent = allIds.every((id) => sentStatus[id]);
        if (!allSent && primary.email && primary.email !== "-") {
          seen.add(emailKey);
          rows.push({ trip, passengers });
        }
      });
    });
    return rows;
  }, [weekTrips, sentStatus]);

  const missingEmailFamilies = useMemo(() => {
    const seen = new Set();
    const rows = [];
    weekTrips.forEach((trip) => {
      groupPassengersByFamily(trip.passengers).forEach((passengers) => {
        const primary = passengers[0];
        const key = primary.reservationId || `${primary.nom || ""}-${primary.childName || ""}`;
        if (seen.has(key)) return;
        const allIds = passengers.map((p) => p.reservationId).filter(Boolean);
        const allSent = allIds.length > 0 && allIds.every((id) => sentStatus[id]);
        const hasEmail = primary.email && primary.email !== "-";
        if (!allSent && !hasEmail) {
          seen.add(key);
          rows.push({ trip, passengers });
        }
      });
    });
    return rows;
  }, [weekTrips, sentStatus]);

  const pendingOnSiteReservations = useMemo(
    () => onSiteReservations.filter((reservation) => !sentStatus[reservation.id] && reservation.email && reservation.email !== "-"),
    [onSiteReservations, sentStatus],
  );

  const missingOnSiteEmailReservations = useMemo(
    () => onSiteReservations.filter((reservation) => !sentStatus[reservation.id] && (!reservation.email || reservation.email === "-")),
    [onSiteReservations, sentStatus],
  );

  const pendingMailCount = pendingFamilies.length + pendingOnSiteReservations.length;
  const missingEmailCount = missingEmailFamilies.length + missingOnSiteEmailReservations.length;

  const handleSendAll = useCallback(async () => {
    const total = pendingFamilies.length + pendingOnSiteReservations.length;
    if (!total) { showToast("Toutes les convocations ont été envoyées", "info"); return; }
    setSendingAll(true);
    setSendProgress({ done: 0, total, errors: [] });
    const errors = [];
    let done = 0;
    for (let i = 0; i < pendingFamilies.length; i++) {
      const { trip, passengers } = pendingFamilies[i];
      try { await doSendFamily(trip, passengers); }
      catch (e) { errors.push({ email: passengers[0].email, error: e.message }); }
      done += 1;
      setSendProgress({ done, total, errors: [...errors] });
      if (done < total) await new Promise((r) => setTimeout(r, 350));
    }
    for (let i = 0; i < pendingOnSiteReservations.length; i++) {
      const reservation = pendingOnSiteReservations[i];
      try { await doSendOnSite(reservation); }
      catch (e) { errors.push({ email: reservation.email, error: e.message }); }
      done += 1;
      setSendProgress({ done, total, errors: [...errors] });
      if (done < total) await new Promise((r) => setTimeout(r, 350));
    }
    setSendingAll(false);
    if (errors.length === 0) showToast(`${total} convocation(s) envoyée(s)`, "success");
    else showToast(`${total - errors.length} succès · ${errors.length} erreur(s)`, "error");
  }, [pendingFamilies, pendingOnSiteReservations, doSendFamily, doSendOnSite, showToast]);

  return (
    <div className="tr-convoc-tab">
      {/* Chips semaine */}
      <nav className="dash-subtabs" style={{ marginBottom: 16 }}>
        {WEEKS.map((week) => (
          <button key={week} type="button"
            className={`dash-subtab${selectedWeek === week ? " is-active" : ""}`}
            onClick={() => setSelectedWeek(week)}>
            {week} — {WEEK_INFO[week].dates}
          </button>
        ))}
      </nav>

      {/* Barre d'actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, fontSize: 13, color: "#64748b" }}>
          {pendingMailCount > 0
            ? <span style={{ color: "#ef4444", fontWeight: 600 }}>{pendingMailCount} convocation(s) à envoyer par email</span>
            : <span style={{ color: "#16a34a", fontWeight: 600 }}>Toutes les convocations sont envoyées</span>}
          {pendingOnSiteReservations.length > 0 && (
            <span style={{ color: "#15803d", marginLeft: 8, fontWeight: 600 }}>
              · dont {pendingOnSiteReservations.length} sur place
            </span>
          )}
          {missingEmailCount > 0 && (
            <span style={{ color: "#f97316", marginLeft: 8, fontWeight: 600 }}>
              · {missingEmailCount} famille(s) sans email
            </span>
          )}
        </div>
        <button type="button" className="dash-btn" onClick={() => setShowEditor((v) => !v)}
          style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {showEditor ? "Fermer éditeur" : "Éditer le message"}
        </button>
        {sendingAll ? (
          <div style={{ minWidth: 170 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 3 }}>
              Envoi {sendProgress.done}/{sendProgress.total}
              {sendProgress.errors.length > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>· {sendProgress.errors.length} err.</span>}
            </div>
            <div style={{ height: 4, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#B8336A", borderRadius: 999, transition: "width 0.3s", width: `${Math.round((sendProgress.done / sendProgress.total) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <button type="button" className="dash-btn dash-btn-primary" onClick={handleSendAll} disabled={pendingMailCount === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Envoyer tout ({pendingMailCount})
          </button>
        )}
      </div>

      {/* Éditeur de message */}
      {showEditor && (
        <div style={{ marginBottom: 14, padding: "14px 16px", background: "#fdf8fc", border: "1.5px solid #e8d5f0", borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Message d&rsquo;introduction personnalisé
          </div>
          <textarea
            value={customIntro}
            onChange={(e) => setCustomIntro(e.target.value)}
            placeholder={"Bonjour,\n\nNous vous transmettons les informations de transport pour le séjour de votre enfant.\n\n(Laisser vide pour le texte par défaut)"}
            rows={5}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d4c0e8", borderRadius: 8, fontSize: 13, color: "#374151", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
          />
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
            Ce texte remplace l&rsquo;introduction par défaut dans tous les emails. Le tableau ALLER/RETOUR est généré automatiquement.
          </div>
        </div>
      )}

      {/* Tableau */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e5e7eb" }}>
              <th style={cTh}>Trajet</th>
              <th style={cTh}>Famille</th>
              <th style={cTh}>Ville</th>
              <th style={cTh}>Enfants</th>
              <th style={cTh}>Point de RDV</th>
              <th style={cTh}>Heure RDV</th>
              <th style={cTh}>Email</th>
              <th style={{ ...cTh, textAlign: "center" }}>Convoqué</th>
              <th style={{ ...cTh, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>

            {/* Sur place — par séjour */}
            {onSiteSejourNames.length === 0 && (
              <tr style={{ background: "#f0fdf4" }}>
                <td colSpan={9} style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#15803d", borderBottom: "1px solid #d1fae5" }}>
                  <span style={{ background: "#15803d", color: "#fff", borderRadius: 5, padding: "2px 8px", marginRight: 8, fontSize: 11 }}>SP</span>
                  Sur place — aucune famille cette semaine
                </td>
              </tr>
            )}
            {onSiteSejourNames.map((sejourName) => {
              const sejourRows = onSiteBySejourMap.get(sejourName) || [];
              const cfg = getOnSiteConfig(sejourName);
              const pendingSejourRows = sejourRows.filter((row) => !sentStatus[row.id] && row.email && row.email !== "-");
              return (
                <Fragment key={`sp-${sejourName}`}>
                  <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                    <td colSpan={9} style={{ padding: "8px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ background: "#15803d", color: "#fff", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>SP</span>
                        <span style={{ fontWeight: 800, fontSize: 12, color: "#15803d" }}>{sejourName}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{sejourRows.length} famille{sejourRows.length !== 1 ? "s" : ""}</span>
                        {pendingSejourRows.length > 0 && <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{pendingSejourRows.length} non envoyée{pendingSejourRows.length > 1 ? "s" : ""}</span>}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>RDV :</span>
                          <input type="time" value={cfg.time} onChange={(e) => setOnSiteConfig(sejourName, "time", e.target.value)}
                            style={{ padding: "2px 6px", border: "1px solid #d1fae5", borderRadius: 5, fontSize: 12, color: "#15803d", fontWeight: 700, width: 90 }} />
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Adresse :</span>
                          <input type="text" value={cfg.lieu} onChange={(e) => setOnSiteConfig(sejourName, "lieu", e.target.value)}
                            placeholder="Adresse du lieu de séjour"
                            style={{ padding: "2px 8px", border: "1px solid #d1fae5", borderRadius: 5, fontSize: 12, color: "#374151", width: 240 }} />
                        </div>
                        <button type="button" className="dash-btn" style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px" }}
                          onClick={() => openDoc(buildOnSiteConvocHTML(sejourRows, selectedWeek, { arrivalTime: cfg.time, returnTime: cfg.time, arrivalPoint: cfg.lieu || "Lieu du séjour", returnPoint: cfg.lieu || "Lieu du séjour" }))}
                          disabled={!sejourRows.length}>
                          PDF convocations
                        </button>
                      </div>
                    </td>
                  </tr>
                  {sejourRows.map((r, i) => {
                    const isSent = Boolean(sentStatus[r.id]);
                    const kids = r.children?.length ? r.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ") : r.childName || "—";
                    const familyKey = `onsite-${r.id}`;
                    const hasEmail = r.email && r.email !== "-";
                    const isSending = sendingKey === familyKey;
                    const isPreviewing = preview?.familyKey === familyKey;
                    return (
                      <tr key={r.id} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: "1px solid #f0f0f0" }}>
                        <td style={cTd}><span style={{ fontSize: 11, background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>Sur place</span></td>
                        <td style={cTd}><span style={{ fontWeight: 600, color: "#1e1040" }}>{r.nom}</span></td>
                        <td style={cTd}><span style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>Sur place</span></td>
                        <td style={cTd}><span style={{ color: "#7c3aed", fontSize: 12 }}>{kids}</span></td>
                        <td style={cTd}><span style={{ color: "#374151", fontSize: 12 }}>{cfg.lieu || "Lieu du séjour"}</span></td>
                        <td style={cTd}><span style={{ fontWeight: 700, color: "#16a34a" }}>{cfg.time}</span></td>
                        <td style={cTd}>{hasEmail ? <span style={{ color: "#374151", fontSize: 12 }}>{r.email}</span> : <span style={{ color: "#ef4444", fontStyle: "italic", fontSize: 12 }}>Manquant</span>}</td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <button type="button" onClick={() => isSent ? markAllUnsent([r.id]) : markAllSent([r.id])}
                            style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSent ? "#86efac" : "#d1d5db"}`, background: isSent ? "#dcfce7" : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {isSent && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </button>
                        </td>
                        <td style={{ ...cTd, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => setPreview(isPreviewing ? null : { type: "onsite", familyKey, reservation: r, cfg })}>
                              {isPreviewing ? "Fermer" : "Aperçu"}
                            </button>
                            <button type="button" className={`dash-btn${isSent ? "" : " dash-btn-primary"}`} style={{ fontSize: 11, padding: "3px 9px" }}
                              disabled={!hasEmail || isSending || sendingAll}
                              onClick={async () => {
                                setSendingKey(familyKey);
                                try {
                                  await doSendOnSite(r);
                                  showToast(`Convocation envoyée à ${r.email}`, "success");
                                } catch (e) {
                                  showToast(`Erreur : ${e.message}`, "error");
                                } finally {
                                  setSendingKey(null);
                                }
                              }}>
                              {isSending ? "..." : isSent ? "Renvoyer" : "Envoyer"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Trajets — une ligne par famille */}
            {weekTrips.map((trip) => {
              const familyGroups = groupPassengersByFamily(trip.passengers).slice().sort((a, b) => {
                const oa = cityRouteOrder(trip, passengerCity(trip, a[0]));
                const ob = cityRouteOrder(trip, passengerCity(trip, b[0]));
                if (oa !== ob) return oa - ob;
                return passengerCity(trip, a[0]).localeCompare(passengerCity(trip, b[0]), "fr", { sensitivity: "base" });
              });
              const pendingCount = familyGroups.filter((ps) => {
                const allIds = ps.map((p) => p.reservationId).filter(Boolean);
                return !allIds.every((id) => sentStatus[id]) && ps[0].email && ps[0].email !== "-";
              }).length;

              return (
                <Fragment key={trip.id}>
                  {/* En-tête trajet */}
                  <tr style={{ background: "#f5f0ff", borderTop: "2px solid #d4c0e8" }}>
                    <td colSpan={9} style={{ padding: "8px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 12, color: "#5f3374" }}>{trip.departureCity} → {trip.arrivalCity}</span>
                        <span style={{ fontSize: 11, color: "#7c3aed", background: "#ede9fe", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>
                          {ROUTE_GROUPS.find((g) => g.value === trip.routeGroup)?.label || trip.routeGroup}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {fmtDate(trip.date)} · {familyGroups.length} famille{familyGroups.length !== 1 ? "s" : ""}
                          {pendingCount > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>· {pendingCount} non envoyée{pendingCount > 1 ? "s" : ""}</span>}
                        </span>
                        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                          <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => openDoc(buildGroupConvocHTML(trip))} disabled={!familyGroups.length}>PDF convocations</button>
                          <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => openDoc(buildStaffBriefingHTML(trip))}>Briefing</button>
                          <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => openDoc(buildPassengerListHTML(trip))}>Liste</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {familyGroups.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: "10px 14px", color: "#94a3b8", fontStyle: "italic", fontSize: 12 }}>Aucun passager assigné à ce trajet</td></tr>
                  )}
                  {familyGroups.map((passengers, i) => {
                    const primary   = passengers[0];
                    const merged    = mergeFamily(passengers);
                    const allIds    = passengers.map((p) => p.reservationId).filter(Boolean);
                    const isSent    = allIds.length > 0 && allIds.every((id) => sentStatus[id]);
                    const familyKey = (primary.email && primary.email !== "-") ? primary.email : (primary.reservationId || i);
                    const isSending = sendingKey === familyKey;
                    const hasEmail  = primary.email && primary.email !== "-";
                    const rdvInfo   = getEmailRdvInfo(trip, primary);
                    const allChildren = merged.children?.length
                      ? merged.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean).join(", ")
                      : primary.childName || "—";
                    const isPreviewing = preview?.familyKey === familyKey;

                    return (
                      <tr key={familyKey} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: "1px solid #f0f0f0" }}>
                        <td style={cTd}>
                          <span style={{ fontSize: 11, background: "#f5f0ff", color: "#7c3aed", borderRadius: 4, padding: "2px 6px", fontWeight: 600 }}>
                            {ROUTE_GROUPS.find((g) => g.value === trip.routeGroup)?.label || trip.departureCity}
                          </span>
                        </td>
                        <td style={cTd}>
                          <span style={{ fontWeight: 600, color: "#1e1040" }}>{primary.nom}</span>
                          {passengers.length > 1 && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>({passengers.length} dossiers)</span>}
                        </td>
                        <td style={cTd}><span style={{ fontSize: 12, fontWeight: 600, color: "#5f3374" }}>{passengerCity(trip, primary)}</span></td>
                        <td style={cTd}><span style={{ color: "#7c3aed", fontSize: 12 }}>{allChildren}</span></td>
                        <td style={cTd}><span style={{ color: "#374151", fontSize: 12 }}>{rdvInfo.meetingPoint || passengerCity(trip, primary) || "—"}</span></td>
                        <td style={cTd}>
                          {rdvInfo.rdvTime
                            ? <span style={{ fontWeight: 700, color: "#16a34a" }}>{rdvInfo.rdvTime}</span>
                            : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={cTd}>
                          {hasEmail
                            ? <span style={{ color: "#374151", fontSize: 12 }}>{primary.email}</span>
                            : <span style={{ color: "#ef4444", fontSize: 12, fontStyle: "italic" }}>Manquant</span>}
                        </td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <button type="button"
                            onClick={() => isSent ? markAllUnsent(allIds) : markAllSent(allIds)}
                            title={isSent ? "Cliquer pour annuler" : "Marquer envoyée manuellement"}
                            style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSent ? "#86efac" : "#d1d5db"}`, background: isSent ? "#dcfce7" : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {isSent && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </button>
                        </td>
                        <td style={{ ...cTd, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => setPreview(isPreviewing ? null : { ...merged, familyKey, _rdvInfo: rdvInfo, _trip: trip, _passengers: passengers })}>
                              {isPreviewing ? "Fermer" : "Aperçu"}
                            </button>
                            <button type="button" className={`dash-btn${isSent ? "" : " dash-btn-primary"}`} style={{ fontSize: 11, padding: "3px 9px" }}
                              disabled={!hasEmail || isSending || sendingAll}
                              onClick={async () => {
                                setSendingKey(familyKey);
                                try {
                                  await doSendFamily(trip, passengers);
                                  showToast(`Convocation envoyée à ${primary.email}`, "success");
                                } catch (e) {
                                  showToast(`Erreur : ${e.message}`, "error");
                                } finally {
                                  setSendingKey(null);
                                }
                              }}>
                              {isSending ? "..." : isSent ? "Renvoyer" : "Envoyer"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal aperçu */}
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setPreview(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0e8f5", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1040" }}>{preview.type === "onsite" ? preview.reservation.nom : preview.nom}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{preview.type === "onsite" ? preview.reservation.email : preview.email}</div>
              </div>
              <button type="button" onClick={() => setPreview(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>&#x2715;</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#f5f0ff" }}>
              <div dangerouslySetInnerHTML={{ __html: preview.type === "onsite"
                ? buildOnSiteEmailHtml(preview.reservation, selectedWeek, {
                    arrivalTime: preview.cfg.time,
                    returnTime: preview.cfg.time,
                    arrivalPoint: preview.cfg.lieu || "Lieu du séjour",
                    returnPoint: preview.cfg.lieu || "Lieu du séjour",
                  }, customIntro)
                : buildConvocEmailHtml(preview._trip, preview, preview._rdvInfo, transports, customIntro) }} />
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fff" }}>
              <button type="button" onClick={() => setPreview(null)} style={{ padding: "8px 16px", background: "#f1f5f9", border: "none", borderRadius: 8, color: "#64748b", fontWeight: 600, cursor: "pointer" }}>Fermer</button>
              <button type="button" disabled={!!sendingKey}
                onClick={async () => {
                  setSendingKey(preview.familyKey);
                  try {
                    if (preview.type === "onsite") {
                      await doSendOnSite(preview.reservation);
                      showToast(`Convocation envoyée à ${preview.reservation.email}`, "success");
                    } else {
                      await doSendFamily(preview._trip, preview._passengers);
                      showToast(`Convocation envoyée à ${preview.email}`, "success");
                    }
                    setPreview(null);
                  } catch (e) {
                    showToast(`Erreur : ${e.message}`, "error");
                  } finally {
                    setSendingKey(null);
                  }
                }}
                style={{ padding: "8px 16px", background: sendingKey ? "#f1f5f9" : "#B8336A", border: "none", borderRadius: 8, color: sendingKey ? "#94a3b8" : "#fff", fontWeight: 700, cursor: sendingKey ? "not-allowed" : "pointer" }}>
                {sendingKey ? "Envoi en cours…" : "Envoyer cette convocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cTh = { padding: "9px 12px", fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", whiteSpace: "nowrap" };
const cTd = { padding: "10px 12px", verticalAlign: "middle" };


/* New transport modal */

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
  const sejours = useSejours();
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
          stopType: "rdv",
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
              <select className="dash-input" value={form.sejourName} onChange={e => set("sejourName", e.target.value)}>
                <option value="">- Sélectionner un séjour -</option>
                {sejours.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
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
              <select className="dash-input" value={form.week} onChange={e => {
                set("week", e.target.value);
                const kd = KEY_DATES.find(k => k.week === e.target.value && k.direction === form.direction);
                if (kd) set("date", kd.date);
              }}>
                <option value="">À compléter</option>
                {WEEKS.map(week => <option key={week} value={week}>{WEEK_INFO[week]?.label || week} ({WEEK_INFO[week]?.dates})</option>)}
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

/* Main export */

const TRANSPORT_MAIN_TABS = [
  { key: "overview",     label: "Vue d'ensemble" },
  { key: "trajets",      label: "Trajets" },
  { key: "budget",       label: "Budget & Compta" },
  { key: "convocations", label: "Convocations" },
  { key: "billets",      label: "Billets" },
  { key: "villes",       label: "Points de RDV" },
];

export default function Transport({ focusDate = "" }) {
  const [transports, setTransports]         = useState([]);
  const [reservations, setReservations]     = useState([]);
  const [staffMembers, setStaffMembers]     = useState([]);
  const [staffContracts, setStaffContracts] = useState([]);
  const [cityStops, setCityStops]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showNew, setShowNew]               = useState(false);
  const [activeTab, setActiveTab]           = useState("overview");
  const { showToast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tSnap, rSnap, staffSnap, contractsSnap, cityStopsSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "desc"))),
        getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
        getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
        getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        getDocs(collection(db, COLLECTIONS.TRANSPORT_RDV_POINTS)),
      ]);
      const reservationRows = rSnap.docs.map(mapReservationForTransport);
      const transportRows = tSnap.docs.map(mapTransport);
      setReservations(reservationRows);
      setTransports(transportRows.map((transport) => hydrateTransportPassengers(transport, reservationRows)));
      setStaffMembers(staffSnap.docs.map(mapStaffMember).filter((m) => m.active));
      setStaffContracts(contractsSnap.docs.map(mapStaffContract).filter((c) => c.status !== "cancelled"));
      setCityStops(cityStopsSnap.docs.map(mapCityStop).filter((row) => row.city));
    } catch { showToast("Erreur de chargement", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = (updated) =>
    setTransports((prev) => prev.map((t) => (t.id === updated.id ? hydrateTransportPassengers(updated, reservations) : t)));

  const handleBulkSave = (updatedItems) => {
    const byId = new Map(updatedItems.map((item) => [item.id, hydrateTransportPassengers(item, reservations)]));
    setTransports((prev) => prev.map((t) => byId.get(t.id) || t));
  };

  const handleDelete = (id) => setTransports((prev) => prev.filter((t) => t.id !== id));

  const handleCreated = (t) => {
    setTransports((prev) => [hydrateTransportPassengers(t, reservations), ...prev]);
    setActiveTab("trajets");
  };

  /* KPIs pour Vue d'ensemble */
  const globalStats = useMemo(() => {
    const valid = reservations.filter((r) => r.status === "validated" && r.isImported2026);
    const totalChildren = valid.reduce((s, r) => s + r.childCount, 0);
    const transportChildren = valid.reduce((s, r) => {
      const a = normalizePlace(r.departureCity) !== "sur place";
      const b = normalizePlace(r.returnCity) !== "sur place";
      return s + (a || b ? r.childCount : 0);
    }, 0);
    const assignedIds = new Set(transports.flatMap((t) => (t.passengers || []).map((p) => p.reservationId)));
    const unassigned  = valid.filter(
      (r) => !assignedIds.has(r.id) && normalizePlace(r.departureCity) !== "sur place",
    ).length;
    const ticketCost     = transports.reduce((s, t) => s + (t.tickets || []).reduce((ts, tk) => ts + Number(tk.price || 0), 0), 0);
    const purchasedTix   = transports.reduce((s, t) => s + (t.tickets || []).filter((tk) => tk.purchased).length, 0);
    const totalTix       = transports.reduce((s, t) => s + (t.tickets || []).length, 0);
    const missingSegTix  = transports.reduce((s, t) =>
      s + (t.segments || []).filter((seg) => !(t.tickets || []).some((tk) => tk.segmentId === seg.id)).length, 0);
    const transportRevenue = reservations.filter((r) => r.status === "validated" && r.isImported2026)
      .reduce((s, r) => s + Number(r.transportAmount || 0), 0);
    return { totalChildren, transportChildren, unassigned, ticketCost, purchasedTix, totalTix, missingSegTix, trips: transports.length, transportRevenue };
  }, [reservations, transports]);

  return (
    <div className="tr-main-page">
      {/* Header */}
      <div className="tr-main-header">
        {focusDate && (
          <Link href="/dashboard/transport" className="tr-back-link">← Retour</Link>
        )}
        <div className="tr-main-header-row">
          <h1 className="tr-main-title">Transport été 2026</h1>
          <div className="dash-row-actions">
            <button type="button" className="dash-btn" onClick={loadAll}>Actualiser</button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
              + Nouveau trajet
            </button>
          </div>
        </div>

        {/* Sous-onglets principaux */}
        <nav className="tr-main-tabs">
          {TRANSPORT_MAIN_TABS.map((tab) => (
            <button key={tab.key} type="button"
              className={`tr-main-tab${activeTab === tab.key ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
              {tab.key === "trajets" && transports.length > 0 && (
                <span className="tr-main-tab-count">{transports.length}</span>
              )}
              {tab.key === "overview" && globalStats.missingSegTix > 0 && (
                <span className="tr-main-tab-alert">{globalStats.missingSegTix}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="dash-section" style={{ padding: 24 }}>
          <p className="dash-muted">Chargement des transports…</p>
        </div>
      ) : (
        <div className="tr-main-body">
          {/* Vue d'ensemble */}
          {activeTab === "overview" && (
            <div className="tr-overview">
              <div className="tr-overview-metrics">
                <article className="tr-ov-metric">
                  <span>Enfants à transporter</span>
                  <strong>{globalStats.transportChildren}</strong>
                  <small>sur {globalStats.totalChildren} validés</small>
                </article>
                <article className={`tr-ov-metric${globalStats.unassigned > 0 ? " is-warn" : " is-ok"}`}>
                  <span>Non affectés à un trajet</span>
                  <strong>{globalStats.unassigned}</strong>
                  <small>{globalStats.unassigned === 0 ? "Tous couverts" : "sans trajet assigné"}</small>
                </article>
                <article className="tr-ov-metric">
                  <span>Trajets créés</span>
                  <strong>{globalStats.trips}</strong>
                  <small>toutes semaines confondues</small>
                </article>
                <article className={`tr-ov-metric${globalStats.missingSegTix > 0 ? " is-warn" : " is-ok"}`}>
                  <span>Billets segments</span>
                  <strong>{globalStats.purchasedTix}/{globalStats.totalTix}</strong>
                  <small>{globalStats.missingSegTix > 0 ? `${globalStats.missingSegTix} segment(s) sans billet` : "Tous couverts"}</small>
                </article>
                <article className="tr-ov-metric">
                  <span>CA transport familles</span>
                  <strong>{formatMoney(globalStats.transportRevenue)}</strong>
                  <small>Facturé aux familles</small>
                </article>
                <article className={`tr-ov-metric${globalStats.transportRevenue - globalStats.ticketCost >= 0 ? " is-ok" : " is-warn"}`}>
                  <span>Marge transport</span>
                  <strong>{formatMoney(globalStats.transportRevenue - globalStats.ticketCost)}</strong>
                  <small>CA €' coût billets</small>
                </article>
              </div>
              <TransportCoverage reservations={reservations} transports={transports} />
            </div>
          )}


          {activeTab === "trajets" && (
            transports.length === 0 ? (
              <div className="dash-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.2" strokeLinecap="round" stroke="currentColor">
                  <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <h3>Aucun transport créé</h3>
                <p>Créez votre première ligne de transport pour commencer.</p>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setShowNew(true)}>
                  + Nouveau trajet
                </button>
              </div>
            ) : (
              <TrajetsTab
                transports={transports}
                reservations={reservations}
                staffMembers={staffMembers}
                staffContracts={staffContracts}
                cityStops={cityStops}
                onSave={handleSave}
                onDelete={handleDelete}
                onCreated={handleCreated}
                onCreate={() => setShowNew(true)}
              />
            )
          )}

          {/* Budget & Compta */}
          {activeTab === "budget" && (
            <TransportBudgetOverview reservations={reservations} transports={transports} />
          )}

          {/* Convocations */}
          {activeTab === "convocations" && (
            <ConvocationsTab transports={transports} reservations={reservations} />
          )}

          {/* Billets */}
          {activeTab === "billets" && (
            <BilletsTab transports={transports} onBulkUpdate={handleBulkSave} />
          )}

          {/* Points de RDV */}
          {activeTab === "villes" && (
            <GlobalCityStopsTab
              transports={transports}
              cityStops={cityStops}
              onBulkUpdate={handleBulkSave}
              onCityStopsChange={setCityStops}
            />
          )}
        </div>
      )}

      {showNew && (
        <NewTransportModal
          onClose={() => setShowNew(false)}
          onCreated={(t) => { handleCreated(t); setShowNew(false); }}
        />
      )}
    </div>
  );
}
