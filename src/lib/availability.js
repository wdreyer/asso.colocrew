export function isSessionFull(session) {
  return session?.bookingOpen === false || session?.availabilityStatus === "full";
}

export const PUBLIC_BOOKABLE_SESSION = {
  sejourSlug: "my-creative-surf-camp",
  startDate: "2026-08-17",
  endDate: "2026-08-28",
};

export function isPublicBookableSession(sejourId, session) {
  return (
    String(sejourId || "") === PUBLIC_BOOKABLE_SESSION.sejourSlug
    && String(session?.startDate || "").slice(0, 10) === PUBLIC_BOOKABLE_SESSION.startDate
    && String(session?.endDate || "").slice(0, 10) === PUBLIC_BOOKABLE_SESSION.endDate
    && !isSessionFull(session)
  );
}

export function publicBookableSessions(sejourId, sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => isPublicBookableSession(sejourId, session));
}

export function isPublicBookableSejour(sejourId, sejour) {
  return publicBookableSessions(sejourId, sejour?.dates || []).length > 0;
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
