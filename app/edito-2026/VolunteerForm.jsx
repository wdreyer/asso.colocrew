"use client";
import { EditableText, useEditableText } from "./InlineEditor";


import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaArrowRight, FaCheck } from "react-icons/fa";
import { HELLOASSO_MEMBERSHIP_URL, VOLUNTEER_AVAILABILITY, validateVolunteer } from "@/src/lib/volunteers";
import styles from "./edito.module.css";
import { EDITO_2026 } from "@/src/content/edito2026";
export const VOLUNTEER_PICK_EVENT = "colocrew:volunteer-pick";
const EMPTY = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  interests: [],
  availability: "",
  message: "",
  website: ""
};
const STEPS = [{
  title: "Coordonnées",
  fields: ["firstName", "lastName", "phone", "email"]
}, {
  title: "Participation",
  fields: ["interests", "availability"]
}];
// Reuse the same source strings as the mission descriptions. Inline edits share
// their text keys, so changes made in the missions also appear in the form.
const stayMission = EDITO_2026.missions.find(mission => mission.id === "sejours");
const PARTICIPATION_GROUPS = [{
  title: stayMission.title,
  options: stayMission.interests.map((key, index) => ({
    key,
    label: { conception: "Préparer un séjour", direction: "Diriger un séjour", animation: "Animer un séjour" }[key],
    hint: stayMission.points[index],
  })),
}, {
  title: "La vie de l’association",
  options: EDITO_2026.missions.filter(mission => mission.id !== "sejours").map(mission => ({
    key: mission.interests[0],
    label: mission.title,
    hint: mission.lead,
  })),
}];
const CONTACT_FIELDS = [{
  name: "firstName",
  label: "Prénom",
  autoComplete: "given-name"
}, {
  name: "lastName",
  label: "Nom",
  autoComplete: "family-name"
}, {
  name: "phone",
  label: "Téléphone",
  autoComplete: "tel",
  type: "tel",
  inputMode: "tel"
}, {
  name: "email",
  label: "Email",
  autoComplete: "email",
  type: "email"
}];

