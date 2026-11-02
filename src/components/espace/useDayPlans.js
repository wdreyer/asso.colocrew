"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { findDayPlanConfig, seedDay } from "@/src/lib/dayPlansSeed";
import { datesBetween } from "./format";

/**
 * Day plans of a contract's session, read only.
 * - 2027 on: `day_plans/{sessionId}__{date}`, queried by `sessionId`.
 * - 2026: `day_plans/{stayId}-{date}` with stayId like "mcsc-s1-2026" (stayCode + week), plus the
 *   seed of src/lib/dayPlansSeed.js for days never saved, exactly like the 2026 day plan screen.
 */
export function useDayPlans(contract) {
  const sessionId = contract?.sessionId || "";
  const legacyConfig = useMemo(
    () => (contract?.stayCode && contract?.week && contract?.season === "2026" ? findDayPlanConfig(contract.stayCode, contract.week) : null),
    [contract?.stayCode, contract?.week, contract?.season],
  );
  const legacyStayId = legacyConfig?.stay?.id || "";
  const start = contract?.sessionStart || legacyConfig?.stay?.startDate || "";
  const end = contract?.sessionEnd || legacyConfig?.stay?.endDate || "";
  const [state, setState] = useState({ loading: true, plans: {}, error: "" });

  useEffect(() => {
    let active = true;
    setState({ loading: true, plans: {}, error: "" });
    const reads = [];
    if (sessionId) reads.push(getDocs(query(collection(db, COLLECTIONS.DAY_PLANS), where("sessionId", "==", sessionId))));
    if (legacyStayId) reads.push(getDocs(query(collection(db, COLLECTIONS.DAY_PLANS), where("stayId", "==", legacyStayId))));
    Promise.all(reads)
      .then((snapshots) => {
        if (!active) return;
        const plans = {};
        // Legacy first, so that a plan saved under the session id wins.
        [...snapshots].reverse().forEach((snapshot) => snapshot.docs.forEach((entry) => {
          const data = entry.data();
          if (data?.date) plans[data.date] = { id: entry.id, ...data };
        }));
        setState({ loading: false, plans, error: "" });
      })
      .catch((error) => active && setState({ loading: false, plans: {}, error: error?.message || "Lecture impossible." }));
    return () => { active = false; };
  }, [sessionId, legacyStayId]);

  return useMemo(() => {
    const dates = datesBetween(start, end);
    const plans = Object.fromEntries(dates.map((date) => {
      const saved = state.plans[date];
      if (saved) return [date, saved];
      return [date, legacyConfig ? seedDay(date, legacyConfig) : { date, tasks: [], leaveMemberIds: [], notes: "" }];
    }));
    return { ...state, dates, plans };
  }, [state, start, end, legacyConfig]);
}
