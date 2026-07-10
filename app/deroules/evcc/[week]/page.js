"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { signInAnonymously } from "firebase/auth";
import DayPlans from "@/src/components/dashboard/DayPlans";
import { useAuth } from "@/src/contexts/AuthContext";
import { auth } from "@/src/lib/firebase";

export default function EvccDayPlansPage({ params }) {
  const requestedWeek = String(params?.week || "").toUpperCase();
  const { currentUser, loading } = useAuth();
  const [authError, setAuthError] = useState("");

  if (requestedWeek !== "S3") notFound();

  useEffect(() => {
    if (!loading && !currentUser) {
      signInAnonymously(auth).catch((error) => {
        console.error("Connexion anonyme impossible pour /deroules/evcc/S3", error);
        setAuthError("Connexion publique impossible : active l'authentification anonyme dans Firebase.");
      });
    }
  }, [currentUser, loading]);

  if (loading || (!currentUser && !authError)) {
    return <div className="dp-standalone"><div className="dp-login-state">Preparation du planning...</div></div>;
  }

  if (authError) {
    return <div className="dp-standalone"><div className="dp-login-state">{authError}</div></div>;
  }

  return <div className="dp-standalone"><DayPlans stayCode="EVCC" week="S3" /></div>;
}
