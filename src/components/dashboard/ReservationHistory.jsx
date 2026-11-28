"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "firebase/firestore";
import { useAuth } from "@/src/contexts/AuthContext";
import Badge from "@/src/components/dashboard/ui/Badge";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { db } from "@/src/lib/firebase";
import {
  REQUEST_STAGES,
  addDaysKey,
  followUpLabel,
  parisDayKey,
  relativeDays,
  requestFollowUp,
} from "@/src/lib/reservationCrm";

const ACTIVITY_LABELS = {
  call: "Appel",
  manualEmail: "Email envoyé hors dashboard",
  email: "Email envoyé",
  note: "Note interne",
  price: "Tarif",
  status: "Statut",
  followUp: "Relance",
  assign: "Suivi du dossier",
};

const CONTACT_LABELS = { call: "appel", manualEmail: "email", email: "email" };

const formatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris",
});

export function activityRef(reservationId) {
  return collection(db, COLLECTIONS.RESERVATIONS, reservationId, "activity");
}

export function operatorActivity(user, type, summary) {
  return {
    type, summary,
    actorUid: user.uid,
    actorEmail: user.email,
    createdAt: serverTimestamp(),
  };
}

export function operatorName(user) {
  return user?.displayName || user?.email || "";
}

/** "aujourd’hui", "demain" ou "le 4 mars". */
function followUpPhrase(key) {
  const label = followUpLabel(key);
  return label === "aujourd’hui" || label === "demain" ? label : `le ${label}`;
}

function ActivityItem({ event }) {
  const when = event.createdAt?.toDate?.();
  return (
    <li className={`crm-event is-${event.type || "other"}`}>
      <div className="crm-event-top">
        <strong>{ACTIVITY_LABELS[event.type] || "Activité"}</strong>
        {when && <time dateTime={when.toISOString()}>{formatter.format(when)}</time>}
      </div>
      <p className="crm-event-author">{event.actorName || event.actorEmail}</p>
      {event.subject && <p><strong>{event.subject}</strong></p>}
      {event.recipient && <p className="crm-event-author">À {event.recipient}</p>}
      {event.template && <p className="crm-event-author">Modèle {event.template}</p>}
      {!!event.attachments?.length && <p className="crm-event-author">Pièces jointes · {event.attachments.join(", ")}</p>}
      {event.summary && <p className="crm-event-summary">{event.summary}</p>}
      {event.html && <details>
        <summary>Voir le contenu de l’email</summary>
        <iframe title={event.subject || "Contenu de l’email"} sandbox=""
          srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' + event.html} />
      </details>}
    </li>
  );
}

/** Met à jour `crm` sur la réservation et ajoute une ligne au journal, en une seule écriture. */
async function writeCrm(item, user, crmFields, activity) {
  const batch = writeBatch(db);
  const updates = { updatedAt: serverTimestamp() };
  Object.entries(crmFields).forEach(([key, value]) => { updates[`crm.${key}`] = value; });
  batch.update(doc(db, COLLECTIONS.RESERVATIONS, item.id), updates);
  if (activity) batch.set(doc(activityRef(item.id)), operatorActivity(user, activity.type, activity.summary));
  await batch.commit();
}

