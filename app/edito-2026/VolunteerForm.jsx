"use client";

import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaArrowRight, FaCheck } from "react-icons/fa";
import {
  HELLOASSO_MEMBERSHIP_URL,
  VOLUNTEER_AVAILABILITY,
  validateVolunteer,
} from "@/src/lib/volunteers";
import styles from "./edito.module.css";

export const VOLUNTEER_PICK_EVENT = "colocrew:volunteer-pick";

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", interests: [], availability: "", message: "", website: "" };

const STEPS = [
  { title: "Coordonnées", fields: ["firstName", "lastName", "phone", "email"] },
  { title: "Participation", fields: ["interests", "availability"] },
];

const PARTICIPATION_GROUPS = [
  { title: "Les séjours", options: [
    { key: "conception", label: "Préparer un séjour", hint: "Programme, lieu et organisation" },
    { key: "direction", label: "Diriger un séjour", hint: "Équipe et organisation sur place" },
    { key: "animation", label: "Animer un séjour", hint: "Activités et vie quotidienne" },
  ] },
  { title: "La vie de l’association", options: [
    { key: "inscriptions", label: "Suivre les inscriptions", hint: "Familles et dossiers" },
    { key: "administratif", label: "Aider à l’administratif", hint: "Documents et subventions" },
    { key: "ca", label: "Participer au CA", hint: "Décisions et suivi de l’association" },
  ] },
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
      setServerError(error.message || "Envoi impossible. Veuillez réessayer dans un instant.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div ref={cardRef} id="rejoindre" className={`${styles.formCard} ${styles.formDone}`}>
        <span className={styles.doneIcon} aria-hidden="true"><FaCheck /></span>
        <div>
          <h2>Ton message a été envoyé</h2>
          <p>L’équipe te recontactera pour échanger sur ta participation.</p>
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
          <h2>Le projet ColoCrew te parle ?</h2>
          <p className={styles.formDescription}>Si tu souhaites y participer, indique-nous ce qui t&apos;intéresse et tes disponibilités.</p>
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
          <p className={styles.stepIntro}>Indique tes coordonnées pour que nous puissions te recontacter. <span className={styles.required}>*</span> Tous les champs sont obligatoires.</p>
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
        <div className={styles.stepPane} key="step-1">
          <fieldset className={styles.interestsFieldset} aria-describedby="interests-hint interests-error">
            <legend>Qu’est-ce qui t’intéresse ? <span className={styles.required}>*</span></legend>
            <p id="interests-hint" className={styles.questionHint}>Tu peux choisir plusieurs domaines. Nous en discuterons ensuite.</p>
            {PARTICIPATION_GROUPS.map((group) => (
              <div className={styles.interestGroup} key={group.title}>
                <h3>{group.title}</h3>
                <div className={styles.interestChoices}>
                  {group.options.map((option) => (
                    <label className={styles.interestChoice} key={option.key}>
                      <input type="checkbox" name="interests" value={option.key}
                        checked={form.interests.includes(option.key)} onChange={() => toggleInterest(option.key)}
                        aria-invalid={Boolean(errors.interests)} />
                      <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p id="interests-error" className={styles.questionMessage} aria-live="polite">{errors.interests || ""}</p>
          </fieldset>

          <div className={styles.participationDetails}>
            <label className={styles.field}>
              <span>Quel temps pourrais-tu y consacrer ? <span className={styles.required}>*</span></span>
              <select name="availability" value={form.availability} onChange={set("availability")}
                aria-invalid={Boolean(errors.availability)} aria-describedby="availability-hint availability-error">
                <option value="" disabled>Choisir une disponibilité</option>
                {VOLUNTEER_AVAILABILITY.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <span id="availability-hint" className={styles.fieldHint}>Une estimation suffit. Tu peux préciser tes contraintes dans le message.</span>
              <small id="availability-error" aria-live="polite">{errors.availability || ""}</small>
            </label>
            <label className={styles.field}>
              <span>Une précision à ajouter ? <em>(facultatif)</em></span>
              <textarea name="message" rows={3} maxLength={1500} value={form.message} onChange={set("message")}
                placeholder="Ton expérience, tes disponibilités ou une question…" />
            </label>
          </div>
        </div>
      )}

      <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={form.website} onChange={set("website")} />

      {state === "error" ? <p className={styles.serverError}>{serverError}</p> : null}

      <div className={styles.formFooter}>
        <p className={styles.privacy}>Tes coordonnées servent à te recontacter au sujet de ta participation.</p>
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
