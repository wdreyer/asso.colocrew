"use client";

import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaArrowRight, FaCheck } from "react-icons/fa";
import {
  HELLOASSO_MEMBERSHIP_URL,
  VOLUNTEER_AVAILABILITY,
  VOLUNTEER_INTEREST_GROUPS,
  validateVolunteer,
} from "@/src/lib/volunteers";
import styles from "./edito.module.css";

export const VOLUNTEER_PICK_EVENT = "colocrew:volunteer-pick";

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", interests: [], availability: "", message: "", website: "" };

const STEPS = [
  { title: "Toi", fields: ["firstName", "lastName", "phone", "email"] },
  { title: "Ton aide", fields: ["interests", "availability"] },
];

const CONTACT_FIELDS = [
  { name: "firstName", label: "Prénom", autoComplete: "given-name" },
  { name: "lastName", label: "Nom", autoComplete: "family-name" },
  { name: "phone", label: "Téléphone", autoComplete: "tel", type: "tel", inputMode: "tel" },
  { name: "email", label: "Email", autoComplete: "email", type: "email" },
];

/** Errors of one step only, from the shared validation. */
function stepErrors(form, step) {
  const { errors = {} } = validateVolunteer(form);
  return Object.fromEntries(Object.entries(errors).filter(([field]) => STEPS[step].fields.includes(field)));
}

