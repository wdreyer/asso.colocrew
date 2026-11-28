"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { canOpenDashboardPath } from "@/src/lib/dashboardAccess";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, isAdmin, sections, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !currentUser) router.replace("/dashboard/login");
  }, [loading, currentUser, router]);

  if (loading) return <div className="dash-center-screen"><div className="dash-spinner" /></div>;
  if (!currentUser) return null;

  if (!canOpenDashboardPath(pathname, isAdmin, sections)) {
    return (
      <div className="dash-center-screen">
        <div className="dash-denied-card">
          <h2>Accès refusé</h2>
          <p>Votre compte ne dispose pas de cet accès.</p>
          {sections.length > 0 && <Link className="dash-btn" href="/dashboard">Mes sections</Link>}
          <button type="button" className="dash-btn" onClick={logout}>Déconnexion</button>
        </div>
      </div>
    );
  }

  return children;
}
