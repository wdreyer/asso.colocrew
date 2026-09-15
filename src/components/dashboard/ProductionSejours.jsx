"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const ACCOUNTING_DOC_ID = "colocrew-2026";

const STAY_LABELS = {
  "my-creative-surf-camp": "MCSC",
  "eaux-vives-creative-camp": "EVCC",
};

const WEEK_LABELS = {
  "2026-07-06": "S1",
  "2026-07-20": "S2",
  "2026-08-03": "S3",
  "2026-08-17": "S4",
};

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

const PRODUCTION_WEEK_OPTIONS = ["Toutes", "S1", "S2", "S3", "S4"];

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
  mode: "simulation",
  linkedStayId: "",
  stayCode: "EVCC",
  week: "Toutes",
  pricePerChild: 1027.2,
  childCount: 30,
  extraRevenue: 0,
  startDate: "2026-08-17",
  endDate: "2026-08-28",
  days: 12,
  nights: 11,
  mealPlan: "full",
  halfBoardRatio: 0.62,
  directorCount: 1,
  animatorCount: 4,
  directorNetDay: 90,
  animatorNetDay: 60,
  staffCostMultiplier: 1.3,
  useActualStaffCosts: true,
  notes: "Modèle de base repris depuis le fichier O vives : 30 enfants, 4 anims, 1 DS, 12 jours / 11 nuits.",
  expenses: DEFAULT_PRODUCTION_EXPENSES,
};

const DEFAULT_PRODUCTION = {
  selectedPlanId: DEFAULT_PRODUCTION_PLAN.id,
  plans: [DEFAULT_PRODUCTION_PLAN],
};

const PRODUCTION_TABS = [
  { key: "hr", label: "RH" },
  { key: "assumptions", label: "Prix & dates" },
  { key: "expenses", label: "Tableau dépenses" },
  { key: "summary", label: "Synthèse" },
  { key: "publish", label: "Créer la fiche" },
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

function canonicalStayName(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized === "mycreativesurfcamp" ? "my-creative-surf-camp" : value;
}

function mapFinance(snapshot) {
  const data = snapshot.data() || {};
  const finance = data.finance || {};
  const children = Array.isArray(data.minor?.children) ? data.minor.children : [];
  const declaredChildren = Number(data.minor?.numberOfChildren);
  const childCount = children.length || (Number.isFinite(declaredChildren) && declaredChildren > 0 ? declaredChildren : 1);
  const startDate = String(data.sejour?.startDate || "").slice(0, 10);
  return {
    id: snapshot.id,
    status: data.status || "",
    validationSource: data.validationSource || "",
    childCount,
    stay: STAY_LABELS[canonicalStayName(data.sejour?.name)] || canonicalStayName(data.sejour?.name) || "Non renseigné",
    week: WEEK_LABELS[startDate] || startDate || "Non renseignée",
    stayAmount: amount(finance.stayAmount),
    grossAmount: amount(finance.grossAmount),
    hasFinance: Boolean(data.finance),
  };
}

function productionStayCodeFrom(value) {
  const raw = typeof value === "object" && value !== null
    ? `${value.name || ""} ${value.id || ""} ${value.slug || ""}`
    : String(value || "");
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("eaux") || normalized.includes("evcc") || normalized.includes("vives")) return "EVCC";
  if (normalized.includes("surf") || normalized.includes("mcsc") || normalized.includes("creative")) return "MCSC";
  return String(raw || "Séjour").trim().slice(0, 18) || "Séjour";
}

function productionStayPrice(stay) {
  const datePrices = Array.isArray(stay?.dates)
    ? stay.dates.map((date) => amount(date.basePrice || date.price)).filter((price) => price > 0)
    : [];
  const candidates = [stay?.basePrice, stay?.priceMin, stay?.priceMax, ...datePrices].map(amount).filter((price) => price > 0);
  if (!candidates.length) return 0;
  return Math.round((candidates.reduce((sum, price) => sum + price, 0) / candidates.length) * 100) / 100;
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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || `sejour-${Date.now()}`;
}

