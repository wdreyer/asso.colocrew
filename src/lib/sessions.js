"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { seasonOfDate } from "@/src/lib/seasons";

/**
 * A session is one entry of `sejours/{id}.dates`. It has no Firestore document of its own: its
 * identity is the séjour and its start date, so editing a séjour's prices or texts never breaks
 * the reservations, convoys and contracts that point at it.
 */

export function sessionIdFor(sejourId, startDate) {
  const start = String(startDate || "").slice(0, 10);
  return sejourId && start ? `${sejourId}__${start}` : "";
}

export function parseSessionId(sessionId) {
  const [sejourId = "", startDate = ""] = String(sessionId || "").split("__");
  return { sejourId, startDate };
}

/** Short code of a séjour ("MCSC", "EVCC"): explicit `code`, else the production `stayCode`, else initials. */
export function sejourCode(sejour) {
  const explicit = sejour?.code || sejour?.stayCode || sejour?.productionSnapshot?.plan?.stayCode;
  if (explicit) return String(explicit).toUpperCase();
  return String(sejour?.name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 || /^[A-Z]/.test(word))
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 5);
}

const DAY_MS = 86400000;

function dayCount(startDate, endDate) {
  const start = Date.parse(`${startDate}T12:00:00`);
  const end = Date.parse(`${endDate}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(Math.round((end - start) / DAY_MS) + 1, 1);
}

/** "6 – 17 juil. 2027", "27 févr. – 5 mars 2027" */
export function formatDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate || startDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth ? String(start.getDate()) : start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${startLabel} – ${endLabel}`;
}

/**
 * Flattens séjours into sessions sorted by start date. Within a season and a séjour, sessions are
 * numbered S1, S2… in date order, like the weeks the team already talks about.
 */
export function buildSessionCatalog(sejours) {
  const sessions = [];
  (sejours || []).forEach((sejour) => {
    const code = sejourCode(sejour);
    (Array.isArray(sejour.dates) ? sejour.dates : []).forEach((date) => {
      const startDate = String(date?.startDate || "").slice(0, 10);
      const endDate = String(date?.endDate || "").slice(0, 10);
      if (!startDate) return;
      sessions.push({
        id: sessionIdFor(sejour.id, startDate),
        sejourId: sejour.id,
        sejourName: sejour.name || "Séjour",
        sejourCode: code,
        season: seasonOfDate(startDate),
        startDate,
        endDate,
        days: dayCount(startDate, endDate),
        capacity: Number(date.capacity ?? date.maxChildren ?? sejour.maxChildren ?? 0) || 0,
        basePrice: Number(date.basePrice ?? sejour.basePrice ?? 0) || 0,
        bookingOpen: date.bookingOpen !== false,
        availabilityStatus: date.availabilityStatus || "",
        stations: Array.isArray(sejour.stations) ? sejour.stations : [],
        raw: date,
      });
    });
  });
  sessions.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sejourName.localeCompare(b.sejourName, "fr"));

  const counters = new Map();
  sessions.forEach((session) => {
    const key = `${session.season}|${session.sejourId}`;
    const index = (counters.get(key) || 0) + 1;
    counters.set(key, index);
    session.week = `S${index}`;
    session.label = `${session.sejourCode} ${session.week} · ${formatDateRange(session.startDate, session.endDate)}`;
  });
  return sessions;
}

/** Departure and return days of a season, the unit convoys are organised by. */
export function travelDaysFor(sessions) {
  const days = new Map();
  (sessions || []).forEach((session) => {
    [["aller", session.startDate], ["retour", session.endDate]].forEach(([direction, date]) => {
      if (!date) return;
      const key = `${date}|${direction}`;
      if (!days.has(key)) days.set(key, { date, direction, sessionIds: [] });
      days.get(key).sessionIds.push(session.id);
    });
  });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction));
}

/**
 * Live session catalog. Pass a season to keep only its sessions; omit it to get every season
 * (archives, staff history).
 */
export function useSessionCatalog(season) {
  const [sejours, setSejours] = useState(null);

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.SEJOURS),
    (snapshot) => setSejours(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
    () => setSejours([]),
  ), []);

  return useMemo(() => {
    if (!sejours) return { loading: true, sejours: [], sessions: [], byId: new Map() };
    const all = buildSessionCatalog(sejours);
    const sessions = season ? all.filter((session) => session.season === String(season)) : all;
    return { loading: false, sejours, sessions, byId: new Map(all.map((session) => [session.id, session])) };
  }, [sejours, season]);
}
