import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, terminate } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const documentId = "colocrew-2026";
const passionPlanId = "production-ski-camp-passion-winter-2027";
const evasionPlanId = "production-ski-camp-evasion-winter-2027";

const plansToUpsert = [buildPassionPlan(), buildEvasionPlan()];
const expectedTotals = new Map([
  [passionPlanId, { revenue: 36000, expenses: 28758.75, margin: 7241.25 }],
  [evasionPlanId, { revenue: 29700, expenses: 30109.20, margin: -409.20 }],
]);

const verification = plansToUpsert.map((plan) => verifyPlan(plan, expectedTotals.get(plan.id)));

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const reportRef = doc(db, "accounting_reports", documentId);
const snapshot = await getDoc(reportRef);
const currentProduction = snapshot.data()?.production || {};
const currentPlans = Array.isArray(currentProduction.plans) ? currentProduction.plans : [];
const targetIds = new Set(plansToUpsert.map((plan) => plan.id));
const existingIds = new Set(currentPlans.map((plan) => plan.id));
const preservedPlans = currentPlans.filter((plan) => !targetIds.has(plan.id));
const nextPlans = [...preservedPlans, ...plansToUpsert];
const nextProduction = {
  ...currentProduction,
  selectedPlanId: passionPlanId,
  plans: nextPlans,
};

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  plansBefore: currentPlans.length,
  plansAfter: nextPlans.length,
  preservedPlans: preservedPlans.length,
  plans: plansToUpsert.map((plan, index) => ({
    action: existingIds.has(plan.id) ? "update" : "create",
    id: plan.id,
    code: plan.stayCode,
    name: plan.name,
    sessions: plan.sessions,
    verification: verification[index],
  })),
}, null, 2));