/** Errors of one step only, from the shared validation. */
function stepErrors(form, step) {
  const {
    errors = {}
  } = validateVolunteer(form);
  return Object.fromEntries(Object.entries(errors).filter(([field]) => STEPS[step].fields.includes(field)));
}
export default function VolunteerForm() {
  const placeholder = useEditableText("Ton expérience, tes disponibilités ou une question…").value;
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [serverError, setServerError] = useState("");
  const cardRef = useRef(null);

  // Les boutons « Ça m'intéresse » plus bas dans la page pré-cochent une mission.
  useEffect(() => {
    const onPick = event => {
      const keys = event.detail?.interests || [];
      setForm(current => ({
        ...current,
        interests: [...new Set([...current.interests, ...keys])]
      }));
      setErrors(current => ({
        ...current,
        interests: undefined
      }));
      cardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      window.setTimeout(() => cardRef.current?.querySelector("input")?.focus({
        preventScroll: true
      }), 500);
    };
    window.addEventListener(VOLUNTEER_PICK_EVENT, onPick);
    return () => window.removeEventListener(VOLUNTEER_PICK_EVENT, onPick);
  }, []);
  const clearError = field => {
    if (errors[field]) setErrors(current => ({
      ...current,
      [field]: undefined
    }));
  };
  const set = field => event => {
    const value = event.target.value;
    setForm(current => ({
      ...current,
      [field]: value
    }));
    clearError(field);
  };
  const toggleInterest = key => {
    setForm(current => ({
      ...current,
      interests: current.interests.includes(key) ? current.interests.filter(item => item !== key) : [...current.interests, key]
    }));
    clearError("interests");
  };
  const next = event => {
    event.preventDefault();
    const found = stepErrors(form, 0);
    setErrors(found);
    if (Object.keys(found).length) {
      cardRef.current?.querySelector(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setStep(1);
    cardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };
  const submit = async event => {
    event.preventDefault();
    const found = stepErrors(form, 1);
    setErrors(found);
    if (Object.keys(found).length) return;
    setState("sending");
    setServerError("");
    try {
      const response = await fetch("/api/benevoles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.fields) {
          setErrors(payload.fields);
          if (Object.keys(payload.fields).some(field => STEPS[0].fields.includes(field))) setStep(0);
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
    return <div ref={cardRef} id="rejoindre" className={`${styles.formCard} ${styles.formDone}`}>
        <span className={styles.doneIcon} aria-hidden="true"><FaCheck /></span>
        <div>
          <h2><EditableText>{"Ton message a \xE9t\xE9 envoy\xE9"}</EditableText></h2>
          <p><EditableText>{"L\u2019\xE9quipe te recontactera pour \xE9changer sur ta participation."}</EditableText></p>
        </div>
        <div className={styles.doneLinks}>
          <a href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer"><EditableText>{"Adh\xE9rer \xE0 l'association"}</EditableText><FaArrowRight /></a>
          <a href="/merch"><EditableText>{"Commander un tee-shirt"}</EditableText><FaArrowRight /></a>
        </div>
      </div>;
  }
  return <form ref={cardRef} id="rejoindre" className={styles.formCard} onSubmit={step === 0 ? next : submit} noValidate>
      <div className={styles.formTop}>
        <div>
          <h2><EditableText>{"Le projet ColoCrew te parle ?"}</EditableText></h2>
          <p className={styles.formDescription}><EditableText>{"Si tu souhaites y participer, indique-nous ce qui t'int\xE9resse et tes disponibilit\xE9s."}</EditableText></p>
        </div>
        <ol className={styles.steps} aria-label="Étapes">
          {STEPS.map((item, index) => <li key={item.title} className={`${styles.stepItem} ${index === step ? styles.stepCurrent : ""} ${index < step ? styles.stepDone : ""}`} aria-current={index === step ? "step" : undefined}>
              <span className={styles.stepDot}>{index < step ? <FaCheck /> : index + 1}</span>
              <EditableText>{item.title}</EditableText>
            </li>)}
        </ol>
      </div>
      <div className={styles.progress} aria-hidden="true"><span style={{
        width: step === 0 ? "50%" : "100%"
      }} /></div>

      {step === 0 ? <div className={styles.stepPane} key="step-0">
          <p className={styles.stepIntro}><EditableText>{"Indique tes coordonn\xE9es pour que nous puissions te recontacter."}</EditableText>{" "}<span className={styles.required}>*</span>{" "}<EditableText>{"Tous les champs sont obligatoires."}</EditableText></p>
          <div className={styles.contactRow}>
            {CONTACT_FIELDS.map(field => <label key={field.name} className={`${styles.field} ${errors[field.name] ? styles.fieldError : ""}`}>
                <span><EditableText>{field.label}</EditableText> <span className={styles.required}>*</span></span>
                <input name={field.name} type={field.type || "text"} inputMode={field.inputMode} autoComplete={field.autoComplete} value={form[field.name]} onChange={set(field.name)} aria-invalid={Boolean(errors[field.name])} />
                {errors[field.name] ? <small><EditableText>{errors[field.name]}</EditableText></small> : null}
              </label>)}
          </div>
        </div> : <div className={styles.stepPane} key="step-1">
          <fieldset className={styles.interestsFieldset} aria-describedby="interests-hint interests-error">
            <legend><EditableText>{"Qu\u2019est-ce qui t\u2019int\xE9resse ?"}</EditableText>{" "}<span className={styles.required}>*</span></legend>
            <p id="interests-hint" className={styles.questionHint}><EditableText>{"Tu peux choisir plusieurs domaines. Nous en discuterons ensuite."}</EditableText></p>
            {PARTICIPATION_GROUPS.map(group => <div className={styles.interestGroup} key={group.title}>
                <h3><EditableText>{group.title}</EditableText></h3>
                <div className={styles.interestChoices}>
                  {group.options.map(option => <label className={styles.interestChoice} key={option.key}>
                      <input type="checkbox" name="interests" value={option.key} checked={form.interests.includes(option.key)} onChange={() => toggleInterest(option.key)} aria-invalid={Boolean(errors.interests)} />
                      <span><strong><EditableText>{option.label}</EditableText></strong><small><EditableText>{option.hint}</EditableText></small></span>
                    </label>)}
                </div>
              </div>)}
            <p id="interests-error" className={styles.questionMessage} aria-live="polite"><EditableText>{errors.interests || ""}</EditableText></p>
          </fieldset>

          <div className={styles.participationDetails}>
            <label className={styles.field}>
              <span><EditableText>{"Quel temps pourrais-tu y consacrer ?"}</EditableText>{" "}<span className={styles.required}>*</span></span>
              <select name="availability" value={form.availability} onChange={set("availability")} aria-invalid={Boolean(errors.availability)} aria-describedby="availability-hint availability-error">
                <EditableText as="option" value="" disabled>{"Choisir une disponibilité"}</EditableText>
                {VOLUNTEER_AVAILABILITY.map(option => <EditableText as="option" key={option.key} value={option.key}>{option.label}</EditableText>)}
              </select>
              <span id="availability-hint" className={styles.fieldHint}><EditableText>{"Une estimation suffit. Tu peux pr\xE9ciser tes contraintes dans le message."}</EditableText></span>
              <small id="availability-error" aria-live="polite"><EditableText>{errors.availability || ""}</EditableText></small>
            </label>
            <label className={styles.field}>
              <span><EditableText>{"Une pr\xE9cision \xE0 ajouter ?"}</EditableText>{" "}<em><EditableText>{"(facultatif)"}</EditableText></em></span>
              <textarea name="message" rows={3} maxLength={1500} value={form.message} onChange={set("message")} placeholder={placeholder} />
            </label>
          </div>
        </div>}

      <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={form.website} onChange={set("website")} />

      {state === "error" ? <p className={styles.serverError}>{serverError}</p> : null}

      <div className={styles.formFooter}>
        <p className={styles.privacy}><EditableText>{"Tes coordonn\xE9es servent \xE0 te recontacter au sujet de ta participation."}</EditableText></p>
        <div className={styles.formButtons}>
          {step === 1 ? <button type="button" className={styles.back} onClick={() => setStep(0)}>
              <FaArrowLeft /><EditableText>{"Retour"}</EditableText></button> : null}
          <button type="submit" className={styles.submit} disabled={state === "sending"}>
            {step === 0 ? <><EditableText>{"Suivant"}</EditableText> <FaArrowRight /></> : state === "sending" ? "Envoi…" : <><EditableText>{"Envoyer"}</EditableText> <FaArrowRight /></>}
          </button>
        </div>
      </div>
    </form>;
}
