/**
 * Suivi commercial des demandes de réservation (statuts "pending" et "waitlist").
 *
 * Champs enregistrés sur la réservation, dans `crm` :
 *   lastContactAt     Timestamp du dernier échange avec la famille (appel, email du dashboard ou
 *                     email consigné). Les emails automatiques ne comptent pas.
 *   lastContactType   "call" | "manualEmail" | "email"
 *   nextFollowUpAt    "AAAA-MM-JJ" : date de la prochaine relance prévue ("" : aucune)
 *   nextFollowUpNote  ce qu'il faut faire ce jour-là
 *   ownerUid/ownerName  membre de l'équipe qui suit le dossier
 *   closeReason       motif d'annulation d'une demande
 *
 * L'étape du pipeline n'est pas enregistrée : elle se déduit du dossier (prix, paiement, contact),
 * pour ne jamais être en retard sur la réalité.
 */

export const REQUEST_STAGES = {
  new:      { label: "Nouvelle demande",          badge: "warning", hint: "Personne n’a encore contacté la famille." },
  to_price: { label: "Tarif à définir",           badge: "warning", hint: "Famille contactée, tarif pas encore validé." },
  awaiting: { label: "En attente de la famille",  badge: "info",    hint: "Tarif validé, en attente du paiement ou de la réponse." },
  paid:     { label: "Paiement reçu · à valider", badge: "success", hint: "La famille a payé : l’inscription peut être validée." },
  waitlist: { label: "Liste d’attente",           badge: "neutral", hint: "À recontacter si une place se libère." },
};

export const REQUEST_STAGE_ORDER = ["new", "to_price", "awaiting", "paid", "waitlist"];

/** Sans échange depuis ce nombre de jours (et sans relance prévue), un dossier est signalé. */
export const STALE_AFTER_DAYS = 7;

export const CANCEL_REASONS = [
  "Pas de réponse de la famille",
  "Prix trop élevé",
  "A choisi un autre organisme",
  "Dates ou séjour qui ne conviennent plus",
  "Doublon d’une autre demande",
  "Autre",
];

const DAY = 86400000;

function toMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Date du jour à Paris, au format "AAAA-MM-JJ". */
export function parisDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDaysKey(days, date = new Date()) {
  return parisDayKey(new Date(date.getTime() + days * DAY));
}

/**
 * Lecture CRM d'une réservation mappée par `mapReservation` (champs `status`, `finalPrice`,
 * `alreadyPaid`, `depositPaid`, `dateMs` et `raw.crm`).
 */
export function requestFollowUp(item, now = new Date()) {
  const crm = item?.raw?.crm || item?.crm || {};
  const lastContactMs = toMs(crm.lastContactAt);
  const priced = Number(item?.finalPrice) > 0;
  const paid = Boolean(item?.depositPaid) || Number(item?.alreadyPaid || 0) > 0;

  let stage;
  if (item?.status === "waitlist") stage = "waitlist";
  else if (paid) stage = "paid";
  else if (!priced && !lastContactMs) stage = "new";
  else if (!priced) stage = "to_price";
  else stage = "awaiting";

  const followUp = /^\d{4}-\d{2}-\d{2}$/.test(crm.nextFollowUpAt || "") ? crm.nextFollowUpAt : "";
  const today = parisDayKey(now);
  const silentSince = lastContactMs || item?.dateMs || 0;
  const daysSilent = silentSince ? Math.max(Math.floor((now.getTime() - silentSince) / DAY), 0) : null;

  return {
    stage,
    lastContactMs,
    lastContactType: crm.lastContactType || "",
    followUp,
    followUpNote: crm.nextFollowUpNote || "",
    followUpDue: Boolean(followUp) && followUp <= today,
    followUpLate: Boolean(followUp) && followUp < today,
    daysSilent,
    stale: stage !== "paid" && stage !== "waitlist" && !followUp && daysSilent != null && daysSilent >= STALE_AFTER_DAYS,
    ageDays: item?.dateMs ? Math.max(Math.floor((now.getTime() - item.dateMs) / DAY), 0) : null,
    ownerUid: crm.ownerUid || "",
    ownerName: crm.ownerName || "",
    closeReason: crm.closeReason || "",
  };
}

/**
 * Ordre de traitement des demandes : relances échues d'abord, puis paiements à valider,
 * nouvelles demandes, dossiers sans nouvelles, puis le reste par relance prévue.
 */
export function requestPriority(followUp) {
  if (followUp.followUpDue) return `0-${followUp.followUp}`;
  if (followUp.stage === "paid") return "1";
  if (followUp.stage === "new") return "2";
  if (followUp.stale) return `3-${String(1000 - Math.min(followUp.daysSilent, 999)).padStart(4, "0")}`;
  if (followUp.followUp) return `4-${followUp.followUp}`;
  return "5";
}

export function relativeDays(days) {
  if (days == null) return "";
  if (days === 0) return "aujourd’hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

/** "2027-03-04" → "4 mars" (ou "aujourd’hui" / "demain"). */
export function followUpLabel(key, now = new Date()) {
  if (!key) return "";
  if (key === parisDayKey(now)) return "aujourd’hui";
  if (key === addDaysKey(1, now)) return "demain";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", timeZone: "UTC",
    ...(String(year) !== parisDayKey(now).slice(0, 4) ? { year: "numeric" } : {}),
  }).format(date);
}
