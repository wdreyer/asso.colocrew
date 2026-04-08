"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAdmin = useCallback(async (uid) => {
    if (!uid) return false;
    const adminRef = doc(db, COLLECTIONS.ADMINS, uid);
    const snap = await getDoc(adminRef);
    return snap.exists();
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setCurrentUser(null);
    setIsAdmin(false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      setError(null);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const ok = await checkAdmin(cred.user.uid);

      if (!ok) {
        await signOut(auth);
        setCurrentUser(null);
        setIsAdmin(false);
        setError("Accès non autorisé.");
        throw new Error("Accès non autorisé.");
      }

      setCurrentUser(cred.user);
      setIsAdmin(true);
      return cred;
    },
    [checkAdmin],
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setError(null);
      if (!user) {
        setCurrentUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const ok = await checkAdmin(user.uid);
        if (!ok) {
          await signOut(auth);
          setCurrentUser(null);
          setIsAdmin(false);
          setError("Accès non autorisé.");
        } else {
          setCurrentUser(user);
          setIsAdmin(true);
        }
      } catch (_err) {
        setCurrentUser(null);
        setIsAdmin(false);
        setError("Vérification admin impossible.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [checkAdmin]);

  const value = useMemo(
    () => ({ currentUser, isAdmin, loading, login, logout, error, setError }),
    [currentUser, isAdmin, loading, login, logout, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
