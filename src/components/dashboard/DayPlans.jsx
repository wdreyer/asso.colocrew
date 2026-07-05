"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Modal from "@/src/components/dashboard/ui/Modal";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  DAY_PLAN_SECTIONS,
  DAY_PLAN_STAY,
  TASK_TEMPLATES,
  dayPlanDates,
  seedDay,
} from "@/src/lib/dayPlansSeed";
import "@/src/styles/day-plans.css";

const DATES = dayPlanDates();
const EMPTY_TASK = {
  category: "morning", title: "", startTime: "10:00", endTime: "11:00",
  location: "", groups: "", details: "", assigneeIds: [], documents: [],
  kitchen: false, menu: "", mealLocation: "inside", dietaryNotes: "",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });

function dateLabel(value, short = false) {
  const formatter = short ? shortFormatter : dateFormatter;
  const label = formatter.format(new Date(`${value}T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function previousDate(value) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextDate(value) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function defaultSelectedDate() {
  const now = new Date();
  if (now.getHours() >= 22) now.setDate(now.getDate() + 1);
  const local = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  if (DATES.includes(local)) return local;
  return local < DAY_PLAN_STAY.startDate ? DAY_PLAN_STAY.startDate : DAY_PLAN_STAY.endDate;
}

function memberName(member) {
  return `${member?.firstName || ""} ${member?.lastName || ""}`.trim() || member?.name || "Animateur·ice";
}

function initials(member) {
  return `${member?.firstName?.[0] || ""}${member?.lastName?.[0] || ""}`.toUpperCase() || "?";
}

function newId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => `${a.startTime || "99:99"}-${a.title}`.localeCompare(`${b.startTime || "99:99"}-${b.title}`, "fr"));
}

export default function DayPlans() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [plans, setPlans] = useState({});
  const [members, setMembers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate);
  const [view, setView] = useState("day");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(null);
  const [showTeam, setShowTeam] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
      getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
      getDocs(collection(db, COLLECTIONS.DAY_PLANS)),
    ]).then(async ([memberSnap, contractSnap, planSnap]) => {
      if (!active) return;
      const contracts = contractSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
      const memberIds = new Set(contracts.filter((contract) => contract.week === "S1" && String(contract.stayCode || "").toUpperCase() === "MCSC").map((contract) => contract.memberId));
      const roleByMember = Object.fromEntries(contracts.map((contract) => [contract.memberId, contract.role]));
      setMembers(memberSnap.docs.map((item) => ({ id: item.id, ...item.data(), role: roleByMember[item.id] || "Animateur·ice" }))
        .filter((member) => memberIds.has(member.id)).sort((a, b) => memberName(a).localeCompare(memberName(b), "fr")));

      const existing = Object.fromEntries(planSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((plan) => plan.stayId === DAY_PLAN_STAY.id)
        .map((plan) => [plan.date, plan]));
      const missing = DATES.filter((date) => !existing[date]);
      if (missing.length) {
        await Promise.all(missing.map((date) => setDoc(doc(db, COLLECTIONS.DAY_PLANS, `${DAY_PLAN_STAY.id}-${date}`), seedDay(date))));
      }
    }).catch((error) => showToast(error?.message || "Chargement du planning impossible.", "error"));

    const unsubscribe = onSnapshot(collection(db, COLLECTIONS.DAY_PLANS), (snapshot) => {
      if (!active) return;
      const next = {};
      snapshot.docs.forEach((item) => {
        const data = item.data();
        if (data.stayId === DAY_PLAN_STAY.id) next[data.date] = { id: item.id, ...data };
      });
      setPlans(next);
      setLoading(false);
    }, () => setLoading(false));
    return () => { active = false; unsubscribe(); };
  }, [showToast]);

  const selectedPlan = plans[selectedDate] || seedDay(selectedDate);
  const memberById = useMemo(() => Object.fromEntries(members.map((member) => [member.id, member])), [members]);

  const saveDay = async (date, fields, successMessage = "Planning enregistré.") => {
    setSaving(true);
    try {
      const current = plans[date] || seedDay(date);
      await setDoc(doc(db, COLLECTIONS.DAY_PLANS, `${DAY_PLAN_STAY.id}-${date}`), {
        ...current,
        ...fields,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || "",
      }, { merge: true });
      if (successMessage) showToast(successMessage, "success");
    } catch (error) {
      showToast(error?.message || "Enregistrement impossible.", "error");
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const unavailability = (memberId, time, date = selectedDate) => {
    const hour = Number(String(time || "12:00").split(":")[0]);
    if (hour >= 19) {
      return (plans[date]?.leaveMemberIds || []).includes(memberId)
        ? `Congé du ${dateLabel(date, true)} 19 h au ${dateLabel(nextDate(date), true)} 19 h` : "";
    }
    const prior = previousDate(date);
    return (plans[prior]?.leaveMemberIds || []).includes(memberId)
      ? `Congé jusqu’à 19 h` : "";
  };

  const toggleLeave = async (memberId) => {
    const leave = new Set(selectedPlan.leaveMemberIds || []);
    leave.has(memberId) ? leave.delete(memberId) : leave.add(memberId);
    await saveDay(selectedDate, { leaveMemberIds: [...leave] }, "Congés mis à jour.");
  };

  const saveTask = async (draft, files = []) => {
    const taskId = draft.id || newId();
    const uploaded = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9À-ÿ._-]/g, "-");
      const storageRef = ref(storage, `day-plans/${DAY_PLAN_STAY.id}/${selectedDate}/${taskId}/${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
      uploaded.push({ id: `${Date.now()}-${safeName}`, name: file.name, url: await getDownloadURL(storageRef) });
    }
    const complete = { ...EMPTY_TASK, ...draft, id: taskId, documents: [...(draft.documents || []), ...uploaded] };
    const tasks = [...(selectedPlan.tasks || []).filter((task) => task.id !== taskId), complete];
    await saveDay(selectedDate, { tasks: sortTasks(tasks) }, "Activité enregistrée.");
    setEditor(null);
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm("Supprimer cette tâche du déroulé ?")) return;
    await saveDay(selectedDate, { tasks: (selectedPlan.tasks || []).filter((task) => task.id !== taskId) }, "Tâche supprimée.");
    setEditor(null);
  };

  return (
    <div className="dp-page">
      <header className="dp-topbar">
        <div>
          <span className="dp-eyebrow">Organisation du séjour</span>
          <h1>Déroulés des journées</h1>
          <p>{DAY_PLAN_STAY.name} · {DAY_PLAN_STAY.week} · 6–17 juillet 2026</p>
        </div>
        <div className="dp-top-actions">
          <button type="button" className="dp-team-button" onClick={() => setShowTeam((value) => !value)}>Équipe · {members.length}</button>
          <div className="dp-view-switch">
            <button type="button" className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>Jour</button>
            <button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>Vue générale</button>
          </div>
        </div>
      </header>

      {showTeam && <TeamAvailability members={members} plans={plans} selectedDate={selectedDate} unavailability={unavailability} onClose={() => setShowTeam(false)} />}

      <div className="dp-layout">
        <aside className="dp-days">
          <div className="dp-days-title">Jours du séjour</div>
          {DATES.map((date, index) => {
            const plan = plans[date];
            const taskCount = plan?.tasks?.length || 0;
            const isToday = date === defaultSelectedDate();
            return (
              <button key={date} type="button" className={`${selectedDate === date ? "is-active" : ""} ${isToday ? "is-today" : ""}`} onClick={() => { setSelectedDate(date); setView("day"); }}>
                <span className="dp-day-number">J{index + 1}</span>
                <span><strong>{dateLabel(date, true)}</strong><small>{taskCount} tâche{taskCount > 1 ? "s" : ""}</small></span>
                {isToday && <i>Aujourd’hui</i>}
              </button>
            );
          })}
        </aside>

        <main className="dp-main">
          {loading ? <div className="dp-loading">Chargement du déroulé…</div> : view === "week" ? (
            <WeekOverview plans={plans} members={members} onSelect={(date) => { setSelectedDate(date); setView("day"); }} />
          ) : (
            <>
              <DayHeader date={selectedDate} plan={selectedPlan} members={members} saving={saving} onToggleLeave={toggleLeave} />
              <DayTimeline
                plan={selectedPlan}
                members={members}
                memberById={memberById}
                unavailability={unavailability}
                onEdit={setEditor}
                onAdd={(category) => setEditor({ ...EMPTY_TASK, category })}
              />
              <label className="dp-notes">
                <span>Notes générales de la journée</span>
                <textarea defaultValue={selectedPlan.notes || ""} key={selectedDate} placeholder="Informations utiles à toute l’équipe…" onBlur={(event) => {
                  if (event.target.value !== (selectedPlan.notes || "")) saveDay(selectedDate, { notes: event.target.value }, "Notes enregistrées.");
                }} />
              </label>
            </>
          )}
        </main>
      </div>

      <TaskEditor
        task={editor}
        members={members}
        unavailability={unavailability}
        saving={saving}
        onClose={() => setEditor(null)}
        onSave={saveTask}
        onDelete={editor?.id ? () => deleteTask(editor.id) : null}
      />
    </div>
  );
}

