"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError?.(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (_err) {
      // erreur gérée dans le context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dash-login-page">
      <form className="dash-login-card" onSubmit={handleSubmit}>
        <div className="dash-login-logo">ColoCrew</div>
        <h1>Espace admin</h1>

        <label htmlFor="admin-email">Email</label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />

        <label htmlFor="admin-password">Mot de passe</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
          {submitting ? "Connexion..." : "Se connecter"}
        </button>

        {error ? <p className="dash-login-error">{error}</p> : null}
      </form>
    </div>
  );
}
