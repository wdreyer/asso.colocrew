"use client";

import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import DayPlans from "@/src/components/dashboard/DayPlans";
import { useAuth } from "@/src/contexts/AuthContext";
import { auth } from "@/src/lib/firebase";

export default function StandaloneDayPlansPage() {
  const { currentUser, loading } = useAuth();
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!loading && !currentUser) {
      signInAnonymously(auth).catch((error) => {
        console.error("Connexion anonyme impossible pour /deroules", error);
        setAuthError("Connexion publique impossible : active l’authentification anonyme dans Firebase.");
      });
    }
  }, [currentUser, loading]);

  if (loading || (!currentUser && !authError)) {
    return <div className="dp-standalone"><div className="dp-login-state">Préparation du planning…</div></div>;
  }

  if (authError) {
    return <div className="dp-standalone"><div className="dp-login-state">{authError}</div></div>;
  }

  return <div className="dp-standalone"><DayPlans /></div>;
}