function DayHeader({ date, plan, members, saving, onToggleLeave }) {
  const [open, setOpen] = useState(false);
  const leave = plan.leaveMemberIds || [];
  return (
    <section className="dp-day-head">
      <div>
        <span>{date === defaultSelectedDate() ? "Aujourd’hui" : "Journée"}</span>
        <h2>{dateLabel(date)}</h2>
        <p>{plan.tasks?.length || 0} tâches programmées · mise à jour automatique pour toute l’équipe</p>
      </div>
      <div className="dp-leave-control">
        <button type="button" onClick={() => setOpen((value) => !value)}>🌴 Congés 19 h → 19 h <b>{leave.length}</b></button>
        {open && <div className="dp-leave-menu">
          <strong>Congé du {dateLabel(date, true)} 19 h au {dateLabel(nextDate(date), true)} 19 h</strong>
          {members.map((member) => <label key={member.id}>
            <input type="checkbox" checked={leave.includes(member.id)} disabled={saving} onChange={() => onToggleLeave(member.id)} />
            <span className="dp-mini-avatar">{initials(member)}</span>{memberName(member)}
          </label>)}
        </div>}
      </div>
    </section>
  );
}

function DayTimeline({ plan, members, memberById, unavailability, onEdit, onAdd }) {
  return <div className="dp-sections">
    {DAY_PLAN_SECTIONS.map((section) => {
      const tasks = sortTasks((plan.tasks || []).filter((task) => task.category === section.key));
      return <section className="dp-section" key={section.key} style={{ "--section-color": section.color }}>
        <header><span>{section.icon}</span><div><h3>{section.label}</h3><small>{tasks.length ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""}` : "À organiser"}</small></div><button type="button" onClick={() => onAdd(section.key)}>+ Ajouter</button></header>
        <div className="dp-task-list">
          {!tasks.length && <button type="button" className="dp-empty-task" onClick={() => onAdd(section.key)}>Ajouter une première tâche</button>}
          {tasks.map((task) => {
            const assigned = (task.assigneeIds || []).map((id) => memberById[id]).filter(Boolean);
            const unavailable = assigned.filter((member) => unavailability(member.id, task.startTime));
            return <button type="button" className={`dp-task ${unavailable.length ? "has-conflict" : ""}`} key={task.id} onClick={() => onEdit(task)}>
              <span className="dp-time"><strong>{task.startTime || "—"}</strong><small>{task.endTime ? `→ ${task.endTime}` : ""}</small></span>
              <span className="dp-task-body"><strong>{task.title || "Sans titre"}</strong><small>{[task.location, task.groups].filter(Boolean).join(" · ") || "Cliquer pour ajouter les détails"}</small>
                <span className="dp-tags">{task.kitchen && <i>🍳 Cuisine</i>}{task.documents?.length > 0 && <i>📎 {task.documents.length}</i>}{unavailable.length > 0 && <i className="is-warning">⚠ Conflit congé</i>}</span>
              </span>
              <span className="dp-assignees">{assigned.length ? assigned.slice(0, 4).map((member) => <i key={member.id} title={memberName(member)}>{initials(member)}</i>) : <em>À affecter</em>}{assigned.length > 4 && <b>+{assigned.length - 4}</b>}</span>
              <span className="dp-chevron">›</span>
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}

function WeekOverview({ plans, members, onSelect }) {
  const memberById = Object.fromEntries(members.map((member) => [member.id, member]));
  return <section className="dp-overview">
    <header><span className="dp-eyebrow">Planning général</span><h2>Vue d’ensemble du séjour</h2><p>Les activités principales, repas, veillées et congés en un seul écran.</p></header>
    <div className="dp-week-grid">
      {DATES.map((date, index) => {
        const plan = plans[date] || seedDay(date);
        return <button type="button" key={date} onClick={() => onSelect(date)}>
          <div className="dp-week-day"><span>J{index + 1}</span><strong>{dateLabel(date, true)}</strong><i>{plan.tasks?.length || 0}</i></div>
          <div className="dp-week-content">
            {DAY_PLAN_SECTIONS.map((section) => {
              const tasks = sortTasks((plan.tasks || []).filter((task) => task.category === section.key));
              return <div key={section.key}><span>{section.icon}</span><p>{tasks.length ? tasks.map((task) => task.title).join(" · ") : "—"}</p></div>;
            })}
          </div>
          <div className="dp-week-leave">🌴 {(plan.leaveMemberIds || []).length ? plan.leaveMemberIds.map((id) => memberName(memberById[id])).join(", ") : "Aucun congé saisi"}</div>
        </button>;
      })}
    </div>
  </section>;
}

function TeamAvailability({ members, selectedDate, unavailability, onClose }) {
  return <div className="dp-team-panel">
    <div><strong>Disponibilités · {dateLabel(selectedDate)}</strong><button type="button" onClick={onClose}>×</button></div>
    <p>La disponibilité change à 19 h selon les congés saisis.</p>
    <div className="dp-team-grid">{members.map((member) => {
      const before = unavailability(member.id, "12:00");
      const after = unavailability(member.id, "20:00");
      return <article key={member.id}><span className="dp-mini-avatar">{initials(member)}</span><div><strong>{memberName(member)}</strong><small>{member.role || "Animateur·ice"}</small></div><p><i className={before ? "is-off" : ""}>Journée {before ? "indisponible" : "disponible"}</i><i className={after ? "is-off" : ""}>Après 19 h {after ? "indisponible" : "disponible"}</i></p></article>;
    })}</div>
  </div>;
}

function TaskEditor({ task, members, unavailability, saving, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);
  const [files, setFiles] = useState([]);
  useEffect(() => { setDraft(task ? { ...EMPTY_TASK, ...task } : null); setFiles([]); }, [task]);
  if (!draft) return null;
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleMember = (id) => set("assigneeIds", draft.assigneeIds.includes(id) ? draft.assigneeIds.filter((item) => item !== id) : [...draft.assigneeIds, id]);
  const applyTemplate = (event) => {
    const template = TASK_TEMPLATES[Number(event.target.value)];
    if (template) setDraft((current) => ({ ...current, ...template }));
  };
  return <Modal isOpen={Boolean(task)} onClose={onClose} title={draft.id ? "Détails de la tâche" : "Nouvelle tâche"} size="lg">
    <form className="dp-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave(draft, files); }}>
      {!draft.id && <label className="dp-template"><span>Modèle rapide</span><select defaultValue="" onChange={applyTemplate}><option value="">Choisir un modèle…</option>{TASK_TEMPLATES.map((template, index) => <option value={index} key={template.label}>{template.label}</option>)}</select></label>}
      <div className="dp-form-grid">
        <label className="is-wide"><span>Titre *</span><input value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Nom de l’activité ou de la tâche" required /></label>
        <label><span>Type de moment</span><select value={draft.category} onChange={(event) => set("category", event.target.value)}>{DAY_PLAN_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}</select></label>
        <label><span>Début</span><input type="time" value={draft.startTime} onChange={(event) => set("startTime", event.target.value)} /></label>
        <label><span>Fin</span><input type="time" value={draft.endTime} onChange={(event) => set("endTime", event.target.value)} /></label>
        <label><span>Lieu</span><input value={draft.location} onChange={(event) => set("location", event.target.value)} placeholder="Forum, plage, camping…" /></label>
        <label className="is-wide"><span>Groupes d’enfants</span><input value={draft.groups} onChange={(event) => set("groups", event.target.value)} placeholder="Groupe 1 et 2, mobil-homes référents…" /></label>
        <label className="is-wide"><span>Déroulé détaillé</span><textarea value={draft.details} onChange={(event) => set("details", event.target.value)} placeholder="Objectif, déroulement, matériel, répartition des rôles…" /></label>
      </div>

      <fieldset className="dp-member-picker"><legend>Animateur·ices affecté·es</legend><p>Les personnes en congé sur ce créneau ne peuvent pas être sélectionnées.</p><div>{members.map((member) => {
        const reason = unavailability(member.id, draft.startTime);
        const selected = draft.assigneeIds.includes(member.id);
        return <button key={member.id} type="button" disabled={Boolean(reason) && !selected} title={reason} className={selected ? "is-selected" : reason ? "is-unavailable" : ""} onClick={() => toggleMember(member.id)}><span className="dp-mini-avatar">{initials(member)}</span><strong>{memberName(member)}</strong><small>{reason || member.role || "Disponible"}</small></button>;
      })}</div></fieldset>

      <section className="dp-kitchen-editor">
        <label className="dp-check"><input type="checkbox" checked={draft.kitchen} onChange={(event) => set("kitchen", event.target.checked)} /><span>Cette tâche comprend de la cuisine ou un repas</span></label>
        {draft.kitchen && <div className="dp-form-grid">
          <label className="is-wide"><span>Menu / préparation</span><textarea value={draft.menu || ""} onChange={(event) => set("menu", event.target.value)} placeholder="Menu, quantités ou étapes de préparation…" /></label>
          <label><span>Lieu du repas</span><select value={draft.mealLocation || "inside"} onChange={(event) => set("mealLocation", event.target.value)}><option value="inside">À l’intérieur</option><option value="outside">À l’extérieur</option><option value="picnic">Pique-nique</option><option value="city">En ville</option></select></label>
          <label><span>Groupe cuisine</span><input value={draft.groups || ""} onChange={(event) => set("groups", event.target.value)} placeholder="Groupe 1, volontaires…" /></label>
          <label className="is-wide"><span>Régimes, allergies et organisation</span><textarea value={draft.dietaryNotes || ""} onChange={(event) => set("dietaryNotes", event.target.value)} placeholder="Alternatives prévues, service, vaisselle…" /></label>
        </div>}
      </section>

      <section className="dp-attachments"><strong>Documents du déroulé</strong><p>Fiche de jeu, menu, répartition des groupes, matériel…</p>{draft.documents?.length > 0 && <div>{draft.documents.map((file) => <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer">📎 {file.name}</a>)}</div>}<label><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><span>{files.length ? `${files.length} fichier(s) prêt(s) à envoyer` : "+ Ajouter des documents"}</span></label></section>

      <div className="dp-editor-actions">{onDelete && <button type="button" className="is-delete" onClick={onDelete}>Supprimer</button>}<span /><button type="button" onClick={onClose}>Annuler</button><button type="submit" className="is-primary" disabled={saving || !draft.title.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>
  </Modal>;
}
