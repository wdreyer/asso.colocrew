"use client";

import { useMemo, useState, useEffect } from "react";
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
  { label: "Hébergement gîte", category: "Hébergement", unit: "fixed", quantity: 1, unitAmount: 8550 },
  { label: "Activités prestataires", category: "Activités", unit: "manual", quantity: 32, unitAmount: 200 },
  { label: "Nourriture", category: "Nourriture", unit: "perPersonDay", quantity: 1, unitAmount: 10 },
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
  pricePerChild: 1027.2,
  childCount: 30,
  maxChildren: 30,
  extraRevenue: 0,
  sessions: [{ startDate: "2026-08-17", endDate: "2026-08-28" }],
  days: 12,
  nights: 11,
  mealPlan: "full",
  halfBoardRatio: 0.62,
  directorCount: 1,
  animatorCount: 4,
  animatorStaffingMode: "manual",
  animatorRatio: 8,
  directorNetDay: 90,
  animatorNetDay: 60,
  staffCostMultiplier: 1.3,
  notes: "Modèle de base repris depuis le fichier O vives : 30 enfants, 4 anims, 1 DS, 12 jours / 11 nuits.",
  expenses: DEFAULT_PRODUCTION_EXPENSES,
};

const DEFAULT_PRODUCTION = {
  selectedPlanId: DEFAULT_PRODUCTION_PLAN.id,
  plans: [DEFAULT_PRODUCTION_PLAN],
};

