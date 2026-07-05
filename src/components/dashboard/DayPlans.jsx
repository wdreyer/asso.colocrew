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

function activityPalette(task, fallback = "#8b5cf6") {
  const text = `${task?.title || ""} ${task?.category || ""}`.toLocaleLowerCase("fr");
  if (text.includes("surf")) return { color: "#0284c7", background: "#e0f2fe" };
  if (/repas|d[îi]ner|petit d[ée]jeuner|brunch|cuisine|pique-nique/.test(text)) return { color: "#c56a08", background: "#fff1d6" };
  if (/projet artistique|art|cr[ée]a/.test(text)) return { color: "#7c3aed", background: "#f1e8ff" };
  if (/veill[ée]e|bookmaker|cluedo|zombie|sagamore|loup|boom|fureur/.test(text)) return { color: "#4f46e5", background: "#e9e9ff" };
  if (/plage|lac|baignade/.test(text)) return { color: "#0891b2", background: "#ddf8fc" };
  if (/ville|glace|sunset|balade/.test(text)) return { color: "#db2777", background: "#fce7f3" };
  if (/grand jeu|koh|time|d[ée]fi|tournoi|sardine/.test(text)) return { color: "#15803d", background: "#e5f7ea" };
  return { color: fallback, background: `${fallback}18` };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function openDayPdf({ date, plan, members, memberById, unavailability }) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const rows = DAY_PLAN_SECTIONS.flatMap((section) => sortTasks((plan.tasks || []).filter((task) => task.category === section.key)).map((task) => {
    const assigned = (task.assigneeIds || []).map((id) => memberById[id]).filter(Boolean).map(memberName).join(", ") || "À affecter";
    const leave = members.filter((member) => unavailability(member.id, task.startTime)).map(memberName).join(", ") || "Personne";
    const palette = activityPalette(task, section.color);
    return `<article style="--accent:${palette.color};--soft:${palette.background}"><div class="moment"><span>${section.icon}</span><b>${escapeHtml(section.label)}</b></div><div class="activity"><div class="time">${escapeHtml(task.startTime || "—")}${task.endTime ? ` – ${escapeHtml(task.endTime)}` : ""}</div><h2>${escapeHtml(task.title)}</h2>${task.details ? `<p>${escapeHtml(task.details).replace(/\n/g, "<br>")}</p>` : ""}${task.photo?.url ? `<img src="${escapeHtml(task.photo.url)}" alt="">` : ""}</div><div class="team"><b>Équipe</b><span>${escapeHtml(assigned)}</span><b>En congé</b><span>${escapeHtml(leave)}</span></div></article>`;
  })).join("");
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Déroulé ${escapeHtml(dateLabel(date))}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#f5f3f7;color:#26183b;font-family:Arial,sans-serif}.page{max-width:900px;margin:auto;padding:18px}header{margin-bottom:16px;border-bottom:4px solid #b72f69;padding-bottom:12px}header small{color:#b72f69;font-weight:800;text-transform:uppercase}h1{margin:4px 0 2px;font-size:27px}header p{margin:0;color:#6f637a;font-size:12px}article{display:grid;grid-template-columns:125px minmax(0,1fr) 180px;overflow:hidden;margin:0 0 9px;border:1px solid #dcd5e2;border-left:7px solid var(--accent);border-radius:10px;background:#fff;break-inside:avoid}.moment{display:flex;align-items:center;gap:8px;background:var(--soft);padding:13px;font-size:12px}.moment span{font-size:20px}.activity{padding:12px 14px}.time{color:var(--accent);font-size:12px;font-weight:900}.activity h2{margin:3px 0;font-size:16px}.activity p{margin:7px 0 0;color:#54495d;font-size:11px;line-height:1.5}.activity img{width:100%;max-height:180px;margin-top:8px;border-radius:7px;object-fit:cover}.team{display:flex;justify-content:center;flex-direction:column;gap:3px;border-left:1px solid #e5dfe9;padding:11px}.team b{color:#7b6c86;font-size:9px;text-transform:uppercase}.team span{margin-bottom:5px;font-size:11px;font-weight:700}.notes{margin-top:14px;border:1px solid #ddd5e4;border-radius:8px;background:#fff;padding:11px;font-size:11px;white-space:pre-wrap}@media(max-width:600px){.page{padding:10px}h1{font-size:23px}article{grid-template-columns:92px 1fr}.team{grid-column:2;border-left:0;border-top:1px solid #e5dfe9}.moment{grid-row:span 2;padding:9px}.activity{padding:10px}.activity h2{font-size:15px}}@media print{body{background:#fff}.page{padding:0}.print{display:none}}</style></head><body><main class="page"><header><small>${escapeHtml(DAY_PLAN_STAY.name)} · ${escapeHtml(DAY_PLAN_STAY.week)}</small><h1>${escapeHtml(dateLabel(date))}</h1><p>${(plan.tasks || []).length} activités · horaires, équipe et congés</p></header>${rows || "<p>Aucune activité programmée.</p>"}${plan.notes ? `<div class="notes"><b>Notes de la journée</b><br>${escapeHtml(plan.notes)}</div>` : ""}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`);
  popup.document.close();
  return true;
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
    if (hour < 19) {
      return (plans[date]?.leaveMemberIds || []).includes(memberId)
        ? `Congé du ${dateLabel(previousDate(date), true)} 19 h au ${dateLabel(date, true)} 19 h` : "";
    }
    const following = nextDate(date);
    return (plans[following]?.leaveMemberIds || []).includes(memberId)
      ? `Congé du ${dateLabel(date, true)} 19 h au ${dateLabel(following, true)} 19 h` : "";
  };

  const toggleLeave = async (memberId, date = selectedDate) => {
    const plan = plans[date] || seedDay(date);
    const leave = new Set(plan.leaveMemberIds || []);
    leave.has(memberId) ? leave.delete(memberId) : leave.add(memberId);
    await saveDay(date, { leaveMemberIds: [...leave] }, "Congés mis à jour.");
  };

  const saveTask = async (draft, photoFile = null) => {
    const taskId = draft.id || newId();
    let photo = draft.photo || null;
    if (photoFile) {
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9À-ÿ._-]/g, "-");
      const storageRef = ref(storage, `day-plans/${DAY_PLAN_STAY.id}/${selectedDate}/${taskId}/${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, photoFile, { contentType: photoFile.type || "image/jpeg" });
      photo = { name: photoFile.name, url: await getDownloadURL(storageRef) };
    }
    const complete = { ...EMPTY_TASK, ...draft, id: taskId, photo };
    const tasks = [...(selectedPlan.tasks || []).filter((task) => task.id !== taskId), complete];
    await saveDay(selectedDate, { tasks: sortTasks(tasks) }, "Activité enregistrée.");
    setEditor(null);
  };

  const toggleTaskAssignee = async (task, memberId) => {
    const assigned = new Set(task.assigneeIds || []);
    if (unavailability(memberId, task.startTime) && !assigned.has(memberId)) return;
    assigned.has(memberId) ? assigned.delete(memberId) : assigned.add(memberId);
    const tasks = (selectedPlan.tasks || []).map((item) => item.id === task.id ? { ...item, assigneeIds: [...assigned] } : item);
    await saveDay(selectedDate, { tasks }, "");
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
          <div className="dp-view-switch">
            <button type="button" className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>Jour</button>
            <button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>Planning général</button>
            <button type="button" className={view === "leaves" ? "is-active" : ""} onClick={() => setView("leaves")}>Congés</button>
          </div>
          {view === "day" && <button type="button" className="dp-pdf-button" onClick={() => {
            if (!openDayPdf({ date: selectedDate, plan: selectedPlan, members, memberById, unavailability })) showToast("Autorisez les fenêtres pop-up pour ouvrir le PDF.", "error");
          }}>PDF du jour</button>}
          {view === "day" && <button type="button" className="dp-add-main" onClick={() => setEditor({ ...EMPTY_TASK })}>+ Ajouter une tâche</button>}
        </div>
      </header>

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
          ) : view === "leaves" ? (
            <LeavesOverview plans={plans} members={members} saving={saving} onToggle={toggleLeave} />
          ) : (
            <>
              <DayHeader date={selectedDate} plan={selectedPlan} members={members} saving={saving} onToggleLeave={toggleLeave} />
              <DayTimeline
                plan={selectedPlan}
                members={members}
                memberById={memberById}
                unavailability={unavailability}
                onEdit={setEditor}
                onToggleAssignee={toggleTaskAssignee}
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

      <TaskDetails
        task={editor}
        members={members}
        memberById={memberById}
        saving={saving}
        onClose={() => setEditor(null)}
        onSave={saveTask}
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
        <button type="button" onClick={() => setOpen((value) => !value)}>🌴 En congé aujourd’hui <b>{leave.length}</b></button>
        {open && <div className="dp-leave-menu">
          <strong>Congé du {dateLabel(previousDate(date), true)} à 19 h au {dateLabel(date, true)} à 19 h</strong>
          {members.map((member) => <label key={member.id}>
            <input type="checkbox" checked={leave.includes(member.id)} disabled={saving} onChange={() => onToggleLeave(member.id)} />
            <span className="dp-mini-avatar">{initials(member)}</span>{memberName(member)}
          </label>)}
        </div>}
      </div>
    </section>
  );
}

function DayTimeline({ plan, members, memberById, unavailability, onEdit, onToggleAssignee }) {
  return <div className="dp-schedule-table">
    <div className="dp-table-head"><span>Moment</span><span>Activité</span><span>Animateur·ices</span><span>En congé</span></div>
    {DAY_PLAN_SECTIONS.map((section) => {
      const tasks = sortTasks((plan.tasks || []).filter((task) => task.category === section.key));
      const referenceTime = ["dinner", "evening"].includes(section.key) ? "20:00" : "12:00";
      const sectionLeave = members.filter((member) => unavailability(member.id, referenceTime));
      if (!tasks.length) return <div className="dp-table-row is-empty" key={section.key}>
        <div className="dp-moment" style={{ "--section-color": section.color }}><i>{section.icon}</i><strong>{section.label}</strong></div>
        <div className="dp-activity"><span>À organiser</span></div><div className="dp-people"><em>—</em></div>
        <LeavePeople members={sectionLeave} />
      </div>;
      return tasks.map((task, index) => {
        const assigned = (task.assigneeIds || []).map((id) => memberById[id]).filter(Boolean);
        const unavailable = assigned.filter((member) => unavailability(member.id, task.startTime));
        const peopleOnLeave = members.filter((member) => unavailability(member.id, task.startTime));
        return <div className={`dp-table-row ${unavailable.length ? "has-conflict" : ""}`} key={task.id}>
          <div className={`dp-moment ${index > 0 ? "is-repeat" : ""}`} style={{ "--section-color": section.color }}>
            {index === 0 && <><i>{section.icon}</i><strong>{section.label}</strong></>}
          </div>
          <button type="button" className="dp-activity" onClick={() => onEdit(task)}>
            <span className="dp-inline-time">{task.startTime || "—"}{task.endTime ? ` – ${task.endTime}` : ""}</span>
            <strong>{task.title || "Sans titre"}</strong>
            <small>{[task.location, task.groups].filter(Boolean).join(" · ")}</small>
            {(task.kitchen || task.photo?.url || unavailable.length > 0) && <span className="dp-tags">{task.kitchen && <i>🍳 Cuisine</i>}{task.photo?.url && <i>📷 Photo</i>}{unavailable.length > 0 && <i className="is-warning">⚠ Conflit congé</i>}</span>}
          </button>
          <QuickAssign task={task} members={members} unavailability={unavailability} onToggle={onToggleAssignee} />
          <LeavePeople members={peopleOnLeave} />
        </div>;
      });
    })}
  </div>;
}

function QuickAssign({ task, members, unavailability, onToggle }) {
  const [open, setOpen] = useState(false);
  const selectedIds = new Set(task.assigneeIds || []);
  const selected = members.filter((member) => selectedIds.has(member.id));
  return <div className="dp-quick-assign">
    <div className="dp-assigned-names">{selected.length ? selected.map((member) => <span key={member.id}>{member.firstName || memberName(member)}</span>) : <em>À affecter</em>}</div>
    <button type="button" className="dp-assign-plus" aria-label={`Modifier les affectations de ${task.title}`} onClick={() => setOpen((value) => !value)}>+</button>
    {open && <div className="dp-assign-menu">
      <header><strong>Qui fait cette activité ?</strong><button type="button" onClick={() => setOpen(false)}>×</button></header>
      {members.map((member) => {
        const isSelected = selectedIds.has(member.id);
        const reason = unavailability(member.id, task.startTime);
        return <label key={member.id} className={reason && !isSelected ? "is-unavailable" : ""} title={reason || ""}>
          <input type="checkbox" checked={isSelected} disabled={Boolean(reason) && !isSelected} onChange={() => onToggle(task, member.id)} />
          <span className="dp-mini-avatar">{initials(member)}</span><strong>{memberName(member)}</strong>
          <small>{reason || (isSelected ? "Affecté·e" : "Disponible")}</small>
        </label>;
      })}
    </div>}
  </div>;
}

function LeavePeople({ members }) {
  return <div className={`dp-row-leave ${members.length ? "has-leave" : ""}`}>
    {members.length ? members.map((member) => <span key={member.id} title={memberName(member)}><i>{initials(member)}</i><b>{member.firstName || memberName(member)}</b></span>) : <em>Personne</em>}
  </div>;
}

function WeekOverview({ plans, members, onSelect }) {
  const memberById = Object.fromEntries(members.map((member) => [member.id, member]));
  return <section className="dp-overview">
    <header><span className="dp-eyebrow">Planning général</span><h2>My Creative Surf Camp — S1</h2><p>Comme sur le planning Excel : les jours en colonnes et les moments de la journée en lignes.</p></header>
    <div className="dp-excel-wrap">
      <div className="dp-excel-grid" style={{ "--day-count": DATES.length }}>
        <div className="dp-excel-corner">PLANNING</div>
        {DATES.map((date, index) => <button type="button" className="dp-excel-date" key={date} onClick={() => onSelect(date)}><small>J{index + 1}</small><strong>{dateLabel(date, true)}</strong></button>)}
        {DAY_PLAN_SECTIONS.map((section) => <div className="dp-excel-line" key={section.key} style={{ display: "contents" }}>
          <div className="dp-excel-label" style={{ "--section-color": section.color }}><span>{section.icon}</span><strong>{section.label}</strong></div>
          {DATES.map((date) => {
            const tasks = sortTasks(((plans[date] || seedDay(date)).tasks || []).filter((task) => task.category === section.key));
            return <button type="button" className="dp-excel-cell" key={`${section.key}-${date}`} onClick={() => onSelect(date)}>
              {tasks.length ? tasks.map((task) => {
                const palette = activityPalette(task, section.color);
                return <span key={task.id} style={{ "--activity-color": palette.color, "--activity-bg": palette.background }}><b>{task.startTime}</b><strong>{task.title}</strong><small>{(task.assigneeIds || []).map((id) => memberById[id]?.firstName).filter(Boolean).join(", ") || "À affecter"}</small></span>;
              }) : <em>—</em>}
            </button>;
          })}
        </div>)}
      </div>
    </div>
  </section>;
}

function leaveAssessment(plans, members, member, date) {
  const previous = previousDate(date);
  const eveningTasks = (plans[previous]?.tasks || []).filter((task) => Number(String(task.startTime || "0").split(":")[0]) >= 19);
  const daytimeTasks = (plans[date]?.tasks || []).filter((task) => Number(String(task.startTime || "12").split(":")[0]) < 19);
  const conflicts = [...eveningTasks, ...daytimeTasks].filter((task) => (task.assigneeIds || []).includes(member.id));
  const selectedIds = new Set(plans[date]?.leaveMemberIds || []);
  const alreadySelected = selectedIds.has(member.id);
  selectedIds.add(member.id);
  const projectedOff = selectedIds.size;
  const available = Math.max(members.length - projectedOff, 0);
  const minimumComfort = Math.ceil(members.length * 0.6);

  if (conflicts.length) return { level: "danger", label: `${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""}`, detail: `Affecté·e à : ${conflicts.map((task) => task.title).join(", ")}`, projectedOff, available, alreadySelected };
  if (available < Math.ceil(members.length / 2)) return { level: "danger", label: "Équipe trop réduite", detail: `Il ne resterait que ${available} personne${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}.`, projectedOff, available, alreadySelected };
  if (available < minimumComfort || projectedOff >= 3) return { level: "warning", label: "À vérifier", detail: `${projectedOff} personnes en congé, ${available} disponibles.`, projectedOff, available, alreadySelected };
  return { level: "safe", label: "Possible", detail: `${available} personnes resteraient disponibles.`, projectedOff, available, alreadySelected };
}

function LeavesOverview({ plans, members, saving, onToggle }) {
  return <section className="dp-leaves-view">
    <header><span className="dp-eyebrow">Repos de l’équipe</span><h2>Planning des congés</h2><p>Une case cochée sur un jour signifie : départ en congé à <strong>19 h la veille</strong>, retour disponible à <strong>19 h le jour indiqué</strong>.</p></header>
    <div className="dp-leave-example">Exemple : congé le mardi 7 juillet = du lundi 6 juillet à 19 h au mardi 7 juillet à 19 h.</div>
    <div className="dp-leave-legend"><span className="is-safe">● Possible</span><span className="is-warning">● À vérifier : plusieurs congés</span><span className="is-danger">● Conflit : activité affectée ou équipe trop réduite</span></div>
    <div className="dp-leave-capacity">{DATES.map((date) => {
      const off = plans[date]?.leaveMemberIds || [];
      const conflictCount = off.filter((memberId) => {
        const member = members.find((item) => item.id === memberId);
        return member && leaveAssessment(plans, members, member, date).level === "danger";
      }).length;
      const level = conflictCount ? "danger" : off.length >= 3 ? "warning" : "safe";
      return <div key={date} className={`is-${level}`}><strong>{dateLabel(date, true)}</strong><span>{members.length - off.length} disponibles</span><small>{off.length} en congé{conflictCount ? ` · ${conflictCount} conflit` : ""}</small></div>;
    })}</div>
    <div className="dp-leaves-wrap"><table><thead><tr><th>Équipe</th>{DATES.map((date) => <th key={date}>{dateLabel(date, true)}</th>)}</tr></thead><tbody>
      {members.map((member) => <tr key={member.id}><th><span className="dp-mini-avatar">{initials(member)}</span><span>{memberName(member)}<small>{member.role}</small></span></th>{DATES.map((date) => {
        const selected = (plans[date]?.leaveMemberIds || []).includes(member.id);
        const assessment = leaveAssessment(plans, members, member, date);
        const change = () => {
          if (!selected && assessment.level === "danger" && !window.confirm(`${assessment.label}\n${assessment.detail}\n\nConfirmer quand même ce congé ?`)) return;
          onToggle(member.id, date);
        };
        return <td key={date} className={`${selected ? "is-leave " : ""}is-${assessment.level}`}><label title={`${assessment.label} — ${assessment.detail}`}><input type="checkbox" checked={selected} disabled={saving} onChange={change} /><span>{selected ? "Congé" : assessment.label}</span><small>{selected ? `${dateLabel(previousDate(date), true)} 19 h → ${dateLabel(date, true)} 19 h` : assessment.detail}</small></label></td>;
      })}</tr>)}
    </tbody></table></div>
    <div className="dp-leave-summary"><h3>Récapitulatif</h3>{members.map((member) => {
      const days = DATES.filter((date) => (plans[date]?.leaveMemberIds || []).includes(member.id));
      return <div key={member.id}><strong>{memberName(member)}</strong><span>{days.length ? days.map((date) => `${dateLabel(previousDate(date), true)} 19 h → ${dateLabel(date, true)} 19 h`).join(" · ") : "Aucun congé renseigné"}</span></div>;
    })}</div>
  </section>;
}

function TaskDetails({ task, memberById, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  useEffect(() => {
    setDraft(task ? { ...EMPTY_TASK, ...task } : null);
    setEditing(Boolean(task && !task.id));
    setPhotoFile(null);
    setPhotoPreview("");
  }, [task]);
  if (!draft) return null;
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const section = DAY_PLAN_SECTIONS.find((item) => item.key === draft.category);
  const assigned = (draft.assigneeIds || []).map((id) => memberById[id]).filter(Boolean);
  const choosePhoto = (file) => {
    setPhotoFile(file || null);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  };

  return <Modal isOpen={Boolean(task)} onClose={onClose} title={draft.id ? "Détail de l’activité" : "Nouvelle activité"} size="md">
    {!editing ? <article className="dp-task-detail">
      {(photoPreview || draft.photo?.url) && <img src={photoPreview || draft.photo.url} alt={draft.title} />}
      <div className="dp-detail-meta"><span>{section?.icon} {section?.label}</span><strong>{draft.startTime || "—"}{draft.endTime ? ` – ${draft.endTime}` : ""}</strong></div>
      <h2>{draft.title}</h2>
      {(draft.location || draft.groups) && <p className="dp-detail-place">{[draft.location, draft.groups].filter(Boolean).join(" · ")}</p>}
      <div className="dp-detail-text">{draft.details || draft.menu || "Aucun détail ajouté pour le moment."}</div>
      {assigned.length > 0 && <div className="dp-detail-team"><strong>Équipe</strong>{assigned.map((member) => <span key={member.id}><i>{initials(member)}</i>{memberName(member)}</span>)}</div>}
      <div className="dp-detail-actions"><button type="button" onClick={onClose}>Fermer</button><button type="button" className="is-primary" onClick={() => setEditing(true)}>Modifier</button></div>
    </article> : <form className="dp-simple-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave(draft, photoFile); }}>
      <label><span>Moment de la journée</span><select value={draft.category} onChange={(event) => set("category", event.target.value)}>{DAY_PLAN_SECTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label><span>Nom de l’activité</span><input value={draft.title} onChange={(event) => set("title", event.target.value)} required /></label>
      <div><label><span>Début</span><input type="time" value={draft.startTime} onChange={(event) => set("startTime", event.target.value)} /></label><label><span>Fin</span><input type="time" value={draft.endTime} onChange={(event) => set("endTime", event.target.value)} /></label></div>
      <label><span>Texte / déroulé</span><textarea value={draft.details} onChange={(event) => set("details", event.target.value)} placeholder="Écrivez ici tout ce que l’équipe doit savoir…" /></label>
      <label className="dp-photo-field"><span>Photo facultative</span>{(photoPreview || draft.photo?.url) && <img src={photoPreview || draft.photo.url} alt="Aperçu" />}<input type="file" accept="image/*" onChange={(event) => choosePhoto(event.target.files?.[0])} /><i>{photoFile ? photoFile.name : draft.photo?.name || "Choisir une photo"}</i></label>
      <div className="dp-detail-actions">{draft.id && <button type="button" onClick={() => setEditing(false)}>Annuler</button>}<button type="submit" className="is-primary" disabled={saving || !draft.title.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>}
  </Modal>;
}
