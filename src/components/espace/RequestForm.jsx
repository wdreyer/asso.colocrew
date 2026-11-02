"use client";

import { useState } from "react";
import { REQUESTED_ROLES, staffAuthErrorMessage } from "@/src/contexts/StaffAuthContext";
import { Notice, buttonPrimary, inputClass, labelClass } from "./ui";

/**
 * Account request form. With `withPassword` it creates the Firebase account too (sign-up page);
 * without, it only completes the request of an already signed-in user.
 */
export default function RequestForm({ withPassword = false, defaultEmail = "", onSubmit, submitLabel }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: defaultEmail, phone: "", requestedRole: "animateur", password: "", confirm: "",
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) return setError("Indiquez votre prénom et votre nom.");
    if (form.phone.replace(/\D/g, "").length < 8) return setError("Indiquez un numéro de téléphone joignable.");
    if (withPassword) {
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Adresse e-mail invalide.");
      if (form.password.length < 8) return setError("Mot de passe trop court (8 caractères minimum).");
      if (form.password !== form.confirm) return setError("Les deux mots de passe ne correspondent pas.");
    }
    setSending(true);
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(staffAuthErrorMessage(submitError));
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="firstName">Prénom</label>
          <input id="firstName" className={inputClass} value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="lastName">Nom</label>
          <input id="lastName" className={inputClass} value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
        </div>
      </div>
      {withPassword && (
        <div>
          <label className={labelClass} htmlFor="email">E-mail</label>
          <input id="email" type="email" className={inputClass} value={form.email} onChange={set("email")} autoComplete="email" inputMode="email" />
        </div>
      )}
      <div>
        <label className={labelClass} htmlFor="phone">Téléphone</label>
        <input id="phone" type="tel" className={inputClass} value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" />
      </div>
      <div>
        <label className={labelClass} htmlFor="requestedRole">Poste souhaité</label>
        <select id="requestedRole" className={inputClass} value={form.requestedRole} onChange={set("requestedRole")}>
          {REQUESTED_ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
        </select>
      </div>
      {withPassword && (
        <>
          <div>
            <label className={labelClass} htmlFor="password">Mot de passe</label>
            <input id="password" type="password" className={inputClass} value={form.password} onChange={set("password")} autoComplete="new-password" />
            <p className="mt-1 text-xs text-[#8a7b99]">8 caractères minimum.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="confirm">Confirmer le mot de passe</label>
            <input id="confirm" type="password" className={inputClass} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          </div>
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <button type="submit" className={`${buttonPrimary} w-full`} disabled={sending}>
        {sending ? "Envoi…" : submitLabel}
      </button>
    </form>
  );
}
