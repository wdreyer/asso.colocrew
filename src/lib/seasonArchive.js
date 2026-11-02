"use client";

import {
  collection,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { seasonOfDate, seasonOfRecord } from "@/src/lib/seasons";
import { transportStaffMemberIds } from "@/src/lib/transports";

/**
 * Closing a season tags every reservation, convoy, contract and day plan of that season with
 * `archived: true` (nothing is moved or deleted), then writes `seasons/{season}` with frozen stats.
 * Older records have no `season` field: the rules below infer it from what each screen used to read.
 */

export const ARCHIVED_COLLECTIONS = [
  { key: "reservations", collection: COLLECTIONS.RESERVATIONS, label: "Réservations" },
  { key: "transports", collection: COLLECTIONS.TRANSPORTS, label: "Convoyages" },
  { key: "contracts", collection: COLLECTIONS.STAFF_CONTRACTS, label: "Contrats" },
  { key: "dayPlans", collection: COLLECTIONS.DAY_PLANS, label: "Déroulés" },
];

const BATCH_LIMIT = 450;

// Summer 2026 was organised in four weeks S1–S4 before sessions existed.
const LEGACY_WEEK_SEASON = "2026";
const LEGACY_WEEKS = new Set(["S1", "S2", "S3", "S4"]);
const LEGACY_IMPORT_SOURCES = { ete26_validated_workbook: "2026" };

export function recordKey(collectionName, id) {
  return `${collectionName}/${id}`;
}

export function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function amount(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export function normalizeReservationStatus(value) {
  const status = String(value || "").toLowerCase().trim();
  if (["validated", "validee", "validée", "confirmed"].includes(status)) return "validated";
  if (["deleted", "supprimee", "supprimée", "cancelled", "annulee", "annulée"].includes(status)) return "cancelled";
  if (status === "waitlist") return "waitlist";
  return "pending";
}

export function childCountOf(data) {
  const children = Array.isArray(data?.minor?.children) ? data.minor.children.length : 0;
  if (children > 0) return children;
  const declared = Number(data?.minor?.numberOfChildren);
  return Number.isFinite(declared) && declared > 0 ? declared : 1;
}

/** Amount billed for a reservation: the finance block first (imported workbook), else the payment/pricing block. */
export function reservationRevenue(data) {
  const finance = data?.finance || {};
  if (finance.netAmount != null && finance.netAmount !== "") return amount(finance.netAmount);
  const pricing = data?.payment || data?.pricing || {};
  const value = data?.finalPrice ?? pricing.validatedPrice ?? pricing.totalPrice ?? pricing.total;
  return value == null || value === "" ? null : amount(value);
}

export function reservationPaid(data) {
  const finance = data?.finance || {};
  if (finance.paidAmount != null && finance.paidAmount !== "") return amount(finance.paidAmount);
  const pricing = data?.payment || data?.pricing || {};
  return amount(pricing.alreadyPaid);
}

/** Season of a record from its own fields, or "" when nothing usable is there. */
export function inferSeason(key, data, id = "") {
  const direct = seasonOfRecord(data);
  if (direct) return direct;

  if (key === "reservations") {
    const fromDate = seasonOfDate(data?.sejourStartDate);
    if (fromDate) return fromDate;
    return LEGACY_IMPORT_SOURCES[data?.validationSource] || "";
  }
  if (key === "transports") {
    if (LEGACY_WEEKS.has(String(data?.week || "").toUpperCase())) return LEGACY_WEEK_SEASON;
    const named = String(data?.sejourName || "").match(/\b(20\d{2})\b/);
    return named ? named[1] : "";
  }
  if (key === "contracts") {
    const fromDate = seasonOfDate(data?.endDate);
    if (fromDate) return fromDate;
    return LEGACY_WEEKS.has(String(data?.week || "").toUpperCase()) ? LEGACY_WEEK_SEASON : "";
  }
  if (key === "dayPlans") {
    // New IDs: `${sessionId}__${date}`; 2026 IDs: `${stayId}-${date}`.
    const match = String(id).match(/(?:__|-)(\d{4})-\d{2}-\d{2}$/);
    return match ? match[1] : "";
  }
  return "";
}

/**
 * A record with no usable date may still belong to the season if it was created before
 * 1 October of that year: it is offered for a manual decision, never archived automatically.
 */
function isUndeterminedCandidate(data, season) {
  const createdMs = timestampToMs(data?.createdAt);
  if (!createdMs) return true;
  return createdMs < Date.parse(`${season}-10-01T00:00:00`);
}

async function readCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() || {} }));
}

