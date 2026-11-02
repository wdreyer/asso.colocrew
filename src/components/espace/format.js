/** Small formatting helpers shared by the team space pages. */

export function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function asDate(iso) {
  const value = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "lundi 5 juillet 2027" */
export function longDate(iso) {
  const date = asDate(iso);
  return date ? date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date à confirmer";
}

/** "lun. 5 juil." */
export function shortDate(iso) {
  const date = asDate(iso);
  return date ? date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "—";
}

export function dayNumber(iso) {
  const date = asDate(iso);
  return date ? { weekday: date.toLocaleDateString("fr-FR", { weekday: "short" }), day: date.getDate(), month: date.toLocaleDateString("fr-FR", { month: "short" }) } : null;
}

export function datesBetween(startDate, endDate) {
  const start = asDate(startDate);
  const end = asDate(endDate || startDate);
  if (!start || !end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 60) {
    const local = new Date(cursor.getTime() - cursor.getTimezoneOffset() * 60000);
    dates.push(local.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function daysUntil(iso) {
  const date = asDate(iso);
  const today = asDate(todayIso());
  if (!date || !today) return null;
  return Math.round((date - today) / 86400000);
}

export function relativeDay(iso) {
  const days = daysUntil(iso);
  if (days === null) return "";
  if (days === 0) return "aujourd’hui";
  if (days === 1) return "demain";
  if (days > 1) return `dans ${days} jours`;
  if (days === -1) return "hier";
  return `il y a ${-days} jours`;
}

export function euros(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: amount % 1 ? 2 : 0 });
}

export function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dateTimeLabel(value) {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function personName(person) {
  return person?.name || `${person?.firstName || ""} ${person?.lastName || ""}`.trim() || "";
}

export function telHref(value) {
  return `tel:${String(value || "").replace(/[^\d+]/g, "")}`;
}
