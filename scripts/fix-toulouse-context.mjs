import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";

loadEnv(".env.local");
const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const ids = {
  s1Aller: "GXvhfCTPBcKdnIFHHZIe",
  s1Retour: "mqhiRrp6KjvJZF8FQhsO",
  s2Aller: "2induumArFBxjVCTLaw0",
  s2Retour: "E032d8KCH3OVHdgy5bA5",
};
const refs = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, doc(db, "transports", id)]));
const snapshots = Object.fromEntries(await Promise.all(Object.entries(refs).map(async ([key, ref]) => [key, await getDoc(ref)])));
for (const [key, snapshot] of Object.entries(snapshots)) if (!snapshot.exists()) throw new Error(`Trajet introuvable: ${key}`);

const QUAI_POINT = "Rendez-vous sur le quai — l’animateur·ice vous contactera";
const TOULOUSE_RDV = "Gare de Toulouse-Matabiau — espace d’attente Hall 1";
const patches = {};

for (const key of ["s1Aller", "s1Retour"]) {
  const data = snapshots[key].data();
  const segments = patchStops(data.segments || [], (portion, stop) => normalized(stop.city) === "toulouse"
    ? {
        ...stop,
        meetingPoint: QUAI_POINT,
        stopType: "quai",
        instructions: key === "s1Aller"
          ? "Montée à Toulouse : la voie et la voiture seront communiquées par l’animateur·ice."
          : "Descente à Toulouse : l’animateur·ice contacte la famille à l’approche.",
      }
    : stop);
  patches[key] = { segments, branches: data.branches || [] };
}

{
  const data = snapshots.s2Aller.data();
  const segments = (data.segments || []).map((portion) => normalized(portion.from) === "toulouse" && normalized(portion.to) === "bordeaux"
    ? { ...portion, meetingPoint: TOULOUSE_RDV, meetingTime: "16:10", stopType: "rdv" }
    : { ...portion, stops: (portion.stops || []).filter((stop) => normalized(stop.city) !== "montpellier") });
  const branches = (data.branches || []).map((portion) => {
    const isMarseille = normalized(portion.from) === "marseille" && normalized(portion.to) === "toulouse";
    const stops = (portion.stops || []).filter((stop) => normalized(stop.city) !== "montpellier");
    if (!isMarseille) return { ...portion, stops };
    return { ...portion, stops: [...stops, {
      id: "s2-aller-4760-montpellier",
      city: "Montpellier",
      meetingPoint: QUAI_POINT,
      meetingTime: "12:15",
      arrivalTime: "13:03",
      departureTime: "13:03",
      platform: "",
      stopType: "quai",
      instructions: "Montée de 2 enfants à Montpellier. La voie et la voiture seront communiquées par l’animateur·ice.",
    }] };
  });
  patches.s2Aller = { segments, branches };
}

{
  const data = snapshots.s2Retour.data();
  const segments = (data.segments || []).map((portion) => ({
    ...portion,
    stops: (portion.stops || []).filter((stop) => normalized(stop.city) !== "montpellier"),
  }));
  const branches = (data.branches || []).map((portion) => {
    const base = normalized(portion.from) === "toulouse"
      ? { ...portion, meetingPoint: TOULOUSE_RDV, stopType: "rdv" }
      : portion;
    const stops = (base.stops || []).filter((stop) => normalized(stop.city) !== "montpellier");
    const isMarseille = normalized(base.from) === "toulouse" && normalized(base.to) === "marseille";
    if (!isMarseille) return { ...base, stops };
    return { ...base, stops: [...stops, {
      id: "s2-retour-4665-montpellier",
      city: "Montpellier",
      meetingPoint: QUAI_POINT,
      meetingTime: "",
      arrivalTime: "20:54",
      departureTime: "20:57",
      platform: "",
      stopType: "quai",
      instructions: "Descente de 2 enfants à Montpellier. L’animateur·ice contacte les familles à l’approche.",
    }] };
  });
  patches.s2Retour = { segments, branches };
}

const batch = writeBatch(db);
for (const [key, patch] of Object.entries(patches)) batch.update(refs[key], { ...patch, updatedAt: serverTimestamp() });
await batch.commit();
await setDoc(doc(db, "transport_rdv_points", "toulouse"), {
  city: "Toulouse",
  meetingPoint: TOULOUSE_RDV,
  stopType: "rdv",
  updatedAt: serverTimestamp(),
}, { merge: true });
console.log("Toulouse contextualisé : S1 quai, S2 RDV Hall 1.");
console.log("Montpellier vérifié uniquement sur la branche Marseille, aller et retour S2.");

function patchStops(portions, patcher) {
  return portions.map((portion) => ({ ...portion, stops: (portion.stops || []).map((stop) => patcher(portion, stop)) }));
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
