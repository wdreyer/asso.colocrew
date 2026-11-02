import { formatDateRange, sessionIdFor, travelDaysFor } from "@/src/lib/sessions";
import { seasonOfDate } from "@/src/lib/seasons";

/**
 * Convoys are organised by travel day: the departure and return days of the season's sessions.
 * Sessions sharing a start date form a "départ" (the former S1–S4 weeks): its key is that start
 * date, so it stays stable whatever séjours are added, and it groups the aller day with the
 * matching return day(s).
 */

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildTransportCalendar(sessions = [], season = "") {
  const byStart = new Map();
  sessions.forEach((session) => {
    if (!byStart.has(session.startDate)) byStart.set(session.startDate, []);
    byStart.get(session.startDate).push(session);
  });

  const periods = [...byStart.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([aller, list], index) => {
      const retourDates = unique(list.map((session) => session.endDate)).sort();
      const retour = retourDates.at(-1) || "";
      const weeks = unique(list.map((session) => session.week));
      const codes = unique(list.map((session) => session.sejourCode));
      const short = weeks.length === 1 ? weeks[0] : weeks.join("/") || `D${index + 1}`;
      return {
        key: aller,
        index,
        short,
        label: `${short} · ${codes.join(", ") || "Séjour"}`,
        dates: formatDateRange(aller, retour),
        aller,
        retour,
        retourDates,
        sessionIds: list.map((session) => session.id),
        sejourCodes: codes,
      };
    });

  const periodBySession = new Map();
  periods.forEach((period) => period.sessionIds.forEach((id) => periodBySession.set(id, period)));

  const travelDays = travelDaysFor(sessions).map((day) => {
    const period = periodBySession.get(day.sessionIds[0]) || null;
    return {
      ...day,
      key: `${day.date}|${day.direction}`,
      periodKey: period?.key || "",
      label: `${day.direction === "aller" ? "Départ" : "Retour"} ${period?.short || ""}`.trim(),
    };
  });

  return {
    season: String(season || ""),
    sessions,
    periods,
    periodByKey: Object.fromEntries(periods.map((period) => [period.key, period])),
    periodBySession,
    travelDays,
  };
}

export const EMPTY_TRANSPORT_CALENDAR = buildTransportCalendar([], "");

export function travelDayFor(calendar, date, direction) {
  return (calendar?.travelDays || []).find((day) => day.date === date && day.direction === direction) || null;
}

/** Key of the départ a convoy belongs to, from its date and direction (legacy `week` as fallback). */
export function periodKeyForTransport(calendar, transport) {
  const day = travelDayFor(calendar, transport?.date, transport?.direction || "aller");
  if (day?.periodKey) return day.periodKey;
  const sessionPeriod = (transport?.sessionIds || []).map((id) => calendar?.periodBySession?.get(id)).find(Boolean);
  return sessionPeriod?.key || transport?.week || "";
}

/**
 * Session of a reservation: `sejour.sessionId`, else séjour id + start date, else (old imports
 * without séjour id) the only session of the season starting that day with the same name.
 */
export function reservationSessionId(sejour = {}, calendar = null) {
  if (sejour.sessionId) return sejour.sessionId;
  const direct = sessionIdFor(sejour.id, sejour.startDate);
  if (direct) return direct;
  const start = String(sejour.startDate || "").slice(0, 10);
  if (!start || !calendar) return "";
  const sameDay = calendar.sessions.filter((session) => session.startDate === start);
  if (sameDay.length === 1) return sameDay[0].id;
  const name = normalizeName(sejour.name);
  return sameDay.find((session) => name && normalizeName(session.sejourName) === name)?.id || "";
}

/** Départ of a reservation: through its session, else through its start date. */
export function periodKeyForReservation(calendar, sessionId, startDate) {
  const period = calendar?.periodBySession?.get(sessionId);
  if (period) return period.key;
  const start = String(startDate || "").slice(0, 10);
  return calendar?.periodByKey?.[start] ? start : "";
}

/** Flat list of the `staff_members` ids of a convoy's team, queried by the staff space. */
export function transportStaffMemberIds(transport) {
  return unique((Array.isArray(transport?.staff) ? transport.staff : []).map((member) => member?.memberId));
}

/**
 * Linking fields written with every convoy save: season, travel day, served sessions and the flat
 * list of convoy staff. Sessions come from the season calendar; an unknown day keeps what the
 * convoy already had.
 */
export function transportLinkFields(transport, calendar) {
  const date = String(transport?.date || "").slice(0, 10);
  const direction = transport?.direction === "retour" ? "retour" : "aller";
  const day = travelDayFor(calendar, date, direction);
  return {
    season: seasonOfDate(date) || transport?.season || calendar?.season || "",
    date,
    direction,
    sessionIds: day ? day.sessionIds : (Array.isArray(transport?.sessionIds) ? transport.sessionIds : []),
    staffMemberIds: transportStaffMemberIds(transport),
  };
}
