"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { effectiveDashboardSections } from "@/src/lib/dashboardAccess";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [identity, setIdentity] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setIdentity), []);

  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (!identity || identity.isAnonymous) return;
    const uid = identity.uid;
    const records = {};
    const watch = (key, collection) => onSnapshot(doc(db, collection, uid), { includeMetadataChanges: true }, (snapshot) => {
      records[key] = snapshot.exists() ? snapshot.data() : null;
      if (!snapshot.metadata.fromCache) {
        records[key + "Ready"] = true;
      }
      publish();
    }, () => {
      records[key] = null;
      records[key + "Ready"] = true;
      publish();
    });
    function publish() {
      if (records.adminReady && (records.admin || records.accountReady)) {
        setAccess({ identity, isAdmin: !!records.admin, sections: effectiveDashboardSections(records.account) });
      }
    }
    const stops = [
      watch("admin", COLLECTIONS.ADMINS),
      watch("account", COLLECTIONS.STAFF_ACCOUNTS),
    ];
    return () => stops.forEach((stop) => stop());
  }, [identity]);

  const login = useCallback((email, password) => {
    setError(null);
    return signInWithEmailAndPassword(auth, email, password);
  }, []);
  const logout = useCallback(() => signOut(auth), []);
  const user = identity?.isAnonymous ? null : identity;
  const isCurrent = Boolean(user && access?.identity === user);
  const isAdmin = Boolean(isCurrent && access?.isAdmin);
  const sections = useMemo(() => isCurrent ? access.sections : [], [isCurrent, access]);
  const loading = identity === undefined || Boolean(user && !isCurrent);

  const value = useMemo(
    () => ({ currentUser: user, isAdmin, sections, loading, login, logout, error, setError }),
    [user, isAdmin, sections, loading, login, logout, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
