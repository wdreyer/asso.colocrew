"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Modal from "@/src/components/dashboard/ui/Modal";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  DAY_PLAN_SECTIONS,
  dayPlanDates,
  getDayPlanConfig,
  seedDay,
} from "@/src/lib/dayPlansSeed";
import "@/src/styles/day-plans.css";

const EMPTY_TASK = {
  category: "morning", title: "", startTime: "10:00", endTime: "11:00",
  location: "", groups: "", details: "", assigneeIds: [], documents: [],
  kitchen: false, menu: "", mealLocation: "inside", dietaryNotes: "",
  color: "", backgroundColor: "",
};

const SECTION_DEFAULT_TIMES = {
  breakfast: ["08:00", "09:30"],
  morning: ["10:00", "12:00"],
  lunch: ["12:30", "13:30"],
  afternoon: ["14:30", "17:30"],
  dinner: ["19:30", "20:30"],
  evening: ["21:00", "22:30"],
};

const SECTION_CLICK_RANGES = {
  breakfast: ["08:00", "09:30"],
  morning: ["09:00", "12:30"],
  lunch: ["12:00", "14:00"],
  afternoon: ["14:00", "18:30"],
  dinner: ["19:00", "21:00"],
  evening: ["20:30", "23:30"],
};

const COLOR_PRESETS = [
  { label: "Bleu", color: "#0284c7", backgroundColor: "#e0f2fe" },
  { label: "Vert", color: "#15803d", backgroundColor: "#e5f7ea" },
  { label: "Violet", color: "#7c3aed", backgroundColor: "#f1e8ff" },
  { label: "Rose", color: "#db2777", backgroundColor: "#fce7f3" },
  { label: "Orange", color: "#c56a08", backgroundColor: "#fff1d6" },
  { label: "Indigo", color: "#4f46e5", backgroundColor: "#e9e9ff" },
  { label: "Cyan", color: "#0891b2", backgroundColor: "#ddf8fc" },
  { label: "Rouge", color: "#dc2626", backgroundColor: "#fee2e2" },
];

const MCSC_S2_KITCHEN_CHILDREN = [
  "Marie-Olivia ACOUMIEN",
  "Jabran Aldgig",
  "Louisa ALLIOUD",
  "Sara-Clemence ALLIOUD",
  "Heloise BALA-HAETTIGER",
  "Mila Ballester",
  "Anaelle BASSON",
  "Maysan Benbouzid",
  "Ludmila benghine van stpidonk",
  "Lyna Benkuider",
  "Ninon Buisson",
  "Bilal El kassaoui",
  "Selma El kassaoui",
  "Aymen FELKAOUI",
  "Youssef FELKAOUI",
  "Sophia FELKAOUI",
  "Noemie Gilardi",
  "Mohamed Laouail",
  "Rabah Laouail",
  "Noemie Lautier",
  "Johan Lecuyer",
  "Diane MELIET",
  "Maylis Naghmouchi",
  "Iliana Naghmouchi",
  "Lola PROCACCI",
  "Louise Raylat",
  "Martin Raylat",
  "Sara Seide",
  "Gabriela Seide",
  "Vadim Sillas",
  "Louise Touzaine",
  "Leena Vanhee",
];

const MCSC_S2_KITCHEN_MENUS = [
  {
    id: "mcsc-s2-menu-kebab",
    title: "Kebab / shawarma",
    children: ["Selma El kassaoui", "Bilal El kassaoui", "Noemie Gilardi", "Youssef FELKAOUI", "Rabah Laouail"],
    menu: [
      "Shawarma : oignons rouges, salade, tomates, poulet marine, epices harissa.",
      "Sauces : algerienne, Biggy, blanche.",
      "Pommes de terre barbecue.",
      "Dessert : tiramisu cafe, speculoos, Oreo.",
    ].join("\n"),
  },
  {
    id: "mcsc-s2-menu-burrata-carbonara",
    title: "Burrata tomate / pates carbonara",
    children: ["Jabran Aldgig", "Maysan Benbouzid", "Mohamed Laouail", "Lyna Benkuider", "Leena Vanhee", "Louisa ALLIOUD", "Sara-Clemence ALLIOUD"],
    menu: [
      "Entree : burrata tomate.",
      "Plat : pates carbonara.",
      "Dessert : milkshake vanille.",
    ].join("\n"),
  },
  {
    id: "mcsc-s2-menu-stars",
    title: "Tasty crousty",
    children: ["Louise Raylat", "Mila Ballester", "Noemie Lautier", "Ludmila benghine van stpidonk", "Johan Lecuyer"],
    menu: [
      "Tasty crousty.",
      "Melon et pasteque.",
    ].join("\n"),
  },
  {
    id: "mcsc-s2-menu-chinois",
    title: "Menu chinois",
    children: ["Heloise BALA-HAETTIGER", "Louise Touzaine", "Anaelle BASSON", "Marie-Olivia ACOUMIEN", "Ninon Buisson", "Martin Raylat", "Vadim Sillas"],
    menu: [
      "Nouilles chinoises.",
      "Carottes, brocolis.",
      "Graines de sesame, oignons frits.",
      "Poivrons, poulet, chou.",
      "Sauce soja salee, sucre.",
      "Dessert : farine, beurre, sucre, poudre d'amandes.",
    ].join("\n"),
  },
  {
    id: "mcsc-s2-menu-noel",
    title: "Salade concombre / riz sauce tomate",
    children: [],
    assumedMissingGroup: true,
    menu: [
      "Entree : salade de concombre.",
      "Concombre, tomates cerises, mozzarella, vinaigre, sel, huile.",
      "Plat : riz sauce tomate.",
      "Riz, viande hachee, sauce tomate maison.",
      "Dessert : cheesecake speculoos.",
      "Courses notees : 2 packs de 12 oeufs, 1 kg sucre, 2 packs speculoos, 3 plaquettes beurre, 2 kg creme fraiche epaisse, vanille en poudre, fromage frais.",
      "Groupe enfants : Diane, Sophia, Sara, Gabriela, Lola, Maylis, Iliana, Aymen.",
    ].join("\n"),
  },
];

function normalizeChildName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function mcscS2KitchenCoverage() {
  const all = new Map(MCSC_S2_KITCHEN_CHILDREN.map((name) => [normalizeChildName(name), name]));
  const used = new Map();
  MCSC_S2_KITCHEN_MENUS.forEach((menu) => {
    (menu.children || []).forEach((name) => used.set(normalizeChildName(name), name));
  });
  return {
    covered: [...used.values()],
    missing: [...all.entries()].filter(([key]) => !used.has(key)).map(([, name]) => name),
    total: all.size,
  };
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });

function dateLabel(value, short = false) {
  const formatter = short ? shortFormatter : dateFormatter;
  const label = formatter.format(new Date(`${value}T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function stayDateRange(stay) {
  const start = dateLabel(stay.startDate, true).replace(/^\w+\.\s*/i, "");
  const end = dateLabel(stay.endDate, true).replace(/^\w+\.\s*/i, "");
  return `${start} - ${end}`;
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

function defaultSelectedDate(dates, stay) {
  const now = new Date();
  if (now.getHours() >= 22) now.setDate(now.getDate() + 1);
  const local = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  if (dates.includes(local)) return local;
  return local < stay.startDate ? stay.startDate : stay.endDate;
}

function memberName(member) {
  return member?.firstName || String(member?.name || "").split(" ")[0] || "Anim";
}

function memberActiveOnDate(member, date) {
  if (!date) return true;
  if (Array.isArray(member?.contracts) && member.contracts.length) {
    return member.contracts.some((contract) => memberActiveOnDate(contract, date));
  }
  const start = String(member?.contractStartDate || "").slice(0, 10);
  const end = String(member?.contractEndDate || "").slice(0, 10);
  return (!start || date >= start) && (!end || date <= end);
}

function activeContractOnDate(member, date) {
  return (member?.contracts || []).find((contract) => memberActiveOnDate(contract, date)) || null;
}

function initials(member) {
  return `${member?.firstName?.[0] || member?.name?.[0] || ""}`.toUpperCase() || "?";
}

function newId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => `${a.startTime || "99:99"}-${a.title}`.localeCompare(`${b.startTime || "99:99"}-${b.title}`, "fr"));
}

function isMcscS2(stay) {
  return stay?.id === "mcsc-s2-2026" || (stay?.code === "MCSC" && stay?.week === "S2");
}

function normalizeMcscS2Plan(plan, seededPlan) {
  const seededTasks = seededPlan?.tasks || [];
  const deletedTaskIds = new Set(plan?.deletedTaskIds || []);
  const hasImportedPlanning = Boolean(plan?.importedFrom);
  const managedSeedTasks = seededTasks.filter((task) => (
    String(task.id || "").startsWith("s2-") && (/surf/i.test(task.title || "") || task.category === "evening")
    && !hasImportedPlanning
    && !deletedTaskIds.has(task.id)
  ));
  const managedIds = new Set(managedSeedTasks.map((task) => task.id));
  const cleanedExistingTasks = (plan?.tasks || []).filter((task) => (
    task.title !== "Activites ColoCrew / surf / grand jeu"
    && task.title !== "Activites ColoCrew / grand jeu"
    && task.title !== "Veillee a construire"
    && !managedIds.has(task.id)
  ));
  return {
    ...plan,
    tasks: sortTasks([...cleanedExistingTasks, ...managedSeedTasks]),
  };
}

function normalizePlanForDisplay(plan, seededPlan, stay) {
  if (!isMcscS2(stay)) return plan;
  return normalizeMcscS2Plan(plan, seededPlan);
}

function activityPalette(task, fallback = "#8b5cf6") {
  if (isHexColor(task?.color)) {
    return {
      color: task.color,
      background: isHexColor(task?.backgroundColor) ? task.backgroundColor : `${task.color}18`,
    };
  }
  const text = `${task?.title || ""} ${task?.category || ""} ${task?.location || ""} ${task?.groups || ""} ${task?.details || ""}`.toLocaleLowerCase("fr");
  if (text.includes("surf")) return { color: "#0284c7", background: "#e0f2fe" };
  if (/repas|d[îi]ner|petit d[ée]jeuner|brunch|cuisine|pique-nique/.test(text)) return { color: "#c56a08", background: "#fff1d6" };
  if (/projet artistique|art|cr[ée]a/.test(text)) return { color: "#7c3aed", background: "#f1e8ff" };
  if (/veill[ée]e|bookmaker|cluedo|zombie|sagamore|loup|boom|fureur/.test(text)) return { color: "#4f46e5", background: "#e9e9ff" };
  if (/plage|lac|baignade/.test(text)) return { color: "#0891b2", background: "#ddf8fc" };
  if (/ville|glace|sunset|balade/.test(text)) return { color: "#db2777", background: "#fce7f3" };
  if (/grand jeu|koh|time|d[ée]fi|tournoi|sardine/.test(text)) return { color: "#15803d", background: "#e5f7ea" };
  return { color: fallback, background: `${fallback}18` };
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function isSplitTask(task) {
  return Boolean(task?.rotationSegments?.length);
}

function taskMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function timeFromMinutes(minutes) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes / 15) * 15));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function addMinutes(value, minutes) {
  return timeFromMinutes(taskMinutes(value) + minutes);
}

function clickedSectionTime(event, sectionKey) {
  const [start, end] = SECTION_CLICK_RANGES[sectionKey] || SECTION_DEFAULT_TIMES[sectionKey] || SECTION_DEFAULT_TIMES.morning;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0;
  return timeFromMinutes(taskMinutes(start) + (taskMinutes(end) - taskMinutes(start)) * ratio);
}

function overlapsTask(a, b) {
  const aStart = taskMinutes(a.startTime);
  const aEnd = taskMinutes(a.endTime || a.startTime);
  const bStart = taskMinutes(b.startTime);
  const bEnd = taskMinutes(b.endTime || b.startTime);
  return aStart < bEnd && bStart < aEnd;
}

function groupNumbers(text) {
  return [...String(text || "").matchAll(/\b(?:groupe|groupes|g)\s*([1-9])/gi)].map((match) => Number(match[1]));
}

function otherGroupsLabel(task) {
  const surfGroups = new Set(groupNumbers(`${task.title} ${task.groups}`));
  const allGroups = [1, 2, 3, 4];
  const others = allGroups.filter((number) => !surfGroups.has(number));
  if (!others.length) return "Autres groupes";
  return `Groupes ${others.join(" et ")}`;
}

function otherGroupsActivity(tasks, surfTask) {
  const parallel = tasks.find((task) => !isSplitTask(task) && overlapsTask(task, surfTask));
  if (parallel) return parallel.title;
  return "Activité à renseigner";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function openDayPdf({ date, plan, members, memberById, unavailability, stay }) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const rows = DAY_PLAN_SECTIONS.flatMap((section) => sortTasks((plan.tasks || []).filter((task) => task.category === section.key)).map((task) => {
    const assigned = (task.assigneeIds || []).map((id) => memberById[id]).filter(Boolean).map(memberName).join(", ") || "À affecter";
    const leave = members.filter((member) => unavailability(member.id, task.startTime)).map(memberName).join(", ") || "Personne";
    const palette = activityPalette(task, section.color);
    return `<article style="--accent:${palette.color};--soft:${palette.background}"><div class="moment"><span>${section.icon}</span><b>${escapeHtml(section.label)}</b></div><div class="activity"><div class="time">${escapeHtml(task.startTime || "—")}${task.endTime ? ` – ${escapeHtml(task.endTime)}` : ""}</div><h2>${escapeHtml(task.title)}</h2>${task.details ? `<p>${escapeHtml(task.details).replace(/\n/g, "<br>")}</p>` : ""}${task.photo?.url ? `<img src="${escapeHtml(task.photo.url)}" alt="">` : ""}</div><div class="team"><b>Équipe</b><span>${escapeHtml(assigned)}</span><b>En congé</b><span>${escapeHtml(leave)}</span></div></article>`;
  })).join("");
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Déroulé ${escapeHtml(dateLabel(date))}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#f5f3f7;color:#26183b;font-family:Arial,sans-serif}.page{max-width:900px;margin:auto;padding:18px}header{margin-bottom:16px;border-bottom:4px solid #b72f69;padding-bottom:12px}header small{color:#b72f69;font-weight:800;text-transform:uppercase}h1{margin:4px 0 2px;font-size:27px}header p{margin:0;color:#6f637a;font-size:12px}article{display:grid;grid-template-columns:125px minmax(0,1fr) 180px;overflow:hidden;margin:0 0 9px;border:1px solid #dcd5e2;border-left:7px solid var(--accent);border-radius:10px;background:#fff;break-inside:avoid}.moment{display:flex;align-items:center;gap:8px;background:var(--soft);padding:13px;font-size:12px}.moment span{font-size:20px}.activity{padding:12px 14px}.time{color:var(--accent);font-size:12px;font-weight:900}.activity h2{margin:3px 0;font-size:16px}.activity p{margin:7px 0 0;color:#54495d;font-size:11px;line-height:1.5}.activity img{width:100%;max-height:180px;margin-top:8px;border-radius:7px;object-fit:cover}.team{display:flex;justify-content:center;flex-direction:column;gap:3px;border-left:1px solid #e5dfe9;padding:11px}.team b{color:#7b6c86;font-size:9px;text-transform:uppercase}.team span{margin-bottom:5px;font-size:11px;font-weight:700}.notes{margin-top:14px;border:1px solid #ddd5e4;border-radius:8px;background:#fff;padding:11px;font-size:11px;white-space:pre-wrap}@media(max-width:600px){.page{padding:10px}h1{font-size:23px}article{grid-template-columns:92px 1fr}.team{grid-column:2;border-left:0;border-top:1px solid #e5dfe9}.moment{grid-row:span 2;padding:9px}.activity{padding:10px}.activity h2{font-size:15px}}@media print{body{background:#fff}.page{padding:0}.print{display:none}}</style></head><body><main class="page"><header><small>${escapeHtml(stay.name)} · ${escapeHtml(stay.week)}</small><h1>${escapeHtml(dateLabel(date))}</h1><p>${(plan.tasks || []).length} activités · horaires, équipe et congés</p></header>${rows || "<p>Aucune activité programmée.</p>"}${plan.notes ? `<div class="notes"><b>Notes de la journée</b><br>${escapeHtml(plan.notes)}</div>` : ""}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`);
  popup.document.close();
  return true;
}

function leaveWindowLabel(date) {
  return `${dateLabel(previousDate(date), true)} 19 h → ${dateLabel(date, true)} 19 h`;
}

function openWeekPdf({ plans, dates, config, stay, memberById }) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const headerCells = dates.map((date, index) => `<th><small>J${index + 1}</small><strong>${escapeHtml(dateLabel(date, true))}</strong></th>`).join("");
  const rows = DAY_PLAN_SECTIONS.map((section) => {
    const cells = dates.map((date) => {
      const tasks = sortTasks(((plans[date] || seedDay(date, config)).tasks || []).filter((task) => task.category === section.key));
      const content = tasks.length ? tasks.map((task) => {
        const palette = activityPalette(task, section.color);
        const assigned = (task.assigneeIds || []).map((id) => memberById[id]?.firstName || memberById[id]?.name).filter(Boolean).join(", ");
        return `<article style="--accent:${palette.color};--soft:${palette.background}"><b>${escapeHtml(task.startTime || "--:--")}${task.endTime ? ` - ${escapeHtml(task.endTime)}` : ""}</b><strong>${escapeHtml(task.title || "Sans titre")}</strong>${task.groups || task.location ? `<small>${escapeHtml([task.location, task.groups].filter(Boolean).join(" - "))}</small>` : ""}${assigned ? `<em>${escapeHtml(assigned)}</em>` : ""}</article>`;
      }).join("") : `<span class="empty">-</span>`;
      return `<td>${content}</td>`;
    }).join("");
    return `<tr><th class="moment" style="--section:${section.color}"><span>${escapeHtml(section.icon)}</span><strong>${escapeHtml(section.label)}</strong></th>${cells}</tr>`;
  }).join("");
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planning semaine ${escapeHtml(stay.week)}</title><style>@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{margin:0;background:#f6f4fa;color:#24173d;font-family:Arial,sans-serif}.page{padding:12px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:10px;border-bottom:4px solid #b72f69;padding-bottom:9px}h1{margin:0;font-size:22px}.meta{margin-top:3px;color:#6f637a;font-size:11px;line-height:1.4}.print{border:0;border-radius:8px;background:#b72f69;color:#fff;padding:8px 11px;font-weight:800;cursor:pointer}table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}th,td{border:1px solid #ddd5e4;vertical-align:top}thead th{background:#281747;color:#fff;padding:6px 5px;text-align:left}thead th:first-child{width:95px}thead small,thead strong{display:block}thead small{color:#d6c8e7;font-size:8px}thead strong{font-size:10px}.moment{width:95px;background:#fbf9fd;padding:8px 6px;border-left:5px solid var(--section);font-size:10px}.moment span,.moment strong{display:block}.moment span{font-size:16px;margin-bottom:4px}td{height:94px;padding:4px;background:#fff}article{margin-bottom:3px;border:1px solid color-mix(in srgb,var(--accent) 28%,white);border-left:4px solid var(--accent);border-radius:6px;background:var(--soft);padding:4px 5px;break-inside:avoid}article b{display:block;color:var(--accent);font-size:8px}article strong{display:block;margin-top:1px;font-size:9px;line-height:1.2}article small,article em{display:block;margin-top:2px;color:#5d5067;font-size:7px;line-height:1.25;font-style:normal}.empty{display:grid;place-items:center;height:100%;color:#9b8ca6;font-size:12px}@media print{body{background:#fff}.page{padding:0}.print{display:none}article{box-shadow:none}}</style></head><body><main class="page"><header><div><h1>Planning de la semaine - ${escapeHtml(stay.week)}</h1><div class="meta">${escapeHtml(stay.name)} - ${escapeHtml(stay.startDate)} au ${escapeHtml(stay.endDate)}<br>Export genere le ${escapeHtml(new Date().toLocaleString("fr-FR"))}</div></div><button class="print" onclick="window.print()">Imprimer / PDF</button></header><table><thead><tr><th>Moment</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`);
  popup.document.close();
  return true;
}

function openMenusPdf({ plans, dates, config, stay, memberById }) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;

  const mealSections = [
    { key: "breakfast", label: "Petit dejeuner", color: "#d97706" },
    { key: "lunch", label: "Repas du midi", color: "#16a34a" },
    { key: "dinner", label: "Diner", color: "#ea580c" },
  ];

  const mealContent = (task, color) => {
    const menu = task.menu && !/renseigner/i.test(task.menu) ? task.menu : task.details;
    const team = (task.assigneeIds || []).map((id) => memberById[id]?.firstName || memberById[id]?.name).filter(Boolean).join(", ");
    const meta = [
      task.groups ? `Groupe : ${task.groups}` : "",
      task.mealLocation === "outside" ? "Repas dehors" : "",
      task.dietaryNotes ? `Regimes : ${task.dietaryNotes}` : "",
      team ? `Equipe : ${team}` : "",
    ].filter(Boolean);

    return `<article style="--meal:${color}"><b>${escapeHtml(task.startTime || "--:--")}${task.endTime ? ` - ${escapeHtml(task.endTime)}` : ""}</b><strong>${escapeHtml(task.title || "Repas")}</strong>${menu ? `<p>${escapeHtml(menu).replace(/\n/g, "<br>")}</p>` : `<em>Menu a completer</em>`}${meta.length ? `<small>${escapeHtml(meta.join(" - "))}</small>` : ""}</article>`;
  };

  const dayColumns = dates.map((date, index) =>
    `<th><small>J${index + 1}</small><strong>${escapeHtml(dateLabel(date))}</strong></th>`
  ).join("");

  const rows = mealSections.map((section) => {
    const cells = dates.map((date) => {
      const plan = plans[date] || seedDay(date, config);
      const meals = sortTasks((plan.tasks || []).filter((task) => task.category === section.key));
      return `<td>${meals.length ? meals.map((task) => mealContent(task, section.color)).join("") : `<span class="empty">A renseigner</span>`}</td>`;
    }).join("");
    return `<tr><th class="meal-head" style="--meal:${section.color}">${escapeHtml(section.label)}</th>${cells}</tr>`;
  }).join("");

  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Menus ${escapeHtml(stay.name)} ${escapeHtml(stay.week)}</title><style>@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{margin:0;background:#f6f4fa;color:#24173d;font-family:Arial,sans-serif}.page{padding:12px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:10px;border-bottom:4px solid #b72f69;padding-bottom:9px}h1{margin:0;font-size:23px}.meta{margin-top:3px;color:#6f637a;font-size:11px;line-height:1.4}.print{border:0;border-radius:9px;background:#b72f69;color:#fff;padding:9px 12px;font-weight:800;cursor:pointer}table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}th,td{border:1px solid #ddd5e4;vertical-align:top}thead th{background:#281747;color:#fff;padding:6px;text-align:left;font-size:9px}thead th:first-child{width:105px}thead th small,thead th strong{display:block}thead th small{color:#f5b9cf;font-size:8px}thead th strong{margin-top:2px;font-size:9px;line-height:1.2}.meal-head{background:#fbf9fd;border-left:5px solid var(--meal);color:#24173d;padding:8px;text-align:left;font-size:12px;line-height:1.25}td{padding:4px;min-height:120px}article{margin-bottom:4px;border:1px solid color-mix(in srgb,var(--meal) 28%,white);border-left:4px solid var(--meal);border-radius:6px;background:color-mix(in srgb,var(--meal) 8%,white);padding:5px;break-inside:avoid}article:last-child{margin-bottom:0}article b{display:block;color:var(--meal);font-size:8px}article strong{display:block;margin-top:2px;font-size:9px;line-height:1.2}article p{margin:4px 0 0;color:#46384f;font-size:8px;line-height:1.25}article em{display:block;margin-top:4px;color:#a3620d;font-size:8px;font-style:normal;font-weight:800}article small{display:block;margin-top:4px;color:#66586f;font-size:7px;line-height:1.25}.empty{display:grid;place-items:center;min-height:70px;border:1px dashed #d9cfe0;border-radius:6px;color:#9b8ca6;font-size:8px;text-align:center}@media print{body{background:#fff}.page{padding:0}.print{display:none}}</style></head><body><main class="page"><header><div><h1>Menus du sejour - ${escapeHtml(stay.week)}</h1><div class="meta">${escapeHtml(stay.name)} - ${escapeHtml(stay.startDate)} au ${escapeHtml(stay.endDate)}<br>Export genere le ${escapeHtml(new Date().toLocaleString("fr-FR"))}</div></div><button class="print" onclick="window.print()">Imprimer / PDF</button></header><table><thead><tr><th>Repas</th>${dayColumns}</tr></thead><tbody>${rows}</tbody></table></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`);
  popup.document.close();
  return true;
}

function openLeavesPdf({ plans, members, leaveDates, stay }) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;

  const counts = members.map((member) => ({
    member,
    days: leaveDates.filter((date) => (plans[date]?.leaveMemberIds || []).includes(member.id)),
  }));
  const alerts = [];
  const memberRows = counts.map(({ member, days }) => {
    const cells = leaveDates.map((date) => {
      const selected = days.includes(date);
      const assessment = leaveAssessment(plans, members, member, date, leaveDates);
      if (selected && ["danger", "warning"].includes(assessment.level)) {
        alerts.push({ member, date, assessment });
      }
      const label = selected ? leaveWindowLabel(date) : "—";
      const status = selected ? (assessment.level === "danger" ? "Alerte" : assessment.level === "warning" ? "À vérifier" : "OK") : "";
      return `<td class="${selected ? `is-leave is-${assessment.level}` : ""}"><strong>${escapeHtml(label)}</strong>${status ? `<small>${escapeHtml(status)}</small>` : ""}</td>`;
    }).join("");
    const statusClass = days.length === 2 ? "is-ok" : "is-alert";
    const statusText = days.length === 2 ? "2/2 OK" : `${days.length}/2 à corriger`;
    return `<tr><th><b>${escapeHtml(memberName(member))}</b><small>${escapeHtml(member.role || "")}</small><em class="${statusClass}">${escapeHtml(statusText)}</em></th>${cells}</tr>`;
  }).join("");

  const dayRows = leaveDates.map((date) => {
    const offIds = plans[date]?.leaveMemberIds || [];
    const offMembers = offIds.map((id) => members.find((member) => member.id === id)).filter(Boolean);
    const conflictMembers = offMembers.filter((member) => leaveAssessment(plans, members, member, date, leaveDates).level === "danger");
    const level = conflictMembers.length ? "danger" : offMembers.length >= 3 ? "warning" : "safe";
    return `<tr class="is-${level}"><td><b>${escapeHtml(dateLabel(date))}</b><small>${escapeHtml(leaveWindowLabel(date))}</small></td><td>${escapeHtml(offMembers.map(memberName).join(", ") || "Personne")}</td><td>${members.length - offMembers.length}</td><td>${escapeHtml(conflictMembers.length ? conflictMembers.map(memberName).join(", ") : level === "warning" ? "Beaucoup de congés le même jour" : "OK")}</td></tr>`;
  }).join("");

  const alertRows = alerts.length ? alerts.map(({ member, date, assessment }) => `<tr><td>${escapeHtml(memberName(member))}</td><td>${escapeHtml(leaveWindowLabel(date))}</td><td>${escapeHtml(assessment.label)}</td><td>${escapeHtml(assessment.detail)}</td></tr>`).join("") : `<tr><td colspan="4">Aucune incompatibilité détectée sur les congés posés.</td></tr>`;

  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Congés ${escapeHtml(stay.week)}</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;background:#f6f4fa;color:#24173d;font-family:Arial,sans-serif}.page{padding:16px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:14px;border-bottom:4px solid #b72f69;padding-bottom:10px}h1{margin:0;font-size:25px}.meta{color:#6f637a;font-size:12px;line-height:1.5}.rule{border:1px solid #efcf8b;border-radius:10px;background:#fff8e8;padding:10px;color:#76520b;font-size:12px;font-weight:700}.print{border:0;border-radius:9px;background:#b72f69;color:#fff;padding:9px 12px;font-weight:800;cursor:pointer}section{margin-top:15px}h2{margin:0 0 8px;font-size:17px}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #ddd4e5;border-radius:10px;overflow:hidden}th,td{border:1px solid #e4ddeb;padding:7px;text-align:left;vertical-align:top;font-size:10px}thead th{background:#281747;color:#fff;font-size:10px}tbody th{min-width:135px;background:#fbf9fd}tbody th b,tbody th small,tbody th em{display:block}tbody th small{margin-top:2px;color:#7a6d86;font-size:9px}tbody th em{margin-top:5px;border-radius:99px;padding:3px 6px;width:max-content;font-size:9px;font-style:normal}.is-ok{background:#e8f7ee;color:#13733a}.is-alert{background:#fff0ee;color:#b42318}td strong,td small{display:block}td small{margin-top:3px;color:#6d6078}.is-leave{background:#f0e6fb}.is-leave.is-warning{background:#fff7df}.is-leave.is-danger{background:#ffeceb;color:#9b1c13}.daily tr.is-warning td{background:#fff9e9}.daily tr.is-danger td{background:#fff0ee}.alerts td{font-size:11px}.alerts tr:nth-child(n+1) td{background:#fffaf0}@media(max-width:700px){@page{size:A4 portrait}.page{padding:10px}header{display:block}.print{display:none}table{font-size:9px}th,td{padding:5px;font-size:9px}}@media print{body{background:#fff}.page{padding:0}.print{display:none}section{break-inside:avoid}}</style></head><body><main class="page"><header><div><h1>Planning des congés — ${escapeHtml(stay.week)}</h1><div class="meta">${escapeHtml(stay.name)} · ${escapeHtml(stay.startDate)} au ${escapeHtml(stay.endDate)}<br>Export généré le ${escapeHtml(new Date().toLocaleString("fr-FR"))}</div></div><button class="print" onclick="window.print()">Imprimer / PDF</button></header><div class="rule">Règle de lecture : une case cochée le jour J signifie un congé de la veille à 19 h jusqu’au jour J à 19 h. Tous les jours du séjour peuvent être sélectionnés, y compris le premier et le dernier jour.</div><section><h2>Vue par animateur·ice</h2><table><thead><tr><th>Équipe</th>${leaveDates.map((date) => `<th>${escapeHtml(dateLabel(date, true))}</th>`).join("")}</tr></thead><tbody>${memberRows}</tbody></table></section><section><h2>Récap par jour</h2><table class="daily"><thead><tr><th>Jour</th><th>En congé</th><th>Disponibles</th><th>Signal</th></tr></thead><tbody>${dayRows}</tbody></table></section><section><h2>Incompatibilités / points à vérifier</h2><table class="alerts"><thead><tr><th>Anim</th><th>Créneau congé</th><th>Niveau</th><th>Détail</th></tr></thead><tbody>${alertRows}</tbody></table></section></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`);
  popup.document.close();
  return true;
}

