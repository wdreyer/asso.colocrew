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
const ONSITE_ADDRESSES = {
  MCSC: "375 Rte de la Plage S, 40660 Messanges",
  EVCC: "1050 Plazako bidea, 64780 Bidarray",
};

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

function countUniqueChildrenAcrossTransports(transports) {
  const passengers = new Map();
  (transports || []).forEach((transport) => {
    (transport.passengers || []).forEach((passenger, index) => {
      const key = passenger.reservationId || passenger.id || `${transport.id}-${index}`;
      const count = Math.max(passenger.children?.length || 0, 1);
      passengers.set(key, Math.max(passengers.get(key) || 0, count));
    });
  });
  return [...passengers.values()].reduce((total, count) => total + count, 0);
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

function shortStayCode(value) {
  const normalized = normalizeSearchText(value);
  if (normalized.includes("eaux vives") || normalized.includes("eaux-vives")) return "EVCC";
  if (normalized.includes("surf") || normalized.includes("my creative")) return "MCSC";
  return String(value || "Séjour").trim();
}

function onSiteAddressForStay(value) {
  return ONSITE_ADDRESSES[shortStayCode(value)] || "";
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

function passengerDropoffCity(passenger) {
  return passenger.dropoffCity || "";
}

function passengersLeavingAtStop(transport, city) {
  const normalizedCity = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(passengerDropoffCity(passenger)) === normalizedCity,
  );
}

function segmentStopCity(transport, segment) {
  return transport.direction === "retour" ? segment?.to : segment?.from;
}

function segmentSubStops(segment) {
  return Array.isArray(segment?.stops) ? segment.stops : [];
}

function transportBranches(transport) {
  return Array.isArray(transport?.branches) ? transport.branches : [];
}

function branchStopCity(transport, branch) {
  return transport.direction === "retour" ? branch?.to : branch?.from;
}

function branchJoinCity(transport, branch) {
  return branch?.joinsAt || (transport.direction === "retour" ? branch?.from : branch?.to) || "";
}

function isBranchSegment(segment) {
  return segment?.kind === "branch" || segment?.routeKind === "branch";
}

const STAGE_QUAI_RDV = "Rendez-vous sur le quai — l’animateur·ice vous contactera";
const STAGE_QUAI_DETAILS = "La voie, la voiture et l’heure précise seront communiquées par l’animateur·ice.";

function isRoadTransportMode(value) {
  const mode = normalizePlace(value);
  return mode.includes("bus") || mode.includes("autocar") || mode.includes("minibus");
}

function isRailStageStop(routeStop) {
  return Boolean(
    routeStop
    && (routeStop.type === "sub" || routeStop.type === "branch-sub")
    && !isRoadTransportMode(routeStop.segment?.mode || routeStop.branch?.mode),
  );
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

function mainJoinIndexForBranch(transport, branch) {
  const segments = transport?.segments || [];
  const joinKey = normalizePlace(branchJoinCity(transport, branch));
  if (!joinKey) return transport?.direction === "retour" ? segments.length - 1 : 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (normalizePlace(segment.from) === joinKey) return index;
    if (normalizePlace(segment.to) === joinKey) return Math.min(index + 1, segments.length);
  }

  return transport?.direction === "retour" ? segments.length - 1 : segments.length;
}

function scheduleMinutes(portion) {
  const value = portion?.departureTime || portion?.arrivalTime || "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function orderedTransportPortions(transport) {
  const segments = transport?.segments || [];
  const entries = segments.map((portion, index) => ({
    portion,
    type: "segment",
    fallbackOrder: index * 2,
  }));
  transportBranches(transport).forEach((portion, index) => {
    entries.push({
      portion,
      type: "branch",
      fallbackOrder: mainJoinIndexForBranch(transport, portion) * 2 - 0.5 + index / 100,
    });
  });
  return entries.sort((left, right) => {
    const leftMinutes = scheduleMinutes(left.portion);
    const rightMinutes = scheduleMinutes(right.portion);
    if (leftMinutes !== null && rightMinutes !== null && leftMinutes !== rightMinutes) {
      return leftMinutes - rightMinutes;
    }
    if (leftMinutes !== null && rightMinutes === null) return -1;
    if (leftMinutes === null && rightMinutes !== null) return 1;
    return left.fallbackOrder - right.fallbackOrder;
  });
}

function ticketPortionEntries(transport) {
  const segments = (transport?.segments || []).map((segment, index) => ({
    portion: segment,
    index,
    type: "segment",
  }));
  const branches = transportBranches(transport).map((branch, index) => ({
    portion: { ...branch, kind: branch.kind || "branch" },
    index,
    type: "branch",
  }));
  return [...segments, ...branches];
}

function ticketPortions(transport) {
  return ticketPortionEntries(transport).map((entry) => entry.portion);
}

function routePortionCount(transport) {
  return ticketPortionEntries(transport).length;
}

function missingTicketPortionCount(transport) {
  return ticketPortionEntries(transport).reduce((count, { portion, index }) => {
    const tickets = (transport.tickets || []).filter((ticket) => ticket.segmentId === portion.id);
    return count + segmentLegCoverage(transport, portion, index, tickets)
      .filter((leg) => leg.missingSeats > 0).length;
  }, 0);
}

function ticketPortionEntryById(transport, portionId) {
  return ticketPortionEntries(transport).find((entry) => entry.portion?.id === portionId) || null;
}

function transportStopCities(transport) {
  const cities = new Set();
  (transport.segments || []).forEach((segment) => {
    [segment.from, segment.to].filter(Boolean).forEach((city) => cities.add(city));
    segmentSubStops(segment).forEach((stop) => stop.city && cities.add(stop.city));
  });
  transportBranches(transport).forEach((branch) => {
    [branch.from, branch.to, branch.joinsAt].filter(Boolean).forEach((city) => cities.add(city));
    segmentSubStops(branch).forEach((stop) => stop.city && cities.add(stop.city));
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
  const mainStops = [...stops];
  transportBranches(transport).forEach((branch, branchIndex) => {
    const joinCity = branchJoinCity(transport, branch);
    const joinIndex = mainJoinIndexForBranch(transport, branch);
    const joinStop = mainStops.find((stop) => normalizePlace(stop.city) === normalizePlace(joinCity));
    const baseOrder = Number.isFinite(joinStop?.order)
      ? joinStop.order - 0.35 + branchIndex * 0.01
      : stops.length + branchIndex;
    const city = branchStopCity(transport, branch);
    if (city) {
      stops.push({
        city,
        segment: { ...branch, kind: branch.kind || "branch" },
        branch,
        branchIndex,
        segmentIndex: joinIndex,
        stopIndex: -1,
        type: "branch",
        order: baseOrder,
      });
    }
    segmentSubStops(branch).forEach((stop, stopIndex) => {
      if (!stop.city) return;
      stops.push({
        city: stop.city,
        segment: { ...branch, kind: branch.kind || "branch" },
        branch,
        branchIndex,
        segmentIndex: joinIndex,
        stopIndex,
        stop,
        type: "branch-sub",
        order: baseOrder + (stopIndex + 1) * 0.005,
      });
    });
  });
  return stops.sort((a, b) => a.order - b.order);
}

function routeStopTime(stop, transport, kind = "arrival") {
  if (!stop) return "";
  if (stop.type === "sub") {
    return kind === "departure"
      ? stop.stop?.departureTime || stop.stop?.arrivalTime || ""
      : stop.stop?.arrivalTime || stop.stop?.departureTime || "";
  }
  if (stop.type === "branch" || stop.type === "branch-sub") {
    const item = stop.type === "branch-sub" ? stop.stop : stop.branch;
    return kind === "departure"
      ? item?.departureTime || item?.arrivalTime || ""
      : item?.arrivalTime || item?.departureTime || "";
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
  if (isRailStageStop(stop)) return STAGE_QUAI_RDV;
  if (stop.type === "sub" || stop.type === "branch-sub") return segmentMeetingLabel(stop.stop);
  return segmentMeetingLabel(stop.branch || stop.segment);
}

function trainLabelForSegment(segment, transport) {
  const type = segment?.mode || segment?.trainType || transport?.trainType || transport?.mode || "Train";
  const number = segment?.number || segment?.trainNumber || transport?.trainNumber || transport?.number || "";
  return [type, number].filter(Boolean).join(" ");
}

function routeSegmentsFromStop(transport, stop) {
  const segments = transport?.segments || [];
  if (!segments.length) return [];
  if (!stop) return segments;
  if (stop.type === "branch" || stop.type === "branch-sub") {
    const branch = { ...(stop.branch || stop.segment), kind: "branch" };
    const joinIndex = mainJoinIndexForBranch(transport, branch);
    return transport?.direction === "retour"
      ? [...segments.slice(0, joinIndex + 1), branch]
      : [branch, ...segments.slice(joinIndex)];
  }
  const index = Number.isInteger(stop?.segmentIndex) ? stop.segmentIndex : 0;
  return transport?.direction === "retour"
    ? segments.slice(0, index + 1)
    : segments.slice(index);
}

function routeTrainSummary(transport, stop) {
  const labels = routeSegmentsFromStop(transport, stop)
    .map((segment) => trainLabelForSegment(segment, transport))
    .filter(Boolean);
  const uniqueLabels = labels.filter((label, index) => labels.indexOf(label) === index);
  return uniqueLabels.join(" puis ") || trainLabelForSegment(null, transport);
}

function routeDepartureTimeFromStop(transport, stop) {
  const segments = routeSegmentsFromStop(transport, stop);
  const firstSegment = segments[0] || null;
  if (stop?.type === "sub") return routeStopTime(stop, transport, "departure") || firstSegment?.departureTime || transport?.departureTime || "";
  return firstSegment?.departureTime || transport?.departureTime || routeStopTime(stop, transport, "departure") || "";
}

function routeArrivalTimeFromStop(transport, stop) {
  if (transport?.direction === "retour" && stop) {
    return routeStopTime(stop, transport, "arrival") || "";
  }
  const segments = routeSegmentsFromStop(transport, stop);
  const lastSegment = segments[segments.length - 1] || null;
  return lastSegment?.arrivalTime || transport?.arrivalTime || routeStopTime(stop, transport, "arrival") || "";
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
  if (isRailStageStop(stop)) return true;
  if (stop?.type === "sub" || stop?.type === "branch-sub") return segmentStopType(stop.stop) === "quai";
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

function wrapForPrint(innerHtml) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body{margin:0;padding:20px 8px;background:#f0ebff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}
  @media print{body{background:#fff!important;padding:0!important;}@page{margin:10mm;}}
  .no-print{text-align:center;margin:24px 0 0;}
  .no-print button{padding:10px 28px;background:#B8336A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;}
  @media print{.no-print{display:none;}}
</style>
</head><body>
${innerHtml}
<div class="no-print"><button onclick="window.print()">Imprimer / Télécharger PDF</button></div>
</body></html>`;
}

function passengersAtStop(transport, city) {
  const normalizedCity = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(passengerCity(transport, passenger)) === normalizedCity,
  );
}

function passengersOnBranch(transport, branch) {
  const branchCities = new Set([
    branchStopCity(transport, branch),
    ...segmentSubStops(branch).map((stop) => stop.city),
  ].map((city) => normalizePlace(city)).filter(Boolean));
  return (transport.passengers || []).filter((passenger) =>
    branchCities.has(normalizePlace(passengerCity(transport, passenger))),
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
    if (boarding.type === "branch" || boarding.type === "branch-sub") {
      const joinIndex = mainJoinIndexForBranch(transport, boarding.branch || boarding.segment);
      return transport.direction === "retour"
        ? segmentIndex < joinIndex
        : segmentIndex >= joinIndex;
    }
    return transport.direction === "retour"
      ? segmentIndex <= boarding.segmentIndex
      : segmentIndex >= boarding.segmentIndex;
  });
}

function passengersOnTicketPortion(transport, portion, index) {
  return isBranchSegment(portion)
    ? passengersOnBranch(transport, portion)
    : passengersOnSegment(transport, index);
}

function purchasedTicketsForSegment(tickets, segmentId) {
  return (tickets || []).filter((ticket) => ticket.segmentId === segmentId && ticket.purchased);
}

function ticketsLinkedToSegments(transport) {
  const segmentIds = new Set(ticketPortions(transport).map((segment) => segment.id).filter(Boolean));
  return (transport.tickets || []).filter((ticket) => ticket.segmentId && segmentIds.has(ticket.segmentId));
}

function segmentRouteLabel(segment) {
  const points = [segment?.from, ...segmentSubStops(segment).map((stop) => stop.city), segment?.to]
    .filter(Boolean)
    .filter((city, index, items) => index === 0 || normalizePlace(city) !== normalizePlace(items[index - 1]));
  return points.join(" → ") || "Départ → Arrivée";
}

function transportRouteLabel(transport) {
  return `${transport?.departureCity || "Départ"} → ${transport?.arrivalCity || "Arrivée"}`;
}

function directionIcon(direction) {
  return direction === "retour" ? "↓" : "↑";
}

function assignedTransportStaffIds(transport) {
  return [...new Set([
    ...(transport?.segments || []).flatMap((segment) => segment.assignedStaffIds || []),
    ...transportBranches(transport).flatMap((branch) => branch.assignedStaffIds || []),
  ].filter(Boolean))];
}

function effectiveLeadStaffId(transport) {
  const assignedIds = assignedTransportStaffIds(transport);
  if (assignedIds.length === 1) return assignedIds[0];
  return assignedIds.includes(transport?.leadStaffId) ? transport.leadStaffId : "";
}

function leadStaffMember(transport) {
  const leadId = effectiveLeadStaffId(transport);
  return (transport?.staff || []).find((member) => member.id === leadId) || null;
}

function requiredSeatsForSegment(transport, segment, segmentIndex) {
  if (!segment) return 0;
  return countChildren(passengersOnTicketPortion(transport, segment, segmentIndex)) + (segment.assignedStaffIds || []).length;
}

function purchasedSeatsForSegmentTickets(tickets) {
  return (tickets || [])
    .filter((ticket) => ticket.purchased)
    .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
}

function portionRoutePoints(portion) {
  const points = [portion?.from, ...segmentSubStops(portion).map((stop) => stop.city), portion?.to]
    .filter(Boolean);
  return points.filter((city, index) => index === 0 || normalizePlace(city) !== normalizePlace(points[index - 1]));
}

function ticketCoverageIndexes(ticket, routePoints) {
  const findIndex = (city) => routePoints.findIndex((point) => normalizePlace(point) === normalizePlace(city));
  const labelPoints = String(ticket?.segmentLabel || "")
    .split(/\s*(?:→|>)\s*/)
    .map((city) => city.trim())
    .filter(Boolean);
  const from = ticket?.coverageFrom || ticket?.from || labelPoints[0];
  const to = ticket?.coverageTo || ticket?.to || labelPoints.at(-1);
  const fromIndex = findIndex(from);
  const toIndex = findIndex(to);
  return {
    fromIndex: fromIndex >= 0 ? fromIndex : 0,
    toIndex: toIndex >= 0 ? toIndex : routePoints.length - 1,
  };
}

function passengerUsesPortionLeg(transport, passenger, portionIndex, routePoints, legIndex) {
  const boarding = passengerBoardingStop(transport, passenger);
  if (!boarding) return false;

  if (isBranchSegment(boarding.branch || boarding.segment)) return true;
  let usesLeg;
  if (boarding.segmentIndex !== portionIndex) {
    usesLeg = transport.direction === "retour"
      ? boarding.segmentIndex > portionIndex
      : boarding.segmentIndex < portionIndex;
  } else {
    const cityIndex = routePoints.findIndex((city) =>
      normalizePlace(city) === normalizePlace(passengerCity(transport, passenger)),
    );
    usesLeg = cityIndex < 0
      ? true
      : transport.direction === "retour" ? cityIndex > legIndex : cityIndex <= legIndex;
  }
  if (!usesLeg || transport.direction === "retour") return usesLeg;

  const dropoffIndex = routePoints.findIndex((city) =>
    normalizePlace(city) === normalizePlace(passengerDropoffCity(passenger)),
  );
  return dropoffIndex < 0 || dropoffIndex > legIndex;
}

function segmentLegCoverage(transport, segment, segmentIndex, segmentTickets = []) {
  const routePoints = portionRoutePoints(segment);
  if (routePoints.length < 2) return [];
  const assignedStaffCount = (segment.assignedStaffIds || []).length;

  return routePoints.slice(0, -1).map((from, legIndex) => {
    const passengers = isBranchSegment(segment)
      ? passengersOnBranch(transport, segment)
      : (transport.passengers || []).filter((passenger) =>
        passengerUsesPortionLeg(transport, passenger, segmentIndex, routePoints, legIndex),
      );
    const neededSeats = countChildren(passengers) + assignedStaffCount;
    const purchasedSeats = segmentTickets
      .filter((ticket) => {
        if (!ticket.purchased) return false;
        const { fromIndex, toIndex } = ticketCoverageIndexes(ticket, routePoints);
        return fromIndex <= legIndex && toIndex >= legIndex + 1;
      })
      .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);

    return {
      from,
      to: routePoints[legIndex + 1],
      neededSeats,
      purchasedSeats,
      missingSeats: Math.max(0, neededSeats - purchasedSeats),
    };
  });
}

function missingSeatsForSegment(transport, segment, segmentIndex, segmentTickets = []) {
  return segmentLegCoverage(transport, segment, segmentIndex, segmentTickets)
    .reduce((maximum, leg) => Math.max(maximum, leg.missingSeats), 0);
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
  const segments = ticketPortions(transport);
  const entries = ticketPortionEntries(transport);
  const linkedTickets = ticketsLinkedToSegments(transport);
  const rows = linkedTickets.map((ticket) => {
    const entry = entries.find((item) => item.portion?.id === ticket.segmentId);
    const segmentIndex = entry?.index ?? -1;
    const seg = entry?.portion || null;
    const segmentTickets = seg ? linkedTickets.filter((item) => item.segmentId === seg.id) : [];
    return {
      type: "ticket",
      ticket: displayTicketForSegment(ticket, transport, seg, segmentIndex, segmentTickets),
      transport,
      seg,
    };
  });

  if (!includeMissingSegments) return rows;

  entries.forEach(({ portion: segment, index: segmentIndex }) => {
    const segmentTickets = linkedTickets.filter((ticket) => ticket.segmentId === segment.id);
    const hasPendingTicket = segmentTickets.some((ticket) => !ticket.purchased);
    const coverage = segmentLegCoverage(transport, segment, segmentIndex, segmentTickets);
    const neededSeats = Math.max(0, ...coverage.map((leg) => leg.neededSeats));
    const missingSeats = Math.max(0, ...coverage.map((leg) => leg.missingSeats));
    if (neededSeats <= 0) return;
    if (missingSeats <= 0 || hasPendingTicket) return;

    const missingLegs = coverage.filter((leg) => leg.missingSeats > 0);
    const missingLabel = missingLegs.map((leg) => `${leg.from} → ${leg.to}`).join(", ");

    rows.push({
      type: "segment-missing-ticket",
      transport,
      seg: segment,
      ticket: {
        id: `segment-missing-${transport.id}-${segment.id}`,
        name: `Billet à acheter - ${missingLabel || segmentRouteLabel(segment)}`,
        segmentId: segment.id,
        seats: Math.max(1, missingSeats),
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
  const segmentLabel = ticketSegmentLabel(ticket, ticketPortions(transport));
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

function isBeforeNoon(value) {
  const minutes = timeToMinutes(value);
  return minutes !== null && minutes < 12 * 60;
}

function isAfterDinnerTime(value) {
  const minutes = timeToMinutes(value);
  return minutes !== null && minutes >= 19 * 60;
}

const DEFAULT_REMINDER_ITEMS = [
  { id: "picnic",           condition: "picnic",  conditionLabel: "Si départ avant midi (aller ou retour)",   emoji: "🥪",  defaultText: "Pensez à prévoir un pique-nique pour le déjeuner." },
  { id: "dinner",           condition: "dinner",  conditionLabel: "Si arrivée après 19h00 (aller ou retour)", emoji: "🍽️", defaultText: "Un repas sera prévu sur place, mais l'arrivée étant tardive, pensez à prévoir un encas pour le dîner." },
  { id: "water",            condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "💧",  defaultText: "Merci de prévoir de l'eau et un goûter pour le trajet." },
  { id: "timing",           condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "⏱️", defaultText: "Le rendez-vous est fixé au moins 45 minutes avant le départ du train." },
  { id: "tshirt",           condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "👕",  defaultText: "Un animateur ou animatrice ColoCrew vous attendra au point de rendez-vous, reconnaissable à son t-shirt ColoCrew." },
  { id: "group",            condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "👥",  defaultText: "L'animateur ou animatrice prendra en charge le groupe et assurera un trajet encadré et sécurisé jusqu'au centre de vacances." },
  { id: "meds",             condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "💊",  defaultText: "Si votre enfant a un traitement médical, merci de prévoir les médicaments dans leur emballage d'origine avec l'ordonnance, et de prévenir l'animateur ou animatrice au moment du rendez-vous." },
  { id: "bedding",          condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "🛏️", defaultText: "Pensez à apporter des draps, un sac de couchage ou un sac à viande pour votre enfant." },
  { id: "liability_go",     condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "📝",  defaultText: "Si votre enfant se rend seul au point de rendez-vous, merci de nous fournir la décharge de responsabilité ci-jointe, qu'il remettra directement à l'animateur ou animatrice." },
  { id: "liability_return", condition: "always",  conditionLabel: "Toujours affiché",                         emoji: "📝",  defaultText: "Pour le retour, si l'enfant doit rentrer seul ou être récupéré par une tierce personne, merci de nous fournir la décharge de responsabilité ci-jointe, qu'il remettra directement à l'animateur ou animatrice." },
];

const DEFAULT_HTML_REMINDER = {
  picnic:           "🥪 Pensez à prévoir un <strong>pique-nique pour le déjeuner</strong>.",
  dinner:           "🍽️ Un <strong>repas sera prévu sur place</strong>, mais l'arrivée étant tardive, pensez à prévoir un pique-nique ou un encas pour le dîner.",
  water:            "💧 Merci de prévoir <strong>de l'eau et un goûter</strong> pour le trajet.",
  timing:           "⏱️ Le rendez-vous est fixé <strong>au moins 45 minutes avant le départ du train</strong>.",
  tshirt:           "👕 Un animateur ou animatrice ColoCrew vous attendra au point de rendez-vous, reconnaissable à son <strong>t-shirt ColoCrew</strong>.",
  group:            "👥 L'animateur ou animatrice prendra ensuite en charge le groupe et assurera un <strong>trajet encadré et sécurisé</strong> jusqu'au centre de vacances.",
  meds:             "💊 Si votre enfant a un traitement médical, merci de prévoir les <strong>médicaments dans leur emballage d'origine avec l'ordonnance</strong>, et de prévenir l'animateur ou animatrice au moment du rendez-vous.",
  bedding:          "🛏️ Pensez à apporter des <strong>draps, un sac de couchage ou un sac à viande</strong> pour votre enfant.",
  liability_go:     "📝 Si votre enfant se rend seul au point de rendez-vous, merci de nous fournir la <strong>décharge de responsabilité ci-jointe</strong>, qu'il remettra directement à l'animateur ou animatrice.",
  liability_return: "📝 Pour le retour, si l'enfant doit rentrer seul ou être récupéré par une tierce personne, merci de nous fournir la <strong>décharge de responsabilité ci-jointe</strong>, qu'il remettra directement à l'animateur ou animatrice.",
};

function buildConvocationReminderItems({ departureTime, arrivalTime, returnDepartureTime, returnArrivalTime }, convocSettings = {}) {
  const needsLunch  = isBeforeNoon(departureTime);
  const needsDinner = isAfterDinnerTime(arrivalTime);
  const items = convocSettings.items || {};
  const condMet = (c) => c === "always" || (c === "picnic" && needsLunch) || (c === "dinner" && needsDinner);
  return DEFAULT_REMINDER_ITEMS.map((item) => {
    if (!condMet(item.condition)) return null;
    const s = items[item.id];
    if (s?.enabled === false) return null;
    if (s?.text) return `${item.emoji} ${s.text}`;
    return DEFAULT_HTML_REMINDER[item.id];
  }).filter(Boolean);
}

function buildReminderListHtml(items) {
  return `<ul style="margin:0;padding:0;list-style:none;font-size:14px;color:#374151;line-height:1.75;">
    ${items.map((item) => `<li style="margin:0 0 8px;padding-left:18px;position:relative;"><span style="position:absolute;left:0;color:#B8336A;">●</span>${item}</li>`).join("")}
  </ul>`;
}

function plainReminderText(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
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
  const leavingCount = countChildren(passengersLeavingAtStop(transport, city));
  if (leavingCount > 0) {
    return { label: "descendent", count: leavingCount, tone: "down" };
  }
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
    leadStaffId:     d.leadStaffId     || "",
    capacity:        Number(d.capacity) || 0,
    status:          d.status          || "brouillon",
    notes:           d.notes           || "",
    passengers:      d.passengers      || [],
    routeGroup:      d.routeGroup      || "direct",
    routeLabel:      d.routeLabel      || "",
    week:            d.week            || "",
    segments:        Array.isArray(d.segments) ? d.segments : [],
    branches:        Array.isArray(d.branches) ? d.branches : [],
    staff:           Array.isArray(d.staff) ? d.staff : [],
    tickets:         Array.isArray(d.tickets) ? d.tickets : [],
    coverageExcluded: Boolean(d.coverageExcluded),
    sharedConnection: Boolean(d.sharedConnection),
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
    convocationReminderDone: Boolean(d.convocationReminderDoneAt || d.convocationReminderSentAt),
    convocationReminderDoneAt: d.convocationReminderDoneAt || d.convocationReminderSentAt || null,
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
      if (passenger.dropoffCity) entry.dropoffCity = passenger.dropoffCity;
      if (passenger.stayCode) entry.stayCode = passenger.stayCode;
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
    stayCode: passenger.stayCode || shortStayCode(reservation.sejourName),
    dropoffCity: passenger.dropoffCity || "",
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
    transportSegment: data.transportSegment || "",
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
    <tr class="city-row"><td colspan="8">Ville : ${city} · ${countChildren(passengers)} enfant${countChildren(passengers) !== 1 ? "s" : ""}</td></tr>
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
        <td><strong>${p.stayCode || shortStayCode(p.sejourName)}</strong>${p.dropoffCity ? `<br><span class="sub">↓ ${p.dropoffCity}</span>` : ""}</td>
        <td>${birthStr}</td>
        <td style="font-family:monospace;font-size:11.5px;color:#888">${p.numeroDeReservation || "-"}</td>
        <td style="text-align:center;font-size:16px">→</td>
      </tr>`;
    }).join("")}
  `).join("") || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#aaa;font-style:italic">Aucun passager assigné</td></tr>`;

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
    <thead><tr><th style="width:32px">#</th><th>Responsable légal</th><th>Téléphone</th><th>Enfant(s)</th><th>Séjour / descente</th><th>Date naissance</th><th>N° réservation</th><th style="width:32px">✓</th></tr></thead>
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
          <div class="tr-row"><span class="tr-lbl">Récupération</span><em>À la descente du quai — communiqué par l'animateur·ice</em></div>
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
    const time = routeStop?.stop?.meetingTime || routeStopTime(routeStop, transport, "departure") || stopSegment.meetingTime || transport.meetingTime || "";
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

function buildOnSiteEmailHtml(reservation, week, options = {}, customIntro = "", animInfo = {}) {
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
  const parentFullName = reservation.nom || "Madame, Monsieur";
  const intro = customIntro?.trim()
    ? customIntro.trim().split(/\n{2,}/).map((part) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">${part.replace(/\n/g, "<br>")}</p>`).join("")
    : `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">Bonjour <strong>${parentFullName}</strong>,</p>
       <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">Nous vous transmettons les informations de rendez-vous sur place pour ${childLabel}.</p>`;
  const row = (label, aller, retour, last = false) => `
    <tr>
      <td style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;">${label}</td>
      <td style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;">${aller}</td>
      <td style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;">${retour}</td>
    </tr>`;
  const onSiteReminderItems = [
    isBeforeNoon(arrivalTime) ? "🥪 Pensez à prévoir un <strong>pique-nique pour le déjeuner</strong>." : null,
    isAfterDinnerTime(arrivalTime) || isAfterDinnerTime(returnTime) ? "🍽️ Un <strong>repas sera prévu sur place</strong>, mais l'arrivée étant tardive, pensez à prévoir un pique-nique ou un encas pour le dîner." : null,
    "👕 Un animateur ou animatrice ColoCrew sera reconnaissable à son <strong>t-shirt ColoCrew</strong>.",
    "💧 Merci de prévoir <strong>de l'eau et un goûter</strong>.",
    "💊 Si votre enfant a un traitement médical, merci de prévoir les <strong>médicaments dans leur emballage d'origine avec l'ordonnance</strong>, et de prévenir l'équipe au moment du rendez-vous.",
    "🛏️ Pensez à apporter des <strong>draps, un sac de couchage ou un sac à viande</strong> pour votre enfant.",
    "📝 Si votre enfant arrive seul, repart seul ou est récupéré par une tierce personne, merci de nous fournir la <strong>décharge de responsabilité ci-jointe</strong>.",
  ].filter(Boolean);

  const logoUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://colocrew.com') + '/LogoColoCrew.png';
  const animBlock = animInfo?.name ? `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:15px;font-weight:800;color:#1e1040;">${animInfo.name}</p>
    ${animInfo.phone ? `<p style="margin:4px 0 0;font-size:14px;color:#374151;">📞 ${animInfo.phone}</p>` : ""}
  </div>` : `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:14px;font-weight:700;color:#374151;line-height:1.6;">Les coordonnées de l’animateur·ice vous seront communiquées prochainement.</p>
  </div>`;

  return `
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,16,64,0.12);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #16a34a;"><tr>
    <td style="padding:14px 28px;vertical-align:middle;">
      <img src="${logoUrl}" alt="ColoCrew" style="height:48px;width:auto;display:block;" onerror="this.style.display='none'" />
    </td>
    <td style="padding:14px 28px;text-align:right;vertical-align:middle;font-size:12px;color:#64748b;line-height:1.9;">
      <div>info@colocrew.com</div><div>colocrew.com</div>
    </td>
  </tr></table>
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#166534;">📍 Convocation sur place</h1>
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
        ${row("Heure de RDV", `<strong style="color:#16a34a;">à partir de ${arrivalTime}</strong>`, `<strong style="color:#ea580c;">à partir de ${returnTime}</strong>`)}
        ${row("Lieu", `<strong>${arrivalPoint}</strong>`, `<strong>${returnPoint}</strong>`)}
        ${row("Consigne", "Remise de l'enfant directement à l'équipe ColoCrew sur le lieu du séjour.", "Reprise de l'enfant directement auprès de l'équipe ColoCrew sur le lieu du séjour.", true)}
      </tbody>
    </table>
    <div style="margin-top:18px;padding:16px 18px;background:#fdf8fc;border:1.5px solid #f3d0e6;border-radius:10px;">
      <h2 style="font-size:14px;font-weight:900;color:#1e1040;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f5f0ff;">À prévoir</h2>
      ${buildReminderListHtml(onSiteReminderItems)}
    </div>
    <p style="margin:18px 0 0;font-size:13px;line-height:1.65;color:#64748b;">En cas d'imprévu, contactez-nous rapidement : <strong>${EMERGENCY_PHONES.join(" / ")}</strong>.</p>
  </div>
  ${animBlock}
</div>`;
}

function buildStaffBriefingHTML(transport) {
  const staff = transport.staff || [];
  const segments = transport.segments || [];
  const portions = ticketPortions(transport);
  const tickets = transport.tickets || [];
  const routeLabel = ROUTE_GROUPS.find((item) => item.value === transport.routeGroup)?.label || "Direct";
  const leadId = effectiveLeadStaffId(transport);
  const passengerRows = groupPassengersByCity(transport).map(({ city, passengers }) => `
    <tr class="city-row"><td colspan="6">Ville : ${city} · ${countChildren(passengers)} enfant${countChildren(passengers) !== 1 ? "s" : ""}</td></tr>
    ${passengers.flatMap((passenger) => {
      const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
      return children.map((child) => `
        <tr>
          <td><strong>${child.firstName || ""} ${child.lastName || ""}</strong></td>
          <td><strong>${city}</strong></td>
          <td><strong>${passenger.stayCode || shortStayCode(passenger.sejourName)}</strong>${passenger.dropoffCity ? ` · ↓ ${passenger.dropoffCity}` : ""}</td>
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
      const hdr = `<tr class="city-row"><td colspan="7">` + city + ` — ${countChildren(cp)} enfant${countChildren(cp) !== 1 ? "s" : ""}</td></tr>`;
      const rows = cp.flatMap((passenger) => {
        const children = passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }];
        return children.map((child) => `
          <tr><td><strong>${child.firstName || ""} ${child.lastName || ""}</strong></td>
          <td>${city}</td>
          <td><strong>${passenger.stayCode || shortStayCode(passenger.sejourName)}</strong>${passenger.dropoffCity ? ` · ↓ ${passenger.dropoffCity}` : ""}</td>
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
        <div class="stop-place"><strong>Animateurs sur cette portion :</strong> ${assignedStaff.length ? assignedStaff.map((member) => `${member.name || "Nom à compléter"}${member.id === leadId ? " - CHEF DE CONVOI" : ""} (${member.phone || "téléphone manquant"})`).join(", ") : "Aucun animateur affecté"}</div>
        ${segment.instructions ? `<div class="stop-note">${segment.instructions}</div>` : ""}
        <table><thead><tr><th>Enfant</th><th>Ville</th><th>Séjour / descente</th><th>Responsable</th><th>Téléphone</th><th>Dossier</th><th>Présent</th></tr></thead>
        <tbody>${childRows || "<tr><td colspan='7'>Aucun enfant affecté à cet arrêt.</td></tr>"}</tbody></table>
      </section>`;
  }).join("");
  const staffRows = staff.map((member) => `
    <tr><td><strong>${member.name || "-"}${member.id === leadId ? " - CHEF" : ""}</strong></td><td>${member.role || "Animateur convoyeur"}</td>
    <td>${member.phone || "-"}</td><td>${member.boardingCity || "-"}</td></tr>`).join("");
  const ticketRows = tickets.map((ticket) => `
    <li><strong>${ticket.name || "Billet"}</strong> - ${ticketSegmentLabel(ticket, portions) || "segment non affecté"}
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
    <table><thead><tr><th>Jeune</th><th>Ville</th><th>Séjour / descente</th><th>Responsable</th><th>Téléphone</th><th>Présent</th></tr></thead><tbody>${passengerRows || "<tr><td colspan='6'>Aucun jeune assigné</td></tr>"}</tbody></table>
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

function coverageSummary(reservations, transports, week, direction) {
      const validated = reservations.filter((reservation) => reservation.status === "validated" && reservation.week);
      const cityKey = direction === "aller" ? "departureCity" : "returnCity";
      const expected = validated.filter((reservation) =>
        reservation.week === week && normalizePlace(reservation[cityKey]) !== "sur place",
      );
      const onSite = validated.filter((reservation) =>
        reservation.week === week && normalizePlace(reservation[cityKey]) === "sur place",
      );
      const relevantTrips = transports.filter((transport) =>
        transport.week === week
        && transport.direction === direction
        && transport.status !== "annulé"
        && !transport.coverageExcluded,
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
}

function TransportCoverage({ reservations, transports }) {
  const summaries = useMemo(() => {
    return WEEKS.flatMap((week) => ["aller", "retour"].map((direction) =>
      coverageSummary(reservations, transports, week, direction),
    ));
  }, [reservations, transports]);
  const noWeek = reservations
    .filter((reservation) => reservation.status === "validated" && !reservation.week)
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
              const totalChildren = countUniqueChildrenAcrossTransports(trips);
              const totalStaff = trips.reduce((s, t) => s + (t.staff || []).length, 0);
              const missingTix = trips.reduce((s, t) => s + missingTicketPortionCount(t), 0);
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
                            <span>{routePortionCount(trip)} étape{routePortionCount(trip) !== 1 ? "s" : ""}</span>
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
                const totalChildren = countUniqueChildrenAcrossTransports(trips);
                const totalSegs = trips.reduce((s, t) => s + routePortionCount(t), 0);
                const boughtTickets = trips.reduce((s, t) => s + (t.tickets || []).filter((tk) => tk.purchased).length, 0);
                const totalTickets = trips.reduce((s, t) => s + (t.tickets || []).length, 0);
                const missingSegs = trips.reduce((s, t) => s + missingTicketPortionCount(t), 0);
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
                        const segs = ticketPortions(trip);
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
  const branches  = transportBranches(transport);
  const staffPool = transport.staff    || [];
  const leadStaffId = effectiveLeadStaffId(transport);
  if (segments.length === 0) return null;

  const isS2 = transport.week === "S2";
  const parallelBranchesForSegment = (segment) => isS2 ? branches.filter((branch) => {
    const joinCity = normalizePlace(branchJoinCity(transport, branch));
    const mainCity = normalizePlace(transport.direction === "retour" ? segment.from : segment.to);
    return joinCity && joinCity === mainCity;
  }) : [];
  const parallelBranchIds = new Set(segments.flatMap((segment) =>
    parallelBranchesForSegment(segment).map((branch) => branch.id),
  ));
  const floatingBranches = branches.filter((branch) => !parallelBranchIds.has(branch.id));

  const last = segments[segments.length - 1];
  const finalAction = Number(last?.sharedFinalDropoffChildren || 0) > 0
    ? { count: Number(last.sharedFinalDropoffChildren), label: "descendent", tone: "down" }
    : timelineActionInfo(transport, last?.to);
  const endForkBranches = floatingBranches.filter((b) => mainJoinIndexForBranch(transport, b) >= segments.length);
  const sortedEndForkBranches = [...endForkBranches].sort(
    (a, b) => (a.departureTime || "").localeCompare(b.departureTime || "")
  );
  const hasForks = floatingBranches.length > 0;

  return (
    <div className={`tl-wrap${hasForks ? " tl-wrap--has-forks" : ""}`}>
      <div className="tl-track">
        {segments.flatMap((seg, i) => {
          const assignedIds = seg.assignedStaffIds || [];
          const previous = i > 0 ? segments[i - 1] : null;
          const action = timelineActionInfo(transport, seg.from, { isFirst: i === 0 });
          const connectionDuration = previous ? durationBetween(previous.arrivalTime, seg.departureTime) : "";
          const trainDuration = durationBetween(seg.departureTime, seg.arrivalTime);
          const joiningBranches = floatingBranches.filter((branch) => mainJoinIndexForBranch(transport, branch) === i);
          const parallelBranches = parallelBranchesForSegment(seg);
          const sortedJoiningBranches = [...joiningBranches].sort(
            (a, b) => (a.departureTime || "").localeCompare(b.departureTime || "")
          );

          return [
            /* Fork node — shown BEFORE the joining stop when branches merge here */
            sortedJoiningBranches.length > 0 && (
              <div key={`fork-${seg.id}`} className="tl-fork-node" style={{ "--i": i }}>
                <div className="tl-fork-branches">
                  {sortedJoiningBranches.map((branch) => {
                    const bDur   = durationBetween(branch.departureTime, branch.arrivalTime);
                    const bCount = countChildren(passengersOnBranch(transport, branch));
                    return (
                      <div key={branch.id} className="tl-fork-branch">
                        <span className="tl-fork-branch-chip">
                          <strong>{segmentRouteLabel(branch)}</strong>
                          <small>
                            {branch.departureTime && <span>Dép. {branch.departureTime}</span>}
                            {branch.arrivalTime   && <span>Arr. {branch.arrivalTime}</span>}
                            {bDur                 && <span>{bDur}</span>}
                            {bCount > 0           && <span>{bCount} enf.</span>}
                          </small>
                        </span>
                        <div className="tl-fork-branch-stem" />
                      </div>
                    );
                  })}
                </div>
                <div className="tl-fork-node-junction" />
                <div className="tl-fork-node-track" />
              </div>
            ),

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
            <div key={`leg-${seg.id}`} className={`tl-leg${seg.sharedBus ? " is-shared-bus" : ""}${parallelBranches.length ? " has-parallel-branches" : ""}`} style={{ "--i": i }}>
              <div className="tl-leg-line" />
              {parallelBranches.length > 0 && (
                <div className="tl-parallel-routes">
                  <div className="tl-parallel-route is-main">
                    <span className="tl-parallel-route-line" />
                    <strong>{segmentRouteLabel(seg)}</strong>
                    <small>
                      {seg.departureTime && <span>{seg.departureTime}</span>}
                      {seg.arrivalTime && <span>→ {seg.arrivalTime}</span>}
                      <span>{countChildren(passengersOnSegment(transport, i))} enf.</span>
                    </small>
                  </div>
                  {parallelBranches.map((branch) => (
                    <div key={branch.id} className="tl-parallel-route is-branch">
                      <span className="tl-parallel-route-line" />
                      <strong>{segmentRouteLabel(branch)}</strong>
                      <small>
                        {branch.departureTime && <span>{branch.departureTime}</span>}
                        {branch.arrivalTime && <span>→ {branch.arrivalTime}</span>}
                        {!branch.departureTime && !branch.arrivalTime && <span>Horaire à compléter</span>}
                        <span>{countChildren(passengersOnBranch(transport, branch))} enf.</span>
                      </small>
                    </div>
                  ))}
                </div>
              )}
              {seg.sharedBus && (
                <span className="tl-shared-bus-label">
                  Autocar partagé · regroupement de tous les convois
                  {Number(seg.sharedChildrenCount || 0) > 0 && ` · ${seg.sharedChildrenCount} enfants`}
                </span>
              )}
              {segmentSubStops(seg).length > 0 && (
                <div className="tl-substops">
                  {segmentSubStops(seg).map((stop, stopIndex) => {
                    const stopAction = Number(stop.sharedDropoffChildren || 0) > 0
                      ? { count: Number(stop.sharedDropoffChildren), label: "descendent", tone: "down" }
                      : Number(stop.sharedPickupChildren || 0) > 0
                        ? { count: Number(stop.sharedPickupChildren), label: "montent", tone: "up" }
                      : timelineActionInfo(transport, stop.city);
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
                        {on && member.id === leadStaffId && <span className="tl-anim-check">Chef</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>,
          ];
        })}

        {/* End fork — branches leaving from the very last main stop (e.g. Marseille & Lyon off Toulouse) */}
        {sortedEndForkBranches.length > 0 && (
          <div className="tl-fork-node" style={{ "--i": segments.length }}>
            <div className="tl-fork-branches">
              {sortedEndForkBranches.map((branch) => {
                const bDur   = durationBetween(branch.departureTime, branch.arrivalTime);
                const bCount = countChildren(passengersOnBranch(transport, branch));
                return (
                  <div key={branch.id} className="tl-fork-branch">
                    <span className="tl-fork-branch-chip">
                      <strong>{segmentRouteLabel(branch)}</strong>
                      <small>
                        {branch.departureTime && <span>Dép. {branch.departureTime}</span>}
                        {branch.arrivalTime   && <span>Arr. {branch.arrivalTime}</span>}
                        {bDur                 && <span>{bDur}</span>}
                        {bCount > 0           && <span>{bCount} enf.</span>}
                      </small>
                    </span>
                    <div className="tl-fork-branch-stem" />
                  </div>
                );
              })}
            </div>
            <div className="tl-fork-node-junction" />
          </div>
        )}

        {/* Arrival node — becomes the fork hub when branches leave from here */}
        <div className="tl-stop tl-stop-arr" style={{ "--i": segments.length }}>
          <div className={`tl-dot${sortedEndForkBranches.length > 0 ? " tl-dot-fork" : " tl-dot-arrival"}`} />
          <div className="tl-stop-info">
            <span className="tl-city">{last?.to}</span>
            <div className="tl-times">
              {last?.arrivalTime ? <span>Arr. {last.arrivalTime}</span> : <span>-</span>}
            </div>
            {sortedEndForkBranches.length === 0 && finalAction && (
              <span className={`tl-count is-${finalAction.tone}`}>
                {finalAction.count} {finalAction.label}
              </span>
            )}
            <span className="tl-arr-tag">{sortedEndForkBranches.length > 0 ? "Embranchement" : "Arrivée"}</span>
          </div>
        </div>
      </div>
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
    const missingTickets = trips.reduce((sum, transport) => sum + missingTicketPortionCount(transport), 0);
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

function TransportBudgetOverview({ reservations, transports, financeSummary }) {
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
      ticketRowsForTransport(t, { includeMissingSegments: false }).forEach(({ ticket, seg, type }) => {
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
          segmentLabel: seg ? segmentRouteLabel(seg) : ticketSegmentLabel(ticket, ticketPortions(t)),
          sortKey: `${ticketPortionEntryById(t, ticket.segmentId)?.index ?? 999}-${ticket.name || ""}`,
        };
        d.tickets.push(row);
        day.tickets.push(row);
        trip.tickets.push(row);
      });
    });

    const accountingByWeek = financeSummary?.transportAccounting?.byWeek || {};
    Object.entries(accountingByWeek).forEach(([week, accounting]) => {
      const row = ensure(week);
      const amount = Number(accounting?.transportAmount);
      if (Number.isFinite(amount)) row.revenue = amount;
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
  }, [financeSummary, reservations, transports]);

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
  const leadMember = leadStaffMember(transport);
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
              <th>Mouvement à l'arrêt</th>
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
              const legCoverage = segmentLegCoverage(transport, segment, index, segmentTickets);
              const firstLegCoverage = legCoverage[0];
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
                    <span className={`tr-summary-ticket ${firstLegCoverage?.missingSeats ? "is-missing" : "is-bought"}`}>
                      {firstLegCoverage
                        ? `${firstLegCoverage.purchasedSeats}/${firstLegCoverage.neededSeats}${firstLegCoverage.missingSeats ? ` · ${firstLegCoverage.missingSeats} manq.` : " · OK"}`
                        : "À vérifier"}
                    </span>
                  </td>
                  <td>
                    {assignedStaff.length
                      ? assignedStaff.map((member) => `${member.name || "Animateur"}${member.id === leadMember?.id ? " (chef)" : ""}`).join(", ")
                      : <span className="tr-summary-empty">Non affecté</span>}
                  </td>
                </tr>
              )];

              segmentSubStops(segment).forEach((stop, stopIndex) => {
                const stopCity = stop.city;
                const stopPassengersAtCity = passengersAtStop(transport, stopCity);
                const leavingPassengersAtCity = passengersLeavingAtStop(transport, stopCity);
                const routeStop = routeBoardingStops(transport).find((item) =>
                  item.type === "sub" && item.segmentIndex === index && item.stopIndex === stopIndex,
                );
                const alreadyAtSubStop = passengersBeforeStop(transport, routeStop?.order ?? index);
                const onboardAfterSubStop = passengersAfterStop(transport, routeStop?.order ?? index);
                const nextLegCoverage = legCoverage[stopIndex + 1];
                rows.push(
                  <tr key={`${segment.id}-stop-${stop.id || stop.city || stopIndex}`} className="is-quai-stop is-sub-stop" onClick={() => onEditSegment(transport, segment.id)}>
                    <td><span className="tr-segment-step is-small">{index + 1}.{stopIndex + 1}</span></td>
                    <td>
                      <strong>{stopCity || "Ville à compléter"}</strong>
                      <small>Étape quai · {segmentMeetingLabel(stop)}</small>
                    </td>
                    <td><span className="tr-summary-empty">Sous-étape du billet {segment.from || "-"} → {segment.to || "-"}</span></td>
                    <td><strong>{countChildren(alreadyAtSubStop)}</strong></td>
                    <td>
                      <strong>
                        {leavingPassengersAtCity.length > 0
                          ? `↓ ${countChildren(leavingPassengersAtCity)}`
                          : `↑ ${countChildren(stopPassengersAtCity)}`}
                      </strong>
                    </td>
                    <td><strong>{nextLegCoverage ? Math.max(0, nextLegCoverage.neededSeats - assignedStaff.length) : countChildren(onboardAfterSubStop)}</strong></td>
                    <td>Quai</td>
                    <td>{stop.departureTime || "-"}</td>
                    <td>{stop.arrivalTime || "-"}</td>
                    <td>
                      <span>{stop.mode || segment.mode || "-"} {stop.number || segment.number || ""}</span>
                      {stop.platform && <small>Voie {stop.platform}</small>}
                    </td>
                    <td>
                      <span className={`tr-summary-ticket ${nextLegCoverage?.missingSeats ? "is-missing" : "is-bought"}`}>
                        {nextLegCoverage
                          ? `${nextLegCoverage.purchasedSeats}/${nextLegCoverage.neededSeats}${nextLegCoverage.missingSeats ? ` · ${nextLegCoverage.missingSeats} manq.` : " · OK"}`
                          : "Arrivée"}
                      </span>
                    </td>
                    <td>
                      {assignedStaff.length
                        ? assignedStaff.map((member) => `${member.name || "Animateur"}${member.id === leadMember?.id ? " (chef)" : ""}`).join(", ")
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
                <div><strong>{routePortionCount(trip)}</strong><span>étapes</span></div>
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

const CONVOYAGE_MAP_CITIES = {
  lille: [292, 48],
  paris: [282, 122],
  nantes: [145, 190],
  lyon: [360, 268],
  valence: [355, 315],
  marseille: [365, 425],
  montpellier: [300, 395],
  toulouse: [228, 368],
  bordeaux: [145, 310],
  dax: [130, 365],
  messanges: [112, 390],
  "vieux boucau": [112, 390],
  bidarray: [145, 420],
};

const CONVOYAGE_MAP_LABELS = {
  lille: [10, -8], paris: [10, -7], nantes: [-70, -7], lyon: [10, -7],
  valence: [10, 10], marseille: [10, 14], montpellier: [-82, 14],
  toulouse: [-74, 15], bordeaux: [-75, -8], dax: [-58, -8],
  messanges: [-88, 14], "vieux boucau": [-88, 14], bidarray: [10, 17],
};

function convoyageMapPoint(city) {
  return CONVOYAGE_MAP_CITIES[normalizePlace(city)] || null;
}

function ConvoyageDayMap({ transports, reservations, week, direction }) {
  const coverage = coverageSummary(reservations, transports, week, direction);
  const complete = coverage.missingChildren === 0 && coverage.duplicateChildren === 0;
  const edges = [];
  const cityData = new Map();
  const seenSharedLegs = new Set();
  const seenPassengers = new Set();

  const ensureCity = (city) => {
    const key = normalizePlace(city);
    if (!key || !convoyageMapPoint(city)) return null;
    if (!cityData.has(key)) cityData.set(key, { key, city, up: 0, down: 0, times: new Set() });
    return cityData.get(key);
  };
  const addTime = (city, time) => {
    const row = ensureCity(city);
    if (row && time) row.times.add(time);
  };

  transports.forEach((transport) => {
    (transport.passengers || []).forEach((passenger) => {
      const passengerKey = passenger.reservationId || `${transport.id}-${passenger.nom}`;
      if (seenPassengers.has(passengerKey)) return;
      seenPassengers.add(passengerKey);
      const row = ensureCity(passengerCity(transport, passenger));
      if (row) {
        if (direction === "retour") row.down += Math.max(passenger.children?.length || 0, 1);
        else row.up += Math.max(passenger.children?.length || 0, 1);
      }
      if (direction === "aller") {
        const dropoff = ensureCity(passengerDropoffCity(passenger));
        if (dropoff) dropoff.down += Math.max(passenger.children?.length || 0, 1);
      }
    });

    [...(transport.segments || []), ...transportBranches(transport)].forEach((portion) => {
      const stops = [portion.from, ...segmentSubStops(portion).map((stop) => stop.city), portion.to].filter(Boolean);
      stops.forEach(ensureCity);
      addTime(portion.from, portion.departureTime);
      segmentSubStops(portion).forEach((stop) => {
        addTime(stop.city, stop.arrivalTime || stop.departureTime);
        if (portion.sharedBus && direction === "retour" && Number(stop.sharedPickupChildren || 0) > 0) {
          const sharedKey = `${portion.sharedBusId}-${normalizePlace(stop.city)}-pickup`;
          if (!seenSharedLegs.has(sharedKey)) {
            seenSharedLegs.add(sharedKey);
            ensureCity(stop.city).up += Number(stop.sharedPickupChildren);
          }
        }
      });
      addTime(portion.to, portion.arrivalTime);
      if (portion.sharedBus && direction === "retour" && Number(portion.sharedStartChildren || 0) > 0) {
        const sharedKey = `${portion.sharedBusId}-start`;
        if (!seenSharedLegs.has(sharedKey)) {
          seenSharedLegs.add(sharedKey);
          ensureCity(portion.from).up += Number(portion.sharedStartChildren);
        }
      }
      for (let index = 0; index < stops.length - 1; index += 1) {
        const from = stops[index];
        const to = stops[index + 1];
        if (!convoyageMapPoint(from) || !convoyageMapPoint(to)) continue;
        const sharedKey = portion.sharedBus ? `${portion.sharedBusId || portion.id}-${normalizePlace(from)}-${normalizePlace(to)}` : "";
        if (sharedKey && seenSharedLegs.has(sharedKey)) continue;
        if (sharedKey) seenSharedLegs.add(sharedKey);
        edges.push({
          key: sharedKey || `${transport.id}-${portion.id}-${index}`,
          from,
          to,
          sharedBus: Boolean(portion.sharedBus),
          branch: isBranchSegment(portion),
          routeGroup: transport.routeGroup,
        });
      }
    });
  });

  const routeColors = { nord: "#2563eb", "sud-ouest": "#b8336a", sudouest: "#b8336a", direct: "#64748b" };

  return (
    <section className="tr-map-overview">
      <div className="tr-map-head">
        <div>
          <span>Schéma général de la journée</span>
          <strong>{direction === "aller" ? "Convergences vers les séjours" : "Retours vers les familles"}</strong>
        </div>
        <span className={`tr-map-coverage${complete ? " is-complete" : " has-issue"}`}>
          {complete
            ? `Tous les enfants affectés · ${coverage.expectedChildren}/${coverage.expectedChildren}`
            : `${coverage.missingChildren} sans trajet · ${coverage.duplicateChildren} en doublon`}
        </span>
      </div>
      <div className="tr-map-layout">
        <div className="tr-map-canvas">
          <svg viewBox="55 15 405 465" role="img" aria-label="Schéma des convoyages sur la France">
            <defs>
              <marker id={`convoyage-arrow-${week}-${direction}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
              </marker>
              <filter id={`convoyage-shadow-${week}-${direction}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
              </filter>
            </defs>
            <path className="tr-map-france" d="M258 25 L348 65 L420 155 L397 270 L430 394 L359 456 L258 468 L167 435 L92 365 L72 270 L105 172 L173 83 Z" />
            {edges.map((edge) => {
              const [x1, y1] = convoyageMapPoint(edge.from);
              const [x2, y2] = convoyageMapPoint(edge.to);
              const color = edge.sharedBus ? "#d97706" : routeColors[edge.routeGroup] || "#6d5a86";
              return <line key={edge.key} className={`tr-map-edge${edge.sharedBus ? " is-bus" : ""}${edge.branch ? " is-branch" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color }} markerEnd={`url(#convoyage-arrow-${week}-${direction})`} />;
            })}
            {[...cityData.values()].map((row) => {
              const [x, y] = convoyageMapPoint(row.city);
              const [dx, dy] = CONVOYAGE_MAP_LABELS[row.key] || [9, -8];
              const movement = [row.up ? `+${row.up}` : "", row.down ? `-${row.down}` : ""].filter(Boolean).join(" / ");
              return (
                <g key={row.key} className="tr-map-city" transform={`translate(${x} ${y})`}>
                  <circle r="6" filter={`url(#convoyage-shadow-${week}-${direction})`} />
                  <g transform={`translate(${dx} ${dy})`}>
                    <text className="tr-map-city-name">{row.city}</text>
                    {(movement || row.times.size > 0) && <text className="tr-map-city-meta" y="13">{[movement, [...row.times][0]].filter(Boolean).join(" · ")}</text>}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="tr-map-routes">
          {transports.map((transport) => {
            const lead = leadStaffMember(transport);
            const branches = transportBranches(transport);
            const sharedBus = (transport.segments || []).find((segment) => segment.sharedBus);
            return (
              <article key={transport.id}>
                <div className="tr-map-route-title">
                  <i style={{ background: routeColors[transport.routeGroup] || "#6d5a86" }} />
                  <strong>{ROUTE_GROUPS.find((group) => group.value === transport.routeGroup)?.label || "Trajet"}</strong>
                  <span>{countChildren(transport.passengers)} enf.</span>
                </div>
                <p>{transport.departureCity || "?"} → {transport.arrivalCity || "?"}</p>
                {branches.map((branch) => <small key={branch.id}>Embranchement {segmentRouteLabel(branch)} · {countChildren(passengersOnBranch(transport, branch))} enf.</small>)}
                {sharedBus && <small className="is-bus">Autocar partagé · regroupement à Bordeaux · {sharedBus.sharedChildrenCount || countChildren(transport.passengers)} enf.</small>}
                <small>Chef : {lead?.name || "à désigner"}</small>
              </article>
            );
          })}
          <div className="tr-map-legend"><span><i className="is-north" />Nord</span><span><i className="is-south" />Sud/Ouest</span><span><i className="is-bus" />Autocar partagé</span><span><b>+ monte</b> / <b>- descend</b></span></div>
        </div>
      </div>
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
                      <span className="tr-pax-parent">
                        Séjour : <strong>{p.stayCode || shortStayCode(p.sejourName)}</strong>
                        {p.dropoffCity ? ` · Descente ${p.dropoffCity}` : ""}
                      </span>
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
                        ...transportBranches(transport).map((branch) => branchStopCity(transport, branch)),
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
  const [branches, setBranches] = useState(transport.branches || []);
  const [staff, setStaff] = useState(transport.staff || []);
  const [leadStaffId, setLeadStaffId] = useState(transport.leadStaffId || "");
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
  const assignedStaffIds = useMemo(() => [...new Set([
    ...segments.flatMap((segment) => segment.assignedStaffIds || []),
    ...branches.flatMap((branch) => branch.assignedStaffIds || []),
  ].filter(Boolean))], [branches, segments]);
  const leadCandidates = staff.filter((member) => assignedStaffIds.includes(member.id));
  const resolvedLeadStaffId = leadCandidates.length === 1 ? leadCandidates[0].id : leadStaffId;

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
    setBranches(transport.branches || []);
    setStaff(transport.staff || []);
    setLeadStaffId(transport.leadStaffId || "");
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

  const addBranch = () => {
    const newId = crypto.randomUUID();
    setBranches((items) => {
      const mainJoin = segments.find((segment) => normalizePlace(segment.from) === "paris")
        || segments.find((segment) => normalizePlace(segment.to) === "paris")
        || segments[1]
        || segments[0];
      const to = mainJoin?.from || mainJoin?.to || transport.arrivalCity || "";
      const choices = cityChoicesFor("Rouen", to, transport.departureCity, transport.arrivalCity);
      const from = choices.find((city) => normalizePlace(city) === "rouen") || choices[0] || "";
      return [...items, {
        id: newId,
        kind: "branch",
        label: "",
        from,
        to,
        joinsAt: to,
        meetingTime: "",
        meetingPoint: "",
        departureTime: "",
        arrivalTime: "",
        mode: "TER",
        number: "",
        platform: "",
        stopType: "rdv",
        instructions: "",
        assignedStaffIds: [],
      }];
    });
  };

  const removeBranch = (branchId) => {
    setBranches((items) => items.filter((branch) => branch.id !== branchId));
    setTickets((items) => items.filter((ticket) => ticket.segmentId !== branchId));
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

  /* Add a staff member from a contract AND assign them to a segment or branch */
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
    setBranches((items) => items.map((branch) =>
      branch.id !== segId ? branch : { ...branch, assignedStaffIds: [...(branch.assignedStaffIds || []), newEntry.id] }
    ));
  };

  const addPlannedTicket = () => {
    const newId = crypto.randomUUID();
    const firstEntry = ticketPortionEntries({ ...transport, segments, branches })[0];
    const firstSegment = firstEntry?.portion || null;
    setTickets((items) => [...items, {
      id: newId,
      name: firstSegment ? `Billet à acheter - ${segmentRouteLabel(firstSegment)}` : "Billet à acheter",
      segmentId: firstSegment?.id || "",
      seats: firstEntry ? requiredSeatsForSegment({ ...transport, segments, branches }, firstSegment, firstEntry.index) || 1 : 1,
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
    const toggle = (items) => items.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const assigned = new Set(segment.assignedStaffIds || []);
      if (assigned.has(staffId)) assigned.delete(staffId);
      else assigned.add(staffId);
      return { ...segment, assignedStaffIds: [...assigned] };
    });
    setSegments(toggle);
    setBranches(toggle);
  };

  const save = async () => {
    setSaving(true);
    try {
      const knownCityKeys = new Set(cityChoicesFor(
        transport.departureCity,
        transport.arrivalCity,
        ...segments.flatMap((segment) => [segment.from, segment.to, ...segmentSubStops(segment).map((stop) => stop.city)]),
        ...branches.flatMap((branch) => [branch.from, branch.to, branch.joinsAt, ...segmentSubStops(branch).map((stop) => stop.city)]),
      ).map((city) => normalizePlace(city)).filter(Boolean));
      const invalidSegment = segments.find((segment) =>
        !knownCityKeys.has(normalizePlace(segment.from)) || !knownCityKeys.has(normalizePlace(segment.to)),
      );
      const invalidBranch = branches.find((branch) =>
        !knownCityKeys.has(normalizePlace(branch.from))
        || !knownCityKeys.has(normalizePlace(branch.to))
        || (branch.joinsAt && !knownCityKeys.has(normalizePlace(branch.joinsAt))),
      );
      const invalidStop = segments.flatMap((segment) => segmentSubStops(segment)).find((stop) =>
        !knownCityKeys.has(normalizePlace(stop.city)),
      ) || branches.flatMap((branch) => segmentSubStops(branch)).find((stop) =>
        !knownCityKeys.has(normalizePlace(stop.city)),
      );
      if (invalidSegment || invalidBranch || invalidStop) {
        showToast("Chaque segment doit utiliser une ville présente dans Points de RDV.", "error");
        return;
      }
      if (leadCandidates.length > 1 && !leadCandidates.some((member) => member.id === resolvedLeadStaffId)) {
        showToast("Désignez un chef de convoi parmi les animateurs affectés.", "error");
        return;
      }

      const first = segments[0];
      const last = segments.at(-1);
      const leadMember = leadCandidates.find((member) => member.id === resolvedLeadStaffId) || null;
      const segmentIds = new Set([...segments, ...branches].map((segment) => segment.id).filter(Boolean));
      const linkedTickets = tickets.filter((ticket) => ticket.segmentId && segmentIds.has(ticket.segmentId));
      const patch = {
        ...meta,
        segments,
        branches,
        staff,
        leadStaffId: leadMember?.id || "",
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
        convoyeur: leadMember?.name || transport.convoyeur,
        convoyeurPhone: leadMember?.phone || transport.convoyeurPhone,
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

  const activeT = { ...transport, segments, branches };
  const isRetour = activeT.direction === "retour";
  const portionDisplayOrder = new Map(
    orderedTransportPortions(activeT).map((entry, index) => [entry.portion.id, index]),
  );
  const activeSegIdx = segments.findIndex((s) => s.id === editingSegmentId);
  const activeSeg = (activeSegIdx >= 0 && editingSegmentId !== "__bilan__") ? segments[activeSegIdx] : null;

  const addTicketForSegment = (segmentId) => {
    const newId = crypto.randomUUID();
    const entry = ticketPortionEntryById(activeT, segmentId);
    const segIdx = entry?.index ?? -1;
    const segmentTickets = tickets.filter((ticket) => ticket.segmentId === segmentId);
    const autoSeats = entry
      ? missingSeatsForSegment(activeT, entry.portion, segIdx, segmentTickets)
      : 1;
    setTickets((items) => [...items, {
      id: newId, name: `Billet à acheter - ${entry ? segmentRouteLabel(entry.portion) : "portion"}`, segmentId, seats: autoSeats || 1,
      price: "", departureTime: "", arrivalTime: "", bookingReference: "", purchased: false, url: "",
    }]);
    setEditingTicketId(newId);
  };

  return (
    <div className="tr-ops-simple">

      {/* Segments */}
      <div className="tr-ops-route-sequence">
        {segments.length === 0 && (
          <div className="tr-seg-empty">Aucun segment. Cliquez sur "+ Segment" pour commencer.</div>
        )}

        {segments.map((seg, i) => {
        const rawSegTix = tickets.filter((t) => t.segmentId === seg.id);
        const segTix = rawSegTix.map((ticket) => displayTicketForSegment(ticket, activeT, seg, i, rawSegTix));
        const segPassengers = passengersOnSegment(activeT, i);
        const mainStop = routeBoardingStops(activeT).find((stop) => stop.type === "main" && stop.segmentIndex === i);
        const mainStopOrder = mainStop?.order ?? i;
        const passengersAlreadyHere = isRetour
          ? passengersAfterStop(activeT, mainStopOrder)
          : passengersBeforeStop(activeT, mainStopOrder);
        const passengersBoardingHere = passengersAtStop(activeT, segmentStopCity(activeT, seg));
        const passengerChildren = (passenger) =>
          (passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "", birthDate: "" }])
            .map((child) => ({
              ...child,
              reservationId: passenger.reservationId,
              sejourName: passenger.sejourName,
              stayCode: passenger.stayCode || shortStayCode(passenger.sejourName),
              dropoffCity: passenger.dropoffCity || "",
            }));
        const segKids = segPassengers.flatMap(p =>
          passengerChildren(p)
        );
        const kidsAlreadyHere = passengersAlreadyHere.flatMap(p =>
          passengerChildren(p)
        );
        const kidsBoardingHere = passengersBoardingHere.flatMap(p =>
          passengerChildren(p)
        );
        const childCount = segKids.length;
        const assignedStaff = staff.filter(m => (seg.assignedStaffIds || []).includes(m.id));
        const staffCount = assignedStaff.length;
        const legCoverage = segmentLegCoverage(activeT, seg, i, rawSegTix);
        const needed = Math.max(0, ...legCoverage.map((leg) => leg.neededSeats));
        const sharedCapacityShortage = Number(seg.capacityShortage || 0);
        const seatsOk = legCoverage.every((leg) => leg.missingSeats === 0) && sharedCapacityShortage <= 0;
        const incompleteLegs = legCoverage.filter((leg) => leg.missingSeats > 0);
        const missingTicketIds = new Set(segTix.flatMap((ticket) => ticket.missingReservationIds || []));
        const segmentStops = segmentSubStops(seg);
        const trainLabel = `${seg.mode || "Transport"}${seg.number ? ` ${seg.number}` : ""}`;
        const segmentCityChoices = cityChoicesFor(seg.from, seg.to);
        const attachedBranches = activeT.week === "S2" ? branches.filter((branch) =>
          normalizePlace(branchJoinCity(activeT, branch))
            === normalizePlace(activeT.direction === "retour" ? seg.from : seg.to),
        ) : [];

        return (
          <div key={seg.id} className="tr-ops-seg" style={{ order: portionDisplayOrder.get(seg.id) ?? i }}>
            <div className="tr-ops-seg-head">
              <span className="tr-ops-seg-num">{(portionDisplayOrder.get(seg.id) ?? i) + 1}</span>
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
                  <span className={seatsOk ? "is-ok" : "is-short"}>
                    {seatsOk
                      ? "Tous les tronçons couverts"
                      : sharedCapacityShortage > 0
                        ? `Bus partagé : ${sharedCapacityShortage} place${sharedCapacityShortage > 1 ? "s" : ""} manquante${sharedCapacityShortage > 1 ? "s" : ""} avant les anims`
                        : `${incompleteLegs.length} tronçon${incompleteLegs.length > 1 ? "s" : ""} incomplet${incompleteLegs.length > 1 ? "s" : ""}`}
                  </span>
                  {segmentStops.length > 0 && <span>{segmentStops.length} étape{segmentStops.length > 1 ? "s" : ""}</span>}
                </div>
                {legCoverage.length > 1 && (
                  <div className="tr-ops-seg-summary">
                    {legCoverage.map((leg) => (
                      <span key={`${seg.id}-${leg.from}-${leg.to}`} className={leg.missingSeats ? "is-short" : "is-ok"}>
                        {leg.from} → {leg.to} : {leg.purchasedSeats}/{leg.neededSeats}
                        {leg.missingSeats ? ` (${leg.missingSeats} manquante${leg.missingSeats > 1 ? "s" : ""})` : " (OK)"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="tr-ops-seg-del"
                onClick={() => removeSegment(seg.id)}>
                Supprimer
              </button>
            </div>

            {attachedBranches.length > 0 && (
              <div className="tr-ops-attached-branches">
                <span>En parallèle de ce segment</span>
                {attachedBranches.map((branch) => (
                  <strong key={branch.id}>
                    {segmentRouteLabel(branch)} · {countChildren(passengersOnBranch(activeT, branch))} enf.
                    {(branch.departureTime || branch.arrivalTime) && ` · ${branch.departureTime || "--:--"} → ${branch.arrivalTime || "--:--"}`}
                  </strong>
                ))}
              </div>
            )}

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
                    passengerChildren(p)
                  );
                  const boardingAtStop = passengersAtStop(activeT, stop.city).flatMap(p =>
                    passengerChildren(p)
                  );
                  const leavingAtStop = passengersLeavingAtStop(activeT, stop.city).flatMap(passengerChildren);
                  const stopTimes = [
                    stop.arrivalTime ? `Arrivée ${stop.arrivalTime}` : null,
                    stop.departureTime ? `Départ ${stop.departureTime}` : null,
                    stop.platform ? `Voie ${stop.platform}` : null,
                  ].filter(Boolean);
                  return (
                    <div key={stop.id || `${stop.city}-${stopIndex}`} className="tr-ops-stop-group is-quai-stop is-inline" style={{ order: isRetour ? 1 : 3 }}>
                      <div className="tr-ops-stop-main">
                        <span className="tr-ops-stop-badge">Étape</span>
                        <strong>{stop.city || "Ville à compléter"}</strong>
                        <span className="tr-ops-stop-time">{stopTimes.join(" · ") || "Horaires à compléter"}</span>
                      </div>
                      <div className="tr-ops-stop-counts">
                        <span>{isRetour ? "Restent après" : "Déjà présents"} <strong>{alreadyAtStop.length}</strong></span>
                        <span>{stopActionLabel(activeT)} <strong>{boardingAtStop.length}</strong></span>
                        {leavingAtStop.length > 0 && <span>Descendent <strong>{leavingAtStop.length}</strong></span>}
                      </div>
                      {boardingAtStop.length > 0 && (
                        <div className="tr-ops-stop-kids">
                          {boardingAtStop.map((c, ci) => (
                            <ChildChip key={`stop-${stopIndex}-${ci}`} child={c} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                          ))}
                        </div>
                      )}
                      {leavingAtStop.length > 0 && (
                        <div className="tr-ops-stop-kids">
                          {leavingAtStop.map((child, childIndex) => (
                            <ChildChip key={`dropoff-${stopIndex}-${childIndex}`} child={child} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const finalDropoffs = passengersLeavingAtStop(activeT, seg.to).flatMap(passengerChildren);
                  if (!finalDropoffs.length) return null;
                  return (
                    <div className="tr-ops-stop-group is-inline" style={{ order: 4 }}>
                      <div className="tr-ops-stop-main">
                        <span className="tr-ops-stop-badge">Destination</span>
                        <strong>{seg.to}</strong>
                        <span className="tr-ops-stop-time">Arrivée {seg.arrivalTime || "à compléter"}</span>
                      </div>
                      <div className="tr-ops-stop-counts"><span>Descendent <strong>{finalDropoffs.length}</strong></span></div>
                      <div className="tr-ops-stop-kids">
                        {finalDropoffs.map((child, childIndex) => (
                          <ChildChip key={`final-dropoff-${childIndex}`} child={child} missingTicketIds={missingTicketIds} openReservation={openReservation} />
                        ))}
                      </div>
                    </div>
                  );
                })()}
                </div>
              </details>
            )}

            {/* Billets */}
            <details className="tr-ops-details">
              <summary>
                Billets
                <span className={seatsOk ? "is-ok" : "is-short"}>{seatsOk ? "Couvert" : sharedCapacityShortage > 0 ? `${sharedCapacityShortage} places manquantes` : `${incompleteLegs.length} incomplet${incompleteLegs.length > 1 ? "s" : ""}`}</span>
              </summary>
              <div className="tr-ops-tix">
              <div className="tr-ops-tix-head">
                <span className="tr-ops-anims-label">Billets</span>
                {needed > 0 && (
                  <span className={`tr-seats-badge${seatsOk ? " is-ok" : " is-short"}`}>
                    {seatsOk ? "Tous les tronçons couverts" : `${incompleteLegs.length} tronçon${incompleteLegs.length > 1 ? "s" : ""} à compléter`}
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
                const tCoveredIds = new Set(ticket.coveredReservationIds || []);
                const tPax = tCoveredIds.size > 0
                  ? segPassengers.filter(p => tCoveredIds.has(p.reservationId))
                  : segPassengers;
                const tSegChildCount = countChildren(tPax);
                const tChildCount = tCoveredIds.size > 0 ? tSegChildCount : Math.min(tSegChildCount, ticket.seats);
                const tStaffCount = ticket.seats > 1 ? Math.min(assignedStaff.length, Math.max(0, ticket.seats - tChildCount)) : 0;
                return (
                  <div key={ticket.id} className={`tr-ticket-card${ticket.purchased ? " is-bought" : " is-missing"}`} onClick={() => setEditingTicketId(ticket.id)}>
                    <span className={`tr-ticket-status${ticket.purchased ? " is-bought" : " is-missing"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span>
                    <div className="tr-ticket-card-info">
                      <span className="tr-ticket-card-name">{ticket.name || "Billet sans titre"}</span>
                      <div className="tr-ticket-card-meta">
                        {ticket.seats > 0 && <span>{ticket.seats} place{ticket.seats !== 1 ? "s" : ""}</span>}
                        {ticket.purchased && ticket.seats > 1 && <span>{usedSeats} utilisée{usedSeats !== 1 ? "s" : ""} ({tChildCount} enf. + {tStaffCount} anim.)</span>}
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

      {branches.length > 0 && (
        <div className="tr-ops-branch-list">
          {branches.map((branch, branchIndex) => {
            const branchPortion = { ...branch, kind: branch.kind || "branch" };
            const rawBranchTix = tickets.filter((ticket) => ticket.segmentId === branch.id);
            const branchTix = rawBranchTix.map((ticket) =>
              displayTicketForSegment(ticket, activeT, branchPortion, branchIndex, rawBranchTix),
            );
            const branchPassengers = passengersOnBranch(activeT, branchPortion);
            const branchKids = branchPassengers.flatMap((p) =>
              (p.children?.length ? p.children : [{ firstName: p.childName, lastName: "", birthDate: "" }])
                .map((c) => ({ ...c, reservationId: p.reservationId })),
            );
            const assignedStaff = staff.filter((member) => (branch.assignedStaffIds || []).includes(member.id));
            const needed = branchKids.length + assignedStaff.length;
            const bought = purchasedSeatsForSegmentTickets(rawBranchTix);
            const seatsOk = needed === 0 || bought >= needed;
            const trainLabel = `${branch.mode || "Transport"}${branch.number ? ` ${branch.number}` : ""}`;
            const branchCityChoices = cityChoicesFor(branch.from, branch.to, branch.joinsAt);
            const branchActionCities = isRetour
              ? [...segmentSubStops(branch).map((stop) => ({ city: stop.city, time: stop.arrivalTime || stop.departureTime || "" })), { city: branch.to, time: branch.arrivalTime || "" }]
              : [{ city: branch.from, time: branch.meetingTime || branch.departureTime || "" }, ...segmentSubStops(branch).map((stop) => ({ city: stop.city, time: stop.meetingTime || stop.departureTime || stop.arrivalTime || "" }))];
            const branchActionGroups = branchActionCities.map((action) => ({
              ...action,
              passengers: branchPassengers.filter((passenger) => normalizePlace(passengerCity(activeT, passenger)) === normalizePlace(action.city)),
            })).filter((action) => action.city && action.passengers.length > 0);

            return (
              <div
                key={branch.id}
                className="tr-ops-seg tr-ops-branch"
                style={{ order: portionDisplayOrder.get(branch.id) ?? segments.length + branchIndex }}
              >
                <div className="tr-ops-seg-head">
                  <span className="tr-ops-seg-num">{(portionDisplayOrder.get(branch.id) ?? segments.length + branchIndex) + 1}</span>
                  <div className="tr-ops-seg-main">
                    <span className="tr-ops-seg-title">
                      Embranchement · {segmentRouteLabel(branch) || "Trajet à compléter"}
                    </span>
                    <div className="tr-ops-seg-summary">
                      <span>Rejoint à <strong>{branch.joinsAt || branch.to || "à compléter"}</strong></span>
                      <span><strong>{branch.departureTime || "--:--"}</strong> → <strong>{branch.arrivalTime || "--:--"}</strong></span>
                      <span>{trainLabel}</span>
                      <span>{branchKids.length} enfant{branchKids.length !== 1 ? "s" : ""}</span>
                      <span>{assignedStaff.length} anim.</span>
                      <span className={seatsOk ? "is-ok" : "is-short"}>Billets {bought}/{needed || 0}</span>
                    </div>
                  </div>
                  <button type="button" className="tr-ops-seg-del" onClick={() => removeBranch(branch.id)}>
                    Supprimer
                  </button>
                </div>

                <details className="tr-ops-details">
                  <summary>Détails de la branche</summary>
                  <div className="tr-ops-train-row">
                    <label className="tr-ops-field-sm">
                      <span>De</span>
                      <select className="dash-input" value={branch.from || ""} onChange={(e) => updateItem(setBranches, branch.id, "from", e.target.value)}>
                        <option value="">Ville RDV...</option>
                        {branchCityChoices.map((city) => <option key={`branch-from-${branch.id}-${city}`} value={city}>{city}</option>)}
                      </select>
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>À</span>
                      <select className="dash-input" value={branch.to || ""} onChange={(e) => updateItem(setBranches, branch.id, "to", e.target.value)}>
                        <option value="">Ville RDV...</option>
                        {branchCityChoices.map((city) => <option key={`branch-to-${branch.id}-${city}`} value={city}>{city}</option>)}
                      </select>
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Jonction</span>
                      <select className="dash-input" value={branch.joinsAt || ""} onChange={(e) => updateItem(setBranches, branch.id, "joinsAt", e.target.value)}>
                        <option value="">Ville de jonction...</option>
                        {branchCityChoices.map((city) => <option key={`branch-join-${branch.id}-${city}`} value={city}>{city}</option>)}
                      </select>
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Mode</span>
                      <select className="dash-input" value={branch.mode || "TER"} onChange={(e) => updateItem(setBranches, branch.id, "mode", e.target.value)}>
                        {TRAIN_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>N° train</span>
                      <input className="dash-input" value={branch.number || ""} onChange={(e) => updateItem(setBranches, branch.id, "number", e.target.value)} placeholder="Train" />
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>RDV</span>
                      <input className="dash-input" type="time" value={branch.meetingTime || ""} onChange={(e) => updateItem(setBranches, branch.id, "meetingTime", e.target.value)} />
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Départ</span>
                      <input className="dash-input" type="time" value={branch.departureTime || ""} onChange={(e) => updateItem(setBranches, branch.id, "departureTime", e.target.value)} />
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Arrivée</span>
                      <input className="dash-input" type="time" value={branch.arrivalTime || ""} onChange={(e) => updateItem(setBranches, branch.id, "arrivalTime", e.target.value)} />
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Quai</span>
                      <input className="dash-input" value={branch.platform || ""} onChange={(e) => updateItem(setBranches, branch.id, "platform", e.target.value)} placeholder="Voie" />
                    </label>
                    <label className="tr-ops-field-sm">
                      <span>Type arrêt</span>
                      <select className="dash-input" value={segmentStopType(branch)} onChange={(e) => updateItem(setBranches, branch.id, "stopType", e.target.value)}>
                        <option value="rdv">RDV organisé</option>
                        <option value="quai">Quai uniquement</option>
                      </select>
                    </label>
                  </div>
                </details>

                <details className="tr-ops-details">
                  <summary>
                    Animateurs
                    {assignedStaff.length > 0 && <span>{assignedStaff.length}</span>}
                  </summary>
                  <div className="tr-ops-anims">
                    <span className="tr-ops-anims-label">
                      Animateurs de l&apos;embranchement
                      {assignedStaff.length > 0 && <span className="tr-ops-anims-count">{assignedStaff.length}</span>}
                    </span>
                    {staff.map((member) => {
                      const checked = (branch.assignedStaffIds || []).includes(member.id);
                      return (
                        <label key={member.id} className={`tr-ops-anim-chip${checked ? " is-on" : ""}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSegmentStaff(branch.id, member.id)} />
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
                        onChange={(event) => {
                          if (event.target.value) addStaffToSegment(event.target.value, branch.id);
                        }}
                      >
                        <option value="">+ Ajouter depuis les contrats…</option>
                        {availableContracts.map((contract) => (
                          <option key={contract.id} value={contract.id}>{contract.memberName} · {contract.role}</option>
                        ))}
                      </select>
                    )}
                    {availableContracts.length === 0 && staff.length === 0 && (
                      <span className="tr-ops-anims-empty">Aucun contrat disponible pour cette semaine</span>
                    )}
                  </div>
                </details>

                {branchKids.length > 0 && (
                  <details className="tr-ops-details">
                    <summary>Enfants <span>{branchKids.length}</span></summary>
                    <div className="tr-ops-enfants">
                      {branchActionGroups.map((group, groupIndex) => {
                        const childrenAtCity = group.passengers.flatMap((passenger) =>
                          (passenger.children?.length ? passenger.children : [{ firstName: passenger.childName, lastName: "" }])
                            .map((child) => ({ ...child, reservationId: passenger.reservationId })),
                        );
                        return (
                          <div key={`${branch.id}-${group.city}`} className="tr-ops-stop-group is-inline">
                            <div className="tr-ops-stop-main">
                              <span className="tr-ops-stop-badge">{groupIndex < branchActionGroups.length - 1 ? "Étape" : "Destination"}</span>
                              <strong>{group.city}</strong>
                              <span className="tr-ops-stop-time">{isRetour ? "Arrivée" : "RDV"} {group.time || "à compléter"}</span>
                            </div>
                            <div className="tr-ops-stop-counts">
                              <span>{isRetour ? "Descendent" : "Montent"} <strong>{childrenAtCity.length}</strong></span>
                            </div>
                            <div className="tr-ops-stop-kids">
                              {childrenAtCity.map((child, childIndex) => (
                                <ChildChip key={`branch-child-${branch.id}-${group.city}-${childIndex}`} child={child} missingTicketIds={new Set()} openReservation={openReservation} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                <details className="tr-ops-details">
                  <summary>
                    Billets
                    <span className={seatsOk ? "is-ok" : "is-short"}>{bought}/{needed || 0}</span>
                  </summary>
                  <div className="tr-ops-tix">
                    <div className="tr-ops-tix-head">
                      <span className="tr-ops-anims-label">Billets branche</span>
                      {needed > 0 && (
                        <span className={`tr-seats-badge${seatsOk ? " is-ok" : " is-short"}`}>
                          {bought}/{needed} places
                        </span>
                      )}
                      <button type="button" className="dash-btn" onClick={() => addTicketForSegment(branch.id)}>+ Billet</button>
                    </div>
                    {branchTix.length === 0 && (
                      <p className="tr-add-empty">Aucun billet pour cette branche.</p>
                    )}
                    {branchTix.map((ticket) => {
                      const usedSeats = ticketUsedSeats(ticket, branchPassengers, assignedStaff);
                      const freeSeats = ticketFreeSeats(ticket, branchPassengers, assignedStaff);
                      return (
                        <div key={ticket.id} className={`tr-ticket-card${ticket.purchased ? " is-bought" : " is-missing"}`} onClick={() => setEditingTicketId(ticket.id)}>
                          <span className={`tr-ticket-status${ticket.purchased ? " is-bought" : " is-missing"}`}>{ticket.purchased ? "Acheté" : "À acheter"}</span>
                          <div className="tr-ticket-card-info">
                            <span className="tr-ticket-card-name">{ticket.name || "Billet sans titre"}</span>
                            <div className="tr-ticket-card-meta">
                              {ticket.seats > 0 && <span>{ticket.seats} place{ticket.seats !== 1 ? "s" : ""}</span>}
                              {ticket.purchased && ticket.seats > 1 && <span>{usedSeats} utilisée{usedSeats !== 1 ? "s" : ""}</span>}
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
        </div>
      )}
      </div>

      <button type="button" className="tr-ops-add-seg" onClick={addSegment}>+ Ajouter un segment</button>
      <button type="button" className="tr-ops-add-seg tr-ops-add-branch" onClick={addBranch}>+ Ajouter une branche</button>

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
        <div className="tr-ops-team-head">
          <span className="tr-ops-anims-label">Chef de convoi</span>
          {leadCandidates.length === 0 ? (
            <span className="is-short">Aucun animateur affecté aux segments</span>
          ) : leadCandidates.length === 1 ? (
            <span className="is-ok">{leadCandidates[0].name} · automatique</span>
          ) : (
            <select className="dash-input" value={resolvedLeadStaffId} onChange={(event) => setLeadStaffId(event.target.value)}>
              <option value="">Désigner le chef de convoi…</option>
              {leadCandidates.map((member) => (
                <option key={`lead-${member.id}`} value={member.id}>{member.name || "Animateur"}</option>
              ))}
            </select>
          )}
        </div>
        <div className="tr-staff-list">
          {staff.map((member) => (
            <article className="tr-staff-editor" key={member.id}>
              <input className="dash-input" value={member.name} onChange={(e) => updateItem(setStaff, member.id, "name", e.target.value)} placeholder="Prénom Nom" />
              <input className="dash-input" value={member.role} onChange={(e) => updateItem(setStaff, member.id, "role", e.target.value)} placeholder="Rôle" />
              <input className="dash-input" value={member.phone} onChange={(e) => updateItem(setStaff, member.id, "phone", e.target.value)} placeholder="Téléphone" />
              <input className="dash-input" value={member.boardingCity} onChange={(e) => updateItem(setStaff, member.id, "boardingCity", e.target.value)} placeholder="Prise de service" />
              {member.contractId && <span className="tr-staff-contract">{member.week} · {member.stayCode}</span>}
              {member.id === resolvedLeadStaffId && <span className="tr-staff-contract">Chef de convoi</span>}
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
                      const entry = ticketPortionEntryById(activeT, segId);
                      const autoSeats = entry
                        ? countChildren(passengersOnTicketPortion(activeT, entry.portion, entry.index)) + (entry.portion.assignedStaffIds || []).length
                        : ticket.seats ?? 1;
                      setTickets((items) => items.map((item) => item.id === ticket.id ? { ...item, segmentId: segId, seats: autoSeats } : item));
                    }}>
                      <option value="">- Affecter à une portion -</option>
                      {ticketPortionEntries(activeT).map(({ portion, type }) => (
                        <option key={portion.id} value={portion.id}>
                          {type === "branch" ? "Branche - " : ""}{portion.from} → {portion.to}
                        </option>
                      ))}
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
      <span className="tr-ops-enfant-dob">{child.stayCode || shortStayCode(child.sejourName)}</span>
      {child.dropoffCity && <span className="tr-ops-enfant-dob">↓ {child.dropoffCity}</span>}
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
  const ingestSegment = (segment, city) => {
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
  };
  (transport.segments || []).forEach((segment) => {
    ingestSegment(segment, segmentStopCity(transport, segment));
  });
  transportBranches(transport).forEach((branch) => {
    ingestSegment(branch, branchStopCity(transport, branch));
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
    branches: transportBranches(targetTransport).map((branch) => {
      const city = branchStopCity(targetTransport, branch);
      const patch = cityMap.get(normalizePlace(city));
      return patch ? { ...branch, ...patch } : branch;
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
        if (
          JSON.stringify(current.segments || []) === JSON.stringify(patched.segments || [])
          && JSON.stringify(transportBranches(current)) === JSON.stringify(patched.branches || [])
        ) continue;
        await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, current.id), {
          segments: patched.segments,
          branches: patched.branches,
          updatedAt: serverTimestamp(),
        });
        updatedCount += 1;
        if (current.id === transport.id) updatedCurrent = { ...transport, segments: patched.segments, branches: patched.branches };
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
    transportBranches(transport).forEach((branch) => {
      ingestCity(transport, branch, branch.from);
      ingestCity(transport, branch, branch.to);
      if (branch.joinsAt && normalizePlace(branch.joinsAt) !== normalizePlace(branch.to)) {
        ingestCity(transport, branch, branch.joinsAt);
      }
      segmentSubStops(branch).forEach((stop) => ingestCity(transport, { ...branch, ...stop }, stop.city, true));
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
      const aSegmentIndex = ticketPortionEntryById(a.transport, a.ticket.segmentId)?.index ?? 999;
      const bSegmentIndex = ticketPortionEntryById(b.transport, b.ticket.segmentId)?.index ?? 999;
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
                                            {ticketPortionEntries(transport).map(({ portion, type }) => (
                                              <option key={portion.id} value={portion.id}>{type === "branch" ? "Branche - " : ""}{segmentRouteLabel(portion)}</option>
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

function relevantCityRows(transports, cityStops, reservations) {
  const activeReservationIds = new Set((reservations || [])
    .filter((reservation) => reservation.status === "validated" && ["S1", "S2"].includes(reservation.week))
    .map((reservation) => reservation.id));
  const relevantTransports = (transports || []).filter((transport) =>
    ["S1", "S2"].includes(transport.week)
    && (transport.passengers || []).some((passenger) => activeReservationIds.has(passenger.reservationId))
  );
  const routeRows = cityRowsFromAllTransports(relevantTransports, []);
  const routeCities = new Set(routeRows.map((row) => normalizePlace(row.city)));
  const relevantStops = (cityStops || []).filter((stop) => routeCities.has(normalizePlace(stop.city)));
  return cityRowsFromAllTransports(relevantTransports, relevantStops);
}

function GlobalCityStopsTab({ transports, reservations, cityStops, onBulkUpdate, onCityStopsChange }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => relevantCityRows(transports, cityStops, reservations));
  const [newCity, setNewCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingCity, setDeletingCity] = useState("");

  useEffect(() => {
    setRows(relevantCityRows(transports, cityStops, reservations));
  }, [transports, cityStops, reservations]);

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
            if (!stopPatch) return stop;
            const railStage = !isRoadMode(segment.mode || segment.trainType || transport.trainType);
            return railStage
              ? { ...stop, meetingPoint: STAGE_QUAI_RDV, stopType: "quai" }
              : { ...stop, meetingPoint: stopPatch.meetingPoint, stopType: stopPatch.stopType };
          });
          if (patchedStops.length) patchedSegment = { ...patchedSegment, stops: patchedStops };
          return patchedSegment;
        });
        const patchedBranches = transportBranches(transport).map((branch) => {
          let patchedBranch = branch;
          const patch = cityMap.get(normalizePlace(branchStopCity(transport, branch)));
          if (patch) {
            patchedBranch = { ...patchedBranch, meetingPoint: patch.meetingPoint, stopType: patch.stopType };
          }
          const joinPatch = cityMap.get(normalizePlace(branchJoinCity(transport, branch)));
          if (joinPatch && normalizePlace(branchJoinCity(transport, branch)) === normalizePlace(branch.to)) {
            patchedBranch = { ...patchedBranch, meetingPoint: patchedBranch.meetingPoint || joinPatch.meetingPoint };
          }
          const patchedStops = segmentSubStops(branch).map((stop) => {
            const stopPatch = cityMap.get(normalizePlace(stop.city));
            if (!stopPatch) return stop;
            const railStage = !isRoadMode(branch.mode || branch.trainType || transport.trainType);
            return railStage
              ? { ...stop, meetingPoint: STAGE_QUAI_RDV, stopType: "quai" }
              : { ...stop, meetingPoint: stopPatch.meetingPoint, stopType: stopPatch.stopType };
          });
          if (patchedStops.length) patchedBranch = { ...patchedBranch, stops: patchedStops };
          return patchedBranch;
        });
        if (
          JSON.stringify(transport.segments || []) === JSON.stringify(patchedSegments)
          && JSON.stringify(transportBranches(transport)) === JSON.stringify(patchedBranches)
        ) continue;
        await updateDoc(doc(db, COLLECTIONS.TRANSPORTS, transport.id), {
          segments: patchedSegments,
          branches: patchedBranches,
          updatedAt: serverTimestamp(),
        });
        updatedTransports.push({ ...transport, segments: patchedSegments, branches: patchedBranches });
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
        branches: transportBranches(transport).map((branch) => ({
          ...branch,
          id: crypto.randomUUID(),
          from: branch.to,
          to: branch.from,
          joinsAt: branch.to,
          departureTime: "",
          arrivalTime: "",
          platform: "",
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
  const leadMember = leadStaffMember(transport);

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
          <span>Chef de convoi : {leadMember?.name || "à désigner"}</span>
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
  const segCount    = routePortionCount(trip);
  const totalTix    = (trip.tickets || []).length;
  const boughtTix   = (trip.tickets || []).filter((tk) => tk.purchased).length;
  const missingTix  = missingTicketPortionCount(trip);
  const sCfg = STATUS_CFG[trip.status] || STATUS_CFG.brouillon;
  const leadMember = leadStaffMember(trip);

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
            <span>Chef : {leadMember?.name || "à désigner"}</span>
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

function dayRecapRows(transports) {
  const rows = [];
  const seen = new Set();
  (transports || []).forEach((transport) => {
    routeBoardingStops(transport).forEach((stop) => {
      const passengers = passengersAtStop(transport, stop.city);
      const key = `${transport.id}|${normalizePlace(stop.city)}`;
      if (!passengers.length || seen.has(key)) return;
      seen.add(key);
      const rdv = getEmailRdvInfo(transport, passengers[0]);
      const arrivalTime = transport.direction === "retour"
        ? routeArrivalTimeFromStop(transport, stop)
        : stop.type === "sub" || stop.type === "branch-sub" ? routeStopTime(stop, transport, "arrival") : "";
      const departureTime = transport.direction === "aller"
        ? routeDepartureTimeFromStop(transport, stop)
        : stop.type === "sub" || stop.type === "branch-sub" ? routeStopTime(stop, transport, "departure") : "";
      rows.push({
        id: key,
        route: `${transport.departureCity || "?"} → ${transport.arrivalCity || "?"}`,
        routeGroup: ROUTE_GROUPS.find((group) => group.value === transport.routeGroup)?.label || transport.routeLabel || "Trajet",
        city: stop.city,
        action: transport.direction === "retour" ? "Descente" : "Prise en charge",
        childCount: countChildren(passengers),
        meetingPoint: rdv.meetingPoint || routeStopMeetingPoint(stop) || stop.city,
        meetingTime: rdv.rdvTime || "",
        arrivalTime,
        departureTime,
        trainLabel: rdv.trainLabel || routeTrainSummary(transport, stop),
      });
    });
  });
  return rows.sort((left, right) => {
    const leftTime = timeToMinutes(left.meetingTime || left.arrivalTime || left.departureTime);
    const rightTime = timeToMinutes(right.meetingTime || right.arrivalTime || right.departureTime);
    if (leftTime === null && rightTime === null) return left.city.localeCompare(right.city, "fr");
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return leftTime - rightTime;
  });
}

function DayRecapModal({ day, transports, onClose }) {
  const rows = useMemo(() => dayRecapRows(transports), [transports]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(30,16,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ width: "min(1120px, 100%)", maxHeight: "90vh", overflow: "hidden", background: "#fff", borderRadius: 16, boxShadow: "0 24px 70px rgba(30,16,64,.3)" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e9e3f0" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#1e1040" }}>Récapitulatif de toute la journée</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#6d5a86" }}>{day.label} · {fmtDateLong(day.date)} · {countUniqueChildrenAcrossTransports(transports)} enfants</div>
          </div>
          <button type="button" className="dash-btn" onClick={onClose}>Fermer</button>
        </div>
        <div style={{ maxHeight: "calc(90vh - 72px)", overflow: "auto", padding: 18 }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: "#1e1040", color: "#fff" }}>
                {['Trajet', 'Ville / action', 'Enfants', 'Point de RDV', 'RDV famille', 'Départ', 'Arrivée', 'Transport'].map((label) => <th key={label} style={{ padding: "10px 12px", textAlign: ['Enfants', 'RDV famille', 'Départ', 'Arrivée'].includes(label) ? 'center' : 'left' }}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} style={{ background: index % 2 ? "#faf8fc" : "#fff", borderBottom: "1px solid #eeeaf3" }}>
                  <td style={{ padding: "10px 12px" }}><strong>{row.route}</strong><div style={{ color: "#7c3aed", fontSize: 10, marginTop: 2 }}>{row.routeGroup}</div></td>
                  <td style={{ padding: "10px 12px" }}><strong>{row.city}</strong><div style={{ color: row.action === "Descente" ? "#ea580c" : "#16a34a", fontWeight: 800, fontSize: 10, marginTop: 2, textTransform: "uppercase" }}>{row.action}</div></td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 900, color: "#7c3aed" }}>{row.childCount}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 260 }}>{row.meetingPoint || "À confirmer"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 900, color: "#B8336A" }}>{row.meetingTime || "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 900, color: "#16a34a" }}>{row.departureTime || "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 900, color: "#ea580c" }}>{row.arrivalTime || "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}><strong>{row.trainLabel || "Transport"}</strong></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Aucune ville avec enfant pour cette journée.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TrajetsTab({ transports, reservations, staffMembers, staffContracts, cityStops, onSave, onDelete, onCreated, onCreate }) {
  const [selectedWeek, setSelectedWeek] = useState("S1");
  const [expandedId, setExpandedId]     = useState(null);
  const [recapDay, setRecapDay]         = useState(null);
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
        const dayKids   = countUniqueChildrenAcrossTransports(dayTrips);
        const missingSegTix = dayTrips.reduce((s, t) => s + missingTicketPortionCount(t), 0);

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
                <button type="button" className="dash-btn" disabled={!dayTrips.length} onClick={() => setRecapDay({ dir, date, label, transports: dayTrips })}>
                  Tableau de la journée
                </button>
              </div>
            </div>

            <div className="tr-day-trips">
              {dir === "retour" && dayTrips.filter((trip) => trip.routeGroup === "direct").map((trip) => (
                <TripCard key={trip.id} trip={trip} zoneName={trip.routeLabel || "Premier trajet commun"}
                  isExpanded={expandedId === trip.id}
                  onToggle={() => toggle(trip.id)}
                  reservations={reservations} staffMembers={staffMembers}
                  staffContracts={staffContracts} cityOptions={cityOptions} onSave={onSave}
                  onDelete={(id) => { setExpandedId(null); onDelete(id); }}
                  onCreated={onCreated}
                />
              ))}
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
              {dir === "aller" && dayTrips.filter((trip) => trip.routeGroup === "direct").map((trip) => (
                <TripCard key={trip.id} trip={trip} zoneName={trip.routeLabel || "Trajet final commun"}
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

      {recapDay && (
        <DayRecapModal
          day={recapDay}
          transports={recapDay.transports}
          onClose={() => setRecapDay(null)}
        />
      )}

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
  const trainTime = routeDepartureTimeFromStop(transport, routeStop)
    || routeStopTime(routeStop, transport, transport.direction === "retour" ? "arrival" : "departure")
    || seg?.departureTime
    || transport.departureTime
    || null;
  const arrivalTime = routeArrivalTimeFromStop(transport, routeStop) || transport.arrivalTime || "";
  let rdvTime = routeStop?.stop?.meetingTime || seg?.meetingTime || null;
  if (!rdvTime && trainTime) {
    const [h, m] = trainTime.split(":").map(Number);
    const total = ((h * 60 + m - 60) % 1440 + 1440) % 1440;
    rdvTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : seg?.meetingPoint || transport.meetingPoint || "";
  const stopType = isRailStageStop(routeStop)
    ? "quai"
    : routeStop?.type === "sub" ? routeStop.stop?.stopType || "quai" : seg?.stopType || transport.stopType || "rdv";
  const platform = routeStop?.stop?.platform || seg?.platform || transport.platform || "";
  const trainLabel = routeTrainSummary(transport, routeStop);
  return { city, rdvTime, trainTime, departureTime: trainTime, arrivalTime, trainLabel, meetingPoint, stopType, platform };
}

function getRetourInfo(transport, passenger, allTransports) {
  if (!allTransports) return null;
  const retourCity = normalizePlace(passenger.returnCity || passenger.pickupCity || "");
  const retourTransports = allTransports.filter(
    (t) => t.direction === "retour" && t.week === transport.week &&
      (!transport.sejourName || transport.sejourName === "-" || t.sejourName === transport.sejourName),
  ).sort((left, right) => {
    const leftAssigned = (left.passengers || []).some((item) => item.reservationId === passenger.reservationId);
    const rightAssigned = (right.passengers || []).some((item) => item.reservationId === passenger.reservationId);
    return Number(rightAssigned) - Number(leftAssigned);
  });
  for (const rt of retourTransports) {
    const routeStop = retourCity ? routeStopForCity(rt, retourCity) : null;
    if (!retourCity || routeStop) {
      const seg = routeStop?.segment || null;
      const arrivalTime = routeStopTime(routeStop, rt, "arrival") || seg?.arrivalTime || rt.arrivalTime || "";
      const departureTime = routeDepartureTimeFromStop(rt, routeStop) || rt.departureTime || "";
      const arrivalCity = routeStop?.city || seg?.to || rt.arrivalCity || passenger.returnCity || "";
      const meetingPoint = routeStop ? routeStopMeetingPoint(routeStop) : seg?.meetingPoint || rt.meetingPoint || "";
      const stopType = routeStop?.type === "sub" ? routeStop.stop?.stopType || "quai" : seg?.stopType || rt.stopType || "rdv";
      const platform = routeStop?.stop?.platform || seg?.platform || rt.platform || "";
      const trainLabel = routeTrainSummary(rt, routeStop);
      return { date: rt.date, departureTime, arrivalTime, meetingTime: arrivalTime, arrivalCity, meetingPoint, stopType, platform, trainLabel };
    }
  }
  return null;
}

function buildEmailBody(transport, passenger, rdvInfo, allTransports, convocSettings = {}) {
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
    `Bonjour ${passenger.nom || ""},`,
    ``,
    `Nous vous adressons la convocation de transport pour ${children} dans le cadre du séjour « ${sejourShort} »${sejourDatesStr ? ` (${sejourDatesStr})` : ""}.`,
    ``,
    `- CONVOCATION ALLER -`,
    `Date : ${fmtDateLong(transport.date)}`,
    `Trajet : ${transport.departureCity} → ${transport.arrivalCity}`,
    `Ville d'embarquement : ${city}`,
    rdvTime ? `Heure de RDV : ${rdvTime}${trainTime ? ` (départ train prévu ${trainTime})` : ""}` : null,
    rdvInfo.trainLabel ? `Train : ${rdvInfo.trainLabel}` : null,
    rdvInfo.arrivalTime ? `Arrivée prévue : ${rdvInfo.arrivalTime}` : null,
    stopType === "quai" ? `${STAGE_QUAI_RDV}. ${STAGE_QUAI_DETAILS}` : (meetingPoint ? `Lieu de RDV : ${meetingPoint}` : null),
    ``,
    retourInfo ? `- RETOUR -` : null,
    retourInfo ? `Date de retour : ${fmtDateLong(retourInfo.date)}` : null,
    retourInfo?.arrivalTime ? `Heure de rendez-vous retour : ${retourInfo.arrivalTime}` : null,
    retourInfo?.trainLabel ? `Train retour : ${retourInfo.trainLabel}` : null,
    retourInfo?.arrivalTime ? `Arrivée prévue : ${retourInfo.arrivalTime}${retourInfo.arrivalCity ? ` à ${retourInfo.arrivalCity}` : ""}` : null,
    retourInfo ? `Lieu de récupération : à la descente du quai — communiqué par l'animateur·ice` : null,
    retourInfo ? `` : null,
    `- CONSIGNES -`,
    ...buildConvocationReminderItems({
      departureTime: rdvInfo.departureTime || trainTime,
      arrivalTime: rdvInfo.arrivalTime,
      returnDepartureTime: retourInfo?.departureTime,
      returnArrivalTime: retourInfo?.arrivalTime,
      city,
    }, convocSettings).map((item) => `• ${plainReminderText(item)}`),
    `• En cas d'urgence ou d'imprévu, contactez-nous immédiatement :`,
    ...(convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : EMERGENCY_PHONES).map((n) => `  ${n}`),
    ``,
    `La convocation individuelle est jointe à cet email (document PDF à imprimer).`,
    ``,
    `Cordialement,`,
    `L'équipe ColoCrew`,
  ].filter((l) => l !== null);
  return lines.join("\n");
}

function buildConvocEmailHtml(transport, passenger, rdvInfo, allTransports, customIntro, animInfo = {}, convocSettings = {}) {
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
    if (stopType === "quai") return `<strong>${STAGE_QUAI_RDV}</strong><br><span style="font-size:12px;color:#64748b;">${STAGE_QUAI_DETAILS}</span>${city ? `<br><span style="font-size:12px;color:#64748b;">Gare de ${city}</span>` : ""}`;
    if (meetingPoint) return `<strong>${meetingPoint}</strong>${city ? `<br><span style="font-size:12px;color:#64748b;">Gare de ${city}</span>` : ""}`;
    if (city) return `<strong>${city}</strong>`;
    return TBC;
  })();

  const allerDate = transport.date
    ? `<strong>${fmtDateLong(transport.date)}</strong>${rdvTime ? `<br><span style="color:#16a34a;font-weight:700;">RDV à ${rdvTime}</span>` : ""}`
    : TBC;

  const trainDetailHtml = (label, departure, arrival, arrivalCity = "") => {
    const lines = [
      label ? `<strong>${label}</strong>` : "",
      departure ? `Départ train : <strong>${departure}</strong>` : "",
      arrival ? `Arrivée prévue : <strong>${arrival}</strong>${arrivalCity ? ` à <strong>${arrivalCity}</strong>` : ""}` : "",
    ].filter(Boolean);
    return lines.length ? lines.join("<br>") : TBC;
  };
  const allerTrain = trainDetailHtml(rdvInfo.trainLabel, rdvInfo.departureTime || trainTime, rdvInfo.arrivalTime, transport.arrivalCity);
  const retourDate = retourInfo?.date
    ? `<strong>${fmtDateLong(retourInfo.date)}</strong>${retourInfo.arrivalTime ? `<br><span style="color:#ea580c;font-weight:700;">RDV à ${retourInfo.arrivalTime}</span>` : ""}`
    : TBC;
  const retourTrain = retourInfo
    ? trainDetailHtml(retourInfo.trainLabel, "", retourInfo.arrivalTime, retourInfo.arrivalCity)
    : TBC;
  const retourLieu = retourInfo
    ? `<em style="color:#64748b;">À la descente du quai — communiqué par l'animateur·ice</em>`
    : TBC;

  const td0 = (last) => `style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;"`;
  const td1 = (last) => `style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;
  const td2 = (last) => `style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;

  const phones = (convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : EMERGENCY_PHONES).join(" / ");
  const reminderItems = buildConvocationReminderItems({
    departureTime: rdvInfo.departureTime || trainTime,
    arrivalTime: rdvInfo.arrivalTime,
    returnDepartureTime: retourInfo?.departureTime,
    returnArrivalTime: retourInfo?.arrivalTime,
    city,
  }, convocSettings);
  const introHtml = customIntro && customIntro.trim()
    ? customIntro.trim().split(/\n\n+/).map((para) => `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.75;">${para.replace(/\n/g, "<br/>")}</p>`).join("")
    : `<p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.75;"><strong>${firstNames || children}</strong> ${nbChildren > 1 ? "sont inscrits" : "est inscrit(e)"} au séjour <strong>${sejourShort}</strong>${weekInfo ? ` du <strong>${fmtDateLong(weekInfo.aller)}</strong> au <strong>${fmtDateLong(weekInfo.retour)}</strong>` : ""}.</p>`;

  const logoUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://colocrew.com') + '/LogoColoCrew.png';
  const animBlock = animInfo?.name ? `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:15px;font-weight:800;color:#1e1040;">${animInfo.name}</p>
    ${animInfo.phone ? `<p style="margin:4px 0 0;font-size:14px;color:#374151;">📞 ${animInfo.phone}</p>` : ""}
  </div>` : `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:14px;font-weight:700;color:#374151;line-height:1.6;">Les coordonnées de l’animateur·ice vous seront communiquées prochainement.</p>
  </div>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Convocation transport</title></head>
<body style="margin:0;padding:20px 8px;background:#f0ebff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,16,64,0.12);">
  <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #B8336A;"><tr>
    <td style="padding:14px 28px;vertical-align:middle;">
      <img src="${logoUrl}" alt="ColoCrew" style="height:48px;width:auto;display:block;" onerror="this.style.display='none'" />
    </td>
    <td style="padding:14px 28px;text-align:right;vertical-align:middle;font-size:12px;color:#64748b;line-height:1.9;">
      <div>info@colocrew.com</div><div>01 84 21 02 30</div><div>colocrew.com</div>
    </td>
  </tr></table>
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#B8336A;">🚆 Convocation de transport — ${sejourShort}</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;">Bonjour <strong>${passenger.nom}</strong>,</p>
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
          <td ${td2(true)}>${retourTrain}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div style="margin:0 28px 20px;padding:14px 20px;background:linear-gradient(135deg,#fff0f6,#f5f0ff);border:1.5px solid #f3d0e6;border-radius:10px;text-align:center;">
    <p style="margin:0;font-size:15px;font-weight:800;color:#B8336A;">Permanence transport : ${phones}</p>
  </div>
  <div style="padding:0 28px 28px;">
    <h2 style="font-size:14px;font-weight:900;color:#1e1040;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f5f0ff;">Déroulement du transport encadré</h2>
    ${buildReminderListHtml(reminderItems)}
    <p style="margin:14px 0 0;font-size:14px;color:#374151;line-height:1.7;">En cas d'urgence ou d'imprévu : <strong>${phones}</strong></p>
  </div>
  ${animBlock}
  <div style="border-top:2px solid #f5f0ff;padding:16px 28px;text-align:center;background:#fdf8fc;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Association ColoCrew — SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">@_colocrew / ColoCrew</p>
  </div>
</div></body></html>`;
}

function buildJ3ReminderHtml(html) {
  const banner = `<div style="padding:15px 28px;background:#fff7ed;border-bottom:2px solid #fdba74;text-align:center;">
    <div style="font-size:18px;font-weight:900;color:#ea580c;letter-spacing:0.04em;">⏰ RAPPEL J-3</div>
    <div style="margin-top:5px;font-size:13px;color:#9a3412;line-height:1.55;">Le départ approche. Merci de relire les horaires et les lieux de rendez-vous ci-dessous et de nous signaler rapidement toute difficulté.</div>
  </div>`;
  const header = '<table style="width:100%;border-collapse:collapse;border-bottom:3px solid #B8336A;">';
  const withBanner = html.includes(header) ? html.replace(header, `${banner}${header}`) : `${banner}${html}`;
  return withBanner.replace(
    /<title>(.*?)<\/title>/,
    "<title>Rappel J-3 — $1</title>",
  );
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

  const doSendGroup = useCallback(async (groupPax) => {
    const primary  = groupPax[0];
    const merged   = mergeFamily(groupPax);
    const rdvInfo  = getEmailRdvInfo(transport, primary);
    const retourInfo = getRetourInfo(transport, primary, allTransports);
    const html     = buildConvocEmailHtml(transport, merged, rdvInfo, allTransports, customIntro);
    const sejourReal = (primary.sejourName && primary.sejourName !== "-") ? primary.sejourName : shortSejourName(transport.sejourName);
    const convocData = {
      sejourName: sejourReal,
      departureCity: transport.departureCity,
      dateLabel: fmtDateLong(transport.date),
      responsable: { nom: primary.nom, phone: primary.phone },
      children: merged.children?.length ? merged.children : [{ firstName: primary.childName || "", lastName: "" }],
      rdvInfo: {
        city: rdvInfo.city,
        rdvTime: rdvInfo.rdvTime,
        trainTime: rdvInfo.trainTime || rdvInfo.departureTime,
        meetingPoint: rdvInfo.meetingPoint,
        platform: rdvInfo.platform,
        stopType: rdvInfo.stopType,
        trainLabel: rdvInfo.trainLabel,
        arrivalTime: rdvInfo.arrivalTime,
        arrivalCity: transport.arrivalCity,
      },
      retour: retourInfo ? {
        dateLabel: fmtDateLong(retourInfo.date),
        trainLabel: retourInfo.trainLabel,
        departureTime: retourInfo.departureTime,
        arrivalTime: retourInfo.arrivalTime,
        arrivalCity: retourInfo.arrivalCity,
      } : null,
      emergencyPhones: convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : null,
    };
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: primary.email,
        subject: emailSubject,
        html,
        from_name: "ColoCrew",
        from_email: "contact@colocrew.com",
        includeDecharge: true,
        convocData,
      }),
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t || `HTTP ${resp.status}`); }
    await Promise.all(groupPax.map((p) => p.reservationId ? markSent(p.reservationId) : null));
  }, [transport, allTransports, emailSubject, customIntro, convocSettings, markSent]);

  const handleSendAll = useCallback(async () => {
    const groups  = groupPassengersByFamily(passengers);
    const toSend  = groups.filter((g) => {
      const allIds = g.map((p) => p.reservationId).filter(Boolean);
      return !allIds.every((id) => sentStatus[id]) && g[0].email && g[0].email !== "-";
    });
    if (!toSend.length) { showToast("Toutes les convocations ont été envoyées", "info"); return; }
    setSendingAll(true);
    setSendProgress({ done: 0, total: toSend.length, errors: [] });
    const errors = [];
    for (let i = 0; i < toSend.length; i++) {
      try { await doSendGroup(toSend[i]); } catch (e) { errors.push({ email: toSend[i][0].email, error: e.message }); }
      setSendProgress({ done: i + 1, total: toSend.length, errors: [...errors] });
      if (i < toSend.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    setSendingAll(false);
    if (errors.length === 0) showToast(`${toSend.length} email(s) envoyé(s)`, "success");
    else showToast(`${toSend.length - errors.length} succès · ${errors.length} erreur(s)`, "error");
  }, [passengers, sentStatus, doSendGroup, showToast]);

  if (!passengers.length) {
    return <p className="tr-convoc-empty-msg">Aucun passager assigné à ce trajet.</p>;
  }

  const familyGroups  = groupPassengersByFamily(passengers);
  const pendingCount  = familyGroups.filter((g) => {
    const allIds = g.map((p) => p.reservationId).filter(Boolean);
    return !allIds.every((id) => sentStatus[id]) && g[0].email && g[0].email !== "-";
  }).length;
  const sentCount = familyGroups.length - pendingCount;

  return (
    <div className="tr-convoc-email-list">

      {/* ── Barre d'actions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "#64748b", flex: 1 }}>
          <span style={{ fontWeight: 700, color: "#1e1040" }}>{familyGroups.length}</span> famille{familyGroups.length > 1 ? "s" : ""}
          {sentCount > 0 && <span style={{ color: "#16a34a", marginLeft: 8, fontWeight: 600 }}>· {sentCount} envoyée{sentCount > 1 ? "s" : ""}</span>}
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
            {familyGroups.map((groupPax, i) => {
              const primary  = groupPax[0];
              const merged   = mergeFamily(groupPax);
              const allIds   = groupPax.map((p) => p.reservationId).filter(Boolean);
              const isSent   = allIds.length > 0 && allIds.every((id) => sentStatus[id]);
              const isSending = sendingId === (primary.email || primary.reservationId);
              const children  = merged.children?.length
                ? merged.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean).join(", ")
                : merged.childName || "-";
              const city     = passengerCity(transport, primary);
              const hasEmail = primary.email && primary.email !== "-";
              const rdvInfo  = getEmailRdvInfo(transport, primary);
              const groupKey = primary.email || primary.reservationId;

              return (
                <tr key={groupKey || i} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: i === 0 ? "none" : "1px solid #f0f0f0" }}>

                  {/* Famille */}
                  <td style={tdS}>
                    <div style={{ fontWeight: 600, color: "#1e1040" }}>{primary.nom}</div>
                    {groupPax.length > 1 && <div style={{ fontSize: 11, color: "#94a3b8" }}>{groupPax.length} inscriptions groupées</div>}
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
                      ? <span style={{ color: "#374151", fontSize: 12 }}>{primary.email}</span>
                      : <span style={{ color: "#ef4444", fontSize: 12, fontStyle: "italic" }}>Manquant</span>}
                  </td>

                  {/* Checkbox envoyee */}
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => isSent
                        ? Promise.all(allIds.map((id) => markUnsent(id)))
                        : Promise.all(allIds.map((id) => markSent(id)))
                      }
                      title={isSent ? "Cliquer pour annuler" : "Marquer envoyée"}
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
                        onClick={() => setPreview(preview?._groupKey === groupKey ? null : { ...merged, _groupKey: groupKey, _groupPax: groupPax, _rdvInfo: rdvInfo })}
                      >
                        Aperçu
                      </button>
                      <button
                        type="button"
                        className={`dash-btn${isSent ? "" : " dash-btn-primary"}`}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        disabled={!hasEmail || isSending || sendingAll}
                        onClick={async () => {
                          setSendingId(groupKey);
                          try {
                            await doSendGroup(groupPax);
                            showToast(`Convocation envoyée à ${primary.email}`, "success");
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
                {preview._groupPax?.length > 1 && <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>{preview._groupPax.length} inscriptions — 1 email groupé + 1 PDF par enfant</div>}
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
                  const groupPax = preview._groupPax || [preview];
                  setSendingId(preview._groupKey || preview.email);
                  try {
                    await doSendGroup(groupPax);
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

function isFamilyConvocationPassenger(transport, passenger) {
  const familyCity = passenger.departureCity || "";
  if (!familyCity) return false;
  return Boolean(routeStopForCity(transport, familyCity));
}

function ConvocationsTab({ transports, reservations, staffMembers = [], staffContracts = [] }) {
  const { showToast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState("S1");
  const [sentStatus, setSentStatus]     = useState({});
  const [reminderStatus, setReminderStatus] = useState({});
  const [sendingKey, setSendingKey]     = useState(null);
  const [sendingAll, setSendingAll]     = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: [] });
  const [preview, setPreview]           = useState(null);
  const [showEditor, setShowEditor]     = useState(false);
  const [customIntro, setCustomIntro]   = useState("");
  const [onSiteConfigs, setOnSiteConfigs]       = useState({});
  const [onSiteModal, setOnSiteModal]           = useState(null);
  const [savingOnSiteModal, setSavingOnSiteModal] = useState(false);
  const [convocSettings, setConvocSettings]     = useState({ items: {}, emergencyPhones: [] });
  const [showConvocSettings, setShowConvocSettings] = useState(false);
  const [savingConvocSettings, setSavingConvocSettings] = useState(false);
  const [emailOverrides, setEmailOverrides] = useState({});

  const emailFor = useCallback((item) => {
    const id = item?.reservationId || item?.id;
    return String((id && emailOverrides[id] !== undefined ? emailOverrides[id] : item?.email) || "").trim();
  }, [emailOverrides]);

  const setFamilyEmailDraft = useCallback((ids, value) => {
    setEmailOverrides((previous) => {
      const next = { ...previous };
      ids.filter(Boolean).forEach((id) => { next[id] = value; });
      return next;
    });
  }, []);

  const saveFamilyEmail = useCallback(async (ids, value) => {
    const email = String(value || "").trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      showToast("Adresse e-mail invalide", "warning");
      return false;
    }
    await Promise.all(ids.filter(Boolean).map((id) => updateDoc(doc(db, COLLECTIONS.RESERVATIONS, id), {
      "legal.email": email,
      updatedAt: serverTimestamp(),
    })));
    setFamilyEmailDraft(ids, email);
    showToast("Adresse e-mail enregistrée", "success");
    return true;
  }, [setFamilyEmailDraft, showToast]);

  const getAnimForTrip = useCallback((trip) => {
    const s = trip?.staff?.[0];
    if (!s) return {};
    const member = staffMembers.find((m) => m.id === s.memberId);
    return {
      name: member?.name || s.name || "",
      phone: member?.phone || s.phone || "",
    };
  }, [staffMembers]);

  const getAnimForOnSite = useCallback((sejourName) => {
    const cfg = onSiteConfigs[sejourName] || {};
    if (!cfg.animName) return {};
    return { name: cfg.animName, phone: cfg.animPhone || "" };
  }, [onSiteConfigs]);

  const weekTrips = useMemo(
    () => transports.filter((t) => t.week === selectedWeek && t.status !== "annulé" && t.direction === "aller"),
    [transports, selectedWeek],
  );

  const convocationTrips = useMemo(
    () => weekTrips
      .map((trip) => ({
        ...trip,
        passengers: (trip.passengers || []).filter((passenger) => isFamilyConvocationPassenger(trip, passenger)),
      }))
      .filter((trip) => trip.passengers.length > 0),
    [weekTrips],
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

  // Chargement des configs Firestore (sur place par semaine, réglages messages globaux)
  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.TRANSPORT_SETTINGS, "onsite_configs")).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const cfgs = {};
      Object.entries(data).forEach(([key, val]) => {
        const idx = key.indexOf("_");
        if (idx !== -1 && key.slice(0, idx) === selectedWeek) {
          cfgs[key.slice(idx + 1)] = val;
        }
      });
      setOnSiteConfigs(cfgs);
    }).catch(() => {});

    getDoc(doc(db, COLLECTIONS.TRANSPORT_SETTINGS, "convoc_messages")).then((snap) => {
      if (snap.exists()) setConvocSettings(snap.data());
    }).catch(() => {});
  }, [selectedWeek]);

  const getOnSiteConfig = useCallback((sejourName) => ({
    arrivalTime: onSiteConfigs[sejourName]?.arrivalTime || "14:00",
    returnTime:  onSiteConfigs[sejourName]?.returnTime  || "14:00",
    lieu:        onSiteConfigs[sejourName]?.lieu        || onSiteAddressForStay(sejourName),
    animName:    onSiteConfigs[sejourName]?.animName    || "",
    animPhone:   onSiteConfigs[sejourName]?.animPhone   || "",
  }), [onSiteConfigs]);

  const setOnSiteConfig = useCallback((sejourName, field, value) => {
    setOnSiteConfigs((prev) => ({ ...prev, [sejourName]: { ...prev[sejourName], [field]: value } }));
  }, []);

  const saveOnSiteModal = useCallback(async () => {
    if (!onSiteModal) return;
    setSavingOnSiteModal(true);
    try {
      const key = `${selectedWeek}_${onSiteModal}`;
      const cfg = onSiteConfigs[onSiteModal] || {};
      await setDoc(doc(db, COLLECTIONS.TRANSPORT_SETTINGS, "onsite_configs"), { [key]: cfg }, { merge: true });
      showToast("Configuration sauvegardée", "success");
      setOnSiteModal(null);
    } catch {
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSavingOnSiteModal(false);
    }
  }, [onSiteModal, onSiteConfigs, selectedWeek, showToast]);

  const saveConvocSettings = useCallback(async () => {
    setSavingConvocSettings(true);
    try {
      await setDoc(doc(db, COLLECTIONS.TRANSPORT_SETTINGS, "convoc_messages"), convocSettings);
      showToast("Réglages des messages sauvegardés", "success");
    } catch {
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSavingConvocSettings(false);
    }
  }, [convocSettings, showToast]);

  useEffect(() => {
    const m = {};
    onSiteReservations.forEach((r) => { if (r.convocationSent) m[r.id] = true; });
    weekTrips.forEach((t) => (t.passengers || []).forEach((p) => { if (p.convocationSent) m[p.reservationId] = true; }));
    setSentStatus(m);
  }, [selectedWeek, onSiteReservations, weekTrips]);

  useEffect(() => {
    const next = {};
    reservations.forEach((reservation) => {
      if (reservation.convocationReminderDone) next[reservation.id] = true;
    });
    setReminderStatus(next);
  }, [reservations]);

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

  const markReminderSent = useCallback(async (ids) => {
    await Promise.all(ids.filter(Boolean).map((id) =>
      updateDoc(doc(db, COLLECTIONS.RESERVATIONS, id), {
        convocationReminderSentAt: serverTimestamp(),
        convocationReminderDoneAt: serverTimestamp(),
      })
    ));
    setReminderStatus((previous) => {
      const next = { ...previous };
      ids.filter(Boolean).forEach((id) => { next[id] = true; });
      return next;
    });
  }, []);

  const toggleReminderDone = useCallback(async (ids, done) => {
    await Promise.all(ids.filter(Boolean).map((id) =>
      updateDoc(doc(db, COLLECTIONS.RESERVATIONS, id), done
        ? { convocationReminderDoneAt: serverTimestamp() }
        : { convocationReminderDoneAt: null, convocationReminderSentAt: null })
    ));
    setReminderStatus((previous) => {
      const next = { ...previous };
      ids.filter(Boolean).forEach((id) => {
        if (done) next[id] = true;
        else delete next[id];
      });
      return next;
    });
  }, []);

  const doSendFamily = useCallback(async (trip, passengers, { reminder = false } = {}) => {
    const primary  = passengers[0];
    const destinationEmail = emailFor(primary);
    if (!destinationEmail) throw new Error("Adresse e-mail manquante");
    const merged   = mergeFamily(passengers);
    const rdvInfo  = getEmailRdvInfo(trip, primary);
    const animInfo = getAnimForTrip(trip);
    const convocationHtml = buildConvocEmailHtml(trip, merged, rdvInfo, transports, customIntro, animInfo, convocSettings);
    const html     = reminder ? buildJ3ReminderHtml(convocationHtml) : convocationHtml;
    const sejourReal = (primary.sejourName && primary.sejourName !== "-") ? primary.sejourName : shortSejourName(trip.sejourName);
    const wi = WEEK_INFO[trip.week];
    const subject  = `${reminder ? "Rappel J-3 — " : ""}Convocation transport — ${sejourReal}${wi ? ` (${wi.dates})` : ""} — ${fmtDateLong(trip.date)}`;
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: destinationEmail, subject, html, from_name: "ColoCrew", from_email: "contact@colocrew.com", includeDecharge: true }),
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t || `HTTP ${resp.status}`); }
    const ids = passengers.map((p) => p.reservationId);
    if (reminder) await markReminderSent(ids);
    else await markAllSent(ids);
  }, [transports, customIntro, convocSettings, markAllSent, markReminderSent, getAnimForTrip, emailFor]);

  const doSendOnSite = useCallback(async (reservation, { reminder = false } = {}) => {
    const destinationEmail = emailFor(reservation);
    if (!destinationEmail) throw new Error("Adresse e-mail manquante");
    const cfg = getOnSiteConfig(reservation.sejourName || "Séjour");
    const animInfo = getAnimForOnSite(reservation.sejourName || "Séjour");
    const convocationHtml = buildOnSiteEmailHtml(reservation, selectedWeek, {
      arrivalTime: cfg.arrivalTime,
      returnTime:  cfg.returnTime,
      arrivalPoint: cfg.lieu || "Lieu du séjour",
      returnPoint:  cfg.lieu || "Lieu du séjour",
    }, customIntro, animInfo);
    const html = reminder ? buildJ3ReminderHtml(convocationHtml) : convocationHtml;
    const wi = WEEK_INFO[selectedWeek];
    const sejourReal = reservation.sejourName && reservation.sejourName !== "-" ? shortSejourName(reservation.sejourName) : "Séjour ColoCrew";
    const subject = `${reminder ? "Rappel J-3 — " : ""}Convocation sur place — ${sejourReal}${wi ? ` (${wi.dates})` : ""}`;
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: destinationEmail, subject, html, from_name: "ColoCrew", from_email: "contact@colocrew.com", includeDecharge: true }),
    });
    if (!resp.ok) { const text = await resp.text(); throw new Error(text || `HTTP ${resp.status}`); }
    if (reminder) await markReminderSent([reservation.id]);
    else await markAllSent([reservation.id]);
  }, [customIntro, getOnSiteConfig, getAnimForOnSite, markAllSent, markReminderSent, selectedWeek, emailFor]);

  // Pending = one entry per unique family (email) that hasn't been fully sent
  const pendingFamilies = useMemo(() => {
    const seen = new Set();
    const rows = [];
    convocationTrips.forEach((trip) => {
      groupPassengersByFamily(trip.passengers).forEach((passengers) => {
        const primary = passengers[0];
        const email = emailFor(primary);
        const emailKey = email && email !== "-" ? email : primary.reservationId;
        if (seen.has(emailKey)) return;
        const allIds = passengers.map((p) => p.reservationId).filter(Boolean);
        const allSent = allIds.every((id) => sentStatus[id]);
        if (!allSent && email && email !== "-") {
          seen.add(emailKey);
          rows.push({ trip, passengers });
        }
      });
    });
    return rows;
  }, [convocationTrips, sentStatus, emailFor]);

  const missingEmailFamilies = useMemo(() => {
    const seen = new Set();
    const rows = [];
    convocationTrips.forEach((trip) => {
      groupPassengersByFamily(trip.passengers).forEach((passengers) => {
        const primary = passengers[0];
        const key = primary.reservationId || `${primary.nom || ""}-${primary.childName || ""}`;
        if (seen.has(key)) return;
        const allIds = passengers.map((p) => p.reservationId).filter(Boolean);
        const allSent = allIds.length > 0 && allIds.every((id) => sentStatus[id]);
        const email = emailFor(primary);
        const hasEmail = email && email !== "-";
        if (!allSent && !hasEmail) {
          seen.add(key);
          rows.push({ trip, passengers });
        }
      });
    });
    return rows;
  }, [convocationTrips, sentStatus, emailFor]);

  const pendingOnSiteReservations = useMemo(
    () => onSiteReservations.filter((reservation) => !sentStatus[reservation.id] && emailFor(reservation) && emailFor(reservation) !== "-"),
    [onSiteReservations, sentStatus, emailFor],
  );

  const missingOnSiteEmailReservations = useMemo(
    () => onSiteReservations.filter((reservation) => !sentStatus[reservation.id] && (!emailFor(reservation) || emailFor(reservation) === "-")),
    [onSiteReservations, sentStatus, emailFor],
  );

  const pendingMailCount = pendingFamilies.length + pendingOnSiteReservations.length;
  const missingEmailCount = missingEmailFamilies.length + missingOnSiteEmailReservations.length;

  const pendingReminderFamilies = useMemo(() => {
    const rows = [];
    const seen = new Set();
    convocationTrips.forEach((trip) => {
      groupPassengersByFamily(trip.passengers).forEach((passengers) => {
        const ids = passengers.map((passenger) => passenger.reservationId).filter(Boolean);
        const key = ids.slice().sort().join("|");
        const email = emailFor(passengers[0]);
        if (!key || seen.has(key) || !email || email === "-") return;
        if (ids.every((id) => sentStatus[id]) && !ids.every((id) => reminderStatus[id])) {
          seen.add(key);
          rows.push({ type: "transport", trip, passengers });
        }
      });
    });
    onSiteReservations.forEach((reservation) => {
      const email = emailFor(reservation);
      if (sentStatus[reservation.id] && !reminderStatus[reservation.id] && email && email !== "-") {
        rows.push({ type: "onsite", reservation });
      }
    });
    return rows;
  }, [convocationTrips, onSiteReservations, sentStatus, reminderStatus, emailFor]);

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

  const handleSendAllReminders = useCallback(async () => {
    const total = pendingReminderFamilies.length;
    if (!total) { showToast("Aucun rappel J-3 à envoyer", "info"); return; }
    if (!window.confirm(`Envoyer ${total} rappel(s) J-3 maintenant ?`)) return;
    setSendingAll(true);
    setSendProgress({ done: 0, total, errors: [] });
    const errors = [];
    for (let index = 0; index < pendingReminderFamilies.length; index += 1) {
      const item = pendingReminderFamilies[index];
      try {
        if (item.type === "onsite") await doSendOnSite(item.reservation, { reminder: true });
        else await doSendFamily(item.trip, item.passengers, { reminder: true });
      } catch (error) {
        errors.push({ email: item.type === "onsite" ? emailFor(item.reservation) : emailFor(item.passengers[0]), error: error.message });
      }
      setSendProgress({ done: index + 1, total, errors: [...errors] });
      if (index < total - 1) await new Promise((resolve) => setTimeout(resolve, 350));
    }
    setSendingAll(false);
    if (!errors.length) showToast(`${total} rappel(s) J-3 envoyé(s)`, "success");
    else showToast(`${total - errors.length} succès · ${errors.length} erreur(s)`, "error");
  }, [pendingReminderFamilies, doSendFamily, doSendOnSite, emailFor, showToast]);

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
        <button type="button" className="dash-btn" onClick={() => setShowConvocSettings((v) => !v)}
          style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
          ⚙ {showConvocSettings ? "Fermer réglages" : "Réglages messages"}
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
          <>
            <button type="button" className="dash-btn" onClick={handleSendAllReminders} disabled={pendingReminderFamilies.length === 0}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, color: pendingReminderFamilies.length ? "#ea580c" : undefined, borderColor: pendingReminderFamilies.length ? "#fdba74" : undefined }}>
              Rappels J-3 ({pendingReminderFamilies.length})
            </button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={handleSendAll} disabled={pendingMailCount === 0}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Envoyer tout ({pendingMailCount})
            </button>
          </>
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

      {/* Réglages des messages de convocation */}
      {showConvocSettings && (
        <div style={{ marginBottom: 14, padding: "18px 20px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8 }}>
            ⚙ Réglages des messages de convocation transport
            <span style={{ fontWeight: 400, textTransform: "none", color: "#94a3b8", letterSpacing: 0 }}>— Sauvegardés globalement (toutes les semaines)</span>
          </div>

          {/* Téléphones d'urgence */}
          <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fff", border: "1.5px solid #fca5a5", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 8, textTransform: "uppercase" }}>🚨 Téléphones d'urgence</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : EMERGENCY_PHONES).map((phone, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input
                    value={phone}
                    onChange={(e) => {
                      const phones = [...(convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : [...EMERGENCY_PHONES])];
                      phones[i] = e.target.value;
                      setConvocSettings((prev) => ({ ...prev, emergencyPhones: phones }));
                    }}
                    style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}
                  />
                  <button type="button" onClick={() => {
                    const phones = (convocSettings.emergencyPhones?.length ? convocSettings.emergencyPhones : [...EMERGENCY_PHONES]).filter((_, j) => j !== i);
                    setConvocSettings((prev) => ({ ...prev, emergencyPhones: phones }));
                  }} style={{ padding: "4px 10px", background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", cursor: "pointer", fontSize: 13 }}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => setConvocSettings((prev) => ({ ...prev, emergencyPhones: [...(prev.emergencyPhones?.length ? prev.emergencyPhones : [...EMERGENCY_PHONES]), ""] }))}
                style={{ padding: "5px 12px", background: "none", border: "1.5px dashed #fca5a5", borderRadius: 6, color: "#dc2626", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                + Ajouter un téléphone
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DEFAULT_REMINDER_ITEMS.map((item) => {
              const s = convocSettings.items?.[item.id] || {};
              const enabled = s.enabled !== false;
              return (
                <div key={item.id} style={{ padding: "10px 14px", background: "#fff", border: `1.5px solid ${enabled ? "#e2e8f0" : "#f3f4f6"}`, borderRadius: 8, opacity: enabled ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
                      <input type="checkbox" checked={enabled}
                        onChange={(e) => setConvocSettings((prev) => ({
                          ...prev,
                          items: { ...prev.items, [item.id]: { ...prev.items?.[item.id], enabled: e.target.checked } }
                        }))}
                        style={{ width: 15, height: 15, cursor: "pointer" }}
                      />
                    </label>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{item.emoji} {item.id.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: item.condition === "always" ? "#f0fdf4" : "#fef3c7", color: item.condition === "always" ? "#15803d" : "#92400e" }}>
                          {item.conditionLabel}
                        </span>
                      </div>
                      <textarea
                        value={s.text !== undefined ? s.text : item.defaultText}
                        onChange={(e) => setConvocSettings((prev) => ({
                          ...prev,
                          items: { ...prev.items, [item.id]: { ...prev.items?.[item.id], text: e.target.value } }
                        }))}
                        rows={2}
                        disabled={!enabled}
                        placeholder={item.defaultText}
                        style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#374151", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: enabled ? "#fff" : "#f9fafb" }}
                      />
                      {s.text !== undefined && s.text !== item.defaultText && (
                        <button type="button" onClick={() => setConvocSettings((prev) => ({
                          ...prev,
                          items: { ...prev.items, [item.id]: { ...prev.items?.[item.id], text: undefined } }
                        }))} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "2px 0", marginTop: 2 }}>
                          ↺ Rétablir le message par défaut
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={saveConvocSettings} disabled={savingConvocSettings}
              style={{ padding: "9px 22px", background: "#B8336A", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: savingConvocSettings ? 0.7 : 1 }}>
              {savingConvocSettings ? "Sauvegarde…" : "✓ Enregistrer les réglages"}
            </button>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #e5e7eb" }}>
              <th style={cTh}>Parents</th>
              <th style={cTh}>Enfants</th>
              <th style={cTh}>Ville</th>
              <th style={cTh}>Horaire</th>
              <th style={cTh}>Point de RDV</th>
              <th style={cTh}>Email</th>
              <th style={{ ...cTh, textAlign: "center" }}>Convoqué</th>
              <th style={{ ...cTh, textAlign: "center" }}>Rappel J-3</th>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>↓ Dépose : à partir de {cfg.arrivalTime}</span>
                          <span style={{ fontSize: 11, color: "#64748b" }}>·</span>
                          <span style={{ fontSize: 11, color: "#ea580c", fontWeight: 700 }}>↑ Récup : à partir de {cfg.returnTime}</span>
                          {cfg.lieu && <span style={{ fontSize: 11, color: "#64748b" }}>· {cfg.lieu}</span>}
                          <button
                            type="button"
                            onClick={() => setOnSiteModal(sejourName)}
                            style={{ padding: "2px 10px", border: "1px solid #d1fae5", borderRadius: 5, fontSize: 11, fontWeight: 700, color: "#15803d", background: "#fff", cursor: "pointer" }}
                          >
                            ⚙ Configurer
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {sejourRows.map((r, i) => {
                    const isSent = Boolean(sentStatus[r.id]);
                    const kids = r.children?.length ? r.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ") : r.childName || "—";
                    const familyKey = `onsite-${r.id}`;
                    const currentEmail = emailFor(r);
                    const hasEmail = currentEmail && currentEmail !== "-";
                    const isSending = sendingKey === familyKey;
                    const isPreviewing = preview?.familyKey === familyKey;
                    const reminderDone = Boolean(reminderStatus[r.id]);
                    return (
                      <tr key={r.id} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: "1px solid #f0f0f0" }}>
                        <td style={cTd}><span style={{ fontWeight: 600, color: "#1e1040" }}>{r.nom}</span></td>
                        <td style={cTd}><span style={{ color: "#7c3aed", fontSize: 12 }}>{kids}</span></td>
                        <td style={cTd}><span style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>Sur place</span></td>
                        <td style={cTd}>
                          <span style={{ fontWeight: 700, color: "#16a34a", fontSize: 11 }}>↓ {cfg.arrivalTime}</span>
                          <br />
                          <span style={{ fontWeight: 700, color: "#ea580c", fontSize: 11 }}>↑ {cfg.returnTime}</span>
                        </td>
                        <td style={cTd}><span style={{ color: "#374151", fontSize: 12 }}>{cfg.lieu || "Lieu du séjour"}</span></td>
                        <td style={cTd}>
                          <input
                            type="email"
                            value={currentEmail === "-" ? "" : currentEmail}
                            onChange={(event) => setFamilyEmailDraft([r.id], event.target.value)}
                            onBlur={(event) => saveFamilyEmail([r.id], event.target.value).catch(() => showToast("Impossible d’enregistrer l’adresse e-mail", "error"))}
                            placeholder="Adresse e-mail"
                            style={{ width: 190, padding: "5px 7px", border: `1px solid ${hasEmail ? "#d1d5db" : "#fca5a5"}`, borderRadius: 6, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <button type="button" onClick={() => isSent ? markAllUnsent([r.id]) : markAllSent([r.id])}
                            style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSent ? "#86efac" : "#d1d5db"}`, background: isSent ? "#dcfce7" : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {isSent && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </button>
                        </td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={reminderDone}
                            title={hasEmail ? "Rappel J-3 effectué" : "Cocher si le rappel a été effectué autrement (téléphone, SMS…)"}
                            onChange={async (event) => {
                              const checked = event.target.checked;
                              try { await toggleReminderDone([r.id], checked); }
                              catch { showToast("Impossible de mettre à jour le rappel", "error"); }
                            }}
                            style={{ width: 17, height: 17, accentColor: "#ea580c", cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ ...cTd, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => { const ai = getAnimForOnSite(sejourName); openDoc(wrapForPrint(buildOnSiteEmailHtml(r, selectedWeek, { arrivalTime: cfg.arrivalTime, returnTime: cfg.returnTime, arrivalPoint: cfg.lieu || "Lieu du séjour", returnPoint: cfg.lieu || "Lieu du séjour" }, customIntro, ai))); }}>
                              PDF
                            </button>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => setPreview(isPreviewing ? null : { type: "onsite", familyKey, reservation: { ...r, email: currentEmail }, cfg })}>
                              {isPreviewing ? "Fermer" : "Aperçu"}
                            </button>
                            {hasEmail && (
                              <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px", color: "#ea580c", borderColor: "#fdba74", background: "#fff7ed" }}
                                disabled={!hasEmail || isSending || sendingAll}
                                title={isSent ? "Prévisualiser le rappel J-3" : "Prévisualisation disponible avant l’envoi de la convocation initiale"}
                                onClick={() => setPreview({ type: "onsite", familyKey, reservation: { ...r, email: currentEmail }, cfg, _isReminder: true, _canSendReminder: isSent })}>
                                Rappel J-3
                              </button>
                            )}
                            <button type="button" className={`dash-btn${isSent ? "" : " dash-btn-primary"}`} style={{ fontSize: 11, padding: "3px 9px" }}
                              disabled={!hasEmail || isSending || sendingAll}
                              onClick={async () => {
                                setSendingKey(familyKey);
                                try {
                                  await doSendOnSite(r);
                                  showToast(`Convocation envoyée à ${currentEmail}`, "success");
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
            {convocationTrips.map((trip) => {
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
                    const currentEmail = emailFor(primary);
                    const hasEmail  = currentEmail && currentEmail !== "-";
                    const rdvInfo   = getEmailRdvInfo(trip, primary);
                    const allChildren = merged.children?.length
                      ? merged.children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean).join(", ")
                      : primary.childName || "—";
                    const isPreviewing = preview?.familyKey === familyKey;
                    const reminderDone = allIds.length > 0 && allIds.every((id) => reminderStatus[id]);

                    return (
                      <tr key={familyKey} style={{ background: isSent ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#fdfcff", borderTop: "1px solid #f0f0f0" }}>
                        <td style={cTd}>
                          <span style={{ fontWeight: 600, color: "#1e1040" }}>{primary.nom}</span>
                          {passengers.length > 1 && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>({passengers.length} dossiers)</span>}
                        </td>
                        <td style={cTd}><span style={{ color: "#7c3aed", fontSize: 12 }}>{allChildren}</span></td>
                        <td style={cTd}><span style={{ fontSize: 12, fontWeight: 600, color: "#5f3374" }}>{passengerCity(trip, primary)}</span></td>
                        <td style={cTd}>
                          {rdvInfo.rdvTime
                            ? <span style={{ fontWeight: 700, color: "#16a34a" }}>{rdvInfo.rdvTime}</span>
                            : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={cTd}><span style={{ color: "#374151", fontSize: 12 }}>{rdvInfo.meetingPoint || passengerCity(trip, primary) || "—"}</span></td>
                        <td style={cTd}>
                          <input
                            type="email"
                            value={currentEmail === "-" ? "" : currentEmail}
                            onChange={(event) => setFamilyEmailDraft(allIds, event.target.value)}
                            onBlur={(event) => saveFamilyEmail(allIds, event.target.value).catch(() => showToast("Impossible d’enregistrer l’adresse e-mail", "error"))}
                            placeholder="Adresse e-mail"
                            style={{ width: 190, padding: "5px 7px", border: `1px solid ${hasEmail ? "#d1d5db" : "#fca5a5"}`, borderRadius: 6, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <button type="button"
                            onClick={() => isSent ? markAllUnsent(allIds) : markAllSent(allIds)}
                            title={isSent ? "Cliquer pour annuler" : "Marquer envoyée manuellement"}
                            style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isSent ? "#86efac" : "#d1d5db"}`, background: isSent ? "#dcfce7" : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {isSent && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </button>
                        </td>
                        <td style={{ ...cTd, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={reminderDone}
                            title={hasEmail ? "Rappel J-3 effectué" : "Cocher si le rappel a été effectué autrement (téléphone, SMS…)"}
                            onChange={async (event) => {
                              const checked = event.target.checked;
                              try { await toggleReminderDone(allIds, checked); }
                              catch { showToast("Impossible de mettre à jour le rappel", "error"); }
                            }}
                            style={{ width: 17, height: 17, accentColor: "#ea580c", cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ ...cTd, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => { const ai = getAnimForTrip(trip); openDoc(wrapForPrint(buildConvocEmailHtml(trip, merged, rdvInfo, transports, customIntro, ai))); }}>
                              PDF
                            </button>
                            <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px" }}
                              onClick={() => setPreview(isPreviewing ? null : { ...merged, email: currentEmail, familyKey, _rdvInfo: rdvInfo, _trip: trip, _passengers: passengers })}>
                              {isPreviewing ? "Fermer" : "Aperçu"}
                            </button>
                            {hasEmail && (
                              <button type="button" className="dash-btn" style={{ fontSize: 11, padding: "3px 9px", color: "#ea580c", borderColor: "#fdba74", background: "#fff7ed" }}
                                disabled={!hasEmail || isSending || sendingAll}
                                title={isSent ? "Prévisualiser le rappel J-3" : "Prévisualisation disponible avant l’envoi de la convocation initiale"}
                                onClick={() => setPreview({ ...merged, email: currentEmail, familyKey, _rdvInfo: rdvInfo, _trip: trip, _passengers: passengers, _isReminder: true, _canSendReminder: isSent })}>
                                Rappel J-3
                              </button>
                            )}
                            <button type="button" className={`dash-btn${isSent ? "" : " dash-btn-primary"}`} style={{ fontSize: 11, padding: "3px 9px" }}
                              disabled={!hasEmail || isSending || sendingAll}
                              onClick={async () => {
                                setSendingKey(familyKey);
                                try {
                                  await doSendFamily(trip, passengers);
                                  showToast(`Convocation envoyée à ${currentEmail}`, "success");
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
                {preview._isReminder && <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#ea580c" }}>APERÇU DU RAPPEL J-3</div>}
              </div>
              <button type="button" onClick={() => setPreview(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>&#x2715;</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#f5f0ff" }}>
              <div dangerouslySetInnerHTML={{ __html: (() => {
                const html = preview.type === "onsite"
                  ? buildOnSiteEmailHtml(preview.reservation, selectedWeek, {
                    arrivalTime: preview.cfg.arrivalTime,
                    returnTime:  preview.cfg.returnTime,
                    arrivalPoint: preview.cfg.lieu || "Lieu du séjour",
                    returnPoint:  preview.cfg.lieu || "Lieu du séjour",
                  }, customIntro, getAnimForOnSite(preview.reservation?.sejourName || "Séjour"))
                  : buildConvocEmailHtml(preview._trip, preview, preview._rdvInfo, transports, customIntro, getAnimForTrip(preview._trip), convocSettings);
                return preview._isReminder ? buildJ3ReminderHtml(html) : html;
              })() }} />
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fff" }}>
              <button type="button" onClick={() => setPreview(null)} style={{ padding: "8px 16px", background: "#f1f5f9", border: "none", borderRadius: 8, color: "#64748b", fontWeight: 600, cursor: "pointer" }}>Fermer</button>
              <button type="button" disabled={!!sendingKey || (preview._isReminder && !preview._canSendReminder)}
                onClick={async () => {
                  setSendingKey(preview.familyKey);
                  try {
                    if (preview.type === "onsite") {
                      await doSendOnSite(preview.reservation, { reminder: Boolean(preview._isReminder) });
                      showToast(`${preview._isReminder ? "Rappel J-3" : "Convocation"} envoyé à ${preview.reservation.email}`, "success");
                    } else {
                      await doSendFamily(preview._trip, preview._passengers, { reminder: Boolean(preview._isReminder) });
                      showToast(`${preview._isReminder ? "Rappel J-3" : "Convocation"} envoyé à ${preview.email}`, "success");
                    }
                    setPreview(null);
                  } catch (e) {
                    showToast(`Erreur : ${e.message}`, "error");
                  } finally {
                    setSendingKey(null);
                  }
                }}
                style={{ padding: "8px 16px", background: sendingKey ? "#f1f5f9" : "#B8336A", border: "none", borderRadius: 8, color: sendingKey ? "#94a3b8" : "#fff", fontWeight: 700, cursor: sendingKey ? "not-allowed" : "pointer" }}>
                {sendingKey
                  ? "Envoi en cours…"
                  : preview._isReminder && !preview._canSendReminder
                    ? "Envoyer d’abord la convocation"
                    : preview._isReminder ? "Envoyer le rappel J-3" : "Envoyer cette convocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal configuration Sur place */}
      {onSiteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setOnSiteModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.28)", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background: "#f0fdf4", borderBottom: "1.5px solid #bbf7d0", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ background: "#15803d", color: "#fff", borderRadius: 6, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>SP</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#15803d" }}>{onSiteModal}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Configuration Sur place</div>
              </div>
              <button type="button" onClick={() => setOnSiteModal(null)} style={{ background: "#dcfce7", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#15803d", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {/* Body */}
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                  ↓ Heure de dépose — <em style={{ fontWeight: 600 }}>à partir de</em>
                </span>
                <input
                  type="time"
                  value={getOnSiteConfig(onSiteModal).arrivalTime}
                  onChange={(e) => setOnSiteConfig(onSiteModal, "arrivalTime", e.target.value)}
                  style={{ padding: "8px 12px", border: "1.5px solid #86efac", borderRadius: 8, fontSize: 15, fontWeight: 700, color: "#15803d", width: "100%", outline: "none" }}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>Heure à partir de laquelle les familles peuvent déposer leur enfant</span>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c" }}>
                  ↑ Heure de récupération — <em style={{ fontWeight: 600 }}>à partir de</em>
                </span>
                <input
                  type="time"
                  value={getOnSiteConfig(onSiteModal).returnTime}
                  onChange={(e) => setOnSiteConfig(onSiteModal, "returnTime", e.target.value)}
                  style={{ padding: "8px 12px", border: "1.5px solid #fed7aa", borderRadius: 8, fontSize: 15, fontWeight: 700, color: "#ea580c", width: "100%", outline: "none" }}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>Heure à partir de laquelle les familles peuvent récupérer leur enfant</span>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Adresse du lieu de séjour</span>
                <input
                  type="text"
                  value={getOnSiteConfig(onSiteModal).lieu}
                  onChange={(e) => setOnSiteConfig(onSiteModal, "lieu", e.target.value)}
                  placeholder="Ex : Centre de vacances, 42 rue des Alpes, Barcelonnette"
                  style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, color: "#374151", width: "100%", outline: "none" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed" }}>👤 Animateur·trice référent·e (optionnel)</span>
                <input
                  type="text"
                  value={getOnSiteConfig(onSiteModal).animName}
                  onChange={(e) => setOnSiteConfig(onSiteModal, "animName", e.target.value)}
                  placeholder="Prénom Nom"
                  style={{ padding: "8px 12px", border: "1.5px solid #ede9fe", borderRadius: 8, fontSize: 13, color: "#374151", width: "100%", outline: "none" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed" }}>📞 Téléphone (optionnel)</span>
                <input
                  type="text"
                  value={getOnSiteConfig(onSiteModal).animPhone}
                  onChange={(e) => setOnSiteConfig(onSiteModal, "animPhone", e.target.value)}
                  placeholder="06 12 34 56 78"
                  style={{ padding: "8px 12px", border: "1.5px solid #ede9fe", borderRadius: 8, fontSize: 13, color: "#374151", width: "100%", outline: "none" }}
                />
              </label>
            </div>
            {/* Footer */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #f0fdf4", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
              <button type="button" onClick={() => setOnSiteModal(null)}
                style={{ padding: "9px 18px", background: "none", border: "1.5px solid #d1d5db", borderRadius: 8, color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Annuler
              </button>
              <button type="button" onClick={saveOnSiteModal} disabled={savingOnSiteModal}
                style={{ padding: "9px 22px", background: "#15803d", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: savingOnSiteModal ? 0.7 : 1 }}>
                {savingOnSiteModal ? "Sauvegarde…" : "✓ Valider & Sauvegarder"}
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
  const [financeSummary, setFinanceSummary] = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showNew, setShowNew]               = useState(false);
  const [activeTab, setActiveTab]           = useState("overview");
  const { showToast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tSnap, rSnap, staffSnap, contractsSnap, cityStopsSnap, financeSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "desc"))),
        getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
        getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
        getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        getDocs(collection(db, COLLECTIONS.TRANSPORT_RDV_POINTS)),
        getDoc(doc(db, COLLECTIONS.FINANCE_SUMMARIES, "ete-2026")),
      ]);
      const reservationRows = rSnap.docs.map(mapReservationForTransport);
      const transportRows = tSnap.docs.map(mapTransport);
      setReservations(reservationRows);
      setTransports(transportRows.map((transport) => hydrateTransportPassengers(transport, reservationRows)));
      setStaffMembers(staffSnap.docs.map(mapStaffMember).filter((m) => m.active));
      setStaffContracts(contractsSnap.docs.map(mapStaffContract).filter((c) => c.status !== "cancelled"));
      setCityStops(cityStopsSnap.docs.map(mapCityStop).filter((row) => row.city));
      setFinanceSummary(financeSnap.exists() ? financeSnap.data() : null);
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
    const valid = reservations.filter((r) => r.status === "validated");
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
    const missingSegTix  = transports.reduce((s, t) => s + missingTicketPortionCount(t), 0);
    const summaryTransportRevenue = Number(financeSummary?.transportAccounting?.transportAmount ?? financeSummary?.transportAmount);
    const transportRevenue = Number.isFinite(summaryTransportRevenue)
      ? summaryTransportRevenue
      : reservations.filter((r) => r.status === "validated")
        .reduce((s, r) => s + Number(r.transportAmount || 0), 0);
    return { totalChildren, transportChildren, unassigned, ticketCost, purchasedTix, totalTix, missingSegTix, trips: transports.length, transportRevenue };
  }, [financeSummary, reservations, transports]);

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
            <TransportBudgetOverview reservations={reservations} transports={transports} financeSummary={financeSummary} />
          )}

          {/* Convocations */}
          {activeTab === "convocations" && (
            <ConvocationsTab transports={transports} reservations={reservations} staffMembers={staffMembers} staffContracts={staffContracts} />
          )}

          {/* Billets */}
          {activeTab === "billets" && (
            <BilletsTab transports={transports} onBulkUpdate={handleBulkSave} />
          )}

          {/* Points de RDV */}
          {activeTab === "villes" && (
            <GlobalCityStopsTab
              transports={transports}
              reservations={reservations}
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
