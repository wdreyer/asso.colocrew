import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const documentId = "colocrew-2026";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const quoteData = [
  {
    id: "production-cap-ocean-surf-s1-2027",
    name: "Cap Océan Surf - S1 2027",
    stayCode: "CAPOCEAN27-S1",
    quote: "6851",
    startDate: "2027-07-23",
    endDate: "2027-08-02",
    children: 40,
    paidAdults: 3,
    freeAdults: 2,
    accommodation: 24940,
    surf: 6625,
    quoteTotal: 31565,
    color: "#0f766e",
  },
  {
    id: "production-cap-ocean-surf-s2-2027",
    name: "Cap Océan Surf - S2 2027",
    stayCode: "CAPOCEAN27-S2",
    quote: "6852",
    startDate: "2027-08-04",
    endDate: "2027-08-14",
    children: 38,
    paidAdults: 4,
    freeAdults: 1,
    accommodation: 24360,
    surf: 6625,
    quoteTotal: 30985,
    color: "#0369a1",
  },
  {
    id: "production-cap-ocean-surf-s3-2027",
    name: "Cap Océan Surf - S3 2027",
    stayCode: "CAPOCEAN27-S3",
    quote: "6853",
    startDate: "2027-08-16",
    endDate: "2027-08-26",
    children: 35,
    paidAdults: 4,
    freeAdults: 1,
    accommodation: 22620,
    surf: 6625,
    quoteTotal: 29245,
    color: "#1d4ed8",
  },
];

const plansToUpsert = quoteData.map(buildPlan);
const db = getFirestore(app);
const reportRef = doc(db, "accounting_reports", documentId);
const snapshot = await getDoc(reportRef);
const currentProduction = snapshot.data()?.production || {};
const currentPlans = Array.isArray(currentProduction.plans) ? currentProduction.plans : [];
const targetIds = new Set(plansToUpsert.map((plan) => plan.id));
const preservedPlans = currentPlans.filter((plan) => !targetIds.has(plan.id));
const existingIds = new Set(currentPlans.map((plan) => plan.id));
const nextPlans = [...preservedPlans, ...plansToUpsert];
const nextProduction = {
  ...currentProduction,
  selectedPlanId: plansToUpsert[0].id,
  plans: nextPlans,
};

const summary = plansToUpsert.map((plan) => {
  const staff = plan.directorCount + plan.animatorCount;
  const people = plan.childCount + staff;
  const quoteExpenses = plan.expenses
    .filter((expense) => ["accommodation", "surf-package"].includes(expense.key))
    .reduce((sum, expense) => sum + expense.unitAmount, 0);
  return {
    action: existingIds.has(plan.id) ? "update" : "create",
    id: plan.id,
    name: plan.name,
    dates: plan.sessions[0],
    children: plan.childCount,
    staff,
    people,
    accommodationAndFullBoard: plan.expenses.find((expense) => expense.key === "accommodation")?.unitAmount,
    surfPackage: plan.expenses.find((expense) => expense.key === "surf-package")?.unitAmount,
    quoteExpenses,
  };
});

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  plansBefore: currentPlans.length,
  plansAfter: nextPlans.length,
  plans: summary,
}, null, 2));

if (shouldApply) {
  await setDoc(reportRef, {
    production: nextProduction,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log("Les trois plans Cap Océan Surf 2027 sont enregistrés dans le module Production.");
} else {
  console.log("Aucune écriture effectuée. Relancer avec --apply pour enregistrer.");
}

function buildPlan(source) {
  const staff = source.paidAdults + source.freeAdults;
  return {
    id: source.id,
    name: source.name,
    linkedStayId: "",
    stayCode: source.stayCode,
    location: "Cap Océan, Seignosse",
    color: source.color,
    ageGroups: [],
    pricePerChild: 0,
    childCount: source.children,
    maxChildren: source.children,
    extraRevenue: 0,
    sessions: [{ startDate: source.startDate, endDate: source.endDate }],
    days: 11,
    nights: 10,
    mealPlan: "full",
    mealsPerDay: 4,
    mealCostPerPerson: 0,
    directorCount: 1,
    animatorCount: Math.max(staff - 1, 0),
    animatorStaffingMode: "manual",
    animatorRatio: 8,
    directorNetDay: 90,
    animatorNetDay: 60,
    staffCostMultiplier: 1.35,
    notes: [
      `Données issues du devis Cap Océan n° ${source.quote}.`,
      `${source.children} enfants et ${staff} adultes, dont ${source.freeAdults} adulte${source.freeAdults > 1 ? "s" : ""} gratuit${source.freeAdults > 1 ? "s" : ""}.`,
      `Le poste hébergement comprend la pension complète : ${formatMoney(source.accommodation)}.`,
      `Le forfait surf comprend 5 séances par enfant : ${formatMoney(source.surf)}.`,
      `Total du devis : ${formatMoney(source.quoteTotal)}.`,
      "Prix de vente par enfant à définir.",
    ].join("\n"),
    expenses: [
      { key: "accommodation", label: "Hébergement et pension complète", category: "Hébergement", unit: "fixed", quantity: 1, unitAmount: source.accommodation },
      { key: "surf-package", label: "Surf - 5 séances par enfant", category: "Activités", unit: "fixed", quantity: 1, unitAmount: source.surf },
      { label: "Pédagogie et petit matériel", category: "Péda et autre", unit: "perPerson", quantity: 1, unitAmount: 30 },
      { label: "Assurance", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 400 },
      { label: "Communication", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 500 },
      { label: "Frais animateurs", category: "RH", unit: "perStaff", quantity: 1, unitAmount: 200 },
      { label: "Frais divers", category: "Péda et autre", unit: "fixed", quantity: 1, unitAmount: 1000 },
    ],
  };
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

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}