export default function VolunteerForm() {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [serverError, setServerError] = useState("");
  const cardRef = useRef(null);

  // Les boutons « Ça m'intéresse » plus bas dans la page pré-cochent une mission.
  useEffect(() => {
    const onPick = (event) => {
      const keys = event.detail?.interests || [];
      setForm((current) => ({ ...current, interests: [...new Set([...current.interests, ...keys])] }));
      setErrors((current) => ({ ...current, interests: undefined }));
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => cardRef.current?.querySelector("input")?.focus({ preventScroll: true }), 500);
    };
    window.addEventListener(VOLUNTEER_PICK_EVENT, onPick);
    return () => window.removeEventListener(VOLUNTEER_PICK_EVENT, onPick);
  }, []);

  const clearError = (field) => {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    clearError(field);
  };

  const toggleInterest = (key) => {
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(key)
        ? current.interests.filter((item) => item !== key)
        : [...current.interests, key],
    }));
    clearError("interests");
  };

  const pickAvailability = (key) => {
    setForm((current) => ({ ...current, availability: key }));
    clearError("availability");
  };

  const next = (event) => {
    event.preventDefault();
    const found = stepErrors(form, 0);
    setErrors(found);
    if (Object.keys(found).length) {
      cardRef.current?.querySelector(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setStep(1);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = stepErrors(form, 1);
    setErrors(found);
    if (Object.keys(found).length) return;
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
        if (payload.fields) {
          setErrors(payload.fields);
          if (Object.keys(payload.fields).some((field) => STEPS[0].fields.includes(field))) setStep(0);
        }
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
        <div>
          <h2>Merci {form.firstName}, c&apos;est envoyé !</h2>
          <p>Quelqu&apos;un de l&apos;équipe t&apos;appelle ou t&apos;écrit dans les prochains jours pour en parler.</p>
        </div>
        <div className={styles.doneLinks}>
          <a href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">Adhérer à l&apos;association <FaArrowRight /></a>
          <a href="/merch">Commander un tee-shirt <FaArrowRight /></a>
        </div>
      </div>
    );
  }

  return (
    <form ref={cardRef} id="rejoindre" className={styles.formCard} onSubmit={step === 0 ? next : submit} noValidate>
      <div className={styles.formTop}>
        <div>
          <span className={styles.formBadge}>Bénévolat · 2 minutes</span>
          <h2>Rejoins l&apos;équipe</h2>
        </div>
        <ol className={styles.steps} aria-label="Étapes">
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              className={`${styles.stepItem} ${index === step ? styles.stepCurrent : ""} ${index < step ? styles.stepDone : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              <span className={styles.stepDot}>{index < step ? <FaCheck /> : index + 1}</span>
              {item.title}
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.progress} aria-hidden="true"><span style={{ width: step === 0 ? "50%" : "100%" }} /></div>

      {step === 0 ? (
        <div className={styles.stepPane} key="step-0">
          <p className={styles.stepIntro}>Pour qu&apos;on puisse te recontacter. <span className={styles.required}>*</span> Tous les champs sont obligatoires.</p>
          <div className={styles.contactRow}>
            {CONTACT_FIELDS.map((field) => (
              <label key={field.name} className={`${styles.field} ${errors[field.name] ? styles.fieldError : ""}`}>
                <span>{field.label} <span className={styles.required}>*</span></span>
                <input
                  name={field.name}
                  type={field.type || "text"}
                  inputMode={field.inputMode}
                  autoComplete={field.autoComplete}
                  value={form[field.name]}
                  onChange={set(field.name)}
                  aria-invalid={Boolean(errors[field.name])}
                />
                {errors[field.name] ? <small>{errors[field.name]}</small> : null}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className={`${styles.stepPane} ${styles.helpRow}`} key="step-1">
          <fieldset className={`${styles.question} ${errors.interests ? styles.questionError : ""}`}>
            <legend>Tu es intéressé·e par <span className={styles.required}>*</span></legend>
            <p className={styles.questionHint}>Plusieurs réponses possibles.</p>
            <div className={styles.optionGrid}>
              {VOLUNTEER_INTEREST_GROUPS.flatMap((group) => group.options.map((option) => {
                const active = form.interests.includes(option.key);
                const label = group.options.length > 1 ? `${option.label} de séjour` : group.label;
                const hint = group.options.length > 1 ? "" : group.hint;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    className={`${styles.option} ${active ? styles.optionActive : ""}`}
                    onClick={() => toggleInterest(option.key)}
                  >
                    <span className={styles.checkbox} aria-hidden="true">{active ? <FaCheck /> : null}</span>
                    <span className={styles.optionText}>
                      <strong>{label}</strong>
                      {hint ? <span>{hint}</span> : null}
                    </span>
                  </button>
                );
              }))}
            </div>
            {errors.interests ? <small className={styles.questionMessage}>{errors.interests}</small> : null}
          </fieldset>

          <div className={styles.helpSide}>
            <fieldset className={`${styles.question} ${errors.availability ? styles.questionError : ""}`}>
              <legend>Ta disponibilité <span className={styles.required}>*</span></legend>
              <div className={styles.radioList} role="radiogroup">
                {VOLUNTEER_AVAILABILITY.map((option) => {
                  const active = form.availability === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.option} ${active ? styles.optionActive : ""}`}
                      onClick={() => pickAvailability(option.key)}
                    >
                      <span className={styles.radio} aria-hidden="true" />
                      <span className={styles.optionText}><strong>{option.label}</strong></span>
                    </button>
                  );
                })}
              </div>
              {errors.availability ? <small className={styles.questionMessage}>{errors.availability}</small> : null}
            </fieldset>

            <label className={styles.field}>
              <span>Un mot pour nous <em>(facultatif)</em></span>
              <textarea rows={2} value={form.message} onChange={set("message")} placeholder="Ton parcours, une idée, une question…" />
            </label>
          </div>
        </div>
      )}

      <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={form.website} onChange={set("website")} />

      {state === "error" ? <p className={styles.serverError}>{serverError}</p> : null}

      <div className={styles.formFooter}>
        <p className={styles.privacy}>Tes informations servent uniquement à te recontacter. Elles ne sont jamais partagées.</p>
        <div className={styles.formButtons}>
          {step === 1 ? (
            <button type="button" className={styles.back} onClick={() => setStep(0)}>
              <FaArrowLeft /> Retour
            </button>
          ) : null}
          <button type="submit" className={styles.submit} disabled={state === "sending"}>
            {step === 0 ? <>Suivant <FaArrowRight /></> : state === "sending" ? "Envoi…" : <>Envoyer <FaArrowRight /></>}
          </button>
        </div>
      </div>
    </form>
  );
}
