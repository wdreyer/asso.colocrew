"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_PLAN_SECTIONS } from "@/src/lib/dayPlansSeed";
import { useDayPlans } from "./useDayPlans";
import { dayNumber, longDate, todayIso } from "./format";
import { Badge, EmptyState, Loader, Notice } from "./ui";

/** Read-only, day-by-day view of a session's day plans, highlighting what concerns the member. */

const SECTION_BY_KEY = Object.fromEntries(DAY_PLAN_SECTIONS.map((section) => [section.key, section]));
const SECTION_ORDER = Object.fromEntries(DAY_PLAN_SECTIONS.map((section, index) => [section.key, index]));

function sortTasks(tasks) {
  return [...(tasks || [])].sort((left, right) =>
    String(left.startTime || "99:99").localeCompare(String(right.startTime || "99:99"))
    || (SECTION_ORDER[left.category] ?? 9) - (SECTION_ORDER[right.category] ?? 9));
}

function TaskRow({ task, memberId }) {
  const section = SECTION_BY_KEY[task.category] || { label: "Activité", color: "#8b5cf6" };
  const assignees = task.assigneeIds || [];
  const mine = memberId && assignees.includes(memberId);
  const others = assignees.length - (mine ? 1 : 0);
  const menu = task.menu && !/renseigner/i.test(task.menu) ? task.menu : "";
  return (
    <li className={`rounded-xl border bg-white p-3.5 ${mine ? "border-[#B8336A] ring-1 ring-[#B8336A]/20" : "border-[#ece3f3]"}`} style={{ borderLeft: `5px solid ${section.color}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold" style={{ color: section.color }}>
          {task.startTime || "—"}{task.endTime ? ` – ${task.endTime}` : ""}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-[#9a8cab]">{section.label}</span>
        {mine && <Badge tone="pink">Toi</Badge>}
      </div>
      <p className="mt-1 font-bold text-[#24173D]">{task.title || "Activité"}</p>
      {task.details && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#5b4d6b]">{task.details}</p>}
      {menu && <p className="mt-1 whitespace-pre-line text-sm text-[#5b4d6b]"><strong>Menu :</strong> {menu}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b5c7b]">
        {task.location && <span>Lieu : <strong>{task.location}</strong></span>}
        {task.groups && <span>Groupes : <strong>{task.groups}</strong></span>}
        {task.mealLocation === "outside" && <span><strong>Repas dehors</strong></span>}
        {assignees.length > 0 && <span>Équipe : <strong>{mine ? `toi${others ? ` + ${others}` : ""}` : `${others} anim${others > 1 ? "s" : ""}`}</strong></span>}
      </div>
      {task.photo?.url && <img src={task.photo.url} alt="" className="mt-2 max-h-48 w-full rounded-lg object-cover" />}
      {(task.documents || []).filter((document) => document?.url).map((document) => (
        <a key={document.url} href={document.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-bold text-[#B8336A]">
          {document.name || "Document"} →
        </a>
      ))}
    </li>
  );
}

export default function DayPlanViewer({ contract, memberId }) {
  const { loading, error, dates, plans } = useDayPlans(contract);
  const [selected, setSelected] = useState("");
  const stripRef = useRef(null);

  useEffect(() => {
    if (!dates.length) return;
    const today = todayIso();
    setSelected((current) => (dates.includes(current) ? current : dates.includes(today) ? today : dates[0]));
  }, [dates]);

  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  const plan = plans[selected];
  const tasks = useMemo(() => sortTasks(plan?.tasks), [plan]);
  const onLeave = Boolean(memberId && (plan?.leaveMemberIds || []).includes(memberId));
  const mineCount = tasks.filter((task) => (task.assigneeIds || []).includes(memberId)).length;

  if (loading) return <Loader label="Chargement du déroulé…" />;
  if (!dates.length) return <EmptyState title="Dates de session inconnues">Le déroulé s’affichera quand les dates seront fixées.</EmptyState>;

  return (
    <div>
      {error && <div className="mb-3"><Notice tone="danger">Le déroulé n’a pas pu être chargé.</Notice></div>}
      <div ref={stripRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {dates.map((date) => {
          const label = dayNumber(date);
          const active = date === selected;
          const hasTasks = (plans[date]?.tasks || []).length > 0;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(date)}
              className={`flex min-w-[58px] flex-col items-center rounded-xl border px-2 py-2 text-xs font-bold transition ${active ? "border-[#B8336A] bg-[#B8336A] text-white" : "border-[#ece3f3] bg-white text-[#5b4d6b]"}`}
            >
              <span className="capitalize">{label?.weekday}</span>
              <span className="text-lg leading-tight">{label?.day}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${hasTasks ? (active ? "bg-white" : "bg-[#B8336A]") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold capitalize text-[#24173D]">{longDate(selected)}</h3>
        {onLeave && <Badge tone="success">En congé</Badge>}
        {mineCount > 0 && <Badge tone="pink">{mineCount} activité{mineCount > 1 ? "s" : ""} pour toi</Badge>}
      </div>

      {tasks.length ? (
        <ul className="mt-3 space-y-2.5">
          {tasks.map((task, index) => <TaskRow key={task.id || index} task={task} memberId={memberId} />)}
        </ul>
      ) : (
        <div className="mt-3"><EmptyState title="Rien de programmé ce jour-là pour l’instant" /></div>
      )}

      {plan?.notes && (
        <div className="mt-4 rounded-xl border border-[#ece3f3] bg-white p-4 text-sm leading-relaxed text-[#5b4d6b]">
          <strong className="block text-[#24173D]">Notes de la journée</strong>
          <span className="whitespace-pre-line">{plan.notes}</span>
        </div>
      )}
    </div>
  );
}