if (shouldApply) {
  await setDoc(reportRef, {
    production: nextProduction,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log("Les séjours Ski Camp Passion et Ski Camp Évasion 2027 sont enregistrés dans le module Production.");
} else {
  console.log("Aucune écriture effectuée. Relancer avec --apply pour enregistrer.");
}

await terminate(db);

function buildPassionPlan() {
  return {
    id: passionPlanId,
    name: "Ski Camp Passion - Hiver 2027",
    linkedStayId: "",
    stayCode: "SKIPASSION27",
    location: "Centre de vacances L'Avenière, Les Contamines-Montjoie",
    color: "#b8336a",
    ageGroups: ["11-13 ans", "14-17 ans"],
    pricePerChild: 1200,
    childCount: 30,
    maxChildren: 30,
    extraRevenue: 0,
    sessions: [
      { startDate: "2027-02-13", endDate: "2027-02-19" },
    ],
    days: 7,
    nights: 6,
    mealPlan: "full",
    mealsPerDay: 4,
    mealCostPerPerson: 0,
    directorCount: 1,
    animatorCount: 5,
    animatorStaffingMode: "manual",
    animatorRatio: 8,
    directorNetDay: 80,
    animatorNetDay: 55,
    staffCostMultiplier: 1.35,
    notes: [
      "Données issues du modèle financier Contamines 2027 et de la plaquette des séjours de février 2027.",
      "Programme de base : 5 sorties ski. L'option de 5 cours ESF de 2 h à 150 € reste hors recette de base.",
      "Suppléments de convoyage indiqués dans la plaquette : Paris +200 €, Lyon ou Marseille +150 €, Grenoble +80 €, Bordeaux +250 €.",
      "30 enfants et 6 adultes : 1 direction et 5 animateurs.",
    ].join("\n"),
    expenses: [
      { key: "accommodation", label: "Hébergement et pension complète", category: "Hébergement", unit: "perPersonNight", quantity: 1, unitAmount: 55 },
      { key: "tourist-tax", label: "Taxe de séjour", category: "Hébergement", unit: "perStaffNight", quantity: 1, unitAmount: 0.80 },
      { key: "extra-food", label: "Nourriture supplémentaire", category: "Nourriture", unit: "perPerson", quantity: 1, unitAmount: 10 },
      { key: "pedagogy", label: "Pédagogie et petit matériel", category: "Pédagogie", unit: "perChild", quantity: 1, unitAmount: 10 },
      { key: "pharmacy", label: "Pharmacie", category: "Santé", unit: "perChild", quantity: 1, unitAmount: 5 },
      { key: "insurance", label: "Assurance", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 400 },
      { key: "communication", label: "Communication", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "miscellaneous", label: "Frais divers", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "staff-expenses", label: "Frais d'équipe", category: "RH", unit: "perStaff", quantity: 1, unitAmount: 125 },
      { key: "ski-equipment", label: "Location du matériel de ski - 5 sorties", category: "Ski", unit: "perPerson", quantity: 5, unitAmount: 18 },
      { key: "ski-pass", label: "Forfait ski", category: "Ski", unit: "perPerson", quantity: 1, unitAmount: 198.20 },
      { key: "local-transport", label: "Transport local", category: "Transport", unit: "perPerson", quantity: 1, unitAmount: 10 },
      { key: "outbound-transfer", label: "Transfert Le Fayet → Les Contamines", category: "Transport", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "return-transfer", label: "Transfert Les Contamines → Le Fayet", category: "Transport", unit: "fixed", quantity: 1, unitAmount: 200 },
    ],
  };
}

function buildEvasionPlan() {
  return {
    id: evasionPlanId,
    name: "Ski Camp Évasion - Hiver 2027",
    linkedStayId: "",
    stayCode: "SKIEVASION27",
    location: "Centre de vacances Le Kaly, Saint-Michel-de-Chaillol",
    color: "#2563eb",
    ageGroups: ["6-10 ans", "11-13 ans", "14-17 ans"],
    pricePerChild: 990,
    childCount: 30,
    maxChildren: 30,
    extraRevenue: 0,
    sessions: [
      { startDate: "2027-02-13", endDate: "2027-02-20" },
      { startDate: "2027-02-20", endDate: "2027-02-27" },
    ],
    days: 8,
    nights: 7,
    mealPlan: "full",
    mealsPerDay: 4,
    mealCostPerPerson: 0,
    directorCount: 1,
    animatorCount: 5,
    animatorStaffingMode: "manual",
    animatorRatio: 8,
    directorNetDay: 80,
    animatorNetDay: 55,
    staffCostMultiplier: 1.35,
    notes: [
      "Données issues du modèle financier Saint-Michel-de-Chaillol 2027 et de la plaquette des séjours de février 2027.",
      "Programme de base : 4 sorties ski, dont 1 cours encadré par l'ESF. Le matériel est inclus dans l'hébergement.",
      "Suppléments de convoyage indiqués dans la plaquette : Paris +200 €, Lyon ou Marseille +150 €, Grenoble +80 €, Bordeaux +250 €.",
      "30 enfants et 6 adultes par session : 1 direction et 5 animateurs.",
      "Le 20 février est à la fois la fin de S1 et le début de S2, conformément à la plaquette.",
    ].join("\n"),
    expenses: [
      { key: "accommodation", label: "Hébergement, pension complète et matériel de ski", category: "Hébergement", unit: "perPerson", quantity: 1, unitAmount: 445 },
      { key: "extra-food", label: "Nourriture supplémentaire", category: "Nourriture", unit: "perPerson", quantity: 1, unitAmount: 10 },
      { key: "pedagogy", label: "Pédagogie et petit matériel", category: "Pédagogie", unit: "perChild", quantity: 1, unitAmount: 10 },
      { key: "pharmacy", label: "Pharmacie", category: "Santé", unit: "perChild", quantity: 1, unitAmount: 5 },
      { key: "insurance", label: "Assurance", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 400 },
      { key: "communication", label: "Communication", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "miscellaneous", label: "Frais divers", category: "Frais généraux", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "staff-expenses", label: "Frais d'équipe", category: "RH", unit: "perStaff", quantity: 1, unitAmount: 125 },
      { key: "ski-pass", label: "Forfait ski", category: "Ski", unit: "perPerson", quantity: 1, unitAmount: 198.20 },
      { key: "local-transport", label: "Transport local", category: "Transport", unit: "perPerson", quantity: 1, unitAmount: 10 },
      { key: "outbound-transfer", label: "Transfert gare → centre", category: "Transport", unit: "fixed", quantity: 1, unitAmount: 200 },
      { key: "return-transfer", label: "Centre → gare", category: "Transport", unit: "fixed", quantity: 1, unitAmount: 200 },
    ],
  };
}

function verifyPlan(plan, expected) {
  const children = Number(plan.childCount || 0);
  const staffCount = Number(plan.directorCount || 0) + Number(plan.animatorCount || 0);
  const people = children + staffCount;
  const operationalLines = plan.expenses.map((line) => ({
    label: line.label,
    total: expenseTotal(line, { children, staffCount, people, days: plan.days, nights: plan.nights }),
  }));
  const operationalExpenses = round(operationalLines.reduce((sum, line) => sum + line.total, 0));
  const staffExpenses = round((
    (plan.directorCount * plan.directorNetDay * plan.days)
    + (plan.animatorCount * plan.animatorNetDay * plan.days)
  ) * plan.staffCostMultiplier);
  const revenue = round(plan.pricePerChild * children + plan.extraRevenue);
  const expenses = round(operationalExpenses + staffExpenses);
  const margin = round(revenue - expenses);

  assertMoney(`${plan.name} - recettes`, revenue, expected.revenue);
  assertMoney(`${plan.name} - dépenses`, expenses, expected.expenses);
  assertMoney(`${plan.name} - marge`, margin, expected.margin);

  return {
    children,
    staffCount,
    people,
    days: plan.days,
    nights: plan.nights,
    revenue,
    operationalExpenses,
    staffExpenses,
    expenses,
    margin,
    totalSessions: plan.sessions.length,
    totalRevenue: round(revenue * plan.sessions.length),
    totalExpenses: round(expenses * plan.sessions.length),
    totalMargin: round(margin * plan.sessions.length),
    lines: operationalLines,
  };
}

function expenseTotal(line, context) {
  const quantity = Number(line.quantity || 1);
  const multiplier = {
    fixed: 1,
    manual: quantity,
    perChild: context.children * quantity,
    perStaff: context.staffCount * quantity,
    perPerson: context.people * quantity,
    perDay: context.days * quantity,
    perNight: context.nights * quantity,
    perChildDay: context.children * context.days * quantity,
    perPersonDay: context.people * context.days * quantity,
    perPersonNight: context.people * context.nights * quantity,
    perStaffNight: context.staffCount * context.nights * quantity,
  }[line.unit] ?? 1;
  return round(Number(line.unitAmount || 0) * multiplier);
}

function assertMoney(label, actual, expected) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label} : ${actual} € calculés au lieu de ${expected} € attendus.`);
  }
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
