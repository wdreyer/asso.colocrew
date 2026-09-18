import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const documentId = "colocrew-2026";
const planId = "production-ski-music-winter-2027";
const quoteTotals = [5100.62, 4067.22];
const accommodationAverage = round(quoteTotals.reduce((sum, value) => sum + value, 0) / quoteTotals.length);

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

const plan = {
  id: planId,
  name: "Ski & Music - Hiver 2027",
  linkedStayId: "",
  stayCode: "SKIMUSIC27",
  location: "Domaine de Gravières, Lanobre",
  color: "#2563eb",
  ageGroups: ["11-13 ans", "14-17 ans"],
  pricePerChild: 0,
  childCount: 32,
  maxChildren: 32,
  extraRevenue: 0,
  sessions: [
    { startDate: "2027-02-21", endDate: "2027-02-27" },
    { startDate: "2027-02-28", endDate: "2027-03-06" },
  ],
  days: 7,
  nights: 6,
  mealPlan: "autogestion",
  mealsPerDay: 4,
  mealCostPerPerson: 3.5,
  directorCount: 1,
  animatorCount: 5,
  animatorStaffingMode: "manual",
  animatorRatio: 8,
  directorNetDay: 90,
  animatorNetDay: 60,
  staffCostMultiplier: 1.35,
  notes: [
    "Données issues des devis DEV00000093 et DEV00000094.",
    "Chaque session prévoit 32 enfants et 6 accompagnateurs (1 direction + 5 animateurs).",
    `Hébergement moyen par session : (${formatMoney(quoteTotals[0])} + ${formatMoney(quoteTotals[1])}) / 2 = ${formatMoney(accommodationAverage)}.`,
    "Hypothèse nourriture modifiable : 4 repas par jour à 3,50 € par personne.",
    "Prix de vente par enfant à définir.",
  ].join("\n"),
  expenses: [
    { key: "accommodation", label: "Hébergement - moyenne des deux devis", category: "Hébergement", unit: "fixed", quantity: 1, unitAmount: accommodationAverage },
    { label: "Transport ski", category: "Transport", unit: "fixed", quantity: 1, unitAmount: 1200 },
    { label: "Matériel ski", category: "Ski", unit: "perPerson", quantity: 1, unitAmount: 45 },
    { label: "Forfaits ski", category: "Ski", unit: "perPerson", quantity: 1, unitAmount: 77 },
    { label: "Pédagogie et petit matériel", category: "Péda et autre", unit: "perPerson", quantity: 1, unitAmount: 30 },
    { label: "Assurance", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 400 },
    { label: "Communication", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 500 },
    { label: "Frais animateurs", category: "RH", unit: "perStaff", quantity: 1, unitAmount: 200 },
    { label: "Frais divers", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 1000 },
  ],
};

const existingIndex = currentPlans.findIndex((item) => item.id === planId);
const nextPlans = existingIndex >= 0
  ? currentPlans.map((item, index) => (index === existingIndex ? plan : item))
  : [...currentPlans, plan];
const nextProduction = {
  ...currentProduction,
  selectedPlanId: planId,
  plans: nextPlans,
};

const staffCount = plan.directorCount + plan.animatorCount;
const people = plan.childCount + staffCount;
const skiCosts = 1200 + (45 * people) + (77 * people);

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  action: existingIndex >= 0 ? "update" : "create",
  plan: {
    id: plan.id,
    name: plan.name,
    sessions: plan.sessions,
    childrenPerSession: plan.childCount,
    staffPerSession: staffCount,
    peoplePerSession: people,
    accommodationAverage,
    skiCostsPerSession: skiCosts,
    pricePerChild: plan.pricePerChild,
  },
  plansBefore: currentPlans.length,
  plansAfter: nextPlans.length,
}, null, 2));

if (shouldApply) {
  await setDoc(reportRef, {
    production: nextProduction,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log("Ski & Music - Hiver 2027 enregistré dans le module Production.");
} else {
  console.log("Aucune écriture effectuée. Relancer avec --apply pour enregistrer.");
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

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}
