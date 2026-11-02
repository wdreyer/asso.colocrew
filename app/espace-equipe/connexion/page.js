"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { staffAuthErrorMessage, useStaffAuth } from "@/src/contexts/StaffAuthContext";
import AuthFrame from "@/src/components/espace/AuthFrame";
import { Notice, buttonPrimary, inputClass, labelClass } from "@/src/components/espace/ui";

export default function ConnexionPage() {
  const { status, signIn, resetPassword } = useStaffAuth();
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sending, setSending] = useState(false);

  // Once signed in, the gate of /espace-equipe decides what to show (waiting page, space…).
  useEffect(() => {
    if (status !== "loading" && status !== "signedOut") router.replace("/espace-equipe");
  }, [status, router]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) return setError("Indiquez votre adresse e-mail.");
    setSending(true);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setInfo("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé. Pensez à vérifier les spams.");
      } else {
        await signIn(email, password);
      }
    } catch (submitError) {
      setError(staffAuthErrorMessage(submitError));
    } finally {
      setSending(false);
    }
  };

  const isReset = mode === "reset";

  return (
    <AuthFrame
      title={isReset ? "Mot de passe oublié" : "Connexion"}
      footer={<>Pas encore de compte ? <Link href="/espace-equipe/inscription" className="font-bold text-[#B8336A]">Créer mon compte</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className={labelClass} htmlFor="email">E-mail</label>
          <input id="email" type="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" />
        </div>
        {!isReset && (
          <div>
            <label className={labelClass} htmlFor="password">Mot de passe</label>
            <input id="password" type="password" className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}
        <button type="submit" className={`${buttonPrimary} w-full`} disabled={sending}>
          {sending ? "Patientez…" : isReset ? "Recevoir le lien" : "Se connecter"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => { setMode(isReset ? "login" : "reset"); setError(""); setInfo(""); }}
        className="mt-4 w-full text-center text-sm font-bold text-[#B8336A]"
      >
        {isReset ? "Retour à la connexion" : "Mot de passe oublié ?"}
      </button>
    </AuthFrame>
  );
}