function FollowUpCard({ item, followUp, onCrmChange }) {
  const { currentUser } = useAuth();
  const [date, setDate] = useState(followUp.followUp || "");
  const [note, setNote] = useState(followUp.followUpNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stage = REQUEST_STAGES[followUp.stage];
  const isMine = Boolean(followUp.ownerUid) && followUp.ownerUid === currentUser?.uid;

  useEffect(() => {
    setDate(followUp.followUp || "");
    setNote(followUp.followUpNote || "");
  }, [followUp.followUp, followUp.followUpNote]);

  async function apply(fields, activity) {
    setSaving(true);
    setError("");
    try {
      await writeCrm(item, currentUser, fields, activity);
      onCrmChange(fields);
    } catch {
      setError("Enregistrement impossible. Actualisez la fiche et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const takeOver = () => {
    const name = operatorName(currentUser);
    apply({ ownerUid: currentUser.uid, ownerName: name }, { type: "assign", summary: `Dossier suivi par ${name}` });
  };
  const release = () => apply({ ownerUid: "", ownerName: "" }, { type: "assign", summary: "Dossier sans responsable" });
  const plan = (event) => {
    event.preventDefault();
    if (!date) return;
    const summary = `Relance prévue ${followUpPhrase(date)}${note.trim() ? ` · ${note.trim()}` : ""}`;
    apply({ nextFollowUpAt: date, nextFollowUpNote: note.trim() }, { type: "followUp", summary });
  };
  const clear = () => apply({ nextFollowUpAt: "", nextFollowUpNote: "" }, { type: "followUp", summary: "Relance retirée" });

  return (
    <section className="crm-card crm-followup">
      <h2>Suivi du dossier</h2>
      <dl className="crm-facts">
        <div><dt>Étape</dt><dd><Badge label={stage.label} variant={stage.badge} /></dd></div>
        <div><dt>Demande reçue</dt><dd>{followUp.ageDays != null ? relativeDays(followUp.ageDays) : "—"}</dd></div>
        <div>
          <dt>Dernier contact</dt>
          <dd className={followUp.stale ? "crm-text-warning" : ""}>
            {followUp.lastContactMs
              ? `${relativeDays(followUp.daysSilent)} (${CONTACT_LABELS[followUp.lastContactType] || "échange"})`
              : "aucun"}
          </dd>
        </div>
        <div><dt>Suivi par</dt><dd>{followUp.ownerName || "personne"}</dd></div>
      </dl>
      <p className="crm-hint">{stage.hint}</p>
      <div className="dash-row-actions">
        {!isMine && <button type="button" className="dash-btn" disabled={saving} onClick={takeOver}>
          {followUp.ownerUid ? "Reprendre le dossier" : "Je suis ce dossier"}
        </button>}
        {followUp.ownerUid && <button type="button" className="dash-btn" disabled={saving} onClick={release}>Retirer le responsable</button>}
      </div>

      <h3>Prochaine relance</h3>
      {followUp.followUp ? (
        <p className={followUp.followUpLate ? "crm-text-danger" : followUp.followUpDue ? "crm-text-warning" : ""}>
          <strong>{followUp.followUpLate ? "En retard · " : ""}{followUpLabel(followUp.followUp)}</strong>
          {followUp.followUpNote && <> · {followUp.followUpNote}</>}
        </p>
      ) : <p className="dash-muted">Aucune relance prévue.</p>}
      <form className="crm-log-form" onSubmit={plan}>
        <div className="crm-quick-dates">
          {[["Demain", 1], ["Dans 3 j", 3], ["Dans 1 sem.", 7]].map(([label, days]) => (
            <button key={label} type="button" className="dash-btn" onClick={() => setDate(addDaysKey(days))}>{label}</button>
          ))}
        </div>
        <label>Date
          <input className="dash-input" type="date" value={date} min={parisDayKey()} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>À faire
          <input className="dash-input" type="text" value={note} maxLength={200} placeholder="Rappeler pour le dossier CAF, relancer le paiement…"
            onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="dash-row-actions">
          <button className="dash-btn dash-btn-primary" type="submit" disabled={saving || !date}>
            {followUp.followUp ? "Mettre à jour la relance" : "Planifier la relance"}
          </button>
          {followUp.followUp && <button className="dash-btn" type="button" disabled={saving} onClick={clear}>Retirer</button>}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function ReservationHistory({ item, onGoToEmail, onGoToTarif, onCrmChange }) {
  const { currentUser } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [visible, setVisible] = useState(20);
  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const followUp = requestFollowUp(item);
  const isContact = type === "call" || type === "manualEmail";
  const applyCrm = (patch) => onCrmChange?.(patch);

  useEffect(() => onSnapshot(query(activityRef(item.id), orderBy("createdAt", "desc"), limit(visible + 1)), (snap) => {
    setSnapshot({ events: snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })) });
  }, () => setSnapshot({ error: true })), [item.id, visible]);

  const events = (snapshot?.events || []).filter((event) => event.delivery == null || event.delivery === "sent");

  async function save(event) {
    event.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    // Un échange avec la famille met à jour le dernier contact. Une relance échue est
    // considérée comme faite, sauf si une nouvelle date est donnée.
    const fields = {};
    if (isContact) {
      fields.lastContactAt = serverTimestamp();
      fields.lastContactType = type;
      if (nextDate) {
        fields.nextFollowUpAt = nextDate;
        fields.nextFollowUpNote = "";
      } else if (followUp.followUpDue) {
        fields.nextFollowUpAt = "";
        fields.nextFollowUpNote = "";
      }
    }
    try {
      const nextLabel = isContact && nextDate ? `\nProchaine relance ${followUpPhrase(nextDate)}` : "";
      await writeCrm(item, currentUser, fields, { type, summary: summary.trim() + nextLabel });
      applyCrm({ ...fields, ...(isContact ? { lastContactAt: new Date().toISOString() } : {}) });
      setSummary("");
      setNextDate("");
      setNotice("Échange ajouté à l’historique.");
    } catch {
      setError("Impossible d’enregistrer l’activité. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crm-workspace">
      <section className="crm-card">
        <h2>Historique des échanges</h2>
        {!snapshot && <p className="dash-muted">Chargement…</p>}
        {snapshot?.error && <p role="alert">L’historique est indisponible.</p>}
        {snapshot?.events && !events.length && <p className="dash-muted">Aucune activité enregistrée.</p>}
        <ol className="crm-timeline">{events.slice(0, visible).map((event) => <ActivityItem key={event.id} event={event} />)}</ol>
        {snapshot?.events?.length > visible && <button type="button" className="dash-btn" onClick={() => setVisible((count) => count + 20)}>Voir les activités précédentes</button>}
      </section>

      <div className="crm-sidebar">
        <section className="crm-card">
          <h2>Contact famille</h2>
          {item.email !== "—" && <p><a href={"mailto:" + item.email}>{item.email}</a></p>}
          {item.phone !== "—" && <p><a href={"tel:" + item.phone.replace(/[^+0-9]/g, "")}>{item.phone}</a></p>}
          {item.message && <p className="crm-family-message">« {item.message} »</p>}
          <div className="dash-row-actions">
            <button className="dash-btn dash-btn-primary" type="button" onClick={onGoToEmail}>Écrire un email</button>
            <button className="dash-btn" type="button" onClick={onGoToTarif}>{item.finalPrice > 0 ? "Voir le tarif" : "Définir le tarif"}</button>
          </div>
        </section>

        <FollowUpCard item={item} followUp={followUp} onCrmChange={applyCrm} />

        <section className="crm-card">
          <h2>Consigner un échange</h2>
          <form className="crm-log-form" onSubmit={save}>
            <label>Type d’activité
              <select className="dash-input" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="call">Appel</option>
                <option value="manualEmail">Email envoyé hors dashboard</option>
                <option value="note">Note interne</option>
              </select>
            </label>
            <label>Compte rendu
              <textarea className="dash-input" value={summary} maxLength={3900} rows={4} required
                onChange={(event) => setSummary(event.target.value)}
                placeholder={type === "call" ? "Personne jointe, résultat ou prochaine action…" : type === "manualEmail" ? "Destinataire, objet et contenu de l’email…" : "Information pour l’équipe…"} />
            </label>
            {isContact && (
              <label>Prochaine relance (facultatif)
                <input className="dash-input" type="date" value={nextDate} min={parisDayKey()} onChange={(event) => setNextDate(event.target.value)} />
                {followUp.followUpDue && !nextDate && <small className="dash-muted">La relance prévue {followUpPhrase(followUp.followUp)} sera marquée comme faite.</small>}
              </label>
            )}
            <button className="dash-btn dash-btn-primary" disabled={saving || !summary.trim()} type="submit">
              {saving ? "Enregistrement…" : "Ajouter à l’historique"}
            </button>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
