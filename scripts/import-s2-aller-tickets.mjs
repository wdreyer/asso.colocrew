// import-s2-aller-tickets.mjs
// Enregistre les billets réels achetés pour le convoi ALLER du 20 juillet 2026 (S2) :
// Lille->Paris, Nantes->Paris (embranchement), Paris->Bordeaux, Lyon->Toulouse,
// Marseille->Toulouse (embranchement, 3 billets individuels).
// Met aussi à jour les villes étapes (Valence + Montpellier) sur les legs Lyon<->Toulouse,
// aller et retour, où des enfants montent/descendent en cours de route.
//
// Dry-run par défaut : node scripts/import-s2-aller-tickets.mjs
// Écriture réelle    : node scripts/import-s2-aller-tickets.mjs --apply

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const LYON_MARSEILLE_ALLER = "2induumArFBxjVCTLaw0";
const LILLE_NANTES_ALLER   = "UrYWvoqOWbzNcv53DyCS";
const LYON_MARSEILLE_RETOUR = "E032d8KCH3OVHdgy5bA5";

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

async function loadTransport(id) {
  const snap = await getDoc(doc(db, "transports", id));
  if (!snap.exists()) throw new Error(`Transport introuvable: ${id}`);
  return { id, ...snap.data() };
}

const lyonMarseilleAller = await loadTransport(LYON_MARSEILLE_ALLER);
const lilleNantesAller   = await loadTransport(LILLE_NANTES_ALLER);
const lyonMarseilleRetour = await loadTransport(LYON_MARSEILLE_RETOUR);

// ── 1) Lyon/Marseille ALLER ─────────────────────────────────────────────────

const lyonToulouseSegId = "1c9c0466-3faf-48d3-b118-0ec8a94c8ef8";
const marseilleBranchId = "s2-aller-marseille-toulouse";

const lyonMarseilleAllerSegments = lyonMarseilleAller.segments.map((seg) =>
  seg.id === lyonToulouseSegId
    ? {
        ...seg,
        stops: [
          {
            id: "s2-aller-lyon-toulouse-stop-valence",
            city: "Valence",
            stopType: "quai",
            meetingPoint: "",
            arrivalTime: "",
            departureTime: "",
            sharedPickupChildren: 1,
            instructions: "Montée d'un enfant à Valence.",
          },
          {
            id: "s2-aller-lyon-toulouse-stop-montpellier",
            city: "Montpellier",
            stopType: "quai",
            meetingPoint: "",
            arrivalTime: "",
            departureTime: "",
            sharedPickupChildren: 2,
            instructions: "Montée de 2 enfants à Montpellier.",
          },
        ],
      }
    : seg
);

const lyonMarseilleAllerTickets = lyonMarseilleAller.tickets.map((ticket) => {
  if (ticket.segmentId === lyonToulouseSegId) {
    return {
      ...ticket,
      purchased: true,
      price: 660,
      seats: 12,
      bookingReference: "1MDUXW",
      name: "TGV inOui - Lyon Part Dieu > Toulouse Matabiau (12 places)",
      notes: "Billet acheté (SNCF Connect). 6 Jeunes, 6 Enfants. Réservation 1MDUXW.",
    };
  }
  return ticket;
});
lyonMarseilleAllerTickets.push({
  id: "s2-aller-marseille-ticket",
  segmentId: marseilleBranchId,
  name: "INTERCITÉS 4760 - Marseille Saint-Charles > Toulouse Matabiau (3 places)",
  seats: 3,
  price: 189,
  departureTime: "11:22",
  arrivalTime: "15:15",
  bookingReference: "Y4TMFX",
  purchased: true,
  from: "Marseille",
  to: "Toulouse",
  trainNumber: "4760",
  trainType: "Intercités",
  notes: "Billets individuels, Voiture 5 : Place 44 Mila Ballester (70€, e-billet 703589881), Place 45 Ludmila Benghine Van Stpidonk (70€, e-billet 391558353), Place 43 Louis Richard — animateur accompagnateur (49€, e-billet 443143654).",
  url: "",
});

// ── 2) Lille/Nantes ALLER ────────────────────────────────────────────────────

const lilleParisSegId = "7acea846-4387-4b5c-a44a-252a3d726231";
const parisBordeauxSegId = "3218d8dd-4be3-4ce8-be85-6b07ce80797a";
const nantesBranchId = "s2-aller-nantes-paris";

const lilleNantesAllerSegments = lilleNantesAller.segments.map((seg) => {
  if (seg.id === lilleParisSegId) {
    return { ...seg, departureTime: "13:02", arrivalTime: "14:32" };
  }
  return seg;
});

const lilleNantesAllerBranches = lilleNantesAller.branches.map((branch) => {
  if (branch.id === nantesBranchId) {
    return { ...branch, departureTime: "12:09", arrivalTime: "14:10" };
  }
  return branch;
});

