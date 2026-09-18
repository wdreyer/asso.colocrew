"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/* ─── KPI icon SVGs ──────────────────────────────────────────────────── */
function IconCoins() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M17 7a5 5 0 0 0-4-2c-2.8 0-5 2.5-5 7s2.2 7 5 7a5 5 0 0 0 4-2M4 10h7M4 14h6" />
    </svg>
  );
}
function IconTrend({ up = true }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      {up ? <path d="M3 17l6-6 4 4 8-8M15 7h6v6" /> : <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />}
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  );
}

const ACCOUNTING_DOC_ID = "colocrew-2026";
const DAY_WIDTH = 28;
const LABEL_WIDTH = 170;

const PRODUCTION_UNITS = [
  { key: "fixed", label: "Forfait séjour" },
  { key: "manual", label: "Quantité libre" },
  { key: "perChild", label: "Par enfant" },
  { key: "perStaff", label: "Par membre staff" },
  { key: "perPerson", label: "Par personne" },
  { key: "perDay", label: "Par jour" },
  { key: "perNight", label: "Par nuit" },
  { key: "perChildDay", label: "Par enfant / jour" },
  { key: "perPersonDay", label: "Par personne / jour" },
];

const DEFAULT_PRODUCTION_EXPENSES = [
  { key: "accommodation", label: "Hébergement gîte", category: "Hébergement", unit: "fixed", quantity: 1, unitAmount: 8550 },
  { label: "Activités prestataires", category: "Activités", unit: "manual", quantity: 32, unitAmount: 200 },
  { label: "Pédagogie et petit matériel", category: "Péda et autre", unit: "perPerson", quantity: 1, unitAmount: 30 },
  { label: "Assurance", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 400 },
  { label: "Communication", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 500 },
  { label: "Frais animateurs", category: "RH", unit: "perStaff", quantity: 1, unitAmount: 200 },
  { label: "Frais divers", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 1000 },
];

const DEFAULT_PRODUCTION_PLAN = {
  id: "simulation-o-vives",
  name: "Simulation O vives",
  linkedStayId: "",
  stayCode: "EVCC",
  location: "",
  color: "",
  ageGroups: [],
  pricePerChild: 1027.2,
  childCount: 30,
  maxChildren: 30,
  extraRevenue: 0,
  sessions: [{ startDate: "2026-08-17", endDate: "2026-08-28" }],
  days: 12,
  nights: 11,
  mealPlan: "full",
  mealsPerDay: 3,
  mealCostPerPerson: 8,
  directorCount: 1,
  animatorCount: 4,
  animatorStaffingMode: "manual",
  animatorRatio: 8,
  directorNetDay: 90,
  animatorNetDay: 60,
  staffCostMultiplier: 1.35,
  notes: "Modèle de base repris depuis le fichier O vives : 30 enfants, 4 anims, 1 DS, 12 jours / 11 nuits.",
  expenses: DEFAULT_PRODUCTION_EXPENSES,
};

const DEFAULT_PRODUCTION = {
  selectedPlanId: "",
  plans: [],
};

const PRODUCTION_TABS = [
  { key: "assumptions", label: "Séjour & RH" },
  { key: "food", label: "Nourriture" },
  { key: "expenses", label: "Tableau dépenses" },
  { key: "summary", label: "Synthèse" },
  { key: "profitability", label: "Rentabilité" },
  { key: "publish", label: "Créer la fiche" },
];

const PRICE_TIERS = [
  { key: "low", label: "Prix bas", rate: 0.05 },
  { key: "mid", label: "Prix moyen", rate: 0.12 },
  { key: "high", label: "Prix haut", rate: 0.2 },
];

const SEASONS = ["Été", "Hiver"];
const AGE_GROUP_OPTIONS = ["6-8 ans", "9-11 ans", "12-14 ans", "15-17 ans"];
const WEEKDAY_LETTERS_MON_FIRST = ["L", "M", "M", "J", "V", "S", "D"];

