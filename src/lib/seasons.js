"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/**
 * A season is a calendar year ("2026", "2027"): every session, reservation, convoy, contract and
 * day plan belongs to the season of its start date. Closed seasons have a `seasons/{key}` document
 * with `status: "archived"`; their records stay in Firestore, tagged `archived: true`, and are only
 * shown in /dashboard/archives and in each staff member's history.
 */

export function seasonOfDate(value) {
  const match = String(value || "").match(/^(\d{4})-\d{2}-\d{2}/);
  return match ? match[1] : "";
}

/** Reservations booked before this new system have no `season`: infer it from the session date. */
export function seasonOfRecord(record) {
  if (!record) return "";
  if (record.season) return String(record.season);
  return seasonOfDate(
    record.sejour?.startDate
    || record.startDate
    || record.date
    || record.sessionStartDate
    || "",
  );
}

export function isArchivedRecord(record, archivedSeasons) {
  if (record?.archived === true) return true;
  const season = seasonOfRecord(record);
  return Boolean(season && archivedSeasons?.has?.(season));
}

/** Season opened by default in the dashboard: from September on, the next year is being sold. */
export function defaultActiveSeason(now = new Date()) {
  return String(now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0));
}

/**
 * Live view of `seasons/*`. `activeSeason` is the first non-archived season from the default one
 * on, or the `seasons` document flagged `active: true` if an admin picked one explicitly.
 */
export function useSeasons() {
  const [state, setState] = useState({ loading: true, seasons: [], archivedSeasons: new Set(), activeSeason: defaultActiveSeason() });

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.SEASONS),
    (snapshot) => {
      const seasons = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const archivedSeasons = new Set(seasons.filter((season) => season.status === "archived").map((season) => season.id));
      const flagged = seasons.find((season) => season.active === true && !archivedSeasons.has(season.id));
      let activeSeason = flagged?.id || defaultActiveSeason();
      while (archivedSeasons.has(activeSeason)) activeSeason = String(Number(activeSeason) + 1);
      setState({ loading: false, seasons, archivedSeasons, activeSeason });
    },
    () => setState((previous) => ({ ...previous, loading: false })),
  ), []);

  return state;
}
