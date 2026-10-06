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
