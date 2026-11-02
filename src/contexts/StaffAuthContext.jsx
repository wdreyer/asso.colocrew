"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/**
 * Session of the team space (/espace-equipe). Separate from AuthContext, which belongs to the
 * admin dashboard and signs out anyone who is not an admin.
 *
 * status:
 *   "loading"    – Firebase Auth or the account document is not known yet
 *   "signedOut"  – nobody is signed in
 *   "admin"      – an admin (admins/{uid}) signed in here: they belong on /dashboard
 *   "noAccount"  – signed in, but no staff_accounts/{uid} request yet
 *   "pending"    – request sent, waiting for an admin (also: approved but not linked yet)
 *   "rejected"   – request refused, or account suspended
 *   "approved"   – approved and linked to a staff_members document (memberId)
 */

export const REQUESTED_ROLES = [
  { key: "animateur", label: "Animateur·rice" },
  { key: "adjoint", label: "Directeur·rice adjoint·e" },
  { key: "directeur", label: "Directeur·rice" },
];

const StaffAuthContext = createContext(null);

const BLOCKED_STATUSES = new Set(["rejected", "suspended", "disabled"]);

function accountStatus(account) {
  if (!account) return "noAccount";
  if (BLOCKED_STATUSES.has(account.status)) return "rejected";
  if (account.status === "approved" && account.memberId) return "approved";
  return "pending";
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte avec cet e-mail.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez le mot de passe.",
  "auth/weak-password": "Mot de passe trop court (8 caractères minimum).",
  "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes.",
  "auth/network-request-failed": "Connexion internet indisponible.",
  "auth/user-disabled": "Ce compte a été désactivé. Contactez ColoCrew.",
  "permission-denied": "Action refusée. Contactez ColoCrew si le problème continue.",
};

export function staffAuthErrorMessage(error) {
  return AUTH_ERRORS[error?.code] || error?.message || "Une erreur est survenue. Réessayez.";
}

function cleanText(value) {
  return String(value || "").trim();
}

export function StaffAuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState(undefined);
  const [member, setMember] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setAccount(undefined);
    setMember(undefined);
    if (!nextUser) {
      setIsAdmin(false);
      setUser(null);
      return;
    }
    try {
      const adminSnap = await getDoc(doc(db, COLLECTIONS.ADMINS, nextUser.uid));
      setIsAdmin(adminSnap.exists());
    } catch {
      setIsAdmin(false);
    }
    setUser(nextUser);
  }), []);

  // Live account request: an approval by an admin opens the space without reloading.
  useEffect(() => {
    if (!user || isAdmin) return undefined;
    return onSnapshot(
      doc(db, COLLECTIONS.STAFF_ACCOUNTS, user.uid),
      (snapshot) => setAccount(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
      () => setAccount(null),
    );
  }, [user, isAdmin]);

  const memberId = account?.status === "approved" ? account.memberId || "" : "";

  useEffect(() => {
    if (!memberId) {
      setMember(undefined);
      return undefined;
    }
    return onSnapshot(
      doc(db, COLLECTIONS.STAFF_MEMBERS, memberId),
      (snapshot) => setMember(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
      () => setMember(null),
    );
  }, [memberId]);

  let status = "loading";
  if (user === null) status = "signedOut";
  else if (user && isAdmin) status = "admin";
  else if (user && account !== undefined) status = accountStatus(account);
  if (status === "approved" && member === undefined) status = "loading";

  const signIn = useCallback(async (email, password) => {
    await signInWithEmailAndPassword(auth, cleanText(email), password);
  }, []);

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, cleanText(email));
  }, []);

  const signOut = useCallback(() => firebaseSignOut(auth), []);

  /** Writes staff_accounts/{uid} with status "pending" (contract §6). */
  const submitAccountRequest = useCallback(async (targetUser, form) => {
    const firstName = cleanText(form.firstName);
    const lastName = cleanText(form.lastName);
    await setDoc(doc(db, COLLECTIONS.STAFF_ACCOUNTS, targetUser.uid), {
      uid: targetUser.uid,
      email: targetUser.email || cleanText(form.email).toLowerCase(),
      firstName,
      lastName,
      phone: cleanText(form.phone),
      requestedRole: form.requestedRole || "animateur",
      status: "pending",
      memberId: "",
      createdAt: serverTimestamp(),
    });
  }, []);

  const signUp = useCallback(async (form) => {
    const credential = await createUserWithEmailAndPassword(auth, cleanText(form.email), form.password);
    const displayName = `${cleanText(form.firstName)} ${cleanText(form.lastName)}`.trim();
    try { await updateProfile(credential.user, { displayName }); } catch {}
    await submitAccountRequest(credential.user, form);
  }, [submitAccountRequest]);

  const completeRequest = useCallback(async (form) => {
    if (!auth.currentUser) throw new Error("Session expirée. Reconnectez-vous.");
    await submitAccountRequest(auth.currentUser, form);
  }, [submitAccountRequest]);

  const value = useMemo(() => ({
    status,
    user: user || null,
    account: account || null,
    member: member || null,
    memberId: status === "approved" ? memberId : "",
    signIn,
    signUp,
    completeRequest,
    resetPassword,
    signOut,
  }), [status, user, account, member, memberId, signIn, signUp, completeRequest, resetPassword, signOut]);

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (!context) throw new Error("useStaffAuth must be used inside StaffAuthProvider");
  return context;
}
