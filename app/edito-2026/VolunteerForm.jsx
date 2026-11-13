"use client";

import { useEffect, useRef, useState } from "react";
import { FaArrowRight, FaCheck } from "react-icons/fa";
import {
  HELLOASSO_MEMBERSHIP_URL,
  VOLUNTEER_AVAILABILITY,
  VOLUNTEER_INTEREST_GROUPS,
  validateVolunteer,
} from "@/src/lib/volunteers";
import styles from "./edito.module.css";

export const VOLUNTEER_PICK_EVENT = "colocrew:volunteer-pick";

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", interests: [], availability: "", message: "", website: "" };

export default function VolunteerForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [showMessage, setShowMessage] = useState(false);
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [serverError, setServerError] = useState("");
  const cardRef = useRef(null);

  // Les boutons « Ça m'intéresse » plus bas dans la page pré-cochent une mission.
  useEffect(() => {
    const onPick = (event) => {
      const keys = event.detail?.interests || [];
      setForm((current) => ({ ...current, interests: [...new Set([...current.interests, ...keys])] }));
      setErrors((current) => ({ ...current, interests: undefined }));
      setState((current) => (current === "done" ? current : "idle"));
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => cardRef.current?.querySelector("input[name='firstName']")?.focus({ preventScroll: true }), 500);
    };
    window.addEventListener(VOLUNTEER_PICK_EVENT, onPick);
    return () => window.removeEventListener(VOLUNTEER_PICK_EVENT, onPick);
  }, []);

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const toggleInterest = (key) => {
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(key)
        ? current.interests.filter((item) => item !== key)
        : [...current.interests, key],
    }));
    if (errors.interests) setErrors((current) => ({ ...current, interests: undefined }));
  };

  const pickAvailability = (key) => {
    setForm((current) => ({ ...current, availability: key }));
    if (errors.availability) setErrors((current) => ({ ...current, availability: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const check = validateVolunteer(form);
    if (check.errors) {
      setErrors(check.errors);
      return;
    }
    setState("sending");
    setServerError("");
    try {
      const response = await fetch("/api/benevoles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.fields) setErrors(payload.fields);
        throw new Error(payload.error || "Envoi impossible.");
      }
      setState("done");
    } catch (error) {
      setServerError(error.message || "Envoi impossible. Réessaie dans un instant.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div ref={cardRef} id="rejoindre" className={`${styles.formCard} ${styles.formDone}`}>
        <span className={styles.doneIcon} aria-hidden="true"><FaCheck /></span>
        <h2>Merci {form.firstName} !</h2>
        <p>On a bien reçu ta proposition. Quelqu&apos;un de l&apos;équipe t&apos;appelle ou t&apos;écrit dans les prochains jours pour en parler.</p>
        <div className={styles.doneLinks}>
          <a href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">Adhérer à l&apos;association <FaArrowRight /></a>
          <a href="/merch">Commander un tee-shirt <FaArrowRight /></a>
        </div>
      </div>
    );
  }

  const fieldClass = (field) => `${styles.field} ${errors[field] ? styles.fieldError : ""}`;

  return (
    <form ref={cardRef} id="rejoindre" className={styles.formCard} onSubmit={submit} noValidate>
      <div className={styles.formHead}>
        <span className={styles.formBadge}>Bénévolat</span>
        <h2>Rejoins l&apos;équipe</h2>
        <p>Deux minutes pour remplir, et on te rappelle pour en parler.</p>
      </div>

      <div className={styles.fieldGrid}>
        <label className={fieldClass("firstName")}>
          <span>Prénom</span>
          <input name="firstName" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} />
          {errors.firstName ? <small>{errors.firstName}</small> : null}
        </label>
        <label className={fieldClass("lastName")}>
          <span>Nom</span>
          <input name="lastName" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} />
          {errors.lastName ? <small>{errors.lastName}</small> : null}
        </label>
        <label className={fieldClass("phone")}>
          <span>Téléphone</span>
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
          {errors.phone ? <small>{errors.phone}</small> : null}
        </label>
        <label className={fieldClass("email")}>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          {errors.email ? <small>{errors.email}</small> : null}
        </label>
      </div>

      <fieldset className={`${styles.choiceBlock} ${errors.interests ? styles.choiceError : ""}`}>
        <legend>Tu es intéressé·e par</legend>
        <div className={styles.interestList}>
          {VOLUNTEER_INTEREST_GROUPS.map((group) => (
            group.options.length > 1 ? (
              <div key={group.key} className={styles.interestGroup}>
                <div className={styles.interestGroupHead}>
                  <strong>{group.label}</strong>
                  <span>{group.hint}</span>
                </div>
                <div className={styles.chipRow}>
                  {group.options.map((option) => {
                    const active = form.interests.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={active}
                        className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                        onClick={() => toggleInterest(option.key)}
                      >
                        <span className={styles.check} aria-hidden="true">{active ? <FaCheck /> : null}</span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              group.options.map((option) => {
                const active = form.interests.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    className={`${styles.interestRow} ${active ? styles.interestRowActive : ""}`}
                    onClick={() => toggleInterest(option.key)}
                  >
                    <span className={styles.check} aria-hidden="true">{active ? <FaCheck /> : null}</span>
                    <span className={styles.interestText}>
                      <strong>{group.label}</strong>
                      <span>{group.hint}</span>
                    </span>
                  </button>
                );
              })
            )
          ))}
        </div>
        {errors.interests ? <small className={styles.choiceMessage}>{errors.interests}</small> : null}
      </fieldset>

      <fieldset className={`${styles.choiceBlock} ${errors.availability ? styles.choiceError : ""}`}>
        <legend>Ta disponibilité</legend>
        <div className={styles.segment} role="radiogroup">
          {VOLUNTEER_AVAILABILITY.map((option) => {
            const active = form.availability === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.segmentItem} ${active ? styles.segmentActive : ""}`}
                onClick={() => pickAvailability(option.key)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {errors.availability ? <small className={styles.choiceMessage}>{errors.availability}</small> : null}
      </fieldset>

      {showMessage ? (
        <label className={styles.field}>
          <span>Un mot pour nous <em>(facultatif)</em></span>
          <textarea rows={3} value={form.message} onChange={set("message")} placeholder="Ton parcours, une idée, une question…" />
        </label>
      ) : (
        <button type="button" className={styles.addMessage} onClick={() => setShowMessage(true)}>+ Ajouter un mot (facultatif)</button>
      )}

      <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={form.website} onChange={set("website")} />

      {state === "error" ? <p className={styles.serverError}>{serverError}</p> : null}

      <button type="submit" className={styles.submit} disabled={state === "sending"}>
        {state === "sending" ? "Envoi…" : <>Je me propose <FaArrowRight /></>}
      </button>
      <p className={styles.privacy}>Tes informations servent uniquement à te recontacter. Elles ne sont jamais partagées.</p>
    </form>
  );
}
