/**
 * Reservation rules shared by the dashboard, the public booking flow and the API routes.
 *
 * This module is plain JavaScript on purpose (no "use client", no React, no Firebase): the
 * `/api/reservation` route imports it on the server. The two helpers it needs from
 * `seasons.js` / `sessions.js` (which are client modules) are mirrored below and must keep the
 * same output: `sessionId = "${sejourId}__${startDate}"`, season = year of the start date.
 *
 * Life cycle (docs/MODELE-DONNEES.md §4):
 *   pending (demande reçue) → validated (place confirmée) → cancelled | waitlist
 * A session is full when the children of its `validated` reservations reach its capacity.
 */

/* ── Statuses ──────────────────────────────────────────────────────────── */

export const RESERVATION_STATUSES = ["pending", "validated", "waitlist", "cancelled"];

export const RESERVATION_STATUS_META = {
  pending:   { label: "Demande reçue",   short: "En attente",      badge: "warning", color: "#f97316" },
  validated: { label: "Place confirmée", short: "Validée",         badge: "success", color: "#10b981" },
  waitlist:  { label: "Liste d'attente", short: "Liste d'attente", badge: "info",    color: "#6366f1" },
  cancelled: { label: "Annulée",         short: "Annulée",         badge: "neutral", color: "#94a3b8" },
};

/** Allowed manual moves. Re-opening a cancelled file goes back through "pending". */
export const RESERVATION_TRANSITIONS = {
  pending:   ["validated", "waitlist", "cancelled"],
  validated: ["pending", "waitlist", "cancelled"],
  waitlist:  ["pending", "validated", "cancelled"],
  cancelled: ["pending"],
};

export function canTransition(from, to) {
  return from === to || (RESERVATION_TRANSITIONS[from] || []).includes(to);
}

/**
 * Older files carry other values: "deleted"/"Passée" (closed by hand), "deposit_paid" (written by
 * the Stripe webhook until 2026), "confirmed"… They are read into the four statuses above.
 */
export function normalizeReservationStatus(value) {
  const status = String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (["validated", "validee", "confirmed", "confirmee"].includes(status)) return "validated";
  if (["waitlist", "liste d'attente", "liste_attente", "waiting"].includes(status)) return "waitlist";
  if (["cancelled", "canceled", "annulee", "deleted", "supprimee", "archived", "passee", "passe"].includes(status)) return "cancelled";
  return "pending";
}

export function reservationStatusLabel(status) {
  return RESERVATION_STATUS_META[normalizeReservationStatus(status)]?.short || "En attente";
}

/* ── Session and season of a reservation ───────────────────────────────── */

