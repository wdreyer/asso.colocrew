"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { isArchivedRecord, seasonOfRecord, useSeasons } from "@/src/lib/seasons";
import { formatDateRange, useSessionCatalog } from "@/src/lib/sessions";
import { STAFF_DOCUMENT_TYPES, documentTimestamp } from "@/src/lib/staffDocuments";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import { todayIso } from "./format";

/**
 * Everything the signed-in team member may read, loaded once for all tabs. Every query is
 * filtered on the member's own id (security rules require it): their contracts, their documents,
 * and the convoys listing them in `staffMemberIds`.
 */

const StaffDataContext = createContext(null);

function useMemberQuery(collectionName, field, operator, memberId) {
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => {
    if (!memberId) {
      setState({ loading: false, items: [], error: "" });
      return undefined;
    }
    setState((previous) => ({ ...previous, loading: true }));
    return onSnapshot(
      query(collection(db, collectionName), where(field, operator, memberId)),
      (snapshot) => setState({ loading: false, items: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })), error: "" }),
      (error) => setState({ loading: false, items: [], error: error?.message || "Lecture impossible." }),
    );
  }, [collectionName, field, operator, memberId]);
  return state;
}

/** Attaches the session (from the séjour catalog) and the season to a contract. */
function describeContract(contract, catalog, archivedSeasons) {
  const session = contract.sessionId ? catalog.byId.get(contract.sessionId) : null;
  const stayName = session?.sejourName || contract.stayName || contract.stay || contract.stayCode || "Séjour";
  const stayCode = session?.sejourCode || String(contract.stayCode || "").toUpperCase();
  const week = session?.week || contract.week || "";
  const sessionStart = session?.startDate || contract.startDate || "";
  const sessionEnd = session?.endDate || contract.endDate || "";
  const season = String(contract.season || session?.season || seasonOfRecord(contract) || "");
  return {
    ...contract,
    session,
    season,
    archived: isArchivedRecord({ ...contract, season }, archivedSeasons),
    stayName,
    stayCode,
    week,
    sessionStart,
    sessionEnd,
    sessionLabel: [stayCode || stayName, week].filter(Boolean).join(" · "),
    datesLabel: sessionStart ? formatDateRange(sessionStart, sessionEnd) : "Dates à confirmer",
    workStart: contract.startDate || sessionStart,
    workEnd: contract.endDate || sessionEnd,
  };
}

function describeTransport(transport, archivedSeasons) {
  const season = String(transport.season || seasonOfRecord(transport) || "");
  return { ...transport, season, archived: isArchivedRecord({ ...transport, season }, archivedSeasons) };
}

/** Latest document of each type, and what the person still has to do about it. */
export function documentSituation(documents, member) {
  return STAFF_DOCUMENT_TYPES.map((type) => {
    const ofType = (documents || [])
      .filter((document) => document.documentType === type.key)
      .sort((left, right) => documentTimestamp(right) - documentTimestamp(left));
    const latest = ofType.find((document) => document.status !== "rejected") || ofType[0] || null;
    const locked = Boolean(
      member?.documentLocks?.[type.key]
      || member?.documentStatus?.[type.key]?.locked
      || ofType.some((document) => document.locked && document.status === "validated"),
    );
    const validated = locked || ofType.some((document) => document.status === "validated");
    let state = "missing";
    if (validated) state = "validated";
    else if (latest?.status === "pending") state = "pending";
    else if (latest?.status === "rejected") state = "rejected";
    return { type, documents: ofType, latest, locked, state };
  });
}

export function StaffDataProvider({ children }) {
  const { memberId, member } = useStaffAuth();
  const { activeSeason, archivedSeasons, seasons, loading: seasonsLoading } = useSeasons();
  const catalog = useSessionCatalog();
  const contractsState = useMemberQuery(COLLECTIONS.STAFF_CONTRACTS, "memberId", "==", memberId);
  const documentsState = useMemberQuery(COLLECTIONS.STAFF_DOCUMENTS, "memberId", "==", memberId);
  const transportsState = useMemberQuery(COLLECTIONS.TRANSPORTS, "staffMemberIds", "array-contains", memberId);

  const value = useMemo(() => {
    const contracts = contractsState.items
      .filter((contract) => contract.status !== "cancelled" && contract.deleted !== true)
      .map((contract) => describeContract(contract, catalog, archivedSeasons))
      .sort((left, right) => String(left.sessionStart).localeCompare(String(right.sessionStart)));
    const transports = transportsState.items
      .filter((transport) => String(transport.status || "").toLowerCase() !== "annule")
      .map((transport) => describeTransport(transport, archivedSeasons))
      .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")) || String(left.direction).localeCompare(String(right.direction)));
    const today = todayIso();
    const currentContracts = contracts.filter((contract) => !contract.archived && contract.season === activeSeason);
    const upcomingContracts = contracts.filter((contract) => !contract.archived && String(contract.sessionEnd || contract.workEnd || "9999") >= today);
    const currentTransports = transports.filter((transport) => !transport.archived);
    const upcomingTransports = currentTransports.filter((transport) => String(transport.date || "9999") >= today);

    return {
      memberId,
      member,
      activeSeason,
      archivedSeasons,
      seasons,
      catalog,
      contracts,
      currentContracts,
      upcomingContracts,
      transports,
      currentTransports,
      upcomingTransports,
      documents: documentsState.items,
      documentSituation: documentSituation(documentsState.items, member),
      loading: seasonsLoading || catalog.loading || contractsState.loading || documentsState.loading || transportsState.loading,
      errors: [contractsState.error, documentsState.error, transportsState.error].filter(Boolean),
    };
  }, [memberId, member, activeSeason, archivedSeasons, seasons, seasonsLoading, catalog, contractsState, documentsState, transportsState]);

  return <StaffDataContext.Provider value={value}>{children}</StaffDataContext.Provider>;
}

export function useStaffData() {
  const context = useContext(StaffDataContext);
  if (!context) throw new Error("useStaffData must be used inside StaffDataProvider");
  return context;
}