export default function DayPlans({ stayCode = "MCSC", week = "S1" }) {
  const { showToast } = useToast();
  const config = useMemo(() => getDayPlanConfig(stayCode, week), [stayCode, week]);
  const stay = config.stay;
  const dates = useMemo(() => dayPlanDates(config), [config]);
  const seededPlans = useMemo(() => Object.fromEntries(dates.map((date) => [date, seedDay(date, config)])), [dates, config]);
  const leaveDates = useMemo(() => dates, [dates]);
  const [plans, setPlans] = useState({});
  const [members, setMembers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => defaultSelectedDate(dates, stay));
  const [view, setView] = useState("day");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    setSelectedDate((current) => dates.includes(current) ? current : defaultSelectedDate(dates, stay));
  }, [dates, stay]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPlans(seededPlans);
    Promise.all([
      getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
      getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
      getDocs(collection(db, COLLECTIONS.DAY_PLANS)),
    ]).then(([memberSnap, contractSnap, planSnap]) => {
      if (!active) return;
      const contracts = contractSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
      const stayContracts = contracts.filter((contract) => contract.week === stay.week && String(contract.stayCode || "").toUpperCase() === stay.code);
      const memberIds = new Set(stayContracts.map((contract) => contract.memberId));
      const contractsByMember = stayContracts.reduce((result, contract) => {
        result[contract.memberId] = [...(result[contract.memberId] || []), contract];
        return result;
      }, {});
      setMembers(memberSnap.docs.map((item) => {
        const memberContracts = (contractsByMember[item.id] || [])
          .sort((left, right) => String(left.startDate || "").localeCompare(String(right.startDate || ""), "fr"));
        const contract = memberContracts[0] || {};
        return {
          id: item.id,
          ...item.data(),
          role: contract.role || "Animateur·ice",
          contractId: contract.id || "",
          contractStartDate: contract.startDate || "",
          contractEndDate: contract.endDate || "",
          contracts: memberContracts.map((item) => ({
            id: item.id,
            role: item.role || "Animateur·ice",
            startDate: item.startDate || "",
            endDate: item.endDate || "",
          })),
        };
      }).filter((member) => memberIds.has(member.id)).sort((a, b) => memberName(a).localeCompare(memberName(b), "fr")));

      const existing = Object.fromEntries(planSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((plan) => plan.stayId === stay.id)
        .map((plan) => [plan.date, normalizePlanForDisplay(plan, seededPlans[plan.date], stay)]));
      setPlans({ ...seededPlans, ...existing });
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setPlans(seededPlans);
      setLoading(false);
      showToast(error?.message || "Chargement du planning impossible.", "error");
    });

    const unsubscribe = onSnapshot(collection(db, COLLECTIONS.DAY_PLANS), (snapshot) => {
      if (!active) return;
      const next = {};
      snapshot.docs.forEach((item) => {
        const data = item.data();
        if (data.stayId === stay.id) {
          const plan = { id: item.id, ...data };
          next[data.date] = normalizePlanForDisplay(plan, seededPlans[plan.date], stay);
        }
      });
      setPlans({ ...seededPlans, ...next });
      setLoading(false);
    }, () => setLoading(false));
    return () => { active = false; unsubscribe(); };
  }, [seededPlans, stay, showToast]);

  const selectedPlan = plans[selectedDate] || seedDay(selectedDate, config);
  const selectedMembers = useMemo(
    () => members
      .map((member) => {
        const contract = activeContractOnDate(member, selectedDate);
        return contract ? {
          ...member,
          role: contract.role || member.role,
          contractId: contract.id || member.contractId,
          contractStartDate: contract.startDate || member.contractStartDate,
          contractEndDate: contract.endDate || member.contractEndDate,
        } : member;
      })
      .filter((member) => memberActiveOnDate(member, selectedDate)),
    [members, selectedDate],
  );
  const selectedMemberById = useMemo(() => Object.fromEntries(selectedMembers.map((member) => [member.id, member])), [selectedMembers]);
  const memberById = useMemo(() => Object.fromEntries(members.map((member) => [member.id, member])), [members]);

  const saveDay = async (date, fields, successMessage = "Planning enregistré.") => {
    setSaving(true);
    try {
      const current = plans[date] || seedDay(date, config);
      await setDoc(doc(db, COLLECTIONS.DAY_PLANS, `${stay.id}-${date}`), {
        ...current,
        ...fields,
        updatedAt: new Date().toISOString(),
        updatedBy: "",
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
    const plan = plans[date] || seedDay(date, config);
    const leave = new Set(plan.leaveMemberIds || []);
    leave.has(memberId) ? leave.delete(memberId) : leave.add(memberId);
    await saveDay(date, { leaveMemberIds: [...leave] }, "Congés mis à jour.");
  };

  const saveTask = async (draft, photoFile = null) => {
    const taskId = draft.id || newId();
    const sourceDate = draft._sourceDate || selectedDate;
    const targetDate = draft.targetDate || sourceDate;
    let photo = draft.photo || null;
    if (photoFile) {
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storageRef = ref(storage, `day-plans/${stay.id}/${targetDate}/${taskId}/${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, photoFile, { contentType: photoFile.type || "image/jpeg" });
      photo = { name: photoFile.name, url: await getDownloadURL(storageRef) };
    }
    const { _sourceDate, targetDate: _targetDate, ...publicDraft } = draft;
    const complete = { ...EMPTY_TASK, ...publicDraft, id: taskId, photo };
    if (sourceDate === targetDate) {
      const sourcePlan = plans[sourceDate] || seedDay(sourceDate, config);
      const tasks = [...(sourcePlan.tasks || []).filter((task) => task.id !== taskId), complete];
      await saveDay(targetDate, {
        tasks: sortTasks(tasks),
        deletedTaskIds: (sourcePlan.deletedTaskIds || []).filter((id) => id !== taskId),
      }, "Activité enregistrée.");
    } else {
      setSaving(true);
      try {
        const sourcePlan = plans[sourceDate] || seedDay(sourceDate, config);
        const targetPlan = plans[targetDate] || seedDay(targetDate, config);
        await Promise.all([
          setDoc(doc(db, COLLECTIONS.DAY_PLANS, `${stay.id}-${sourceDate}`), {
            ...sourcePlan,
            tasks: sortTasks((sourcePlan.tasks || []).filter((task) => task.id !== taskId)),
            updatedAt: new Date().toISOString(),
            updatedBy: "",
          }, { merge: true }),
          setDoc(doc(db, COLLECTIONS.DAY_PLANS, `${stay.id}-${targetDate}`), {
            ...targetPlan,
            tasks: sortTasks([...(targetPlan.tasks || []).filter((task) => task.id !== taskId), complete]),
            deletedTaskIds: (targetPlan.deletedTaskIds || []).filter((id) => id !== taskId),
            updatedAt: new Date().toISOString(),
            updatedBy: "",
          }, { merge: true }),
        ]);
        showToast("Activité déplacée.", "success");
      } catch (error) {
        showToast(error?.message || "Déplacement impossible.", "error");
        throw error;
      } finally {
        setSaving(false);
      }
    }
    setSelectedDate(targetDate);
    setEditor(null);
  };

  const deleteTask = async (task) => {
    const date = task._sourceDate || selectedDate;
    const plan = plans[date] || seedDay(date, config);
    const tasks = (plan.tasks || []).filter((item) => item.id !== task.id);
    const deletedTaskIds = [...new Set([...(plan.deletedTaskIds || []), task.id].filter(Boolean))];
    await saveDay(date, { tasks, deletedTaskIds }, "Activité supprimée.");
    setEditor(null);
  };

  const duplicateTask = async (task) => {
    const date = task.targetDate || task._sourceDate || selectedDate;
    const plan = plans[date] || seedDay(date, config);
    const { id: _id, _sourceDate, targetDate, ...taskFields } = task;
    const copy = {
      ...EMPTY_TASK,
      ...taskFields,
      id: newId(),
      title: `${task.title || "Activité"} (copie)`,
    };
    await saveDay(date, {
      tasks: sortTasks([...(plan.tasks || []), copy]),
      deletedTaskIds: (plan.deletedTaskIds || []).filter((id) => id !== copy.id),
    }, "Activité dupliquée.");
    setSelectedDate(date);
    setEditor({ ...copy, _sourceDate: date, targetDate: date });
  };

  const toggleTaskAssignee = async (task, memberId) => {
    const assigned = new Set(task.assigneeIds || []);
    if (unavailability(memberId, task.startTime) && !assigned.has(memberId)) return;
    assigned.has(memberId) ? assigned.delete(memberId) : assigned.add(memberId);
    const tasks = (selectedPlan.tasks || []).map((item) => item.id === task.id ? { ...item, assigneeIds: [...assigned] } : item);
    await saveDay(selectedDate, { tasks }, "");
  };

  const openTaskEditor = (date, task, nextView = null) => {
    setSelectedDate(date);
    if (nextView) setView(nextView);
    setEditor({ ...EMPTY_TASK, ...task, _sourceDate: date, targetDate: date });
  };

  const openNewTaskEditor = (date, sectionKey, startOverride = "") => {
    const [defaultStart, defaultEnd] = SECTION_DEFAULT_TIMES[sectionKey] || SECTION_DEFAULT_TIMES.morning;
    const startTime = startOverride || defaultStart;
    const endTime = startOverride ? addMinutes(startOverride, Math.max(45, taskMinutes(defaultEnd) - taskMinutes(defaultStart))) : defaultEnd;
    setSelectedDate(date);
    setEditor({
      ...EMPTY_TASK,
      category: sectionKey,
      startTime,
      endTime,
      _sourceDate: date,
      targetDate: date,
    });
  };

  const openKitchenMenuEditor = (menu) => {
    setEditor({
      ...EMPTY_TASK,
      id: "",
      category: "dinner",
      title: menu.title,
      startTime: "17:30",
      endTime: "20:30",
      groups: menu.children?.length ? menu.children.join(", ") : "Groupe enfants a confirmer",
      details: menu.menu,
      menu: menu.menu,
      kitchen: true,
      mealLocation: "inside",
      _sourceDate: selectedDate,
      targetDate: selectedDate,
    });
  };

  return (
    <div className="dp-page">
      <header className="dp-topbar">
        <div>
          <span className="dp-eyebrow">Organisation du séjour</span>
          <h1>Déroulés des journées</h1>
          <p>{stay.name} · {stay.week} · {stayDateRange(stay)}</p>
        </div>
        <div className="dp-top-actions">
          <div className="dp-view-switch">
            <button type="button" className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>Jour</button>
            <button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>Planning général</button>
            <button type="button" className={view === "food" ? "is-active" : ""} onClick={() => setView("food")}>Repas</button>
            <button type="button" className={view === "leaves" ? "is-active" : ""} onClick={() => setView("leaves")}>Congés</button>
          </div>
          {view === "day" && <button type="button" className="dp-pdf-button" onClick={() => {
            if (!openDayPdf({ date: selectedDate, plan: selectedPlan, members: selectedMembers, memberById, unavailability, stay })) showToast("Autorisez les fenêtres pop-up pour ouvrir le PDF.", "error");
          }}>PDF du jour</button>}
          {view === "week" && <button type="button" className="dp-pdf-button" onClick={() => {
            if (!openWeekPdf({ plans, dates, config, stay, memberById })) showToast("Autorisez les fenetres pop-up pour ouvrir le PDF.", "error");
          }}>PDF semaine</button>}
          {view === "food" && <button type="button" className="dp-pdf-button" onClick={() => {
            if (!openMenusPdf({ plans, dates, config, stay, memberById })) showToast("Autorisez les fenetres pop-up pour exporter les menus.", "error");
          }}>PDF menus</button>}
          {view === "day" && <button type="button" className="dp-add-main" onClick={() => setEditor({ ...EMPTY_TASK, _sourceDate: selectedDate, targetDate: selectedDate })}>+ Ajouter une tâche</button>}
        </div>
      </header>

      <div className="dp-layout">
        <aside className="dp-days">
          <div className="dp-days-title">Jours du séjour</div>
          {dates.map((date, index) => {
            const plan = plans[date];
            const taskCount = plan?.tasks?.length || 0;
            const isToday = date === defaultSelectedDate(dates, stay);
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
            <WeekOverview
              plans={plans}
              members={members}
              dates={dates}
              config={config}
              stay={stay}
              onOpenTask={openTaskEditor}
              onAddTask={openNewTaskEditor}
              onSelect={(date) => { setSelectedDate(date); setView("day"); }}
            />
          ) : view === "food" ? (
            <FoodOverview
              plans={plans}
              dates={dates}
              memberById={memberById}
              stay={stay}
              selectedDate={selectedDate}
              onOpen={(date, task) => openTaskEditor(date, task, "food")}
              onUseMenu={openKitchenMenuEditor}
            />
          ) : view === "leaves" ? (
            <LeavesOverview plans={plans} members={members} leaveDates={leaveDates} stay={stay} saving={saving} onToggle={toggleLeave} showToast={showToast} />
          ) : (
            <>
              <DayHeader date={selectedDate} plan={selectedPlan} dates={dates} leaveDates={leaveDates} stay={stay} members={selectedMembers} saving={saving} onToggleLeave={toggleLeave} />
              <DayTimeline
                plan={selectedPlan}
                members={selectedMembers}
                memberById={selectedMemberById}
                unavailability={unavailability}
                onEdit={(task) => openTaskEditor(selectedDate, task)}
                onAdd={(sectionKey) => openNewTaskEditor(selectedDate, sectionKey)}
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
        dates={dates}
        members={selectedMembers}
        memberById={selectedMemberById}
        saving={saving}
        onClose={() => setEditor(null)}
        onSave={saveTask}
        onDelete={deleteTask}
        onDuplicate={duplicateTask}
      />
    </div>
  );
}

function DayHeader({ date, plan, dates, leaveDates, stay, members, saving, onToggleLeave }) {
  const [open, setOpen] = useState(false);
  const leave = plan.leaveMemberIds || [];
  const leaveAllowed = leaveDates.includes(date);
  return (
    <section className="dp-day-head">
      <div>
        <span>{date === defaultSelectedDate(dates, stay) ? "Aujourd’hui" : "Journée"}</span>
        <h2>{dateLabel(date)}</h2>
        <p>{plan.tasks?.length || 0} tâches programmées · mise à jour automatique pour toute l’équipe</p>
      </div>
      <div className="dp-leave-control">
        <button type="button" disabled={!leaveAllowed} title={leaveAllowed ? "" : "Aucun congé pendant les 2 premiers et les 2 derniers jours"} onClick={() => setOpen((value) => !value)}>{leaveAllowed ? "🌴 En congé aujourd’hui" : "Congés non disponibles"} {leaveAllowed && <b>{leave.length}</b>}</button>
        {leaveAllowed && open && <div className="dp-leave-menu">
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

function DayTimeline({ plan, members, memberById, unavailability, onEdit, onAdd, onToggleAssignee }) {
  return <div className="dp-schedule-table">
    <div className="dp-table-head"><span>Moment</span><span>Activité</span><span>Animateur·ices</span><span>En congé</span></div>
    {DAY_PLAN_SECTIONS.map((section) => {
      const tasks = sortTasks((plan.tasks || []).filter((task) => task.category === section.key));
      const referenceTime = ["dinner", "evening"].includes(section.key) ? "20:00" : "12:00";
      const sectionLeave = members.filter((member) => unavailability(member.id, referenceTime));
      if (!tasks.length) return <div className="dp-table-row is-empty" key={section.key}>
        <div className="dp-moment" style={{ "--section-color": section.color }}><i>{section.icon}</i><strong>{section.label}</strong></div>
        <button type="button" className="dp-activity dp-add-slot" onClick={() => onAdd(section.key)}><span>À organiser</span><b>+</b></button><div className="dp-people"><em>—</em></div>
        <LeavePeople members={sectionLeave} />
      </div>;
      return tasks.map((task, index) => {
        const assigned = (task.assigneeIds || []).map((id) => memberById[id]).filter(Boolean);
        const unavailable = assigned.filter((member) => unavailability(member.id, task.startTime));
        const peopleOnLeave = members.filter((member) => unavailability(member.id, task.startTime));
        const palette = activityPalette(task, section.color);
        return <div className={`dp-table-row ${unavailable.length ? "has-conflict" : ""}`} key={task.id}>
          <div className={`dp-moment ${index > 0 ? "is-repeat" : ""}`} style={{ "--section-color": section.color }}>
            {index === 0 && <><i>{section.icon}</i><strong>{section.label}</strong></>}
          </div>
          <button type="button" className="dp-activity" style={{ "--activity-color": palette.color, "--activity-bg": palette.background }} onClick={() => onEdit(task)}>
            <span className="dp-inline-time">{task.startTime || "—"}{task.endTime ? ` – ${task.endTime}` : ""}</span>
            <strong>{task.title || "Sans titre"}</strong>
            <small>{[task.location, task.groups].filter(Boolean).join(" · ")}</small>
            {(task.details || task.menu) && <p>{task.details || task.menu}</p>}
            {(task.kitchen || task.photo?.url || unavailable.length > 0) && <span className="dp-tags">{task.kitchen && <i>🍳 Cuisine</i>}{task.photo?.url && <i>📷 Photo</i>}{unavailable.length > 0 && <i className="is-warning">⚠ Conflit congé</i>}</span>}
          </button>
          <QuickAssign task={task} members={members} unavailability={unavailability} onToggle={onToggleAssignee} />
          <LeavePeople members={peopleOnLeave} />
          {index === tasks.length - 1 && <button type="button" className="dp-row-add-task" onClick={() => onAdd(section.key)} title={`Ajouter dans ${section.label}`}>+</button>}
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

function WeekOverview({ plans, members, dates, config, stay, onSelect, onOpenTask, onAddTask }) {
  const scrollRef = useRef(null);
  const memberById = Object.fromEntries(members.map((member) => [member.id, member]));
  return <section className="dp-overview">
    <header><span className="dp-eyebrow">Planning général</span><h2>{stay.name} — {stay.week}</h2><p>Comme sur le planning Excel : les jours en colonnes et les moments de la journée en lignes.</p></header>
    <div className="dp-scroll-controls"><span>Déplacer le planning</span><div><button type="button" aria-label="Déplacer le planning vers la gauche" onClick={() => scrollRef.current?.scrollBy({ left: -700, behavior: "smooth" })}>←</button><button type="button" aria-label="Déplacer le planning vers la droite" onClick={() => scrollRef.current?.scrollBy({ left: 700, behavior: "smooth" })}>→</button></div></div>
    <div className="dp-excel-wrap" ref={scrollRef}>
      <div className="dp-excel-grid" style={{ "--day-count": dates.length }}>
        <div className="dp-excel-corner">PLANNING</div>
        {dates.map((date, index) => <button type="button" className="dp-excel-date" key={date} onClick={() => onSelect(date)}><small>J{index + 1}</small><strong>{dateLabel(date, true)}</strong></button>)}
        {DAY_PLAN_SECTIONS.map((section) => <div className="dp-excel-line" key={section.key} style={{ display: "contents" }}>
          <div className="dp-excel-label" style={{ "--section-color": section.color }}><span>{section.icon}</span><strong>{section.label}</strong></div>
          {dates.map((date) => {
            const tasks = sortTasks(((plans[date] || seedDay(date, config)).tasks || []).filter((task) => task.category === section.key));
            const addAtClick = (event) => {
              if (event.target.closest("[data-dp-action]")) return;
              onAddTask(date, section.key, clickedSectionTime(event, section.key));
            };
            return <div
              role="button"
              tabIndex={0}
              className="dp-excel-cell"
              key={`${section.key}-${date}`}
              onClick={addAtClick}
              onKeyDown={(event) => {
                if (!["Enter", " "].includes(event.key)) return;
                event.preventDefault();
                onAddTask(date, section.key);
              }}
            >
              {tasks.length ? tasks.map((task) => {
                const palette = activityPalette(task, section.color);
                if (isSplitTask(task)) {
                  if (task.rotationSegments?.length) {
                    return <button type="button" data-dp-action="edit" key={task.id} className="dp-surf-split" style={{ "--activity-color": palette.color, "--activity-bg": palette.background }} onClick={(event) => { event.stopPropagation(); onOpenTask(date, task); }}>
                      <b>{task.startTime}</b>
                      <strong>{task.title}</strong>
                      <small>{(task.assigneeIds || []).map((id) => memberById[id]?.firstName).filter(Boolean).join(", ") || "À affecter"}</small>
                      {(task.rotationSegments || []).map((segment) => (
                        <em key={`${task.id}-${segment.label}`}><i>{segment.label}</i><u>{segment.groups}</u></em>
                      ))}
                    </button>;
                  }
                  const otherLabel = otherGroupsLabel(task);
                  const otherActivity = otherGroupsActivity(tasks, task);
                  return <button type="button" data-dp-action="edit" key={task.id} className="dp-surf-split" style={{ "--activity-color": palette.color, "--activity-bg": palette.background }} onClick={(event) => { event.stopPropagation(); onOpenTask(date, task); }}>
                    <b>{task.startTime}</b>
                    <strong>{task.title}</strong>
                    <small>{(task.assigneeIds || []).map((id) => memberById[id]?.firstName).filter(Boolean).join(", ") || "À affecter"}</small>
                    <em><i>Surf</i><u>{task.groups || "Groupes à préciser"}</u></em>
                    <em className="is-other"><i>Autres</i><u>{otherLabel} · {otherActivity}</u></em>
                  </button>;
                }
                return <button type="button" data-dp-action="edit" key={task.id} style={{ "--activity-color": palette.color, "--activity-bg": palette.background }} onClick={(event) => { event.stopPropagation(); onOpenTask(date, task); }}><b>{task.startTime}</b><strong>{task.title}</strong><small>{(task.assigneeIds || []).map((id) => memberById[id]?.firstName).filter(Boolean).join(", ") || "A affecter"}</small></button>;
              }) : <em>—</em>}
              <button type="button" data-dp-action="add" className="dp-excel-add-task" aria-label={`Ajouter une tache ${section.label} le ${dateLabel(date, true)}`} onClick={(event) => { event.stopPropagation(); onAddTask(date, section.key, clickedSectionTime(event, section.key)); }}>+</button>
            </div>;
          })}
        </div>)}
      </div>
    </div>
  </section>;
}

function FoodOverview({ plans, dates, memberById, stay, selectedDate, onOpen, onUseMenu }) {
  const mealSections = [
    { key: "breakfast", label: "Petit déjeuner", icon: "☕", color: "#d97706" },
    { key: "lunch", label: "Repas du midi", icon: "🥗", color: "#16a34a" },
    { key: "dinner", label: "Dîner", icon: "🍽️", color: "#ea580c" },
  ];
  return <section className="dp-food-view">
    <header><span className="dp-eyebrow">Cuisine et repas</span><h2>Planning nourriture</h2><p>Menus, horaires, groupes cuisine et personnes affectées pour tout le séjour.</p></header>
    {stay?.code === "MCSC" && stay?.week === "S2" && <KitchenMenuLibrary selectedDate={selectedDate} onUseMenu={onUseMenu} />}
    <div className="dp-food-wrap"><table><thead><tr><th>Jour</th>{mealSections.map((section) => <th key={section.key}><span>{section.icon}</span>{section.label}</th>)}</tr></thead><tbody>
      {dates.map((date, index) => {
        const tasks = plans[date]?.tasks || [];
        return <tr key={date}><th><small>J{index + 1}</small><strong>{dateLabel(date)}</strong></th>{mealSections.map((section) => {
          const meals = sortTasks(tasks.filter((task) => task.category === section.key));
          return <td key={section.key}>{meals.length ? meals.map((task) => {
            const team = (task.assigneeIds || []).map((id) => memberById[id]?.firstName).filter(Boolean);
            const palette = activityPalette(task, section.color);
            return <button type="button" key={task.id} style={{ "--meal-color": palette.color, "--meal-bg": palette.background }} onClick={() => onOpen(date, task)}>
              <span className="dp-food-time">{task.startTime || "—"}{task.endTime ? ` – ${task.endTime}` : ""}</span>
              <strong>{task.title}</strong>
              {(task.menu && task.menu !== "À renseigner") || task.details ? <p>{task.menu && task.menu !== "À renseigner" ? task.menu : task.details}</p> : <i>Menu à compléter</i>}
              {task.groups && <small>Groupe : {task.groups}</small>}
              <em>{team.length ? `👥 ${team.join(", ")}` : "👥 À affecter"}</em>
            </button>;
          }) : <div className="dp-food-empty">À renseigner</div>}</td>;
        })}</tr>;
      })}
    </tbody></table></div>
  </section>;
}

function KitchenMenuLibrary({ selectedDate, onUseMenu }) {
  const coverage = mcscS2KitchenCoverage();
  const assumedMenu = MCSC_S2_KITCHEN_MENUS.find((menu) => menu.assumedMissingGroup);
  const menus = MCSC_S2_KITCHEN_MENUS.map((menu) => (
    menu.assumedMissingGroup ? { ...menu, children: coverage.missing } : menu
  ));
  const coveredCount = assumedMenu ? coverage.total : coverage.covered.length;
  return <section className="dp-menu-bank">
    <div className="dp-menu-bank-head">
      <div>
        <span className="dp-eyebrow">Menus enfants S2</span>
        <h3>Menus cuisine a placer</h3>
        <p>Reference enfants MCSC S2 : {coveredCount}/{coverage.total} enfants couverts. Les enfants restants sont places sur le menu de la deuxieme photo, a confirmer si besoin.</p>
      </div>
      <strong className={coveredCount === coverage.total ? "is-ok" : "is-warn"}>{coverage.total} enfants</strong>
    </div>
    <div className="dp-menu-bank-grid">
      {menus.map((menu) => <article key={menu.id} className={menu.assumedMissingGroup ? "is-confirm" : ""}>
        <header>
          <div><strong>{menu.title}</strong><small>{menu.children.length} enfant{menu.children.length > 1 ? "s" : ""}</small></div>
          <button type="button" onClick={() => onUseMenu(menu)}>Placer sur {dateLabel(selectedDate, true)}</button>
        </header>
        <p>{menu.menu}</p>
        <div>{menu.children.map((child) => <span key={child}>{child}</span>)}</div>
      </article>)}
    </div>
    <details className="dp-menu-check">
      <summary>Controle enfants / corrections</summary>
      <p>Corrections appliquees : Raba = Rabah, Jabrane = Jabran, Maissane = Maysan, Lena = Leena, Sarah Clemence = Sara-Clemence.</p>
      {coverage.missing.length ? <p>Enfants rattaches au menu a confirmer : {coverage.missing.join(", ")}.</p> : <p>Tous les enfants sont rattaches explicitement.</p>}
    </details>
  </section>;
}

function leaveAssessment(plans, members, member, date, leaveDates) {
  const previous = previousDate(date);
  const eveningTasks = (plans[previous]?.tasks || []).filter((task) => Number(String(task.startTime || "0").split(":")[0]) >= 19);
  const daytimeTasks = (plans[date]?.tasks || []).filter((task) => Number(String(task.startTime || "12").split(":")[0]) < 19);
  const conflicts = [...eveningTasks, ...daytimeTasks].filter((task) => (task.assigneeIds || []).includes(member.id));
  const selectedIds = new Set(plans[date]?.leaveMemberIds || []);
  const alreadySelected = selectedIds.has(member.id);
  const memberLeaveCount = leaveDates.filter((leaveDate) => (plans[leaveDate]?.leaveMemberIds || []).includes(member.id)).length;
  selectedIds.add(member.id);
  const projectedOff = selectedIds.size;
  const available = Math.max(members.length - projectedOff, 0);
  const minimumComfort = Math.ceil(members.length * 0.6);

  if (!alreadySelected && memberLeaveCount >= 2) return { level: "quota", label: "2/2 atteint", detail: "Quota déjà complet.", projectedOff, available, alreadySelected, limitReached: true, memberLeaveCount };
  if (conflicts.length) return { level: "danger", label: `${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""}`, detail: `Affecté·e à : ${conflicts.map((task) => task.title).join(", ")}`, projectedOff, available, alreadySelected };
  if (available < Math.ceil(members.length / 2)) return { level: "danger", label: "Équipe trop réduite", detail: `Il ne resterait que ${available} personne${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}.`, projectedOff, available, alreadySelected };
  if (available < minimumComfort || projectedOff >= 3) return { level: "warning", label: "À vérifier", detail: `${projectedOff} personnes en congé, ${available} disponibles.`, projectedOff, available, alreadySelected };
  return { level: "safe", label: "Possible", detail: `${available} personnes resteraient disponibles.`, projectedOff, available, alreadySelected, memberLeaveCount };
}

function LeavesOverview({ plans, members, leaveDates, stay, saving, onToggle, showToast }) {
  const countsByMember = Object.fromEntries(members.map((member) => [member.id, leaveDates.filter((date) => (plans[date]?.leaveMemberIds || []).includes(member.id)).length]));
  return <section className="dp-leaves-view">
    <header className="dp-leaves-header"><div><span className="dp-eyebrow">Repos de l’équipe</span><h2>Planning des congés</h2><p>Une case cochée sur un jour signifie : départ en congé à <strong>19 h la veille</strong>, retour disponible à <strong>19 h le jour indiqué</strong>.</p></div><button type="button" className="dp-leaves-export" onClick={() => {
      if (!openLeavesPdf({ plans, members, leaveDates, stay })) showToast?.("Autorisez les fenêtres pop-up pour exporter les congés.", "error");
    }}>Exporter les congés</button></header>
    <div className="dp-leave-example">Exemple : congé le mardi 7 juillet = du lundi 6 juillet à 19 h au mardi 7 juillet à 19 h.</div>
    <div className="dp-leave-legend"><span className="is-safe">● Possible</span><span className="is-warning">● À vérifier</span><span className="is-danger">● Conflit</span><span className="is-quota">● Déjà 2 congés</span></div>
    <div className="dp-leave-capacity">{leaveDates.map((date) => {
      const off = plans[date]?.leaveMemberIds || [];
      const conflictCount = off.filter((memberId) => {
        const member = members.find((item) => item.id === memberId);
        return member && leaveAssessment(plans, members, member, date, leaveDates).level === "danger";
      }).length;
      const level = conflictCount ? "danger" : off.length >= 3 ? "warning" : "safe";
      return <div key={date} className={`is-${level}`}><strong>{dateLabel(date, true)}</strong><span>{members.length - off.length} disponibles</span><small>{off.length} en congé{conflictCount ? ` · ${conflictCount} conflit` : ""}</small></div>;
    })}</div>
    <div className="dp-leaves-wrap"><table><thead><tr><th>Équipe</th>{leaveDates.map((date) => <th key={date}>{dateLabel(date, true)}</th>)}</tr></thead><tbody>
      {members.map((member) => <tr key={member.id}><th><span className="dp-mini-avatar">{initials(member)}</span><span>{memberName(member)}<small>{member.role} · {countsByMember[member.id] || 0}/2 congés</small></span></th>{leaveDates.map((date) => {
        const selected = (plans[date]?.leaveMemberIds || []).includes(member.id);
        const assessment = leaveAssessment(plans, members, member, date, leaveDates);
        const change = () => {
          if (!selected && assessment.level === "danger" && !window.confirm(`${assessment.label}\n${assessment.detail}\n\nConfirmer quand même ce congé ?`)) return;
          onToggle(member.id, date);
        };
        return <td key={date} className={`${selected ? "is-leave " : ""}is-${assessment.level}`}><label title={`${assessment.label} — ${assessment.detail}`}><input type="checkbox" checked={selected} disabled={saving || (!selected && assessment.limitReached)} onChange={change} /><span>{selected ? "Congé posé" : assessment.label}</span><small>{selected ? `${dateLabel(previousDate(date), true)} 19 h → ${dateLabel(date, true)} 19 h` : assessment.level === "quota" ? "Décochez un autre congé pour changer." : assessment.detail}</small></label></td>;
      })}</tr>)}
    </tbody></table></div>
    <div className="dp-leave-summary"><h3>Récapitulatif</h3>{members.map((member) => {
      const days = leaveDates.filter((date) => (plans[date]?.leaveMemberIds || []).includes(member.id));
      return <div key={member.id}><strong>{memberName(member)}</strong><span>{days.length ? days.map((date) => `${dateLabel(previousDate(date), true)} 19 h → ${dateLabel(date, true)} 19 h`).join(" · ") : "Aucun congé renseigné"}</span></div>;
    })}</div>
    <LeaveValidation plans={plans} members={members} leaveDates={leaveDates} />
  </section>;
}

function LeaveValidation({ plans, members, leaveDates }) {
  const counts = members.map((member) => ({ member, count: leaveDates.filter((date) => (plans[date]?.leaveMemberIds || []).includes(member.id)).length }));
  const valid = counts.length > 0 && counts.every((item) => item.count === 2);
  const missing = counts.reduce((total, item) => total + Math.max(2 - item.count, 0), 0);
  return <section className={`dp-leave-validation ${valid ? "is-valid" : "is-invalid"}`}>
    <div><span>{valid ? "✓" : "!"}</span><div><strong>{valid ? "Planning des congés validé" : "Planning des congés non validé"}</strong><small>{valid ? "Chaque personne dispose de 2 congés." : `${missing} congé${missing > 1 ? "s" : ""} reste${missing > 1 ? "nt" : ""} à attribuer.`}</small></div></div>
    <div className="dp-leave-quotas">{counts.map(({ member, count }) => <span key={member.id} className={count === 2 ? "is-complete" : ""}>{member.firstName || memberName(member)} <b>{count}/2</b></span>)}</div>
  </section>;
}

function TaskDetails({ task, dates, memberById, saving, onClose, onSave, onDelete, onDuplicate }) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  useEffect(() => {
    setDraft(task ? {
      ...EMPTY_TASK,
      ...task,
      assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds : [],
      documents: Array.isArray(task.documents) ? task.documents : [],
      rotationSegments: Array.isArray(task.rotationSegments) ? task.rotationSegments : [],
    } : null);
    setEditing(Boolean(task));
    setPhotoFile(null);
    setPhotoPreview("");
  }, [task]);
  if (!draft) return null;
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const section = DAY_PLAN_SECTIONS.find((item) => item.key === draft.category);
  const assigned = (draft.assigneeIds || []).map((id) => memberById[id]).filter(Boolean);
  const palette = activityPalette(draft, section?.color);
  const choosePhoto = (file) => {
    setPhotoFile(file || null);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  };

  return <Modal isOpen={Boolean(task)} onClose={onClose} title={draft.id ? "Détail de l’activité" : "Nouvelle activité"} size="md" closeOnBackdrop={false} closeOnEscape={false}>
    {!editing ? <article className="dp-task-detail">
      {(photoPreview || draft.photo?.url) && <img src={photoPreview || draft.photo.url} alt={draft.title} />}
      <div className="dp-detail-meta"><span>{section?.icon} {section?.label}</span><strong>{draft.startTime || "—"}{draft.endTime ? ` – ${draft.endTime}` : ""}</strong></div>
      <div className="dp-detail-color" style={{ "--activity-color": palette.color, "--activity-bg": palette.background }}><span />Couleur {draft.color ? "personnalisée" : "automatique"}</div>
      <h2>{draft.title}</h2>
      {(draft.location || draft.groups) && <p className="dp-detail-place">{[draft.location, draft.groups].filter(Boolean).join(" · ")}</p>}
      <div className="dp-detail-text">{draft.details || draft.menu || "Aucun détail ajouté pour le moment."}</div>
      {assigned.length > 0 && <div className="dp-detail-team"><strong>Équipe</strong>{assigned.map((member) => <span key={member.id}><i>{initials(member)}</i>{memberName(member)}</span>)}</div>}
      <div className="dp-detail-actions">
        {draft.id && <button type="button" className="is-danger" onClick={() => { if (window.confirm(`Supprimer l’activité « ${draft.title} » ?`)) onDelete(draft); }}>Supprimer</button>}
        {draft.id && <button type="button" onClick={() => onDuplicate(draft)} disabled={saving}>Dupliquer</button>}
        <button type="button" onClick={onClose}>Fermer</button>
        <button type="button" className="is-primary" onClick={() => setEditing(true)}>Modifier</button>
      </div>
    </article> : <form className="dp-simple-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave(draft, photoFile); }}>
      <div><label><span>Jour</span><select value={draft.targetDate || draft._sourceDate || dates[0]} onChange={(event) => set("targetDate", event.target.value)}>{dates.map((date, index) => <option key={date} value={date}>J{index + 1} — {dateLabel(date, true)}</option>)}</select></label><label><span>Moment</span><select value={draft.category} onChange={(event) => set("category", event.target.value)}>{DAY_PLAN_SECTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
      <label><span>Nom de l’activité</span><input value={draft.title} onChange={(event) => set("title", event.target.value)} required /></label>
      <div><label><span>Début</span><input type="time" value={draft.startTime} onChange={(event) => set("startTime", event.target.value)} /></label><label><span>Fin</span><input type="time" value={draft.endTime} onChange={(event) => set("endTime", event.target.value)} /></label></div>
      <label><span>Texte / menu / déroulé</span><textarea value={draft.details} onChange={(event) => set("details", event.target.value)} placeholder="Écrivez ici tout ce que l’équipe doit savoir…" /></label>
      <fieldset className="dp-color-editor">
        <legend>Couleur</legend>
        <div className="dp-color-presets">
          {COLOR_PRESETS.map((preset) => <button
            type="button"
            key={preset.label}
            className={draft.color === preset.color ? "is-selected" : ""}
            style={{ "--swatch-color": preset.color, "--swatch-bg": preset.backgroundColor }}
            onClick={() => setDraft((current) => ({ ...current, color: preset.color, backgroundColor: preset.backgroundColor }))}
            title={preset.label}
            aria-label={`Couleur ${preset.label}`}
          ><span /></button>)}
          <button type="button" className="dp-color-auto" onClick={() => setDraft((current) => ({ ...current, color: "", backgroundColor: "" }))}>Auto</button>
        </div>
        <div className="dp-color-inputs">
          <label><span>Accent</span><input type="color" value={isHexColor(draft.color) ? draft.color : palette.color} onChange={(event) => set("color", event.target.value)} /></label>
          <label><span>Fond</span><input type="color" value={isHexColor(draft.backgroundColor) ? draft.backgroundColor : isHexColor(palette.background) ? palette.background : "#ffffff"} onChange={(event) => set("backgroundColor", event.target.value)} /></label>
        </div>
      </fieldset>
      <label className="dp-photo-field"><span>Photo facultative</span>{(photoPreview || draft.photo?.url) && <img src={photoPreview || draft.photo.url} alt="Aperçu" />}<input type="file" accept="image/*" onChange={(event) => choosePhoto(event.target.files?.[0])} /><i>{photoFile ? photoFile.name : draft.photo?.name || "Choisir une photo"}</i></label>
      <div className="dp-detail-actions">
        {draft.id && <button type="button" className="is-danger" onClick={() => { if (window.confirm(`Supprimer l’activité « ${draft.title} » ?`)) onDelete(draft); }}>Supprimer</button>}
        {draft.id && <button type="button" onClick={() => onDuplicate(draft)} disabled={saving}>Dupliquer</button>}
        {draft.id && <button type="button" onClick={() => setEditing(false)}>Annuler</button>}
        <button type="submit" className="is-primary" disabled={saving || !draft.title.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>}
  </Modal>;
}
