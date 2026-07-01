// restructure-s2-aller.mjs
// Réorganise les 2 convois S2 ALLER (Nord + Sud/Ouest) autour du nouveau plan :
// tout le monde converge à Bordeaux, puis un autocar partagé (devis LCB Tourisme)
// fait Bordeaux -> Vieux Boucau (MCSC) -> Bidarray (EVCC).
// Ne touche pas au retour (pris en charge par l'utilisateur) ni à la S1.
//
// Dry-run par défaut. --apply pour écrire.

import fs from "node:fs";
import crypto from "node:crypto";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });
const db = getFirestore(app);

const NORD_ID = "UrYWvoqOWbzNcv53DyCS";
const SUDOUEST_ID = "2induumArFBxjVCTLaw0";

const rSnap = await getDocs(collection(db, "reservations"));
const byId = new Map(rSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
function camp(resId) {
  const name = byId.get(resId)?.sejour?.name || "";
  if (name.includes("surf") || name.includes("MCSC")) return "MCSC";
  if (name.includes("eaux") || name.includes("EVCC")) return "EVCC";
  return "?";
}
function dropoffFor(c) {
  return c === "MCSC" ? "Vieux Boucau" : c === "EVCC" ? "Bidarray" : "";
}

function blankSegment(from, to, extra = {}) {
  return {
    id: crypto.randomUUID(),
    from, to,
    mode: "Autre", stopType: "rdv",
    number: "", platform: "", meetingPoint: "",
    departureTime: "", arrivalTime: "", meetingTime: "",
    instructions: "",
    ...extra,
  };
}

function blankTicket(extra) {
  return {
    id: crypto.randomUUID(),
    purchased: false,
    price: 0, seats: 0,
    missingReservationIds: [], coveredReservationIds: [],
    storagePath: "", url: "", sourceFile: "",
    uploadedAt: new Date().toISOString(),
    replacedAt: "",
    trainType: "", trainNumber: "",
    notes: "",
    ...extra,
  };
}

// ── Convoi Nord ──────────────────────────────────────────────────────────
const nordSnap = await getDoc(doc(db, "transports", NORD_ID));
const nord = nordSnap.data();
const nordLilleParis = nord.segments[0]; // inchangé
const nordParisBordeaux = { ...nord.segments[1], departureTime: "16:39", arrivalTime: "20:06" };
const nordBdxVB = blankSegment("Bordeaux", "Vieux Boucau", { departureTime: "20:00", instructions: "Départ Gare St Jean Bordeaux Côté Belcier — Autocar LCB Tourisme (devis 12373)" });
const nordVBBidarray = blankSegment("Vieux Boucau", "Bidarray");
const nordSegments = [nordLilleParis, nordParisBordeaux, nordBdxVB, nordVBBidarray];

const nordTickets = [
  blankTicket({
    from: "Paris", to: "Bordeaux", coverageFrom: "Paris", coverageTo: "Bordeaux",
    segmentId: nordParisBordeaux.id, segmentLabel: "Paris Montparnasse > Bordeaux Saint-Jean",
    departureTime: "16:39", arrivalTime: "20:06", seats: 30,
    bookingReference: "R3LMIPU7", name: "TGV - Paris Montparnasse > Bordeaux Saint-Jean (30 places)",
    notes: "Préréservation SNCF Connect, paiement dû avant le 10/07/2026.",
  }),
  blankTicket({
    from: "Bordeaux", to: "Bidarray", coverageFrom: "Bordeaux", coverageTo: "Bidarray",
    segmentId: nordBdxVB.id, segmentLabel: "Bordeaux Gare St Jean > Vieux Boucau > Bidarray",
    departureTime: "20:00", arrivalTime: "23:00", seats: 50, price: 1840,
    bookingReference: "Devis LCB Tourisme n°12373", name: "Autocar LCB Tourisme (partagé avec Convoi Sud/Ouest)",
    trainType: "Autocar",
    notes: "Devis 1840€ TTC pour l'ensemble du groupe (Nord+Sud/Ouest, 20 à 50 pers). Valable jusqu'au 10/07. Coût compté sur ce convoi uniquement (voir Convoi Sud/Ouest pour la répartition passagers).",
  }),
];

const nordPassengers = (nord.passengers || []).map((p) => {
  const c = camp(p.reservationId);
  return { ...p, camp: c, dropoffCity: dropoffFor(c) };
});

// ── Convoi Sud / Ouest ───────────────────────────────────────────────────
const sudouestSnap = await getDoc(doc(db, "transports", SUDOUEST_ID));
const sudouest = sudouestSnap.data();
const soLyonToulouse = blankSegment("Lyon", "Toulouse", { departureTime: "12:10", arrivalTime: "16:20", meetingPoint: sudouest.segments[0]?.meetingPoint || "" });
const soToulouseBordeaux = blankSegment("Toulouse", "Bordeaux", { departureTime: "17:09", arrivalTime: "19:40" });
const soBdxVB = blankSegment("Bordeaux", "Vieux Boucau", { departureTime: "20:00", instructions: "Départ Gare St Jean Bordeaux Côté Belcier — Autocar LCB Tourisme (devis 12373), partagé avec Convoi Nord" });
const soVBBidarray = blankSegment("Vieux Boucau", "Bidarray");
const sudouestSegments = [soLyonToulouse, soToulouseBordeaux, soBdxVB, soVBBidarray];

const sudouestTickets = [
  blankTicket({
    from: "Lyon", to: "Toulouse", coverageFrom: "Lyon", coverageTo: "Toulouse",
    segmentId: soLyonToulouse.id, segmentLabel: "Lyon Part Dieu > Toulouse Matabiau",
    departureTime: "12:10", arrivalTime: "16:20", seats: 11,
    bookingReference: "R2UY2IDH", name: "TGV - Lyon Part Dieu > Toulouse Matabiau (11 places)",
    notes: "Préréservation SNCF Connect, paiement dû avant le 10/07/2026.",
  }),
  blankTicket({
    from: "Toulouse", to: "Bordeaux", coverageFrom: "Toulouse", coverageTo: "Bordeaux",
    segmentId: soToulouseBordeaux.id, segmentLabel: "Toulouse Matabiau > Bordeaux Saint-Jean",
    departureTime: "17:09", arrivalTime: "19:40", seats: 11,
    bookingReference: "R54SQ5L8", name: "TGV - Toulouse Matabiau > Bordeaux Saint-Jean (11 places)",
    notes: "Préréservation SNCF Connect, paiement dû avant le 10/07/2026.",
  }),
  blankTicket({
    from: "Bordeaux", to: "Bidarray", coverageFrom: "Bordeaux", coverageTo: "Bidarray",
    segmentId: soBdxVB.id, segmentLabel: "Bordeaux Gare St Jean > Vieux Boucau > Bidarray",
    departureTime: "20:00", arrivalTime: "23:00", seats: 50, price: 0,
    bookingReference: "Devis LCB Tourisme n°12373", name: "Autocar LCB Tourisme (même autocar que Convoi Nord — coût déjà compté sur Convoi Nord)",
    trainType: "Autocar",
    notes: "Autocar partagé avec le Convoi Nord (1840€ TTC déjà comptabilisés sur ce convoi-là). Ne pas compter deux fois.",
  }),
];

const sudouestPassengers = (sudouest.passengers || []).map((p) => {
  const c = camp(p.reservationId);
  return { ...p, camp: c, dropoffCity: dropoffFor(c) };
});

// ── Récap ────────────────────────────────────────────────────────────────
console.log(`\n${shouldApply ? "APPLY" : "DRY-RUN"} — restructuration S2 aller\n`);
console.log("Convoi Nord :", nordSegments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("  tickets:", nordTickets.map((t) => `${t.bookingReference} (${t.seats} places)`).join(", "));
console.log("  passagers:", nordPassengers.length, "| MCSC:", nordPassengers.filter((p) => p.camp === "MCSC").length, "| EVCC:", nordPassengers.filter((p) => p.camp === "EVCC").length);
console.log("\nConvoi Sud/Ouest :", sudouestSegments.map((s) => `${s.from}->${s.to}`).join(" | "));
console.log("  tickets:", sudouestTickets.map((t) => `${t.bookingReference} (${t.seats} places)`).join(", "));
console.log("  passagers:", sudouestPassengers.length, "| MCSC:", sudouestPassengers.filter((p) => p.camp === "MCSC").length, "| EVCC:", sudouestPassengers.filter((p) => p.camp === "EVCC").length);

if (shouldApply) {
  await updateDoc(doc(db, "transports", NORD_ID), { segments: nordSegments, tickets: nordTickets, passengers: nordPassengers });
  await updateDoc(doc(db, "transports", SUDOUEST_ID), { segments: sudouestSegments, tickets: sudouestTickets, passengers: sudouestPassengers });
  console.log("\n✅ Terminé.");
} else {
  console.log("\n▶ Relance avec --apply pour écrire.");
}
process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
