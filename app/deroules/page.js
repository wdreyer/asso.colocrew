"use client";

import { useState } from "react";
import DayPlans from "@/src/components/dashboard/DayPlans";
import { useAuth } from "@/src/contexts/AuthContext";

export default function StandaloneDayPlansPage() {
  const { currentUser, loading, login, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="dp-standalone"><div className="dp-login-state">Chargement…</div></div>;
  if (currentUser) return <div className="dp-standalone"><DayPlans /></div>;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError?.(null);
    try { await login(email, password); } catch (_error) { /* géré par le contexte */ }
    finally { setSubmitting(false); }
  };

  return <div className="dp-standalone dp-login-page">
    <form className="dp-login-card" onSubmit={submit}>
      <span className="dp-eyebrow">ColoCrew · Équipe</span>
      <h1>Déroulés des journées</h1>
      <p>Connectez-vous pour consulter et organiser le planning du séjour.</p>
      <label><span>Adresse e-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
      <label><span>Mot de passe</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
      {error && <div className="dp-login-error">{error}</div>}
      <button type="submit" disabled={submitting}>{submitting ? "Connexion…" : "Se connecter"}</button>
    </form>
  </div>;
}
