"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const { currentUser, isAdmin, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      router.replace("/dashboard/login");
    }
  }, [loading, currentUser, router]);

  if (loading) {
    return (
      <div className="dash-center-screen">
        <div className="dash-spinner" />
      </div>
    );
  }

  if (!currentUser) return null;

  if (!isAdmin) {
    return (
      <div className="dash-center-screen">
        <div className="dash-denied-card">
          <h2>Accès refusé</h2>
          <p>Votre compte n’est pas autorisé pour le dashboard.</p>
          <button type="button" className="dash-btn" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  return children;
}