const lilleNantesAllerTickets = lilleNantesAller.tickets.map((ticket) => {
  if (ticket.segmentId === parisBordeauxSegId) {
    return {
      ...ticket,
      purchased: true,
      seats: 43,
      bookingReference: "R94MZA_DREYER_TTP2FU",
      name: "SNCF Voyages en Groupe - Paris Gare Montparnasse > Bordeaux Saint-Jean (43 places)",
      notes: "Réservation de groupe confirmée le 02/07/2026. Prix non communiqué dans l'e-mail de confirmation — vérifier facture.",
    };
  }
  return ticket;
});
lilleNantesAllerTickets.push(
  {
    id: "s2-aller-lille-paris-ticket",
    segmentId: lilleParisSegId,
    name: "TGV inOui - Lille Europe > Paris Gare du Nord (10 places)",
    seats: 10,
    price: 234.50,
    departureTime: "13:02",
    arrivalTime: "14:32",
    bookingReference: "9LZJXR",
    purchased: true,
    from: "Lille",
    to: "Paris",
    trainType: "TGV inOui",
    notes: "Billet acheté. 1 Adulte, 5 Jeunes, 4 Enfants.",
    url: "",
  },
  {
    id: "s2-aller-nantes-paris-ticket",
    segmentId: nantesBranchId,
    name: "SNCF Voyages en Groupe - Nantes > Paris Gare Montparnasse (10 places)",
    seats: 10,
    price: 0,
    departureTime: "12:09",
    arrivalTime: "14:10",
    bookingReference: "R943Q9_DREYER_R5FDV6",
    purchased: true,
    from: "Nantes",
    to: "Paris",
    trainType: "TGV",
    notes: "Réservation de groupe confirmée le 02/07/2026. Prix non communiqué dans l'e-mail de confirmation — vérifier facture.",
    url: "",
  },
);

// ── 3) Lyon/Marseille RETOUR — ajoute Montpellier à côté de Valence ──────────

const lyonMarseilleRetourBranches = lyonMarseilleRetour.branches.map((branch) => {
  if (branch.id === "s2-retour-toulouse-lyon") {
    const hasMontpellier = (branch.stops || []).some((s) => s.city === "Montpellier");
    if (hasMontpellier) return branch;
    return {
      ...branch,
      stops: [
        {
          id: "s2-retour-lyon-branch-stop-montpellier",
          city: "Montpellier",
          stopType: "quai",
          meetingPoint: "",
          arrivalTime: "",
          departureTime: "",
          sharedDropoffChildren: 2,
          instructions: "Descente de 2 enfants à Montpellier.",
        },
        ...(branch.stops || []),
      ],
    };
  }
  return branch;
});

// ── Résumé ────────────────────────────────────────────────────────────────────

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} — billets & étapes ALLER S2 (20 juillet)\n`);

console.log("Lyon/Marseille ALLER :");
console.log("  Lyon->Toulouse stops:", lyonMarseilleAllerSegments.find((s) => s.id === lyonToulouseSegId).stops.map((s) => `${s.city}(+${s.sharedPickupChildren})`).join(", "));
console.log("  Tickets:", lyonMarseilleAllerTickets.map((t) => `${t.name} — ${t.price}€ — ${t.purchased ? "acheté" : "à acheter"}`).join("\n    "));

console.log("\nLille/Nantes ALLER :");
console.log("  Tickets:", lilleNantesAllerTickets.map((t) => `${t.name} — ${t.price}€ — ${t.purchased ? "acheté" : "à acheter"}`).join("\n    "));

console.log("\nLyon/Marseille RETOUR :");
console.log("  Toulouse->Lyon branch stops:", lyonMarseilleRetourBranches.find((b) => b.id === "s2-retour-toulouse-lyon").stops.map((s) => s.city).join(", "));

const totalPrice = [...lyonMarseilleAllerTickets, ...lilleNantesAllerTickets].reduce((s, t) => s + Number(t.price || 0), 0);
console.log(`\nTotal billets ALLER S2 enregistrés : ${totalPrice.toFixed(2)}€ (hors autocar partagé déjà en base, hors 2 réservations sans prix communiqué)`);

if (!shouldApply) {
  console.log("\nDry-run uniquement — relancez avec --apply pour appliquer.");
  process.exit(0);
}

await updateDoc(doc(db, "transports", LYON_MARSEILLE_ALLER), {
  segments: lyonMarseilleAllerSegments,
  tickets: lyonMarseilleAllerTickets,
});
await updateDoc(doc(db, "transports", LILLE_NANTES_ALLER), {
  segments: lilleNantesAllerSegments,
  branches: lilleNantesAllerBranches,
  tickets: lilleNantesAllerTickets,
});
await updateDoc(doc(db, "transports", LYON_MARSEILLE_RETOUR), {
  branches: lyonMarseilleRetourBranches,
});

console.log("\nMise à jour Firebase terminée.");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const separator = value.indexOf("=");
    if (separator < 0) continue;
    const key = value.slice(0, separator).trim();
    const envValue = value.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = envValue;
  }
}
