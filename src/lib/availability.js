export function isSessionFull(session) {
  return session?.bookingOpen === false || session?.availabilityStatus === "full";
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
