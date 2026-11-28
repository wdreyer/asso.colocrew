"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/src/contexts/AuthContext";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { db } from "@/src/lib/firebase";

const ACTIVITY_LABELS = {
  call: "Appel",
  manualEmail: "Email envoyé hors dashboard",
  email: "Email envoyé",
  note: "Note interne",
  price: "Tarif",
  status: "Statut",
};

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

function ActivityItem({ event }) {
  const when = event.createdAt?.toDate?.();
  return (
    <li className="crm-event">
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

export default function ReservationHistory({ item, onGoToEmail, onGoToTarif }) {
  const { currentUser } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [visible, setVisible] = useState(20);
  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    try {
      await setDoc(doc(activityRef(item.id)), operatorActivity(currentUser, type, summary.trim()));
      setSummary("");
      setNotice("Activité ajoutée.");
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
          {item.email !== "—" && <p>{item.email}</p>}
          {item.phone !== "—" && <p><a href={"tel:" + item.phone.replace(/[^+0-9]/g, "")}>{item.phone}</a></p>}
          <div className="dash-row-actions">
            <button className="dash-btn dash-btn-primary" type="button" onClick={onGoToEmail}>Écrire un email</button>
            <button className="dash-btn" type="button" onClick={onGoToTarif}>{item.finalPrice > 0 ? "Voir le tarif" : "Définir le tarif"}</button>
          </div>
        </section>
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
              <textarea className="dash-input" value={summary} maxLength={4000} rows={4} required
                onChange={(event) => setSummary(event.target.value)}
                placeholder={type === "call" ? "Personne jointe, résultat ou prochaine action…" : type === "manualEmail" ? "Destinataire, objet et contenu de l’email…" : "Information pour l’équipe…"} />
            </label>
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
