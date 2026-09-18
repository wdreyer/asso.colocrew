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
    quote: "6851",
    startDate: "2027-07-23",
    endDate: "2027-08-02",
    children: 40,
    paidAdults: 3,
    freeAdults: 2,
    accommodation: 24940,
    surf: 6625,
    quoteTotal: 31565,
  },
  {
    quote: "6852",
    startDate: "2027-08-04",
    endDate: "2027-08-14",
    children: 38,
    paidAdults: 4,
    freeAdults: 1,
    accommodation: 24360,
    surf: 6625,
    quoteTotal: 30985,
  },
  {
    quote: "6853",
    startDate: "2027-08-16",
    endDate: "2027-08-26",
    children: 35,
    paidAdults: 4,
    freeAdults: 1,
    accommodation: 22620,
    surf: 6625,
    quoteTotal: 29245,
  },
];

const mergedPlanId = "production-cap-ocean-surf-2027";
const legacyPlanIds = new Set([
  "production-cap-ocean-surf-s1-2027",
  "production-cap-ocean-surf-s2-2027",
  "production-cap-ocean-surf-s3-2027",
]);
const planToUpsert = buildPlan(quoteData);
const db = getFirestore(app);
const reportRef = doc(db, "accounting_reports", documentId);
const snapshot = await getDoc(reportRef);
const currentProduction = snapshot.data()?.production || {};
const currentPlans = Array.isArray(currentProduction.plans) ? currentProduction.plans : [];
const targetIds = new Set([...legacyPlanIds, mergedPlanId]);
const preservedPlans = currentPlans.filter((plan) => !targetIds.has(plan.id));
const existingIds = new Set(currentPlans.map((plan) => plan.id));
const nextPlans = [...preservedPlans, planToUpsert];
const nextProduction = {
  ...currentProduction,
  selectedPlanId: planToUpsert.id,
  plans: nextPlans,
};

const summary = {
  action: existingIds.has(mergedPlanId) ? "update" : ([...legacyPlanIds].some((id) => existingIds.has(id)) ? "merge" : "create"),
  id: planToUpsert.id,
  name: planToUpsert.name,
  sessions: planToUpsert.sessions.map((session, index) => ({
    label: `S${index + 1}`,
    dates: `${session.startDate} -> ${session.endDate}`,
    children: session.childCount,
    quote: session.sourceQuote,
    accommodationAndFullBoard: session.expenseOverrides.accommodation,
  })),
};

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  plansBefore: currentPlans.length,
  plansAfter: nextPlans.length,
  plan: summary,
}, null, 2));

if (shouldApply) {
  await setDoc(reportRef, {
    production: nextProduction,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log("Le plan Cap Océan Surf 2027 et ses trois sessions sont enregistrés dans le module Production.");
} else {
  console.log("Aucune écriture effectuée. Relancer avec --apply pour enregistrer.");
}

function buildPlan(sources) {
  const first = sources[0];
  const staff = first.paidAdults + first.freeAdults;
  return {
    id: mergedPlanId,
    name: "Cap Océan Surf - Été 2027",
    linkedStayId: "",
    stayCode: "CAPOCEAN27",
    location: "Cap Océan, Seignosse",
    color: "#0f766e",
    ageGroups: [],
    pricePerChild: 0,
    childCount: first.children,
    maxChildren: Math.max(...sources.map((source) => source.children)),
    extraRevenue: 0,
    sessions: sources.map((source) => ({
      startDate: source.startDate,
      endDate: source.endDate,
      childCount: source.children,
      expenseOverrides: { accommodation: source.accommodation },
      sourceQuote: source.quote,
    })),
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
      "Données issues des devis Cap Océan n° 6851, 6852 et 6853.",
      ...sources.map((source, index) => (
        `S${index + 1} : ${source.children} enfants, ${staff} adultes, hébergement et pension complète ${formatMoney(source.accommodation)}, surf ${formatMoney(source.surf)}, total du devis ${formatMoney(source.quoteTotal)}.`
      )),
      "Prix de vente par enfant à définir.",
    ].join("\n"),
    expenses: [
      { key: "accommodation", label: "Hébergement et pension complète", category: "Hébergement", unit: "fixed", quantity: 1, unitAmount: first.accommodation },
      { key: "surf-package", label: "Surf - 5 séances par enfant", category: "Activités", unit: "fixed", quantity: 1, unitAmount: first.surf },
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