const PRODUCTION_TABS = [
  { key: "assumptions", label: "Séjour & RH" },
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

function toIsoDate(value) {
  return value ? `${String(value).slice(0, 10)}T00:00:00.000Z` : "";
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

function sessionsDuration(sessions) {
  const first = Array.isArray(sessions) ? sessions.find((session) => session?.startDate && session?.endDate) : null;
  const days = daysBetween(first?.startDate, first?.endDate);
  return {
    days: days || DEFAULT_PRODUCTION_PLAN.days,
    nights: days > 1 ? days - 1 : DEFAULT_PRODUCTION_PLAN.nights,
  };
}

function sessionsRange(sessions) {
  const valid = (Array.isArray(sessions) ? sessions : []).filter((session) => session?.startDate && session?.endDate);
  if (!valid.length) return { openDate: "", closeDate: "" };
  const starts = valid.map((session) => session.startDate).sort();
  const ends = valid.map((session) => session.endDate).sort();
  return { openDate: starts[0], closeDate: ends[ends.length - 1] };
}

function normalizeProductionExpense(line) {
  return {
    label: line?.label || "Nouvelle dépense",
    category: line?.category || "Autre",
    unit: PRODUCTION_UNITS.some((unit) => unit.key === line?.unit) ? line.unit : "fixed",
    quantity: amount(line?.quantity ?? 1),
    unitAmount: amount(line?.unitAmount),
  };
}

function normalizeProductionPlan(plan) {
  const base = deepClone(DEFAULT_PRODUCTION_PLAN);
  const merged = { ...base, ...(plan || {}) };
  const sessions = Array.isArray(merged.sessions) && merged.sessions.length
    ? merged.sessions.map(normalizeSession)
    : base.sessions.map(normalizeSession);
  const duration = sessionsDuration(sessions);
  return {
    ...merged,
    id: String(plan?.id || base.id),
    sessions,
    days: duration.days,
    nights: duration.nights,
    expenses: Array.isArray(plan?.expenses) && plan.expenses.length
      ? plan.expenses.map(normalizeProductionExpense)
      : base.expenses.map(normalizeProductionExpense),
  };
}

function mealRatioFor(plan) {
  return plan.mealPlan === "half" ? Math.max(amount(plan.halfBoardRatio), 0) : 1;
}

function isFoodLine(line) {
  const text = `${line.category || ""} ${line.label || ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return text.includes("nourriture") || text.includes("repas") || text.includes("aliment");
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
  const foodRatio = isFoodLine(line) ? mealRatioFor(plan) : 1;
  return Math.round(unitAmount * multiplier * foodRatio * 100) / 100;
}

function productionExpenseFormula(line, plan, staffCount) {
  const unitAmount = currency(line.unitAmount);
  const quantity = amount(line.quantity || 1);
  const children = amount(plan.childCount);
  const days = amount(plan.days);
  const nights = amount(plan.nights);
  const people = children + amount(staffCount);
  const unitLabel = PRODUCTION_UNITS.find((unit) => unit.key === line.unit)?.label || "Forfait";
  const base = {
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
  if (isFoodLine(line) && plan.mealPlan === "half") {
    return `${base} × demi-pension ${amount(plan.halfBoardRatio || 0.62).toFixed(2)}`;
  }
  return base;
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
  const revenue = Math.round(((amount(plan.pricePerChild) * amount(calcPlan.childCount)) + amount(plan.extraRevenue)) * 100) / 100;
  const expenseRows = calcPlan.expenses.map((line) => ({
    ...line,
    total: productionExpenseTotal(line, calcPlan, staffCount),
    formula: productionExpenseFormula(line, calcPlan, staffCount),
    mealAdjusted: isFoodLine(line) && calcPlan.mealPlan === "half",
  }));
  const operationalExpenses = expenseRows.reduce((sum, line) => sum + amount(line.total), 0);
  const totalExpenses = Math.round((operationalExpenses + rhCost) * 100) / 100;
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
    revenue,
    expenseRows,
    operationalExpenses,
    totalExpenses,
    margin,
    marginRate,
    breakEvenPrice,
    categories: summarizeProductionByCategory([...expenseRows, { category: "RH", total: rhCost }]),
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

export default function ProductionSejours() {
  const router = useRouter();
  const [production, setProduction] = useState(() => deepClone(DEFAULT_PRODUCTION));
  const [status, setStatus] = useState("");
  const [creatingStay, setCreatingStay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assumptions");
  const [sensitivityRange, setSensitivityRange] = useState({ start: null, end: null, step: 1 });

  useEffect(() => {
    async function load() {
      try {
        const accountingSnapshot = await getDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID));
        const saved = accountingSnapshot.exists() ? accountingSnapshot.data()?.production : null;
        setProduction({
          selectedPlanId: saved?.selectedPlanId || DEFAULT_PRODUCTION.selectedPlanId,
          plans: Array.isArray(saved?.plans) && saved.plans.length ? saved.plans : DEFAULT_PRODUCTION.plans,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const plans = useMemo(
    () => (Array.isArray(production.plans) && production.plans.length ? production.plans : DEFAULT_PRODUCTION.plans).map(normalizeProductionPlan),
    [production.plans],
  );
  const selectedPlanId = production.selectedPlanId || plans[0]?.id || DEFAULT_PRODUCTION_PLAN.id;
  const selectedIndex = Math.max(plans.findIndex((plan) => plan.id === selectedPlanId), 0);
  const selectedPlan = plans[selectedIndex] || normalizeProductionPlan(DEFAULT_PRODUCTION_PLAN);
  const sessions = selectedPlan.sessions || [];
  const { openDate, closeDate } = sessionsRange(sessions);
  const computed = computeProduction(selectedPlan);
  const simulatedDirectorNet = amount(selectedPlan.directorCount) * amount(selectedPlan.directorNetDay) * amount(selectedPlan.days);
  const simulatedAnimatorNet = computed.animatorCount * amount(selectedPlan.animatorNetDay) * amount(selectedPlan.days);
  const simulatedNet = simulatedDirectorNet + simulatedAnimatorNet;
  const simulatedCharges = Math.max(computed.simulatedStaffCost - simulatedNet, 0);
  const targetMarginRate = amount(computed.revenue) > 0 ? computed.marginRate : 0;
  const recommendedPrice = priceForMargin(computed, 0.12);
  const breakEvenChildren = useMemo(() => findBreakEvenChildren(selectedPlan), [selectedPlan]);
  const sensitivityDefaultStart = Math.max(1, Math.min(amount(selectedPlan.childCount), breakEvenChildren || amount(selectedPlan.childCount)) - 5);
  const sensitivityDefaultEnd = Math.max(amount(selectedPlan.childCount), breakEvenChildren || 0) + 10;
  const sensitivityStart = sensitivityRange.start ?? sensitivityDefaultStart;
  const sensitivityEnd = sensitivityRange.end ?? sensitivityDefaultEnd;
  const sensitivityStep = Math.max(amount(sensitivityRange.step ?? 1), 1);
  const sensitivityRows = [];
  for (let count = sensitivityStart; count <= sensitivityEnd && sensitivityRows.length < 200; count += sensitivityStep) {
    sensitivityRows.push(computeProduction(selectedPlan, { childCount: count }));
  }

  const writePlans = (nextPlans, nextSelectedId = selectedPlanId) => {
    setProduction({
      selectedPlanId: nextSelectedId,
      plans: nextPlans.map(normalizeProductionPlan),
    });
  };

  const updatePlan = (patch) => {
    writePlans(plans.map((plan, index) => (index === selectedIndex ? normalizeProductionPlan({ ...plan, ...patch }) : plan)));
  };

  const updateExpense = (expenseIndex, patch) => {
    updatePlan({
      expenses: selectedPlan.expenses.map((line, index) => (
        index === expenseIndex ? normalizeProductionExpense({ ...line, ...patch }) : line
      )),
    });
  };

  const addPlan = () => {
    const id = `production-${Date.now()}`;
    writePlans([
      ...plans,
      normalizeProductionPlan({
        ...DEFAULT_PRODUCTION_PLAN,
        id,
        name: `Séjour test ${plans.length + 1}`,
        linkedStayId: "",
      }),
    ], id);
  };

  const duplicatePlan = () => {
    const id = `production-${Date.now()}`;
    writePlans([...plans, normalizeProductionPlan({ ...selectedPlan, id, name: `${selectedPlan.name || "Simulation"} - copie`, linkedStayId: "" })], id);
  };

  const removePlan = () => {
    if (plans.length <= 1) return;
    const nextPlans = plans.filter((_, index) => index !== selectedIndex);
    writePlans(nextPlans, nextPlans[0]?.id);
  };

  const addExpense = () => {
    updatePlan({
      expenses: [...selectedPlan.expenses, { label: "Nouvelle dépense", category: "Autre", unit: "fixed", quantity: 1, unitAmount: 0 }],
    });
  };

  const removeExpense = (expenseIndex) => {
    updatePlan({ expenses: selectedPlan.expenses.filter((_, index) => index !== expenseIndex) });
  };

  const setSessionCount = (value) => {
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
    const last = sessions[sessions.length - 1];
    updatePlan({ sessions: [...sessions, { startDate: last?.endDate || "", endDate: "" }] });
  };

  const removeSession = (index) => {
    if (sessions.length <= 1) return;
    updatePlan({ sessions: sessions.filter((_, i) => i !== index) });
  };

  const updateSession = (index, patch) => {
    updatePlan({ sessions: sessions.map((session, i) => (i === index ? { ...session, ...patch } : session)) });
  };

  const saveProduction = async () => {
    setStatus("Enregistrement...");
    const nextProduction = {
      selectedPlanId: selectedPlan.id,
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
    if (!selectedPlan.linkedStayId) return;
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
        productionSnapshot: {
          plan: normalizeProductionPlan(selectedPlan),
          computed: {
            revenue: computed.revenue,
            operationalExpenses: computed.operationalExpenses,
            rhCost: computed.rhCost,
            totalExpenses: computed.totalExpenses,
            margin: computed.margin,
            marginRate: computed.marginRate,
            breakEvenPrice: computed.breakEvenPrice,
          },
        },
      };

      if (selectedPlan.linkedStayId) {
        const stayRef = doc(db, COLLECTIONS.SEJOURS, selectedPlan.linkedStayId);
        await updateDoc(stayRef, {
          dates: sessionDates,
          basePrice: priceMin,
          priceMin,
          priceMax,
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
          heroSubtitle: `${selectedPlan.days || 0} jours · ${selectedPlan.stayCode || "Séjour"} · prix construit en production`,
          heroImage: "",
          environment: selectedPlan.stayCode || "",
          basePrice: priceMin,
          priceMin,
          priceMax,
          ageGroups: [],
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

  if (loading) {
    return (
      <div className="dash-page production-page">
        <section className="dash-section"><p className="dash-muted">Chargement du module de production...</p></section>
      </div>
    );
  }

  return (
    <div className="dash-page production-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Production de séjour</h1>
          <p>Construis un séjour en simulation : semaines, capacité, RH, dépenses, marge, puis création de la fiche publique.</p>
        </div>
        <div className="accounting-actions">
          <button type="button" className="dash-btn dash-btn-secondary" onClick={addPlan}>Nouvelle simulation</button>
          <button type="button" className="dash-btn" onClick={saveProduction}>Enregistrer</button>
        </div>
      </header>
      {status && <p className="accounting-status">{status}</p>}

      <div className="production-layout">
        <aside className="production-sidebar">
          <div className="production-sidebar-head">
            <strong>Plans de production</strong>
            <span>{plans.length}</span>
          </div>
          {plans.map((plan) => {
            const planComputed = computeProduction(plan);
            const planSessions = plan.sessions || [];
            return (
              <button
                type="button"
                key={plan.id}
                className={plan.id === selectedPlan.id ? "is-active" : ""}
                onClick={() => setProduction((previous) => ({ ...previous, selectedPlanId: plan.id }))}
              >
                <strong>{plan.name}</strong>
                <span>
                  {plan.stayCode || "Test"} · {planSessions.length} sem. ·{" "}
                  <span className={planComputed.margin >= 0 ? "production-margin-positive" : "production-margin-negative"}>
                    {currency(planComputed.margin)}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="production-main">
          <nav className="production-tabs" aria-label="Sections production">
            {PRODUCTION_TABS.map((tab) => (
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
                <button type="button" className="dash-btn dash-btn-secondary" onClick={removePlan} disabled={plans.length <= 1}>Supprimer</button>
              </div>
            </div>

            <div className="production-form-grid production-form-grid-2">
              <label><span>Nom du séjour</span><input value={selectedPlan.name || ""} onChange={(event) => updatePlan({ name: event.target.value })} /></label>
              <label><span>Code séjour</span><input value={selectedPlan.stayCode || ""} onChange={(event) => updatePlan({ stayCode: event.target.value })} /></label>
            </div>

            <div className="production-subsection-head">
              <h4>Capacité</h4>
            </div>
            <div className="production-form-grid production-form-grid-3">
              <label><span>Nombre d'enfants (prévision)</span><input type="number" step="1" value={selectedPlan.childCount ?? 0} onChange={(event) => updatePlan({ childCount: amount(event.target.value) })} /></label>
              <label><span>Capacité max (enfants)</span><input type="number" step="1" value={selectedPlan.maxChildren ?? 0} onChange={(event) => updatePlan({ maxChildren: amount(event.target.value) })} /></label>
              <label><span>Recettes complémentaires</span><input type="number" step="0.01" value={selectedPlan.extraRevenue ?? 0} onChange={(event) => updatePlan({ extraRevenue: amount(event.target.value) })} /></label>
            </div>

            <div className="production-subsection-head">
              <h4>Semaines du séjour</h4>
              <span className="production-session-summary">
                Ouverture {openDate || "-"} · Clôture {closeDate || "-"}
              </span>
            </div>
            <div className="production-form-grid production-form-grid-3">
              <label><span>Nombre de séjours</span><input type="number" min="1" step="1" value={sessions.length} onChange={(event) => setSessionCount(event.target.value)} /></label>
            </div>
            <div className="production-session-list">
              {sessions.map((session, index) => (
                <div className="production-session-row" key={index}>
                  <span className="production-session-label">S{index + 1}</span>
                  <label><span>Début</span><input type="date" value={session.startDate || ""} onChange={(event) => updateSession(index, { startDate: event.target.value })} /></label>
                  <label><span>Fin</span><input type="date" value={session.endDate || ""} onChange={(event) => updateSession(index, { endDate: event.target.value })} /></label>
                  <button type="button" className="production-session-remove" onClick={() => removeSession(index)} disabled={sessions.length <= 1} title="Retirer cette semaine">×</button>
                </div>
              ))}
              <button type="button" className="dash-btn dash-btn-secondary" onClick={addSession}>+ Ajouter une semaine</button>
            </div>
            <div className="production-form-grid production-form-grid-3">
              <label><span>Durée par séjour</span><input readOnly value={`${selectedPlan.days || 0} jour${selectedPlan.days > 1 ? "s" : ""} · ${selectedPlan.nights || 0} nuit${selectedPlan.nights > 1 ? "s" : ""}`} /></label>
            </div>

            <div className="production-subsection-head">
              <h4>Restauration</h4>
            </div>
            <div className="production-form-grid production-form-grid-2">
              <label>
                <span>Formule</span>
                <select value={selectedPlan.mealPlan || "full"} onChange={(event) => updatePlan({ mealPlan: event.target.value })}>
                  <option value="full">Pension complète</option>
                  <option value="half">Demi-pension</option>
                </select>
              </label>
              {selectedPlan.mealPlan === "half" && (
                <label><span>Ratio demi-pension</span><input type="number" step="0.01" value={selectedPlan.halfBoardRatio ?? 0.62} onChange={(event) => updatePlan({ halfBoardRatio: amount(event.target.value) })} /></label>
              )}
            </div>

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
              <label><span>Nombre DS</span><input type="number" step="1" value={selectedPlan.directorCount ?? 0} onChange={(event) => updatePlan({ directorCount: amount(event.target.value) })} /></label>
              <label><span>Salaire DS net / jour</span><input type="number" step="0.01" value={selectedPlan.directorNetDay ?? 0} onChange={(event) => updatePlan({ directorNetDay: amount(event.target.value) })} /></label>
              {selectedPlan.animatorStaffingMode === "ratio" ? (
                <label>
                  <span>1 animateur pour ___ enfants</span>
                  <input type="number" step="1" min="1" value={selectedPlan.animatorRatio ?? 8} onChange={(event) => updatePlan({ animatorRatio: amount(event.target.value) })} />
                </label>
              ) : (
                <label><span>Nombre anims</span><input type="number" step="1" value={selectedPlan.animatorCount ?? 0} onChange={(event) => updatePlan({ animatorCount: amount(event.target.value) })} /></label>
              )}
              <label><span>Salaire anim net / jour</span><input type="number" step="0.01" value={selectedPlan.animatorNetDay ?? 0} onChange={(event) => updatePlan({ animatorNetDay: amount(event.target.value) })} /></label>
              <label><span>Coefficient chargé</span><input type="number" step="0.01" value={selectedPlan.staffCostMultiplier ?? 1} onChange={(event) => updatePlan({ staffCostMultiplier: amount(event.target.value) })} /></label>
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
          </section>

          <section className={activeTab === "expenses" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Tableau des dépenses</h3>
                <p>Saisie type Excel : intitulé, catégorie, unité de calcul, quantité, prix unitaire, puis total automatique par ligne.</p>
              </div>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={addExpense}>Ajouter un poste</button>
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
                    <tr key={`${line.label}-${index}`}>
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
                      <td>
                        <strong>{currency(line.total)}</strong>
                        {line.mealAdjusted && <small className="production-adjust-note">Demi-pension × {amount(selectedPlan.halfBoardRatio || 0.62).toFixed(2)}</small>}
                      </td>
                      <td><button type="button" className="accounting-table-remove" onClick={() => removeExpense(index)}>Supprimer</button></td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td colSpan="6">Total hors RH</td>
                    <td>{currency(computed.operationalExpenses)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="production-line-sums">
              <h4>Somme par intitulé</h4>
              <div>
                {computed.expenseRows.map((line, index) => (
                  <span key={`${line.label}-sum-${index}`}>
                    <strong>{line.label || "Sans intitulé"}</strong>
                    {currency(line.total)}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className={activeTab === "summary" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Synthèse par catégorie</h3>
                <p>Lecture rapide pour voir ce qui pèse vraiment dans la marge du séjour. Se met à jour automatiquement selon le RH, les quotas et les dépenses.</p>
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
                <p>Fixe le prix ici. Trois repères de marge, puis le seuil de rentabilité et un tableau précis par effectif — tout se recalcule automatiquement selon le RH, les quotas et le nombre de jours.</p>
              </div>
            </div>
            <div className="production-form-grid production-form-grid-2">
              <label><span>Prix de vente / enfant</span><input type="number" step="0.01" value={selectedPlan.pricePerChild ?? 0} onChange={(event) => updatePlan({ pricePerChild: amount(event.target.value) })} /></label>
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
              <p>1. Construis le budget ici, avec toutes les semaines du séjour. 2. Choisis le prix dans l'onglet Rentabilité. 3. Publie. 4. Termine les textes, photos, âges et gares dans “Séjours en vente”.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
