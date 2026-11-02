export function isSessionFull(session) {
  return session?.bookingOpen === false || session?.availabilityStatus === "full";
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function sessionStartKey(session) {
  return String((typeof session === "object" ? session?.startDate : session) || "").slice(0, 10);
}

/**
 * Firestore IDs are case-sensitive (e.g. "bmbeCU0pbLudQzIMCQzX"): try the URL value as is,
 * then its legacy slug form ("My Creative Surf Camp" -> "my-creative-surf-camp").
 */
export function sejourIdCandidates(value) {
  const raw = String(value || "").trim();
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
  return [...new Set([raw, slug].filter(Boolean))];
}

/** A session is public as long as it has not started yet. */
export function isUpcomingSession(session) {
  const start = sessionStartKey(session);
  return Boolean(start) && start >= todayKey();
}

export function upcomingSessions(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).filter(isUpcomingSession);
}

/** Every séjour with an upcoming session is online, whatever its status in the dashboard. */
export function isPublicSejour(sejour) {
  return upcomingSessions(sejour?.dates).length > 0;
}

export function isPublicBookableSession(_sejourId, session) {
  return isUpcomingSession(session) && !isSessionFull(session);
}

export function publicBookableSessions(sejourId, sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => isPublicBookableSession(sejourId, session));
}

export function isSessionLimited(session) {
  return !isSessionFull(session) && session?.availabilityStatus === "limited";
}

export function firstBookableSession(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).find((session) => !isSessionFull(session)) || null;
}

export function bookableSessions(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => !isSessionFull(session));
}

/**
 * Public fill state of a séjour's sessions (GET /api/reservation?sejour=…), keyed by start date:
 * `{ full, remaining }`. A session full in capacity still takes requests, on the waitlist.
 * Resolves to an empty Map when the count is unavailable, so the pages keep working as before.
 */
export async function fetchSessionFill(sejourId) {
  const fill = new Map();
  if (!sejourId) return fill;
  try {
    const response = await fetch(`/api/reservation?sejour=${encodeURIComponent(sejourId)}`);
    if (!response.ok) return fill;
    const data = await response.json();
    (data.sessions || []).forEach((session) => fill.set(session.startDate, session));
  } catch {
    // no availability information: behave as before
  }
  return fill;
}

/** Same id as `sessionIdFor` in sessions.js, for the public booking pages. */
export function publicSessionId(sejourId, startDate) {
  const start = String(startDate || "").slice(0, 10);
  return sejourId && start ? `${sejourId}__${start}` : "";
}
