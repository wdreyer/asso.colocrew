// Vérifie les billets manquants pour MCSC S1
// node scripts/check-billets.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId: "colocrew-5edf9",
  authDomain: "colocrew-5edf9.firebaseapp.com",
  storageBucket: "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId: "1:74332244617:web:1947fe469b0ca4a103d458",
};

const PDF_CITIES = {
  Paris: 10, Nantes: 3, Lyon: 3, Bordeaux: 3,
  Valence: 1, Toulouse: 1, Rouen: 1, Montpellier: 1, "Sur Place": 3,
};

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const tSnap = await getDocs(collection(db, "transports"));
  const s1Transports = tSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.week === "S1");
  console.log(`\n📦  ${s1Transports.length} transports S1\n`);

  for (const t of s1Transports) {
    const dir = t.direction === "aller" ? "↑ ALLER" : "↓ RETOUR";
    const tickets = t.tickets || [];
    const passengers = t.passengers || [];
    const totalSeats = tickets.reduce((s, tk) => s + (tk.seats || 0), 0);
    const coveredIds = new Set(tickets.flatMap(tk => tk.coveredReservationIds || []));
    const uncovered = passengers.filter(p => p.reservationId && !coveredIds.has(p.reservationId));

    console.log(`${"─".repeat(70)}`);
    console.log(`${dir}  "${t.sejourName}"  [${t.date || ""}]`);
    console.log(`  Route : ${t.departureCity || "?"}→${t.arrivalCity || "?"}`);
    console.log(`  Passagers : ${passengers.length}  |  Billets : ${tickets.length} (${totalSeats} places total)`);

    // Segments + branches
    if ((t.segments || []).length) {
      const stops = [t.segments[0].from, ...t.segments.map(s => s.to)];
      console.log(`  Segments : ${stops.join(" → ")}`);
    }
    if ((t.branches || []).length) {
      for (const b of t.branches) {
        console.log(`  Branche  : ${b.from || "?"} → ${b.joinsAt || b.to || "?"}`);
      }
    }

    console.log(`\n  BILLETS :`);
    if (!tickets.length) {
      console.log(`    ⚠️  AUCUN BILLET`);
    } else {
      for (const tk of tickets) {
        const usedCount = (tk.coveredReservationIds || []).length;
        const label = [tk.label, tk.trainType, tk.trainNumber].filter(Boolean).join(" ") || "Billet";
        const seg = tk.segment || "";
        const status = usedCount >= (tk.seats || 0) ? "🔴 COMPLET" : usedCount > 0 ? "🟡" : "⚪";
        console.log(`    ${status}  ${label.padEnd(35)} ${usedCount}/${tk.seats || "?"} places${seg ? `  [${seg}]` : ""}`);
      }
    }

    if (uncovered.length) {
      console.log(`\n  ❌  ${uncovered.length} passager(s) SANS BILLET :`);
      for (const p of uncovered) {
        const city = p.departureCity || "?";
        console.log(`      - ${(p.nom || "?").padEnd(25)} enfant: ${p.childName || "?"}  ville: ${city}`);
      }
    } else if (passengers.length > 0) {
      console.log(`\n  ✅  Tous les passagers ont un billet`);
    }
    console.log();
  }

  // Villes dans transports aller
  const allerTransports = s1Transports.filter(t => t.direction === "aller");
  const citiesInTransport = new Set();
  for (const t of allerTransports) {
    const addCity = (c) => { if (c) citiesInTransport.add(c.trim()); };
    addCity(t.departureCity);
    for (const seg of t.segments || []) { addCity(seg.from); addCity(seg.to); }
    for (const b of t.branches || []) { addCity(b.from); addCity(b.to); addCity(b.joinsAt); }
    for (const p of t.passengers || []) { addCity(p.departureCity || p.city); }
  }

  console.log(`${"═".repeat(70)}`);
  console.log("VILLES COUVERTES par les transports S1 aller :");
  console.log("  " + [...citiesInTransport].filter(Boolean).sort().join(", "));

  const missing = Object.keys(PDF_CITIES).filter(c =>
    c !== "Sur Place" && ![...citiesInTransport].some(tc => norm(tc).includes(norm(c)))
  );
  if (missing.length) {
    console.log(`\n🆕  NOUVELLES VILLES À GÉRER (dans PDF, absentes des transports) :`);
    for (const c of missing) console.log(`    - ${c} : ${PDF_CITIES[c]} inscrit${PDF_CITIES[c] > 1 ? "s" : ""}`);
  } else {
    console.log(`\n✅  Toutes les villes du PDF sont couvertes`);
  }
  console.log(`${"═".repeat(70)}\n`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