function dateKey(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

/** Same output as `sessionIdFor` in sessions.js. */
export function reservationSessionKey(sejourId, startDate) {
  const start = dateKey(startDate);
  return sejourId && start ? `${sejourId}__${start}` : "";
}

function comparableName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Session of a reservation: `sejour.sessionId` when it was recorded, else rebuilt from the séjour
 * id and start date. Manual files from 2026 only have the séjour name: with a session catalog,
 * the name and start date are matched against it.
 */
export function reservationSessionId(raw, sessions) {
  const sejour = raw?.sejour || {};
  if (sejour.sessionId) return String(sejour.sessionId);
  const start = dateKey(sejour.startDate || raw?.sejourStartDate);
  if (!start) return "";
  if (Array.isArray(sessions) && sessions.length) {
    const byId = sejour.id ? sessions.find((session) => session.sejourId === sejour.id && session.startDate === start) : null;
    if (byId) return byId.id;
    const name = comparableName(sejour.name || raw?.sejourName);
    const id = comparableName(sejour.id);
    const byName = sessions.find((session) =>
      session.startDate === start
      && (comparableName(session.sejourName) === name || comparableName(session.sejourId) === name || (id && comparableName(session.sejourId) === id)),
    );
    if (byName) return byName.id;
  }
  return reservationSessionKey(sejour.id, start);
}

/** Same rule as `seasonOfRecord` in seasons.js, for server code. */
export function reservationSeason(raw) {
  if (!raw) return "";
  if (raw.season) return String(raw.season);
  return dateKey(raw.sejour?.startDate || raw.sejourStartDate || raw.startDate || raw.date).slice(0, 4);
}

/* ── Children and amounts ──────────────────────────────────────────────── */

export function reservationChildCount(raw) {
  const children = Array.isArray(raw?.minor?.children) ? raw.minor.children.length : 0;
  if (children > 0) return children;
  const declared = Number(raw?.minor?.numberOfChildren ?? raw?.payment?.childCount);
  return Number.isFinite(declared) && declared > 0 ? declared : 1;
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** Confirmed price, estimate and amount collected of one reservation (raw Firestore data). */
export function reservationAmounts(raw) {
  const payment = raw?.payment || raw?.pricing || {};
  const validatedPrice = amount(
    raw?.finance?.grossAmount
    ?? raw?.finalPrice
    ?? payment.validatedPrice
    ?? (payment.priceStatus === "validated" ? payment.totalPrice : 0),
  );
  const estimate = amount(payment.estimatedPriceMax ?? payment.basePriceMax ?? payment.basePrice ?? payment.estimatedPriceMin);
  return {
    validatedPrice,
    estimate: validatedPrice || estimate,
    paid: amount(payment.alreadyPaid ?? raw?.finance?.paidAmount),
  };
}

/* ── Occupancy ─────────────────────────────────────────────────────────── */

function emptyOccupancy(sessionId) {
  return {
    sessionId,
    files: 0,
    validated: 0,
    pending: 0,
    waitlist: 0,
    cancelled: 0,
    revenueEstimated: 0,
    revenueValidated: 0,
    collected: 0,
  };
}

/**
 * Children per status, revenue and cash collected per session. `reservations` are raw Firestore
 * documents (with their `id`); pass the season's session catalog to attach older files by name.
 *   revenueValidated: confirmed prices of validated files
 *   revenueEstimated: validated files + estimates of pending ones
 *   collected:        amounts already paid, cancelled files excluded
 */
export function computeSessionOccupancy(reservations, sessions) {
  const bySession = new Map();
  (reservations || []).forEach((raw) => {
    const sessionId = reservationSessionId(raw, sessions);
    if (!sessionId) return;
    if (!bySession.has(sessionId)) bySession.set(sessionId, emptyOccupancy(sessionId));
    const entry = bySession.get(sessionId);
    const status = normalizeReservationStatus(raw.status);
    const children = reservationChildCount(raw);
    const amounts = reservationAmounts(raw);
    entry.files += 1;
    entry[status] += children;
    if (status === "validated") {
      entry.revenueValidated += amounts.validatedPrice;
      entry.revenueEstimated += amounts.estimate;
    }
    if (status === "pending") entry.revenueEstimated += amounts.estimate;
    if (status !== "cancelled") entry.collected += amounts.paid;
  });
  return bySession;
}

/** Fill state of a session: `capacity` 0 means "not set", the session is then never full. */
export function sessionFillState(capacity, occupancy) {
  const cap = Number(capacity) || 0;
  const validated = occupancy?.validated || 0;
  return {
    capacity: cap,
    validated,
    remaining: cap ? Math.max(cap - validated, 0) : null,
    full: cap > 0 && validated >= cap,
    rate: cap ? Math.min(Math.round((validated / cap) * 100), 100) : null,
  };
}

/* ── Convoys ───────────────────────────────────────────────────────────── */

export function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function transportStopCities(transport) {
  const cities = new Set();
  [...(transport?.segments || []), ...(transport?.branches || [])].forEach((segment) => {
    [segment.from, segment.to].filter(Boolean).forEach((city) => cities.add(city));
    (segment.stops || []).forEach((stop) => stop.city && cities.add(stop.city));
  });
  if (transport?.departureCity) cities.add(transport.departureCity);
  if (transport?.arrivalCity) cities.add(transport.arrivalCity);
  return [...cities];
}

/**
 * Week label ("S1", "S2"…) of a session inside its séjour and season, numbered by start date like
 * `buildSessionCatalog`. Only used to read 2026 convoys, which have a `week` and nothing else.
 */
export function legacyWeekOf(sejourDates, startDate) {
  const start = dateKey(startDate);
  const season = start.slice(0, 4);
  if (!start) return "";
  const starts = [...new Set((sejourDates || [])
    .map((entry) => dateKey(entry?.startDate))
    .filter((value) => value && value.slice(0, 4) === season))]
    .sort();
  const index = starts.indexOf(start);
  return index >= 0 ? `S${index + 1}` : "";
}

/**
 * Does a convoy serve this reservation's session in this direction?
 * 2027 convoys list their `sessionIds`; otherwise the travel day must match the session's first
 * (aller) or last (retour) day; 2026 convoys without a date fall back to their `week`.
 */
export function transportServesSession(transport, { direction, sessionId, startDate, endDate, legacyWeek }) {
  if (!transport || transport.direction !== direction) return false;
  if (transport.archived === true) return false;
  if (normalizePlace(transport.status) === "annule") return false;
  if (Array.isArray(transport.sessionIds) && transport.sessionIds.length) {
    return Boolean(sessionId) && transport.sessionIds.includes(sessionId);
  }
  const travelDay = dateKey(direction === "retour" ? endDate : startDate);
  if (transport.date) return Boolean(travelDay) && dateKey(transport.date) === travelDay;
  return Boolean(legacyWeek) && transport.week === legacyWeek;
}

/**
 * Convoys a validated reservation should ride, one per direction, when exactly one convoy of the
 * right day stops in the family's city. Returns `[{ transport, direction, city }]`.
 */
export function matchReservationTransports(transports, raw, { sessionId, legacyWeek } = {}) {
  if (normalizeReservationStatus(raw?.status) !== "validated") return [];
  const sejour = raw?.sejour || {};
  const context = {
    sessionId: sessionId || reservationSessionId(raw),
    startDate: sejour.startDate,
    endDate: sejour.endDate,
    legacyWeek,
  };
  const matches = [];
  ["aller", "retour"].forEach((direction) => {
    const city = direction === "retour" ? raw?.transport?.returnCity : raw?.transport?.departureCity;
    if (!city || normalizePlace(city) === "sur place") return;
    const candidates = (transports || []).filter((transport) =>
      transportServesSession(transport, { ...context, direction })
      && transportStopCities(transport).some((stopCity) => normalizePlace(stopCity) === normalizePlace(city)),
    );
    if (candidates.length === 1) matches.push({ transport: candidates[0], direction, city });
  });
  return matches;
}

/** Convoys whose passenger list holds this reservation, aller first. */
export function reservationTransports(transports, reservationId) {
  return (transports || [])
    .filter((transport) => (transport.passengers || []).some((passenger) => passenger.reservationId === reservationId))
    .sort((a, b) => (a.direction === "aller" ? 0 : 1) - (b.direction === "aller" ? 0 : 1));
}