const WIZARD_STEP_DEFS = [
  { key: "identity", label: "Séjour" },
  { key: "weeks", label: "Semaines & RH" },
  { key: "expenses", label: "Budget" },
  { key: "pricing", label: "Prix & rentabilité" },
];

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount(value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function daysBetween(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function addDays(dateStr, days) {
  if (!dateStr) return "";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value) {
  return value ? `${String(value).slice(0, 10)}T00:00:00.000Z` : "";
}

function formatFr(dateStr) {
  if (!dateStr) return "-";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-");
  return `${day}/${month}`;
}

function productionStaySlug(value) {
  const slug = String(value || "sejour")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || `sejour-${Date.now()}`;
}

function normalizeSession(session) {
  return {
    startDate: session?.startDate ? String(session.startDate).slice(0, 10) : "",
    endDate: session?.endDate ? String(session.endDate).slice(0, 10) : "",
  };
}

function syncSessionEndDates(sessions) {
  const normalized = (Array.isArray(sessions) ? sessions : []).map(normalizeSession);
  const firstSession = normalized[0];
  const durationDays = daysBetween(firstSession?.startDate, firstSession?.endDate);

  return normalized.map((session, index) => {
    if (index === 0) return session;
    return {
      ...session,
      endDate: durationDays > 0 && session.startDate
        ? addDays(session.startDate, durationDays - 1)
        : "",
    };
  });
}

function sessionsDuration(sessions) {
  const first = Array.isArray(sessions) ? sessions[0] : null;
  const days = daysBetween(first?.startDate, first?.endDate);
  return {
    days,
    nights: Math.max(days - 1, 0),
  };
}

function sessionsRange(sessions) {
  const valid = (Array.isArray(sessions) ? sessions : []).filter((session) => session?.startDate && session?.endDate);
  if (!valid.length) return { openDate: "", closeDate: "" };
  const starts = valid.map((session) => session.startDate).sort();
  const ends = valid.map((session) => session.endDate).sort();
  return { openDate: starts[0], closeDate: ends[ends.length - 1] };
}

function seasonOf(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  return (month <= 3 || month >= 10) ? "Hiver" : "Été";
}

function normalizeProductionExpense(line) {
  return {
    key: line?.key || "",
    label: line?.label || "Nouvelle dépense",
    category: line?.category || "Autre",
    unit: PRODUCTION_UNITS.some((unit) => unit.key === line?.unit) ? line.unit : "fixed",
    quantity: amount(line?.quantity ?? 1),
    unitAmount: amount(line?.unitAmount),
  };
}

function comparableExpenseLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isAccommodationExpense(line) {
  const searchable = comparableExpenseLabel(`${line?.label || ""} ${line?.category || ""}`);
  return line?.key === "accommodation" || searchable.includes("hebergement");
}

function normalizeProductionPlan(plan) {
  const base = deepClone(DEFAULT_PRODUCTION_PLAN);
  const merged = { ...base, ...(plan || {}) };
  const rawSessions = Array.isArray(merged.sessions) && merged.sessions.length
    ? merged.sessions.map(normalizeSession)
    : base.sessions.map(normalizeSession);
  const sessions = syncSessionEndDates(rawSessions);
  const duration = sessionsDuration(sessions);
  return {
    ...merged,
    id: String(plan?.id || base.id),
    sessions,
    ageGroups: Array.isArray(merged.ageGroups) ? merged.ageGroups.map(String) : [],
    days: duration.days,
    nights: duration.nights,
    expenses: Array.isArray(plan?.expenses)
      ? plan.expenses.map(normalizeProductionExpense)
      : base.expenses.map(normalizeProductionExpense),
  };
}

function productionExpenseTotal(line, plan, staffCount) {
  const unitAmount = amount(line.unitAmount);
  const quantity = amount(line.quantity || 1);
  const children = amount(plan.childCount);
  const days = Math.max(amount(plan.days), 0);
  const nights = Math.max(amount(plan.nights), 0);
  const people = children + amount(staffCount);
  const multiplier = {
    fixed: 1,
    manual: quantity,
    perChild: children * quantity,
    perStaff: amount(staffCount) * quantity,
    perPerson: people * quantity,
    perDay: days * quantity,
    perNight: nights * quantity,
    perChildDay: children * days * quantity,
    perPersonDay: people * days * quantity,
  }[line.unit] ?? 1;
  return Math.round(unitAmount * multiplier * 100) / 100;
}

function productionExpenseFormula(line, plan, staffCount) {
  const unitAmount = currency(line.unitAmount);
  const quantity = amount(line.quantity || 1);
  const children = amount(plan.childCount);
  const days = amount(plan.days);
  const nights = amount(plan.nights);
  const people = children + amount(staffCount);
  const unitLabel = PRODUCTION_UNITS.find((unit) => unit.key === line.unit)?.label || "Forfait";
  return {
    fixed: `${unitAmount}`,
    manual: `${quantity} × ${unitAmount}`,
    perChild: `${children} enfants × ${quantity} × ${unitAmount}`,
    perStaff: `${amount(staffCount)} staff × ${quantity} × ${unitAmount}`,
    perPerson: `${people} personnes × ${quantity} × ${unitAmount}`,
    perDay: `${days} jours × ${quantity} × ${unitAmount}`,
    perNight: `${nights} nuits × ${quantity} × ${unitAmount}`,
    perChildDay: `${children} enfants × ${days} jours × ${quantity} × ${unitAmount}`,
    perPersonDay: `${people} personnes × ${days} jours × ${quantity} × ${unitAmount}`,
  }[line.unit] || `${unitLabel} · ${unitAmount}`;
}

const CATEGORY_COLORS = ["#f97316", "#10b981", "#6366f1", "#b8336a", "#0ea5e9", "#a855f7"];

function categoryColor(label) {
  let hash = 0;
  const text = String(label || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % CATEGORY_COLORS.length;
  }
  return CATEGORY_COLORS[Math.abs(hash)];
}

function summarizeProductionByCategory(expenses) {
  const groups = new Map();
  expenses.forEach((line) => {
    const key = line.category || "Autre";
    groups.set(key, amount(groups.get(key)) + amount(line.total));
  });
  return [...groups.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
}

function effectiveAnimatorCount(plan, childCount) {
  const count = childCount != null ? amount(childCount) : amount(plan.childCount);
  if (plan.animatorStaffingMode === "ratio" && amount(plan.animatorRatio) > 0) {
    return Math.ceil(count / amount(plan.animatorRatio));
  }
  return amount(plan.animatorCount);
}

function foodCostFor(plan, staffCount) {
  if (plan.mealPlan !== "autogestion") return 0;
  const people = amount(plan.childCount) + amount(staffCount);
  return Math.round(amount(plan.mealsPerDay) * amount(plan.mealCostPerPerson) * people * amount(plan.days) * 100) / 100;
}

function computeProduction(planInput, options = {}) {
  const plan = normalizeProductionPlan(planInput);
  const calcPlan = options.childCount != null ? { ...plan, childCount: amount(options.childCount) } : plan;
  const animatorCount = effectiveAnimatorCount(plan, calcPlan.childCount);
  const staffCount = amount(plan.directorCount) + animatorCount;
  const simulatedStaffCost = Math.round((
    (amount(plan.directorCount) * amount(plan.directorNetDay) * amount(plan.days))
    + (animatorCount * amount(plan.animatorNetDay) * amount(plan.days))
  ) * amount(plan.staffCostMultiplier || 1) * 100) / 100;
  const rhCost = simulatedStaffCost;
  const foodCost = foodCostFor(calcPlan, staffCount);
  const revenue = Math.round(((amount(plan.pricePerChild) * amount(calcPlan.childCount)) + amount(plan.extraRevenue)) * 100) / 100;
  const expenseRows = calcPlan.expenses.map((line) => ({
    ...line,
    total: productionExpenseTotal(line, calcPlan, staffCount),
    formula: productionExpenseFormula(line, calcPlan, staffCount),
  }));
  const operationalExpenses = expenseRows.reduce((sum, line) => sum + amount(line.total), 0);
  const totalExpenses = Math.round((operationalExpenses + rhCost + foodCost) * 100) / 100;
  const calculatedExpenseRows = [
    {
      key: "calculated-rh",
      label: "Salaires et charges RH",
      category: "RH",
      formula: `${staffCount} staff × ${amount(plan.days)} jours · coefficient ${amount(plan.staffCostMultiplier || 1).toFixed(2)}`,
      total: rhCost,
      calculated: true,
    },
    {
      key: "calculated-food",
      label: "Nourriture",
      category: "Nourriture",
      formula: plan.mealPlan === "autogestion"
        ? `${amount(plan.mealsPerDay)} repas × ${amount(plan.days)} jours × ${amount(calcPlan.childCount) + staffCount} personnes × ${currency(plan.mealCostPerPerson)}`
        : "Pension complète incluse dans l’hébergement",
      total: foodCost,
      calculated: true,
    },
  ];
  const allExpenseRows = [...expenseRows, ...calculatedExpenseRows];
  const margin = Math.round((revenue - totalExpenses) * 100) / 100;
  const marginRate = revenue > 0 ? (margin / revenue) * 100 : 0;
  const breakEvenPrice = amount(calcPlan.childCount) > 0 ? totalExpenses / amount(calcPlan.childCount) : 0;
  return {
    plan,
    childCount: amount(calcPlan.childCount),
    animatorCount,
    staffCount,
    simulatedStaffCost,
    rhCost,
    foodCost,
    revenue,
    expenseRows,
    calculatedExpenseRows,
    allExpenseRows,
    operationalExpenses,
    totalExpenses,
    margin,
    marginRate,
    breakEvenPrice,
    categories: summarizeProductionByCategory(allExpenseRows),
  };
}

function findBreakEvenChildren(plan, maxSearch = 200) {
  for (let count = 1; count <= maxSearch; count += 1) {
    if (computeProduction(plan, { childCount: count }).margin >= 0) return count;
  }
  return null;
}

function priceForMargin(computed, marginRate) {
  return computed.childCount > 0
    ? Math.ceil(((computed.totalExpenses * (1 + marginRate)) / computed.childCount) * 100) / 100
    : 0;
}

function timelineEntriesFor(plans) {
  return plans.flatMap((plan) => (plan.sessions || [])
    .filter((session) => session.startDate && session.endDate)
    .map((session, index) => ({
      key: `${plan.id}-${index}`,
      planId: plan.id,
      planName: plan.name || "Séjour",
      color: plan.color || categoryColor(plan.name || plan.id),
      label: `S${index + 1}`,
      startDate: session.startDate,
      endDate: session.endDate,
      season: seasonOf(session.startDate),
    })));
}

function startOfMonth(dateStr) {
  const date = new Date(dateStr);
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonth(dateStr) {
  const date = new Date(dateStr);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function dayInfo(dateStr) {
  const date = new Date(dateStr);
  const jsDay = date.getDay();
  const mondayIndex = jsDay === 0 ? 6 : jsDay - 1;
  return {
    date: dateStr,
    letter: WEEKDAY_LETTERS_MON_FIRST[mondayIndex],
    dayNumber: date.getDate(),
    isWeekend: mondayIndex >= 5,
    monthKey: `${date.getFullYear()}-${date.getMonth()}`,
    monthLabel: date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
  };
}

function daysRangeFor(minDate, maxDate) {
  const days = [];
  let cursor = minDate;
  let guard = 0;
  while (cursor <= maxDate && guard < 400) {
    days.push(dayInfo(cursor));
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

function monthGroupsFor(days) {
  const groups = [];
  days.forEach((day) => {
    const last = groups[groups.length - 1];
    if (last && last.key === day.monthKey) {
      last.count += 1;
    } else {
      groups.push({ key: day.monthKey, label: day.monthLabel, count: 1 });
    }
  });
  return groups;
}

function dayIndexOf(days, dateStr) {
  return days.findIndex((day) => day.date === dateStr);
}

function planRowsFor(seasonEntries, plans) {
  const byPlan = new Map();
  seasonEntries.forEach((entry) => {
    const list = byPlan.get(entry.planId) || [];
    list.push(entry);
    byPlan.set(entry.planId, list);
  });
  return [...byPlan.entries()].map(([planId, planSessions]) => {
    const plan = plans.find((item) => item.id === planId);
    return {
      planId,
      planName: plan?.name || planSessions[0].planName,
      color: plan?.color || planSessions[0].color,
      sessions: [...planSessions].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  });
}

function seasonGroupsFor(plans) {
  const entries = timelineEntriesFor(plans);
  return SEASONS.map((season) => {
    const seasonEntries = entries.filter((entry) => entry.season === season);
    if (!seasonEntries.length) return { season, rows: [], days: [], months: [], rangeLabel: "" };
    const starts = seasonEntries.map((entry) => entry.startDate).sort();
    const ends = seasonEntries.map((entry) => entry.endDate).sort();
    const rawMin = starts[0];
    const rawMax = ends[ends.length - 1];
    const minDate = startOfMonth(rawMin);
    const maxDate = endOfMonth(rawMax);
    const days = daysRangeFor(minDate, maxDate);
    const months = monthGroupsFor(days);
    const rows = planRowsFor(seasonEntries, plans);
    return { season, rows, days, months, rangeLabel: `${formatFr(rawMin)} → ${formatFr(rawMax)}` };
  });
}

export default function ProductionSejours() {
  const router = useRouter();
  const [production, setProduction] = useState(() => deepClone(DEFAULT_PRODUCTION));
  const [status, setStatus] = useState("");
  const [creatingStay, setCreatingStay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("seasons");
  const [activeTab, setActiveTab] = useState("assumptions");
  const [sensitivityRange, setSensitivityRange] = useState({ start: null, end: null, step: 1 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const accountingSnapshot = await getDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID));
        const saved = accountingSnapshot.exists() ? accountingSnapshot.data()?.production : null;
        setProduction({
          selectedPlanId: saved?.selectedPlanId || "",
          plans: Array.isArray(saved?.plans) ? saved.plans : [],
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const plans = useMemo(
    () => (Array.isArray(production.plans) ? production.plans : []).map(normalizeProductionPlan),
    [production.plans],
  );
  const selectedPlanId = production.selectedPlanId || plans[0]?.id || "";
  const selectedIndex = Math.max(plans.findIndex((plan) => plan.id === selectedPlanId), 0);
  const selectedPlan = plans.length ? (plans[selectedIndex] || plans[0]) : null;
  const sessions = selectedPlan?.sessions || [];
  const { openDate, closeDate } = sessionsRange(sessions);
  const computed = selectedPlan ? computeProduction(selectedPlan) : null;
  const accommodationExpense = selectedPlan?.expenses?.find(isAccommodationExpense);
  const accommodationCost = amount(accommodationExpense?.unitAmount);

  useEffect(() => {
    if (activeTab === "food" && selectedPlan && selectedPlan.mealPlan !== "autogestion") {
      setActiveTab("assumptions");
    }
  }, [activeTab, selectedPlan?.mealPlan]);

  const visibleTabs = PRODUCTION_TABS.filter((tab) => tab.key !== "food" || (selectedPlan && selectedPlan.mealPlan === "autogestion"));
  const wizardSteps = WIZARD_STEP_DEFS;
  const safeWizardStep = Math.min(wizardStep, wizardSteps.length - 1);
  const currentWizardStep = wizardSteps[safeWizardStep];

  const simulatedDirectorNet = selectedPlan ? amount(selectedPlan.directorCount) * amount(selectedPlan.directorNetDay) * amount(selectedPlan.days) : 0;
  const simulatedAnimatorNet = selectedPlan ? computed.animatorCount * amount(selectedPlan.animatorNetDay) * amount(selectedPlan.days) : 0;
  const simulatedNet = simulatedDirectorNet + simulatedAnimatorNet;
  const simulatedCharges = selectedPlan ? Math.max(computed.simulatedStaffCost - simulatedNet, 0) : 0;
  const targetMarginRate = selectedPlan && amount(computed.revenue) > 0 ? computed.marginRate : 0;
  const recommendedPrice = selectedPlan ? priceForMargin(computed, 0.12) : 0;
  const breakEvenChildren = useMemo(() => (selectedPlan ? findBreakEvenChildren(selectedPlan) : null), [selectedPlan]);
  const sensitivityDefaultStart = selectedPlan ? Math.max(1, Math.min(amount(selectedPlan.childCount), breakEvenChildren || amount(selectedPlan.childCount)) - 5) : 1;
  const sensitivityDefaultEnd = selectedPlan ? Math.max(amount(selectedPlan.childCount), breakEvenChildren || 0) + 10 : 1;
  const sensitivityStart = sensitivityRange.start ?? sensitivityDefaultStart;
  const sensitivityEnd = sensitivityRange.end ?? sensitivityDefaultEnd;
  const sensitivityStep = Math.max(amount(sensitivityRange.step ?? 1), 1);
  const sensitivityRows = [];
  if (selectedPlan) {
    for (let count = sensitivityStart; count <= sensitivityEnd && sensitivityRows.length < 200; count += sensitivityStep) {
      sensitivityRows.push(computeProduction(selectedPlan, { childCount: count }));
    }
  }
  const seasonGroups = useMemo(() => seasonGroupsFor(plans), [plans]);

  const writePlans = (nextPlans, nextSelectedId = selectedPlanId) => {
    setProduction({
      selectedPlanId: nextSelectedId,
      plans: nextPlans.map(normalizeProductionPlan),
    });
  };

  const updatePlan = (patch) => {
    if (!selectedPlan) return;
    writePlans(plans.map((plan, index) => (index === selectedIndex ? normalizeProductionPlan({ ...plan, ...patch }) : plan)));
  };

  const updatePlanById = (planId, patch) => {
    writePlans(plans.map((plan) => (plan.id === planId ? normalizeProductionPlan({ ...plan, ...patch }) : plan)));
  };

  const toggleAgeGroup = (age) => {
    if (!selectedPlan) return;
    const current = selectedPlan.ageGroups || [];
    updatePlan({ ageGroups: current.includes(age) ? current.filter((item) => item !== age) : [...current, age] });
  };

  const updateExpense = (expenseIndex, patch) => {
    if (!selectedPlan) return;
    updatePlan({
      expenses: selectedPlan.expenses.map((line, index) => (
        index === expenseIndex ? normalizeProductionExpense({ ...line, ...patch }) : line
      )),
    });
  };

  const duplicatePlan = () => {
    if (!selectedPlan) return;
    const id = `production-${Date.now()}`;
    writePlans([...plans, normalizeProductionPlan({ ...selectedPlan, id, name: `${selectedPlan.name || "Simulation"} - copie`, linkedStayId: "" })], id);
  };

  const deletePlanById = (planId) => {
    const target = plans.find((plan) => plan.id === planId);
    if (!target) return;
    const warnPublished = target.linkedStayId
      ? " Le séjour déjà publié ne sera pas supprimé automatiquement (utilise \"Supprimer le séjour\" dans l'onglet Créer la fiche pour ça)."
      : "";
    if (!window.confirm(`Supprimer la simulation "${target.name || "sans nom"}" ?${warnPublished}`)) return;
    const nextPlans = plans.filter((plan) => plan.id !== planId);
    const nextSelectedId = planId === selectedPlanId ? (nextPlans[0]?.id || "") : selectedPlanId;
    writePlans(nextPlans, nextSelectedId);
  };

  const addExpense = () => {
    if (!selectedPlan) return;
    updatePlan({
      expenses: [...selectedPlan.expenses, { label: "Nouvelle dépense", category: "Autre", unit: "fixed", quantity: 1, unitAmount: 0 }],
    });
  };

  const addDefaultExpenses = () => {
    if (!selectedPlan) return;
    const additions = DEFAULT_PRODUCTION_EXPENSES.filter((template) => (
      !selectedPlan.expenses.some((line) => (
        (template.key && line.key === template.key)
        || comparableExpenseLabel(line.label) === comparableExpenseLabel(template.label)
      ))
    ));

    if (!additions.length) {
      setStatus("Tous les postes du modèle EVCC sont déjà présents.");
      return;
    }

    updatePlan({ expenses: [...selectedPlan.expenses, ...deepClone(additions)] });
    setStatus(`${additions.length} poste${additions.length > 1 ? "s" : ""} du modèle EVCC ajouté${additions.length > 1 ? "s" : ""}.`);
  };

  const setAccommodationCost = (value) => {
    if (!selectedPlan) return;
    const unitAmount = amount(value);
    const expenseIndex = selectedPlan.expenses.findIndex(isAccommodationExpense);

    if (expenseIndex === -1) {
      updatePlan({
        expenses: [
          normalizeProductionExpense({ ...DEFAULT_PRODUCTION_EXPENSES[0], unitAmount }),
          ...selectedPlan.expenses,
        ],
      });
      return;
    }

    updatePlan({
      expenses: selectedPlan.expenses.map((line, index) => (
        index === expenseIndex
          ? normalizeProductionExpense({
            ...line,
            key: "accommodation",
            label: line.label || "Hébergement gîte",
            category: line.category || "Hébergement",
            unit: "fixed",
            quantity: 1,
            unitAmount,
          })
          : line
      )),
    });
  };

  const removeExpense = (expenseIndex) => {
    if (!selectedPlan) return;
    updatePlan({ expenses: selectedPlan.expenses.filter((_, index) => index !== expenseIndex) });
  };

  const setSessionCount = (value) => {
    if (!selectedPlan) return;
    const target = Math.max(1, Math.round(amount(value)));
    if (target === sessions.length) return;
    if (target > sessions.length) {
      const additions = Array.from({ length: target - sessions.length }, () => ({ startDate: "", endDate: "" }));
      updatePlan({ sessions: [...sessions, ...additions] });
    } else {
      updatePlan({ sessions: sessions.slice(0, target) });
    }
  };

  const addSession = () => {
    if (!selectedPlan) return;
    updatePlan({ sessions: [...sessions, { startDate: "", endDate: "" }] });
  };

  const removeSession = (index) => {
    if (!selectedPlan || sessions.length <= 1) return;
    updatePlan({ sessions: sessions.filter((_, i) => i !== index) });
  };

  const updateSession = (index, patch) => {
    if (!selectedPlan) return;
    updatePlan({ sessions: sessions.map((session, i) => (i === index ? { ...session, ...patch } : session)) });
  };

  const setMealPlan = (mode) => {
    updatePlan({ mealPlan: mode, animatorRatio: mode === "autogestion" ? 5 : 8 });
  };

  const saveProduction = async () => {
    setStatus("Enregistrement...");
    const nextProduction = {
      selectedPlanId,
      plans: plans.map(normalizeProductionPlan),
    };
    await setDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID), {
      production: nextProduction,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setProduction(nextProduction);
    setStatus("Module production enregistré.");
  };

  const persistPlanUpdate = async (patch) => {
    const updatedPlan = normalizeProductionPlan({ ...selectedPlan, ...patch });
    const nextPlans = plans.map((plan, index) => (index === selectedIndex ? updatedPlan : plan));
    const nextProduction = { selectedPlanId: updatedPlan.id, plans: nextPlans };
    setProduction(nextProduction);
    await setDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID), {
      production: nextProduction,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return updatedPlan;
  };

  const deleteLinkedStay = async () => {
    if (!selectedPlan?.linkedStayId) return;
    if (!window.confirm(`Supprimer définitivement le séjour "${selectedPlan.name || "ce séjour"}" ? Cette action est irréversible.`)) return;
    setStatus("Suppression du séjour...");
    try {
      await deleteDoc(doc(db, COLLECTIONS.SEJOURS, selectedPlan.linkedStayId));
      await persistPlanUpdate({ linkedStayId: "" });
      setStatus("Séjour supprimé.");
    } catch (error) {
      setStatus(`Suppression impossible : ${error?.message || "erreur inconnue"}`);
    }
  };

  const publishPlan = async () => {
    if (!selectedPlan) return;
    setCreatingStay(true);
    setStatus(selectedPlan.linkedStayId ? "Mise à jour du séjour..." : "Création de la fiche séjour...");
    try {
      const sessionDates = sessions
        .filter((session) => session.startDate && session.endDate)
        .map((session) => ({
          startDate: toIsoDate(session.startDate),
          endDate: toIsoDate(session.endDate),
          basePrice: amount(selectedPlan.pricePerChild),
        }));
      if (!sessionDates.length) throw new Error("Ajoute au moins une semaine avec des dates avant de publier.");
      const prices = sessionDates.map((entry) => amount(entry.basePrice)).filter((price) => price > 0);
      const priceMin = prices.length ? Math.min(...prices) : amount(selectedPlan.pricePerChild);
      const priceMax = prices.length ? Math.max(...prices) : amount(selectedPlan.pricePerChild);
      const snapshotFields = {
        productionPlanId: selectedPlan.id,
        location: selectedPlan.location || "",
        productionSnapshot: {
          plan: normalizeProductionPlan(selectedPlan),
          computed: {
            revenue: computed.revenue,
            operationalExpenses: computed.operationalExpenses,
            rhCost: computed.rhCost,
            foodCost: computed.foodCost,
            totalExpenses: computed.totalExpenses,
            margin: computed.margin,
            marginRate: computed.marginRate,
            breakEvenPrice: computed.breakEvenPrice,
          },
        },
      };
      const locationSuffix = selectedPlan.location ? ` · ${selectedPlan.location}` : "";

      if (selectedPlan.linkedStayId) {
        const stayRef = doc(db, COLLECTIONS.SEJOURS, selectedPlan.linkedStayId);
        await updateDoc(stayRef, {
          dates: sessionDates,
          basePrice: priceMin,
          priceMin,
          priceMax,
          ageGroups: selectedPlan.ageGroups || [],
          ...snapshotFields,
          updatedAt: serverTimestamp(),
        });
        setStatus("Séjour mis à jour.");
        router.push(`/dashboard/sejours/${selectedPlan.linkedStayId}`);
      } else {
        const baseName = selectedPlan.name || "Nouveau séjour";
        const payload = {
          name: baseName,
          slug: productionStaySlug(baseName),
          heroSubtitle: `${selectedPlan.days || 0} jours · ${selectedPlan.stayCode || "Séjour"}${locationSuffix} · prix construit en production`,
          heroImage: "",
          environment: selectedPlan.stayCode || "",
          basePrice: priceMin,
          priceMin,
          priceMax,
          ageGroups: selectedPlan.ageGroups || [],
          dates: sessionDates,
          stations: [{ name: "Sur Place", priceExtra: 0 }],
          summarySubsections: [{
            title: "Séjour en préparation",
            text: `Prévision ${selectedPlan.childCount || 0} enfants, marge estimée ${currency(computed.margin)} (${computed.marginRate.toFixed(1)} %).`,
            imageSrc: "",
          }],
          sections: [{
            subSections: [{
              title: "Production",
              text: `Budget construit depuis le module production. Recettes prévues : ${currency(computed.revenue)}. Dépenses prévues : ${currency(computed.totalExpenses)}.`,
              imageSrc: "",
            }],
          }],
          ...snapshotFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, COLLECTIONS.SEJOURS), payload);
        await persistPlanUpdate({ linkedStayId: ref.id });
        setStatus("Fiche séjour créée depuis la production.");
        router.push(`/dashboard/sejours/${ref.id}`);
      }
    } catch (error) {
      setStatus(`Publication impossible : ${error?.message || "erreur inconnue"}`);
    } finally {
      setCreatingStay(false);
    }
  };

  const openCreateModal = () => {
    const id = `production-${Date.now()}`;
    const newPlan = normalizeProductionPlan({
      id,
      name: "",
      stayCode: "",
      location: "",
      color: "",
      ageGroups: [],
      linkedStayId: "",
      pricePerChild: 0,
      childCount: 0,
      maxChildren: 0,
      extraRevenue: 0,
      sessions: [{ startDate: "", endDate: "" }],
      mealPlan: "full",
      mealsPerDay: 3,
      mealCostPerPerson: 8,
      directorCount: 1,
      animatorCount: 4,
      animatorStaffingMode: "manual",
      animatorRatio: 8,
      directorNetDay: 90,
      animatorNetDay: 60,
      staffCostMultiplier: 1.35,
      notes: "",
      expenses: deepClone(DEFAULT_PRODUCTION_EXPENSES),
    });
    writePlans([...plans, newPlan], id);
    setWizardStep(0);
    setShowCreateModal(true);
    setView("plan");
  };

  const closeCreateModal = () => setShowCreateModal(false);

  const openPlan = (planId) => {
    setProduction((previous) => ({ ...previous, selectedPlanId: planId }));
    setView("plan");
  };

  if (loading) {
    return (
      <div className="dash-page production-page">
        <section className="dash-section"><p className="dash-muted">Chargement du module de production...</p></section>
      </div>
    );
  }

  /* ─── Shared budget section renderers (used in both the tabs and the
     creation wizard, so the wizard covers the whole budget) ─────────── */
  const renderIdentitySection = () => (
    <div className="production-form-grid production-form-grid-3">
      <label><span>Nom du séjour</span><input value={selectedPlan.name || ""} placeholder="ex : Colo Surf Camp" onChange={(event) => updatePlan({ name: event.target.value })} /></label>
      <label><span>Code séjour</span><input value={selectedPlan.stayCode || ""} placeholder="ex : ABC" onChange={(event) => updatePlan({ stayCode: event.target.value })} /></label>
      <label><span>Lieu</span><input value={selectedPlan.location || ""} placeholder="ex : Dax, Landes" onChange={(event) => updatePlan({ location: event.target.value })} /></label>
      <label>
        <span>Prix total de l’hébergement</span>
        <input type="number" step="0.01" min="0" placeholder="ex : 8 550" value={accommodationCost || ""} onChange={(event) => setAccommodationCost(event.target.value)} />
        <small className="production-field-hint">Ce montant alimente automatiquement la ligne Hébergement du tableau des dépenses.</small>
      </label>
      <label>
        <span>Couleur (récap saisons)</span>
        <input
          type="color"
          className="production-color-input"
          value={selectedPlan.color || categoryColor(selectedPlan.name || selectedPlan.id)}
          onChange={(event) => updatePlan({ color: event.target.value })}
        />
        <small className="production-field-hint">Sert à repérer ce séjour dans le récap saisons.</small>
      </label>
    </div>
  );

  const renderCapacitySection = () => (
    <>
      <div className="production-form-grid production-form-grid-3">
        <label>
          <span>Nombre d'enfants (prévision)</span>
          <input type="number" step="1" min="0" placeholder="ex : 30" value={selectedPlan.childCount || ""} onChange={(event) => updatePlan({ childCount: amount(event.target.value) })} />
          <small className="production-field-hint">L'effectif utilisé pour tous les calculs de budget.</small>
        </label>
        <label>
          <span>Capacité max (enfants)</span>
          <input type="number" step="1" min="0" placeholder="ex : 35" value={selectedPlan.maxChildren || ""} onChange={(event) => updatePlan({ maxChildren: amount(event.target.value) })} />
          <small className="production-field-hint">Le maximum que le lieu peut accueillir, pour info.</small>
        </label>
        <label>
          <span>Recettes complémentaires</span>
          <input type="number" step="0.01" min="0" placeholder="ex : 0" value={selectedPlan.extraRevenue || ""} onChange={(event) => updatePlan({ extraRevenue: amount(event.target.value) })} />
          <small className="production-field-hint">Subventions, sponsors ou autres revenus hors prix de vente.</small>
        </label>
      </div>
      <div className="production-age-chips">
        {AGE_GROUP_OPTIONS.map((age) => (
          <button
            type="button"
            key={age}
            className={(selectedPlan.ageGroups || []).includes(age) ? "is-active" : ""}
            onClick={() => toggleAgeGroup(age)}
          >
            {age}
          </button>
        ))}
      </div>
    </>
  );

  const renderWeeksSection = () => (
    <>
      <div className="production-form-grid production-form-grid-3">
        <label>
          <span>Nombre de séjours</span>
          <input type="number" min="1" step="1" value={sessions.length} onChange={(event) => setSessionCount(event.target.value)} />
          <small className="production-field-hint">S1 fixe la durée. Pour les suivants, renseigne uniquement leur date de début.</small>
        </label>
        <label>
          <span>Durée calculée depuis S1</span>
          <input readOnly value={`${selectedPlan.days || 0} jour${selectedPlan.days > 1 ? "s" : ""} · ${selectedPlan.nights || 0} nuit${selectedPlan.nights > 1 ? "s" : ""}`} />
          <small className="production-field-hint">Cette durée est automatiquement appliquée à tous les séjours.</small>
        </label>
      </div>
      <div className="production-session-list">
        {sessions.map((session, index) => (
          <div className="production-session-row" key={index}>
            <span className="production-session-label">S{index + 1}</span>
            <label><span>Début</span><input type="date" value={session.startDate || ""} onChange={(event) => updateSession(index, { startDate: event.target.value })} /></label>
            {index === 0 ? (
              <label><span>Fin</span><input type="date" min={session.startDate || undefined} value={session.endDate || ""} onChange={(event) => updateSession(index, { endDate: event.target.value })} /></label>
            ) : (
              <div className={`production-session-end${session.endDate ? "" : " is-pending"}`}>
                <span>Fin calculée</span>
                <strong>{session.endDate ? formatFr(session.endDate) : "Après la saisie du début"}</strong>
              </div>
            )}
            <button type="button" className="production-session-remove" onClick={() => removeSession(index)} disabled={sessions.length <= 1} title="Retirer ce séjour">×</button>
          </div>
        ))}
        <button type="button" className="dash-btn dash-btn-secondary" onClick={addSession}>+ Ajouter un séjour</button>
      </div>
    </>
  );

  const renderMealPlanSection = () => (
    <div className="production-form-grid production-form-grid-2">
      <label>
        <span>Formule</span>
        <select value={selectedPlan.mealPlan || "full"} onChange={(event) => setMealPlan(event.target.value)}>
          <option value="full">Pension complète</option>
          <option value="autogestion">Auto-gestion</option>
        </select>
      </label>
      <label><span>Note</span><input readOnly value={selectedPlan.mealPlan === "autogestion" ? "Budget nourriture dans l'onglet dédié" : "Repas inclus, pas de suivi nourriture séparé"} /></label>
    </div>
  );

  const renderRhSection = () => (
    <>
      <div className="production-subsection-head">
        <h4>Simulation RH</h4>
        <div className="production-toggle-group">
          <button
            type="button"
            className={selectedPlan.animatorStaffingMode !== "ratio" ? "is-active" : ""}
            onClick={() => updatePlan({ animatorStaffingMode: "manual" })}
          >
            Manuel
          </button>
          <button
            type="button"
            className={selectedPlan.animatorStaffingMode === "ratio" ? "is-active" : ""}
            onClick={() => updatePlan({ animatorStaffingMode: "ratio" })}
          >
            Quota
          </button>
        </div>
      </div>
      <div className="production-form-grid production-form-grid-3">
        <label><span>Nombre DS</span><input type="number" step="1" min="0" placeholder="ex : 1" value={selectedPlan.directorCount || ""} onChange={(event) => updatePlan({ directorCount: amount(event.target.value) })} /></label>
        <label><span>Salaire DS net / jour</span><input type="number" step="0.01" min="0" placeholder="ex : 90" value={selectedPlan.directorNetDay || ""} onChange={(event) => updatePlan({ directorNetDay: amount(event.target.value) })} /></label>
        {selectedPlan.animatorStaffingMode === "ratio" ? (
          <label>
            <span>1 animateur pour ___ enfants</span>
            <input type="number" step="1" min="1" value={selectedPlan.animatorRatio ?? 8} onChange={(event) => updatePlan({ animatorRatio: amount(event.target.value) })} />
          </label>
        ) : (
          <label><span>Nombre anims</span><input type="number" step="1" min="0" placeholder="ex : 4" value={selectedPlan.animatorCount || ""} onChange={(event) => updatePlan({ animatorCount: amount(event.target.value) })} /></label>
        )}
        <label><span>Salaire anim net / jour</span><input type="number" step="0.01" min="0" placeholder="ex : 60" value={selectedPlan.animatorNetDay || ""} onChange={(event) => updatePlan({ animatorNetDay: amount(event.target.value) })} /></label>
        <label>
          <span>Coefficient chargé</span>
          <input type="number" step="0.01" min="1" value={selectedPlan.staffCostMultiplier ?? 1.35} onChange={(event) => updatePlan({ staffCostMultiplier: amount(event.target.value) })} />
          <small className="production-field-hint">Multiplie le salaire net pour estimer le coût employeur (1,35 = +35 % de charges).</small>
        </label>
        {selectedPlan.animatorStaffingMode === "ratio" && (
          <label>
            <span>Nombre d'animateurs (calculé)</span>
            <input readOnly value={`${amount(selectedPlan.childCount)} enfants ÷ ${amount(selectedPlan.animatorRatio || 8)} = ${computed.animatorCount} animateur${computed.animatorCount > 1 ? "s" : ""}`} />
          </label>
        )}
      </div>
      <div className="production-rh-detail-grid">
        <table className="production-mini-table">
          <thead>
            <tr><th>Poste</th><th>Calcul net</th><th>Net</th><th>Chargé</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Direction</td>
              <td>{amount(selectedPlan.directorCount)} DS × {selectedPlan.days} j × {currency(selectedPlan.directorNetDay)}</td>
              <td>{currency(simulatedDirectorNet)}</td>
              <td>{currency(simulatedDirectorNet * amount(selectedPlan.staffCostMultiplier || 1))}</td>
            </tr>
            <tr>
              <td>Animation</td>
              <td>{computed.animatorCount} anims × {selectedPlan.days} j × {currency(selectedPlan.animatorNetDay)}</td>
              <td>{currency(simulatedAnimatorNet)}</td>
              <td>{currency(simulatedAnimatorNet * amount(selectedPlan.staffCostMultiplier || 1))}</td>
            </tr>
            <tr className="total">
              <td>Total simulation</td>
              <td>Coefficient chargé {amount(selectedPlan.staffCostMultiplier || 1).toFixed(2)}</td>
              <td>{currency(simulatedNet)}</td>
              <td>{currency(computed.simulatedStaffCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="production-rh-summary">
        <div><span>Coût RH simulé (chargé)</span><strong>{currency(computed.simulatedStaffCost)}</strong></div>
        <div><span>Dont charges patronales</span><strong>{currency(simulatedCharges)}</strong></div>
      </div>
    </>
  );

  const renderFoodSection = () => (
    <>
      <div className="production-form-grid production-form-grid-3">
        <label><span>Repas / jour</span><input type="number" step="1" min="0" value={selectedPlan.mealsPerDay ?? 3} onChange={(event) => updatePlan({ mealsPerDay: amount(event.target.value) })} /></label>
        <label><span>Coût / repas / personne</span><input type="number" step="0.01" min="0" placeholder="ex : 8" value={selectedPlan.mealCostPerPerson || ""} onChange={(event) => updatePlan({ mealCostPerPerson: amount(event.target.value) })} /></label>
        <label><span>Personnes concernées</span><input readOnly value={`${amount(selectedPlan.childCount)} enfants + ${computed.staffCount} staff = ${amount(selectedPlan.childCount) + computed.staffCount}`} /></label>
      </div>
      <div className="production-rh-summary">
        <div>
          <span>Formule</span>
          <strong>{amount(selectedPlan.mealsPerDay)} repas × {selectedPlan.days} j × {amount(selectedPlan.childCount) + computed.staffCount} pers. × {currency(selectedPlan.mealCostPerPerson)}</strong>
        </div>
        <div><span>Coût nourriture total</span><strong>{currency(computed.foodCost)}</strong></div>
      </div>
    </>
  );

  const renderExpensesSection = () => (
    <>
      <div className="production-card-head" style={{ padding: "0 0 12px" }}>
        <div />
        <div className="accounting-actions">
          <button type="button" className="dash-btn dash-btn-secondary" onClick={addDefaultExpenses}>Ajouter le modèle EVCC</button>
          <button type="button" className="dash-btn dash-btn-secondary" onClick={addExpense}>Ajouter un poste</button>
        </div>
      </div>
      <div className="production-table-wrap">
        <table className="production-table production-spreadsheet">
          <thead>
            <tr>
              <th>Intitulé</th>
              <th>Catégorie</th>
              <th>Unité</th>
              <th>Qté</th>
              <th>Prix unit.</th>
              <th>Calcul</th>
              <th>Total ligne</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {computed.expenseRows.map((line, index) => (
              <tr key={index}>
                <td><input className="production-text-input" value={line.label || ""} placeholder="ex: Hébergement, activités..." onChange={(event) => updateExpense(index, { label: event.target.value })} /></td>
                <td>
                  <div className="production-category-cell">
                    <span className="production-cat-dot" style={{ background: categoryColor(line.category) }} />
                    <input className="production-text-input" value={line.category || ""} placeholder="Catégorie" onChange={(event) => updateExpense(index, { category: event.target.value })} />
                  </div>
                </td>
                <td>
                  <select value={line.unit || "fixed"} onChange={(event) => updateExpense(index, { unit: event.target.value })}>
                    {PRODUCTION_UNITS.map((unit) => <option key={unit.key} value={unit.key}>{unit.label}</option>)}
                  </select>
                </td>
                <td><input className="production-number-input" type="number" step="0.01" value={line.quantity ?? 1} onChange={(event) => updateExpense(index, { quantity: amount(event.target.value) })} /></td>
                <td><input className="production-number-input" type="number" step="0.01" value={line.unitAmount ?? 0} onChange={(event) => updateExpense(index, { unitAmount: amount(event.target.value) })} /></td>
                <td className="production-formula-cell">{line.formula}</td>
                <td><strong>{currency(line.total)}</strong></td>
                <td><button type="button" className="accounting-table-remove" onClick={() => removeExpense(index)}>Supprimer</button></td>
              </tr>
            ))}
            {computed.calculatedExpenseRows.map((line) => (
              <tr className="production-system-expense" key={line.key}>
                <td>
                  <strong>{line.label}</strong>
                  <small>Calcul automatique</small>
                </td>
                <td>
                  <div className="production-category-cell">
                    <span className="production-cat-dot" style={{ background: categoryColor(line.category) }} />
                    <strong>{line.category}</strong>
                  </div>
                </td>
                <td><span className="production-system-badge">Calculé</span></td>
                <td>—</td>
                <td>—</td>
                <td className="production-formula-cell">{line.formula}</td>
                <td><strong>{currency(line.total)}</strong></td>
                <td><span className="production-system-badge">Auto</span></td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan="6">Total des dépenses</td>
              <td>{currency(computed.totalExpenses)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="production-line-sums">
        <h4>Somme par intitulé</h4>
        <div>
          {computed.allExpenseRows.map((line, index) => (
            <span key={line.key || `${line.label}-${index}`}>
              <strong>{line.label || "Sans intitulé"}</strong>
              {currency(line.total)}
            </span>
          ))}
        </div>
      </div>
    </>
  );

  const renderPricingSection = () => (
    <>
      <div className="production-form-grid production-form-grid-2">
        <label>
          <span>Prix de vente / enfant</span>
          <input type="number" step="0.01" min="0" placeholder="ex : 250" value={selectedPlan.pricePerChild || ""} onChange={(event) => updatePlan({ pricePerChild: amount(event.target.value) })} />
          <small className="production-field-hint">Utilise un des repères ci-dessous, ou saisis ton propre prix.</small>
        </label>
      </div>
      <div className="production-price-tiers">
        {PRICE_TIERS.map((tier) => {
          const price = priceForMargin(computed, tier.rate);
          const isActive = Math.abs(price - amount(selectedPlan.pricePerChild)) < 0.01;
          return (
            <div className={`production-price-tier ${isActive ? "is-active" : ""}`} key={tier.key}>
              <span>{tier.label}</span>
              <strong>{currency(price)}</strong>
              <small>marge visée {(tier.rate * 100).toFixed(0)} %</small>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={() => updatePlan({ pricePerChild: price })}>
                Utiliser
              </button>
            </div>
          );
        })}
      </div>
      <div className="production-breakeven-badge">
        <IconTarget />
        <span>
          {breakEvenChildren != null
            ? `Seuil de rentabilité : ${breakEvenChildren} enfants (marge ≥ 0 €)`
            : "Seuil de rentabilité non atteint sur la plage testée (jusqu'à 200 enfants)"}
        </span>
      </div>
    </>
  );

  return (
    <div className="dash-page production-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Production de séjour</h1>
          <p>Construis un séjour en simulation : semaines, capacité, RH, dépenses, marge, puis création de la fiche publique.</p>
        </div>
        <div className="accounting-actions">
          <div className="production-view-switcher">
            <button type="button" className={view === "plan" ? "is-active" : ""} onClick={() => setView("plan")}>Plan</button>
            <button type="button" className={view === "seasons" ? "is-active" : ""} onClick={() => setView("seasons")}>Récap saisons</button>
          </div>
          <button type="button" className="dash-btn dash-btn-secondary" onClick={openCreateModal}>+ Nouveau séjour</button>
          <button type="button" className="dash-btn" onClick={saveProduction}>Enregistrer</button>
        </div>
      </header>
      {status && <p className="accounting-status">{status}</p>}

      {showCreateModal && selectedPlan && portalMounted && createPortal(
        <div className="dash-modal-backdrop" onClick={closeCreateModal}>
          <div className="dash-modal-card dash-modal-lg" onClick={(event) => event.stopPropagation()}>
            <div className="dash-modal-header">
              <h3>Nouveau séjour — {currentWizardStep.label} ({safeWizardStep + 1}/{wizardSteps.length})</h3>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={closeCreateModal}>Fermer</button>
            </div>
            <div className="dash-modal-body">
              <div className="production-wizard-recap">
                <span>Recettes <strong>{currency(computed.revenue)}</strong></span>
                <span>Dépenses totales <strong>{currency(computed.totalExpenses)}</strong></span>
                <span>Marge <strong className={computed.margin >= 0 ? "production-margin-positive" : "production-margin-negative"}>{currency(computed.margin)} ({computed.marginRate.toFixed(1)} %)</strong></span>
              </div>
              {currentWizardStep.key === "identity" && (
                <>
                  {renderIdentitySection()}
                  <div className="production-subsection-head"><h4>Capacité</h4></div>
                  {renderCapacitySection()}
                </>
              )}
              {currentWizardStep.key === "weeks" && (
                <>
                  {renderWeeksSection()}
                  {renderMealPlanSection()}
                  {renderRhSection()}
                </>
              )}
              {currentWizardStep.key === "expenses" && (
                <>
                  {selectedPlan.mealPlan === "autogestion" && (
                    <>
                      <div className="production-subsection-head"><h4>Nourriture</h4></div>
                      {renderFoodSection()}
                    </>
                  )}
                  <div className="production-subsection-head"><h4>Dépenses</h4></div>
                  {renderExpensesSection()}
                </>
              )}
              {currentWizardStep.key === "pricing" && renderPricingSection()}
              <div className="dash-modal-actions">
                {safeWizardStep > 0 && (
                  <button type="button" className="dash-btn dash-btn-secondary" onClick={() => setWizardStep(safeWizardStep - 1)}>Précédent</button>
                )}
                {safeWizardStep < wizardSteps.length - 1 ? (
                  <button type="button" className="dash-btn" onClick={() => setWizardStep(safeWizardStep + 1)}>Suivant</button>
                ) : (
                  <button type="button" className="dash-btn" onClick={closeCreateModal}>Terminer</button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {view === "seasons" ? (
        <div className="production-seasons-recap">
          {seasonGroups.map((group) => (
            <div className="production-season-card" key={group.season}>
              <div className="production-season-head">
                <h3>{group.season}</h3>
                {group.rows.length > 0 && <span>{group.rangeLabel}</span>}
              </div>
              {!group.rows.length ? (
                <p className="dash-muted">Aucune semaine simulée sur cette saison.</p>
              ) : (
                <div className="production-timeline-wrap">
                  <div className="production-timeline-grid" style={{ width: `${LABEL_WIDTH + group.days.length * DAY_WIDTH}px` }}>
                    <div className="production-timeline-row production-timeline-months-row">
                      <div className="production-timeline-label-cell" style={{ width: LABEL_WIDTH }} />
                      {group.months.map((month) => (
                        <div key={month.key} className="production-timeline-month-cell" style={{ width: month.count * DAY_WIDTH }}>{month.label}</div>
                      ))}
                    </div>
                    <div className="production-timeline-row">
                      <div className="production-timeline-label-cell" style={{ width: LABEL_WIDTH }} />
                      {group.days.map((day) => (
                        <div key={day.date} className={`production-timeline-daycell ${day.isWeekend ? "is-weekend" : ""}`} style={{ width: DAY_WIDTH }}>{day.letter}</div>
                      ))}
                    </div>
                    <div className="production-timeline-row">
                      <div className="production-timeline-label-cell" style={{ width: LABEL_WIDTH }} />
                      {group.days.map((day) => (
                        <div key={day.date} className={`production-timeline-daycell ${day.isWeekend ? "is-weekend" : ""}`} style={{ width: DAY_WIDTH }}>{day.dayNumber}</div>
                      ))}
                    </div>
                    {group.rows.map((row) => (
                      <div className="production-timeline-row production-timeline-plan-row" key={row.planId}>
                        <div className="production-timeline-label-cell" style={{ width: LABEL_WIDTH }} title={row.planName}>{row.planName}</div>
                        <div className="production-timeline-row-track" style={{ width: group.days.length * DAY_WIDTH }}>
                          {group.days.map((day, index) => day.isWeekend && (
                            <div key={day.date} className="production-timeline-weekend-col" style={{ left: `${index * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }} />
                          ))}
                          {row.sessions.map((session) => {
                            const startIndex = Math.max(dayIndexOf(group.days, session.startDate), 0);
                            const span = Math.max(daysBetween(session.startDate, session.endDate), 1);
                            const durationLabel = `${formatFr(session.startDate)} → ${formatFr(session.endDate)} (${span}j)`;
                            return (
                              <div
                                key={session.key}
                                className="production-timeline-bar"
                                style={{ left: `${startIndex * DAY_WIDTH}px`, width: `${span * DAY_WIDTH}px`, background: row.color }}
                                title={`${row.planName} · ${durationLabel}`}
                              >
                                <span>{durationLabel}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="production-season-card">
            <div className="production-season-head">
              <h3>Synthèse des simulations</h3>
              <span>{plans.length} plan{plans.length > 1 ? "s" : ""}</span>
            </div>
            {!plans.length ? (
              <p className="dash-muted">Aucune simulation pour l'instant.</p>
            ) : (
              <div className="production-table-wrap">
                <table className="production-mini-table">
                  <thead>
                    <tr>
                      <th>Couleur</th>
                      <th>Séjour</th>
                      <th>Lieu</th>
                      <th>Âges</th>
                      <th>Semaines</th>
                      <th>Dates</th>
                      <th>Enfants</th>
                      <th>Prix/enfant</th>
                      <th>Marge</th>
                      <th>Taux</th>
                      <th>Statut</th>
                      <th></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => {
                      const planComputed = computeProduction(plan);
                      const planRange = sessionsRange(plan.sessions);
                      const planSessions = plan.sessions || [];
                      return (
                        <tr key={plan.id}>
                          <td>
                            <input
                              type="color"
                              className="production-color-input"
                              value={plan.color || categoryColor(plan.name || plan.id)}
                              onChange={(event) => updatePlanById(plan.id, { color: event.target.value })}
                              title="Couleur de ce séjour dans le récap saisons"
                            />
                          </td>
                          <td><button type="button" className="production-link-button" onClick={() => openPlan(plan.id)}>{plan.name || "Sans nom"}</button></td>
                          <td>{plan.location || "-"}</td>
                          <td>{(plan.ageGroups || []).join(", ") || "-"}</td>
                          <td>{planSessions.length}</td>
                          <td>{planRange.openDate || "-"} → {planRange.closeDate || "-"}</td>
                          <td>{plan.childCount}</td>
                          <td>{currency(plan.pricePerChild)}</td>
                          <td className={planComputed.margin >= 0 ? "production-margin-positive" : "production-margin-negative"}>{currency(planComputed.margin)}</td>
                          <td>{planComputed.marginRate.toFixed(1)} %</td>
                          <td>{plan.linkedStayId ? "Publié" : "Simulation"}</td>
                          <td><button type="button" className="dash-btn dash-btn-secondary" onClick={() => openPlan(plan.id)}>Ouvrir</button></td>
                          <td><button type="button" className="accounting-table-remove" onClick={() => deletePlanById(plan.id)}>Supprimer</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : !selectedPlan ? (
        <div className="production-main">
          <div className="production-empty-state">
            <p>Aucune simulation de production pour l'instant.</p>
            <button type="button" className="dash-btn" onClick={openCreateModal}>+ Nouveau séjour</button>
          </div>
        </div>
      ) : (
        <div className="production-main">
          <div className="production-plan-switcher">
            <label>
              <span>Plan de production</span>
              <select value={selectedPlan.id} onChange={(event) => setProduction((previous) => ({ ...previous, selectedPlanId: event.target.value }))}>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name || "Sans nom"} — {plan.stayCode || "Test"}</option>)}
              </select>
            </label>
            <div className="production-plan-switcher-stats">
              <span>{sessions.length} semaine{sessions.length > 1 ? "s" : ""}</span>
              <span className={computed.margin >= 0 ? "production-margin-positive" : "production-margin-negative"}>{currency(computed.margin)}</span>
            </div>
          </div>

          <nav className="production-tabs" aria-label="Sections production">
            {visibleTabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                className={activeTab === tab.key ? "is-active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <section className="dash-metrics-grid production-kpis">
            <article className="dash-card dash-card-green">
              <div className="dash-card-icon dash-card-icon-green"><IconCoins /></div>
              <p>Recettes prévues</p>
              <strong>{currency(computed.revenue)}</strong>
            </article>
            <article className={`dash-card production-margin-card ${computed.margin >= 0 ? "is-positive" : "is-negative"}`}>
              <div className="dash-card-icon"><IconTrend up={computed.margin >= 0} /></div>
              <p>Marge prévisionnelle</p>
              <strong>{currency(computed.margin)}</strong>
              <span className="production-kpi-sub">{computed.marginRate.toFixed(1)} % de marge</span>
            </article>
            <article className="dash-card dash-card-pink">
              <div className="dash-card-icon dash-card-icon-pink"><IconTarget /></div>
              <p>Prix conseillé (marge 12 %)</p>
              <strong>{currency(recommendedPrice)}</strong>
              <span className="production-kpi-sub">Équilibre : {currency(computed.breakEvenPrice)}</span>
            </article>
          </section>

          <section className={activeTab === "assumptions" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Séjour & RH</h3>
                <p>Identité, semaines, capacité et RH de la simulation.</p>
              </div>
              <div className="accounting-actions">
                <button type="button" className="dash-btn dash-btn-secondary" onClick={duplicatePlan}>Dupliquer</button>
                <button type="button" className="dash-btn dash-btn-secondary" onClick={() => deletePlanById(selectedPlan.id)}>Supprimer</button>
              </div>
            </div>

            {renderIdentitySection()}

            <div className="production-subsection-head">
              <h4>Capacité</h4>
            </div>
            {renderCapacitySection()}

            <div className="production-subsection-head">
              <h4>Semaines du séjour</h4>
              <span className="production-session-summary">
                Ouverture {openDate || "-"} · Clôture {closeDate || "-"}
              </span>
            </div>
            {renderWeeksSection()}

            <div className="production-subsection-head">
              <h4>Restauration</h4>
            </div>
            {renderMealPlanSection()}

            {renderRhSection()}
          </section>

          <section className={activeTab === "food" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Nourriture (auto-gestion)</h3>
                <p>Budget nourriture calculé automatiquement et ajouté à la synthèse et à la marge.</p>
              </div>
            </div>
            {renderFoodSection()}
          </section>

          <section className={activeTab === "expenses" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Tableau des dépenses</h3>
                <p>Tous les coûts du séjour au même endroit : hébergement, postes éditables, nourriture et RH calculés automatiquement.</p>
              </div>
            </div>
            {renderExpensesSection()}
          </section>

          <section className={activeTab === "summary" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Synthèse par catégorie</h3>
                <p>Lecture rapide pour voir ce qui pèse vraiment dans la marge du séjour. Se met à jour automatiquement selon le RH, les quotas, la nourriture et les dépenses.</p>
              </div>
              <strong>{currency(computed.totalExpenses)}</strong>
            </div>
            <div className="production-bar-chart">
              {computed.categories.map((category) => {
                const percent = computed.totalExpenses > 0 ? (amount(category.total) / computed.totalExpenses) * 100 : 0;
                const color = categoryColor(category.label);
                return (
                  <div className="production-bar-row" key={category.label}>
                    <span className="production-bar-label">{category.label}</span>
                    <div className="production-bar-track">
                      <div className="production-bar-fill" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
                    </div>
                    <span className="production-bar-value">{currency(category.total)}</span>
                    <span className="production-bar-percent">{percent.toFixed(1)} %</span>
                  </div>
                );
              })}
            </div>
            <label className="production-notes">
              <span>Notes de production</span>
              <textarea value={selectedPlan.notes || ""} onChange={(event) => updatePlan({ notes: event.target.value })} />
            </label>
          </section>

          <section className={activeTab === "profitability" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Rentabilité & prix de vente</h3>
                <p>Fixe le prix ici. Trois repères de marge, puis le seuil de rentabilité et un tableau précis par effectif — tout se recalcule automatiquement selon le RH, les quotas, la nourriture et le nombre de jours.</p>
              </div>
            </div>
            {renderPricingSection()}
            <div className="production-form-grid production-form-grid-3">
              <label><span>De (enfants)</span><input type="number" step="1" min="0" value={sensitivityStart} onChange={(event) => setSensitivityRange((previous) => ({ ...previous, start: amount(event.target.value) }))} /></label>
              <label><span>À (enfants)</span><input type="number" step="1" min="0" value={sensitivityEnd} onChange={(event) => setSensitivityRange((previous) => ({ ...previous, end: amount(event.target.value) }))} /></label>
              <label><span>Pas</span><input type="number" step="1" min="1" value={sensitivityStep} onChange={(event) => setSensitivityRange((previous) => ({ ...previous, step: amount(event.target.value) }))} /></label>
            </div>
            <div className="production-rh-detail-grid">
              <table className="production-mini-table">
                <thead>
                  <tr><th>Enfants</th><th>Recettes</th><th>Dépenses (dont RH)</th><th>Marge</th><th>Taux</th></tr>
                </thead>
                <tbody>
                  {sensitivityRows.map((row) => {
                    const isCurrent = row.childCount === amount(selectedPlan.childCount);
                    const isBreakEven = breakEvenChildren != null && row.childCount === breakEvenChildren;
                    return (
                      <tr key={row.childCount} className={isCurrent || isBreakEven ? "total" : ""}>
                        <td>
                          {row.childCount}
                          {isCurrent && " (actuel)"}
                          {isBreakEven && " (seuil)"}
                        </td>
                        <td>{currency(row.revenue)}</td>
                        <td>{currency(row.totalExpenses)}</td>
                        <td className={row.margin >= 0 ? "production-margin-positive" : "production-margin-negative"}>{currency(row.margin)}</td>
                        <td>{row.marginRate.toFixed(1)} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={activeTab === "publish" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Publier ce plan</h3>
                <p>
                  {selectedPlan.linkedStayId
                    ? "Déjà publié : republier met à jour les semaines et le prix de la fiche existante, sans toucher au reste (textes, photos, sections)."
                    : "Crée la fiche séjour dans “Séjours en vente” avec toutes les semaines, le prix et un instantané de production."}
                </p>
              </div>
              <div className="accounting-actions">
                {selectedPlan.linkedStayId && (
                  <button type="button" className="dash-btn dash-btn-danger" onClick={deleteLinkedStay}>
                    Supprimer le séjour
                  </button>
                )}
                <button type="button" className="dash-btn" onClick={publishPlan} disabled={creatingStay}>
                  {creatingStay ? "Publication..." : selectedPlan.linkedStayId ? "Mettre à jour le séjour" : "Créer le séjour en vente"}
                </button>
              </div>
            </div>
            <div className="production-publish-grid">
              <div>
                <span>Nom</span>
                <strong>{selectedPlan.name || "Nouveau séjour"}</strong>
              </div>
              <div>
                <span>Lieu</span>
                <strong>{selectedPlan.location || "-"}</strong>
              </div>
              <div>
                <span>Semaines</span>
                <strong>{sessions.length} · {openDate || "-"} → {closeDate || "-"}</strong>
              </div>
              <div>
                <span>Prix public</span>
                <strong>{currency(selectedPlan.pricePerChild)}</strong>
              </div>
              <div>
                <span>Prix d'équilibre</span>
                <strong>{currency(computed.breakEvenPrice)}</strong>
              </div>
              <div>
                <span>Marge actuelle</span>
                <strong className={computed.margin >= 0 ? "finance-paid" : "finance-due"}>{currency(computed.margin)} · {targetMarginRate.toFixed(1)} %</strong>
              </div>
            </div>
            <div className="production-publish-note">
              <strong>Flux recommandé</strong>
              <p>1. Construis le budget ici, avec toutes les semaines du séjour. 2. Choisis le prix dans l'onglet Rentabilité. 3. Publie. 4. Termine les textes, photos, gares dans “Séjours en vente”.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