/** Counts per inferred season across the four collections, to list seasons that exist only in data. */
export async function scanSeasonCounts() {
  const counts = {};
  const results = await Promise.all(ARCHIVED_COLLECTIONS.map((item) => readCollection(item.collection)));
  results.forEach((records, index) => {
    const { key } = ARCHIVED_COLLECTIONS[index];
    records.forEach(({ id, data }) => {
      const season = inferSeason(key, data, id);
      if (!season) return;
      counts[season] = counts[season] || { reservations: 0, transports: 0, contracts: 0, dayPlans: 0, archived: 0 };
      counts[season][key] += 1;
      if (data.archived === true) counts[season].archived += 1;
    });
  });
  return counts;
}

/**
 * Read-only analysis. For each collection: `matched` (to archive), `archived` (already tagged),
 * `undetermined` (no usable date, decided by the admin). Each item is `{ id, key, data }`.
 */
export async function previewSeasonArchive(season) {
  const target = String(season);
  const results = await Promise.all(ARCHIVED_COLLECTIONS.map((item) => readCollection(item.collection)));
  const collections = {};

  results.forEach((records, index) => {
    const meta = ARCHIVED_COLLECTIONS[index];
    const bucket = { ...meta, total: records.length, matched: [], archived: [], undetermined: [] };
    records.forEach(({ id, data }) => {
      const inferred = inferSeason(meta.key, data, id);
      const item = { id, key: recordKey(meta.collection, id), data };
      if (inferred === target) {
        (data.archived === true ? bucket.archived : bucket.matched).push(item);
      } else if (!inferred && data.archived !== true && isUndeterminedCandidate(data, target)) {
        bucket.undetermined.push(item);
      }
    });
    collections[meta.key] = bucket;
  });

  return { season: target, collections, scannedAt: Date.now() };
}

/** Frozen figures stored on `seasons/{season}`. */
export function computeSeasonStats(itemsByKey) {
  const reservations = itemsByKey.reservations || [];
  const validated = reservations.filter((item) => normalizeReservationStatus(item.data.status) === "validated");
  let revenueValidated = 0;
  let revenueMissing = 0;
  let paidValidated = 0;
  validated.forEach(({ data }) => {
    const revenue = reservationRevenue(data);
    if (revenue == null) revenueMissing += 1;
    else revenueValidated += revenue;
    paidValidated += reservationPaid(data);
  });

  const contracts = itemsByKey.contracts || [];
  const members = new Set(contracts.map(({ id, data }) => data.memberId || data.memberName || id));
  const round = (value) => Math.round(value * 100) / 100;

  return {
    reservations: reservations.length,
    validatedReservations: validated.length,
    children: validated.reduce((sum, { data }) => sum + childCountOf(data), 0),
    revenueValidated: round(revenueValidated),
    revenueMissing,
    paidValidated: round(paidValidated),
    transports: (itemsByKey.transports || []).length,
    contracts: contracts.length,
    staffMembers: members.size,
    payrollNet: round(contracts.reduce((sum, { data }) => sum + amount(data.netSalary), 0)),
    dayPlans: (itemsByKey.dayPlans || []).length,
  };
}

async function commitInBatches(operations, onProgress, phase) {
  let done = 0;
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(start, start + BATCH_LIMIT).forEach((apply) => apply(batch));
    try {
      await batch.commit();
    } catch (error) {
      const wrapped = new Error(
        `${error?.message || "Écriture impossible."} (${done} sur ${operations.length} documents traités avant l'erreur ; relancer l'opération est sans risque.)`,
      );
      wrapped.cause = error;
      wrapped.done = done;
      throw wrapped;
    }
    done = Math.min(start + BATCH_LIMIT, operations.length);
    onProgress?.({ phase, done, total: operations.length });
  }
  return done;
}

