"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { upcomingSessions } from "@/src/lib/availability";

const firstStart = (sejour) => String(sejour.dates[0]?.startDate || "").slice(0, 10);

/**
 * Séjours shown on the public site: every séjour with a session still to come, with only those sessions,
 * sorted by their next departure. `null` while loading.
 */
export function usePublicSejours() {
  const [sejours, setSejours] = useState(null);

  useEffect(() => onSnapshot(
    collection(db, COLLECTIONS.SEJOURS),
    (snapshot) => {
      const next = snapshot.docs
        .map((entry) => {
          const data = entry.data();
          const dates = upcomingSessions(data.dates).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
          return { ...data, id: entry.id, dates };
        })
        .filter((sejour) => sejour.dates.length > 0)
        .sort((a, b) => firstStart(a).localeCompare(firstStart(b)));
      setSejours(next);
    },
    () => setSejours([]),
  ), []);

  return sejours;
}

/** "11-13 / 14-17 ans" */
export function formatAgesLabel(ageGroups) {
  const groups = (Array.isArray(ageGroups) ? ageGroups : [])
    .map((group) => String(group || "").replace(/\s*ans\s*$/i, "").trim())
    .filter(Boolean);
  return groups.length ? `${groups.join(" / ")} ans` : "";
}

/** "Février 2027", "Octobre – Novembre 2026" */
export function formatSessionsLabel(sessions) {
  const seen = new Set();
  const months = [];
  let year = "";
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    const start = new Date(session?.startDate);
    if (Number.isNaN(start.getTime())) return;
    const month = start.toLocaleDateString("fr-FR", { month: "long" });
    year = String(start.getFullYear());
    if (seen.has(month)) return;
    seen.add(month);
    months.push(month.charAt(0).toUpperCase() + month.slice(1));
  });
  return months.length ? `${months.join(" – ")} ${year}` : "";
}