function productionStayDuration(stay) {
  const firstDate = Array.isArray(stay?.dates) ? stay.dates.find((date) => date?.startDate && date?.endDate) : null;
  const days = daysBetween(firstDate?.startDate, firstDate?.endDate);
  return {
    startDate: firstDate?.startDate ? String(firstDate.startDate).slice(0, 10) : "",
    endDate: firstDate?.endDate ? String(firstDate.endDate).slice(0, 10) : "",
    days: days || amount(stay?.days) || DEFAULT_PRODUCTION_PLAN.days,
    nights: days > 1 ? days - 1 : amount(stay?.nights) || DEFAULT_PRODUCTION_PLAN.nights,
  };
}

function productionDurationFromDates(plan) {
  const datedDays = daysBetween(plan?.startDate, plan?.endDate);
  if (datedDays > 0) {
    return { days: datedDays, nights: Math.max(datedDays - 1, 0) };
  }
  return {
    days: Math.max(amount(plan?.days), 0),
    nights: Math.max(amount(plan?.nights), 0),
  };
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
  const duration = productionDurationFromDates(merged);
  return {
    ...merged,
    id: String(plan?.id || base.id),
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
    .replace(/[\u0300-\u036f]/g, "")
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
  const duration = productionDurationFromDates(plan);
  const people = children + amount(staffCount);
  const unitLabel = PRODUCTION_UNITS.find((unit) => unit.key === line.unit)?.label || "Forfait";
  const base = {
    fixed: `${unitAmount}`,
    manual: `${quantity} × ${unitAmount}`,
    perChild: `${children} enfants × ${quantity} × ${unitAmount}`,
    perStaff: `${amount(staffCount)} staff × ${quantity} × ${unitAmount}`,
    perPerson: `${people} personnes × ${quantity} × ${unitAmount}`,
    perDay: `${duration.days} jours × ${quantity} × ${unitAmount}`,
    perNight: `${duration.nights} nuits × ${quantity} × ${unitAmount}`,
    perChildDay: `${children} enfants × ${duration.days} jours × ${quantity} × ${unitAmount}`,
    perPersonDay: `${people} personnes × ${duration.days} jours × ${quantity} × ${unitAmount}`,
  }[line.unit] || `${unitLabel} · ${unitAmount}`;
  if (isFoodLine(line) && plan.mealPlan === "half") {
    return `${base} × demi-pension ${amount(plan.halfBoardRatio || 0.62).toFixed(2)}`;
  }
  return base;
}

function summarizeProductionByCategory(expenses) {
  const groups = new Map();
  expenses.forEach((line) => {
    const key = line.category || "Autre";
    groups.set(key, amount(groups.get(key)) + amount(line.total));
  });
  return [...groups.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
}

function computeProduction(planInput, context = {}) {
  const plan = normalizeProductionPlan(planInput);
  const staffCount = amount(plan.directorCount) + amount(plan.animatorCount);
  const simulatedStaffCost = Math.round((
    (amount(plan.directorCount) * amount(plan.directorNetDay) * amount(plan.days))
    + (amount(plan.animatorCount) * amount(plan.animatorNetDay) * amount(plan.days))
  ) * amount(plan.staffCostMultiplier || 1) * 100) / 100;
  const actualStaffCost = amount(context.actualStaffCost);
  const rhCost = plan.useActualStaffCosts && actualStaffCost > 0 ? actualStaffCost : simulatedStaffCost;
  const revenue = Math.round(((amount(plan.pricePerChild) * amount(plan.childCount)) + amount(plan.extraRevenue)) * 100) / 100;
  const expenseRows = plan.expenses.map((line) => ({
    ...line,
    total: productionExpenseTotal(line, plan, staffCount),
    formula: productionExpenseFormula(line, plan, staffCount),
    mealAdjusted: isFoodLine(line) && plan.mealPlan === "half",
  }));
  const operationalExpenses = expenseRows.reduce((sum, line) => sum + amount(line.total), 0);
  const totalExpenses = Math.round((operationalExpenses + rhCost) * 100) / 100;
  const margin = Math.round((revenue - totalExpenses) * 100) / 100;
  const marginRate = revenue > 0 ? (margin / revenue) * 100 : 0;
  const breakEvenPrice = amount(plan.childCount) > 0 ? totalExpenses / amount(plan.childCount) : 0;
  return {
    plan,
    staffCount,
    simulatedStaffCost,
    actualStaffCost,
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

function productionContextFor(planInput, rows, staffContracts) {
  const plan = normalizeProductionPlan(planInput);
  const stayCode = String(plan.stayCode || "").toUpperCase();
  const week = String(plan.week || "Toutes");
  const salesRows = rows.filter((row) => (
    String(row.stay || "").toUpperCase() === stayCode
    && (week === "Toutes" || String(row.week || "") === week)
  ));
  const contractRows = staffContracts.filter((contract) => (
    String(contract.stayCode || contract.stay || "").toUpperCase() === stayCode
    && (week === "Toutes" || String(contract.week || "") === week)
  ));
  return {
    soldChildren: salesRows.reduce((sum, row) => sum + amount(row.childCount), 0),
    soldStayRevenue: salesRows.reduce((sum, row) => sum + amount(row.stayAmount), 0),
    soldGrossRevenue: salesRows.reduce((sum, row) => sum + amount(row.grossAmount), 0),
    actualStaffCost: contractRows.reduce((sum, contract) => sum + amount(contract.grossSalary), 0),
    actualStaffNet: contractRows.reduce((sum, contract) => sum + amount(contract.netSalary), 0),
    actualStaffCount: new Set(contractRows.map((contract) => contract.memberId || contract.memberName || contract.id)).size,
    contractRows,
  };
}

export default function ProductionSejours() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [staffContracts, setStaffContracts] = useState([]);
  const [onlineStays, setOnlineStays] = useState([]);
  const [production, setProduction] = useState(() => deepClone(DEFAULT_PRODUCTION));
  const [status, setStatus] = useState("");
  const [creatingStay, setCreatingStay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assumptions");

  useEffect(() => {
    async function load() {
      try {
        const [reservationsSnapshot, contractsSnapshot, onlineStaysSnapshot, accountingSnapshot] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
          getDocs(collection(db, COLLECTIONS.SEJOURS)),
          getDoc(doc(db, COLLECTIONS.ACCOUNTING_REPORTS, ACCOUNTING_DOC_ID)),
        ]);
        setRows(reservationsSnapshot.docs.map(mapFinance).filter((row) =>
          row.hasFinance
          && row.status === "validated"
          && row.validationSource === "ete26_validated_workbook",
        ));
        setStaffContracts(contractsSnapshot.docs.map((contract) => ({ id: contract.id, ...contract.data() })));
        setOnlineStays(onlineStaysSnapshot.docs.map((stay) => ({ id: stay.id, ...stay.data() })).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "fr")));
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
  const context = productionContextFor(selectedPlan, rows, staffContracts);
  const computed = computeProduction(selectedPlan, context);
  const linkedStay = onlineStays.find((stay) => stay.id === selectedPlan.linkedStayId);
  const simulatedDirectorNet = amount(selectedPlan.directorCount) * amount(selectedPlan.directorNetDay) * amount(selectedPlan.days);
  const simulatedAnimatorNet = amount(selectedPlan.animatorCount) * amount(selectedPlan.animatorNetDay) * amount(selectedPlan.days);
  const simulatedNet = simulatedDirectorNet + simulatedAnimatorNet;
  const simulatedCharges = Math.max(computed.simulatedStaffCost - simulatedNet, 0);
  const targetMarginRate = amount(computed.revenue) > 0 ? computed.marginRate : 0;
  const recommendedPrice = amount(selectedPlan.childCount) > 0
    ? Math.ceil(((computed.totalExpenses * 1.12) / amount(selectedPlan.childCount)) * 100) / 100
    : 0;

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
        mode: "simulation",
      }),
    ], id);
  };

  const duplicatePlan = () => {
    const id = `production-${Date.now()}`;
    writePlans([...plans, normalizeProductionPlan({ ...selectedPlan, id, name: `${selectedPlan.name || "Simulation"} - copie` })], id);
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

  const applyOnlineStay = (stayId) => {
    if (!stayId) {
      updatePlan({ linkedStayId: "", mode: "simulation" });
      return;
    }
    const stay = onlineStays.find((item) => item.id === stayId);
    if (!stay) return;
    const duration = productionStayDuration(stay);
    const price = productionStayPrice(stay);
    updatePlan({
      mode: "linked",
      linkedStayId: stay.id,
      name: stay.name || selectedPlan.name,
      stayCode: productionStayCodeFrom(stay),
      pricePerChild: price || selectedPlan.pricePerChild,
      days: duration.days,
      nights: duration.nights,
      startDate: duration.startDate || selectedPlan.startDate || "",
      endDate: duration.endDate || selectedPlan.endDate || "",
    });
  };

  const useActualSales = () => {
    updatePlan({
      childCount: context.soldChildren || selectedPlan.childCount,
      pricePerChild: context.soldChildren > 0 && context.soldStayRevenue > 0
        ? Math.round((context.soldStayRevenue / context.soldChildren) * 100) / 100
        : selectedPlan.pricePerChild,
    });
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

  const createStayFromProduction = async () => {
    setCreatingStay(true);
    setStatus("Création de la fiche séjour...");
    try {
      const baseName = selectedPlan.name || "Nouveau séjour";
      const payload = {
        name: baseName,
        slug: productionStaySlug(baseName),
        heroSubtitle: `${selectedPlan.days || 0} jours · ${selectedPlan.stayCode || "Séjour"} · prix construit en production`,
        heroImage: "",
        environment: selectedPlan.stayCode || "",
        basePrice: amount(selectedPlan.pricePerChild),
        priceMin: amount(selectedPlan.pricePerChild),
        priceMax: amount(selectedPlan.pricePerChild),
        ageGroups: [],
        dates: [{
          startDate: toIsoDate(selectedPlan.startDate),
          endDate: toIsoDate(selectedPlan.endDate),
          basePrice: amount(selectedPlan.pricePerChild),
        }],
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, COLLECTIONS.SEJOURS), payload);
      updatePlan({ linkedStayId: ref.id, mode: "linked" });
      setStatus("Fiche séjour créée depuis la production.");
      router.push(`/dashboard/sejours/${ref.id}`);
    } catch (error) {
      setStatus(`Création impossible : ${error?.message || "erreur inconnue"}`);
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
          <p>Construis un séjour avant sa mise en vente : dates, prix, RH, dépenses, marge, puis création de la fiche publique.</p>
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
            const planContext = productionContextFor(plan, rows, staffContracts);
            const planComputed = computeProduction(plan, planContext);
            return (
              <button
                type="button"
                key={plan.id}
                className={plan.id === selectedPlan.id ? "is-active" : ""}
                onClick={() => setProduction((previous) => ({ ...previous, selectedPlanId: plan.id }))}
              >
                <strong>{plan.name}</strong>
                <span>{plan.stayCode || "Test"} · {plan.week || "Toutes"} · {currency(planComputed.margin)}</span>
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

          <section className={activeTab === "assumptions" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Prix, dates et capacité</h3>
                <p>Commence ici pour fixer le prix de vente. Le rattachement à un séjour existant sert seulement à reprendre ses ventes/RH déjà connues.</p>
              </div>
              <div className="accounting-actions">
                <button type="button" className="dash-btn dash-btn-secondary" onClick={duplicatePlan}>Dupliquer</button>
                <button type="button" className="dash-btn dash-btn-secondary" onClick={removePlan} disabled={plans.length <= 1}>Supprimer</button>
              </div>
            </div>
            <div className="production-form-grid">
              <label><span>Nom de la simulation</span><input value={selectedPlan.name || ""} onChange={(event) => updatePlan({ name: event.target.value })} /></label>
              <label>
                <span>Reprendre un séjour déjà en vente</span>
                <select value={selectedPlan.linkedStayId || ""} onChange={(event) => applyOnlineStay(event.target.value)}>
                  <option value="">Aucun, construction depuis zéro</option>
                  {onlineStays.map((stay) => <option key={stay.id} value={stay.id}>{stay.name || stay.id}</option>)}
                </select>
              </label>
              <label><span>Code séjour</span><input value={selectedPlan.stayCode || ""} onChange={(event) => updatePlan({ stayCode: event.target.value })} /></label>
              <label>
                <span>Semaine</span>
                <select value={selectedPlan.week || "Toutes"} onChange={(event) => updatePlan({ week: event.target.value })}>
                  {PRODUCTION_WEEK_OPTIONS.map((week) => <option key={week} value={week}>{week}</option>)}
                </select>
              </label>
              <label><span>Prix de vente / enfant</span><input type="number" step="0.01" value={selectedPlan.pricePerChild ?? 0} onChange={(event) => updatePlan({ pricePerChild: amount(event.target.value) })} /></label>
              <label><span>Nombre d'enfants</span><input type="number" step="1" value={selectedPlan.childCount ?? 0} onChange={(event) => updatePlan({ childCount: amount(event.target.value) })} /></label>
              <label><span>Recettes complémentaires</span><input type="number" step="0.01" value={selectedPlan.extraRevenue ?? 0} onChange={(event) => updatePlan({ extraRevenue: amount(event.target.value) })} /></label>
              <label><span>Premier jour</span><input type="date" value={selectedPlan.startDate || ""} onChange={(event) => updatePlan({ startDate: event.target.value })} /></label>
              <label><span>Dernier jour</span><input type="date" value={selectedPlan.endDate || ""} onChange={(event) => updatePlan({ endDate: event.target.value })} /></label>
              <label><span>Durée calculée</span><input readOnly value={`${selectedPlan.days || 0} jour${selectedPlan.days > 1 ? "s" : ""} · ${selectedPlan.nights || 0} nuit${selectedPlan.nights > 1 ? "s" : ""}`} /></label>
              <label>
                <span>Restauration</span>
                <select value={selectedPlan.mealPlan || "full"} onChange={(event) => updatePlan({ mealPlan: event.target.value })}>
                  <option value="full">Pension complète</option>
                  <option value="half">Demi-pension</option>
                </select>
              </label>
              <label><span>Ratio demi-pension</span><input type="number" step="0.01" value={selectedPlan.halfBoardRatio ?? 0.62} onChange={(event) => updatePlan({ halfBoardRatio: amount(event.target.value) })} /></label>
            </div>
            <div className="production-linked-strip">
              <div><span>Source des données réelles</span><strong>{linkedStay?.name || "Aucune, simulation libre"}</strong></div>
              <div><span>Enfants vendus</span><strong>{context.soldChildren}</strong></div>
              <div><span>CA séjour vendu</span><strong>{currency(context.soldStayRevenue)}</strong></div>
              <div><span>Contrats RH trouvés</span><strong>{context.actualStaffCount}</strong></div>
              <button type="button" className="dash-btn dash-btn-secondary" onClick={useActualSales} disabled={!context.soldChildren}>
                Reprendre les ventes réelles
              </button>
            </div>
          </section>

          <section className="production-kpis">
            <div><span>Recettes prévues</span><strong>{currency(computed.revenue)}</strong></div>
            <div><span>Dépenses hors RH</span><strong>{currency(computed.operationalExpenses)}</strong></div>
            <div><span>Coût RH</span><strong>{currency(computed.rhCost)}</strong></div>
            <div><span>Marge</span><strong className={computed.margin >= 0 ? "finance-paid" : "finance-due"}>{currency(computed.margin)}</strong></div>
            <div><span>Taux de marge</span><strong>{computed.marginRate.toFixed(1)} %</strong></div>
            <div><span>Prix d'équilibre</span><strong>{currency(computed.breakEvenPrice)}</strong></div>
            <div><span>Prix conseillé 12 %</span><strong>{currency(recommendedPrice)}</strong></div>
          </section>

          <section className={activeTab === "hr" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>RH détaillée</h3>
                <p>Compare le budget RH simulé avec les contrats déjà enregistrés pour ce code séjour et cette semaine.</p>
              </div>
              <label className="production-checkbox">
                <input type="checkbox" checked={selectedPlan.useActualStaffCosts !== false} onChange={(event) => updatePlan({ useActualStaffCosts: event.target.checked })} />
                <span>Reprendre les salaires RH enregistrés</span>
              </label>
            </div>
            <div className="production-form-grid">
              <label><span>Nombre DS</span><input type="number" step="1" value={selectedPlan.directorCount ?? 0} onChange={(event) => updatePlan({ directorCount: amount(event.target.value) })} /></label>
              <label><span>Salaire DS net / jour</span><input type="number" step="0.01" value={selectedPlan.directorNetDay ?? 0} onChange={(event) => updatePlan({ directorNetDay: amount(event.target.value) })} /></label>
              <label><span>Nombre anims</span><input type="number" step="1" value={selectedPlan.animatorCount ?? 0} onChange={(event) => updatePlan({ animatorCount: amount(event.target.value) })} /></label>
              <label><span>Salaire anim net / jour</span><input type="number" step="0.01" value={selectedPlan.animatorNetDay ?? 0} onChange={(event) => updatePlan({ animatorNetDay: amount(event.target.value) })} /></label>
              <label><span>Coefficient chargé</span><input type="number" step="0.01" value={selectedPlan.staffCostMultiplier ?? 1} onChange={(event) => updatePlan({ staffCostMultiplier: amount(event.target.value) })} /></label>
            </div>
            <div className="production-rh-detail-grid">
              <div>
                <h4>Simulation RH</h4>
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
                      <td>{amount(selectedPlan.animatorCount)} anims × {selectedPlan.days} j × {currency(selectedPlan.animatorNetDay)}</td>
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
              <div>
                <h4>Contrats RH trouvés</h4>
                <table className="production-mini-table">
                  <thead>
                    <tr><th>Nom</th><th>Rôle</th><th>Net</th><th>Brut/chargé</th></tr>
                  </thead>
                  <tbody>
                    {context.contractRows.length ? context.contractRows.map((contract) => (
                      <tr key={contract.id}>
                        <td>{contract.memberName || contract.name || "Contrat RH"}</td>
                        <td>{contract.role || contract.roleLabel || contract.position || "-"}</td>
                        <td>{currency(contract.netSalary)}</td>
                        <td>{currency(contract.grossSalary)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="4">Aucun contrat ne correspond encore à {selectedPlan.stayCode || "ce séjour"} {selectedPlan.week || ""}.</td></tr>
                    )}
                    <tr className="total">
                      <td>Total contrats</td>
                      <td>{context.actualStaffCount} personne(s)</td>
                      <td>{currency(context.actualStaffNet)}</td>
                      <td>{currency(context.actualStaffCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="production-rh-summary">
              <div><span>RH simulée chargée</span><strong>{currency(computed.simulatedStaffCost)}</strong></div>
              <div><span>Charges simulées</span><strong>{currency(simulatedCharges)}</strong></div>
              <div><span>RH réelle brute</span><strong>{currency(context.actualStaffCost)}</strong></div>
              <div><span>RH réelle nette</span><strong>{currency(context.actualStaffNet)}</strong></div>
              <div><span>RH retenue</span><strong>{currency(computed.rhCost)}</strong></div>
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
                      <td><input className="production-text-input" value={line.category || ""} placeholder="Catégorie" onChange={(event) => updateExpense(index, { category: event.target.value })} /></td>
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
                <p>Lecture rapide pour voir ce qui pèse vraiment dans la marge du séjour.</p>
              </div>
              <strong>{currency(computed.totalExpenses)}</strong>
            </div>
            <div className="production-category-grid">
              {computed.categories.map((category) => (
                <div key={category.label}>
                  <span>{category.label}</span>
                  <strong>{currency(category.total)}</strong>
                </div>
              ))}
            </div>
            <label className="production-notes">
              <span>Notes de production</span>
              <textarea value={selectedPlan.notes || ""} onChange={(event) => updatePlan({ notes: event.target.value })} />
            </label>
          </section>

          <section className={activeTab === "publish" ? "production-card" : "production-card production-tab-hidden"}>
            <div className="production-card-head">
              <div>
                <h3>Créer la fiche séjour</h3>
                <p>Quand le prix et le budget sont cohérents, crée une fiche dans “Séjours en vente” avec les dates, le prix et un instantané de production.</p>
              </div>
              <button type="button" className="dash-btn" onClick={createStayFromProduction} disabled={creatingStay}>
                {creatingStay ? "Création..." : "Créer le séjour en vente"}
              </button>
            </div>
            <div className="production-publish-grid">
              <div>
                <span>Nom créé</span>
                <strong>{selectedPlan.name || "Nouveau séjour"}</strong>
              </div>
              <div>
                <span>Dates</span>
                <strong>{selectedPlan.startDate || "-"} → {selectedPlan.endDate || "-"}</strong>
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
              <div>
                <span>Prix conseillé 12 %</span>
                <strong>{currency(recommendedPrice)}</strong>
                <button type="button" className="dash-btn dash-btn-secondary" onClick={() => updatePlan({ pricePerChild: recommendedPrice })} disabled={!recommendedPrice}>
                  Utiliser ce prix
                </button>
              </div>
            </div>
            <div className="production-publish-note">
              <strong>Flux recommandé</strong>
              <p>1. Construis le budget ici. 2. Ajuste le prix jusqu'à obtenir la marge voulue. 3. Crée la fiche séjour. 4. Termine les textes, photos, âges et gares dans “Séjours en vente”.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