/**
 * Tags the season's records then marks the season archived. `includeIds` lists the keys
 * (`collection/id`, see `recordKey`) of undetermined records the admin chose to include.
 * Records are tagged before the season document, so an interrupted run can simply be re-run.
 */
export async function applySeasonArchive(season, { includeIds = [], adminEmail = "", onProgress, preview } = {}) {
  const target = String(season);
  const analysis = preview?.season === target ? preview : await previewSeasonArchive(target);
  const included = new Set(includeIds);
  const archivedBy = adminEmail || "";

  const itemsByKey = {};
  const operations = [];
  ARCHIVED_COLLECTIONS.forEach((meta) => {
    const bucket = analysis.collections[meta.key];
    const chosen = [...bucket.matched, ...bucket.undetermined.filter((item) => included.has(item.key))];
    itemsByKey[meta.key] = [...chosen, ...bucket.archived];
    chosen.forEach((item) => {
      // Older convoys only list their staff in `staff[]`: copy the flat ids so each member's
      // history in the team space still finds them.
      const staffMemberIds = meta.key === "transports" && !item.data.staffMemberIds?.length
        ? transportStaffMemberIds(item.data)
        : [];
      operations.push((batch) => batch.update(doc(db, meta.collection, item.id), {
        archived: true,
        season: target,
        archivedAt: serverTimestamp(),
        archivedBy,
        ...(staffMemberIds.length ? { staffMemberIds } : {}),
      }));
    });
  });

  onProgress?.({ phase: "records", done: 0, total: operations.length });
  await commitInBatches(operations, onProgress, "records");

  const stats = computeSeasonStats(itemsByKey);
  await setDoc(doc(db, COLLECTIONS.SEASONS, target), {
    status: "archived",
    archivedAt: serverTimestamp(),
    archivedBy,
    stats: { ...stats, computedAt: new Date().toISOString() },
  }, { merge: true });
  onProgress?.({ phase: "done", done: operations.length, total: operations.length });

  return { tagged: operations.length, stats };
}

/** Records of an archived season, for read-only consultation. */
export async function loadArchivedRecords(season, key) {
  const meta = ARCHIVED_COLLECTIONS.find((item) => item.key === key);
  if (!meta) return [];
  const target = String(season);
  const records = await readCollection(meta.collection);
  return records.filter(({ id, data }) => data.archived === true && (String(data.season || "") || inferSeason(key, data, id)) === target);
}

/**
 * Reopens a season: removes `archived`/`archivedAt`/`archivedBy` (the `season` tag stays) and sets
 * the season back to "open". Records are untagged first; the season document is only reopened once
 * every batch has succeeded, so an interrupted run leaves the season closed and can be re-run.
 */
export async function restoreSeason(season, { adminEmail = "", onProgress } = {}) {
  const target = String(season);
  const operations = [];
  for (const meta of ARCHIVED_COLLECTIONS) {
    const records = await loadArchivedRecords(target, meta.key);
    records.forEach((item) => {
      operations.push((batch) => batch.update(doc(db, meta.collection, item.id), {
        archived: deleteField(),
        archivedAt: deleteField(),
        archivedBy: deleteField(),
        restoredAt: serverTimestamp(),
        restoredBy: adminEmail || "",
      }));
    });
  }

  onProgress?.({ phase: "records", done: 0, total: operations.length });
  await commitInBatches(operations, onProgress, "records");

  await setDoc(doc(db, COLLECTIONS.SEASONS, target), {
    status: "open",
    reopenedAt: serverTimestamp(),
    reopenedBy: adminEmail || "",
  }, { merge: true });
  onProgress?.({ phase: "done", done: operations.length, total: operations.length });

  return { restored: operations.length };
}
