// DRY RUN — MCSC S1 — 23 inscrits — ne modifie RIEN
// node scripts/dry-run-import.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const firebaseConfig = {
  apiKey:            "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId:         "colocrew-5edf9",
  authDomain:        "colocrew-5edf9.firebaseapp.com",
  storageBucket:     "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId:             "1:74332244617:web:1947fe469b0ca4a103d458",
};

const WEEK_DATES = {
  S1: { startDate: "2026-07-06", endDate: "2026-07-19" },
};

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s\-']+/g, " ");
}
function normCity(s) { return norm(s).replace(/\s/g, ""); }
function toNum(v) {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/\s/g,"").replace(",","."));
  return isNaN(n) ? null : n;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const row = {};
    splitLine(line).forEach((v, i) => { row[(headers[i]||"").trim()] = v.trim(); });
    return row;
  });
}
function splitLine(line) {
  const r = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { r.push(cur); cur = ""; continue; }
    cur += ch;
  }
  r.push(cur); return r;
}

function matchScore(row, fsDoc) {
  const legal  = fsDoc.legal  || {};
  const minor  = fsDoc.minor  || {};
  const child  = (minor.children||[])[0] || fsDoc.child || {};
  const sejour = fsDoc.sejour || {};
  const trans  = fsDoc.transport || {};

  let score = 0; const hits = [];

  // Référence
  const csvRef = norm(row["n dossier"] || "");
  const fsRef  = norm(fsDoc.numeroDeReservation || "");
  if (csvRef && fsRef && csvRef === fsRef) { score += 100; hits.push(`ref:${fsRef}`); }

  // Noms enfant
  const cF = norm(row["prenom enfant"]);
  const cL = norm(row["nom enfant"]);
  const fF = norm(child.firstName || child.prenom || "");
  const fL = norm(child.lastName  || child.nom   || "");
  if (cF && fF && cF === fF) { score += 20; hits.push(`prénom:${cF}`); }
  if (cL && fL && cL === fL) { score += 20; hits.push(`nom:${cL}`); }

  // Email
  const cE = norm(row["mail"]);
  const fE = norm(legal.email || fsDoc.email || "");
  if (cE && fE && cE === fE) { score += 30; hits.push(`email:${cE}`); }

  // Séjour MCSC
  const fsSejourName = norm(sejour.name || fsDoc.sejourName || "");
  if (fsSejourName === "mcsc" || fsSejourName.includes("mycreativesurfcamp")) { score += 10; hits.push("sejour:mcsc"); }

  // Semaine S1
  const fsStart = (sejour.startDate || fsDoc.sejourStartDate || "").slice(0,10);
  if (fsStart === WEEK_DATES.S1.startDate) { score += 10; hits.push("week:S1"); }

  // Ville départ
  const cCity = normCity(row["ville aller"]);
  const fCity = normCity(trans.departureCity || trans.stationName || "");
  if (cCity && fCity && cCity === fCity) { score += 5; hits.push(`ville:${cCity}`); }

  return { score, hits };
}

function computeDiff(fsDoc, row) {
  const legal  = fsDoc.legal  || {};
  const minor  = fsDoc.minor  || {};
  const child  = (minor.children||[])[0] || {};
  const trans  = fsDoc.transport || {};
  const sejour = fsDoc.sejour    || {};

  const diffs = [];

  if (fsDoc.status !== "validated")
    diffs.push({ field: "status", from: fsDoc.status, to: "validated" });

  if (!legal.email    && row["mail"])             diffs.push({ field: "email",            to: row["mail"] });
  if (!legal.phone    && row["tel"])              diffs.push({ field: "tel",              to: row["tel"] });
  if (!legal.firstName && row["prenom responsable"]) diffs.push({ field: "prenom responsable", to: row["prenom responsable"] });
  if (!legal.lastName  && row["nom responsable"])    diffs.push({ field: "nom responsable",    to: row["nom responsable"] });
  if (!legal.address  && row["adresse"])          diffs.push({ field: "adresse",          to: row["adresse"] });
  if (!legal.cafOrSecu && row["n caf"])           diffs.push({ field: "n°caf",            to: row["n caf"] });
  if (!legal.qf       && row["qf"])              diffs.push({ field: "qf",               to: row["qf"] });

  if (!child.birthDate && row["date naissance"])  diffs.push({ field: "date naissance",   to: row["date naissance"] });
  if (!child.gender   && row["sexe"])             diffs.push({ field: "sexe",             to: row["sexe"] });

  if (!sejour.startDate) diffs.push({ field: "startDate", to: WEEK_DATES.S1.startDate });
  if (!sejour.endDate)   diffs.push({ field: "endDate",   to: WEEK_DATES.S1.endDate });

  if (!trans.departureCity && row["ville aller"])  diffs.push({ field: "ville aller",  to: row["ville aller"] });
  if (!trans.returnCity    && row["ville retour"]) diffs.push({ field: "ville retour", to: row["ville retour"] });

  return diffs;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log("\n⏳  Lecture Firestore...");
  const snap = await getDocs(collection(db, "reservations"));
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fsMcscS1 = allDocs.filter(d => {
    const s = d.sejour || {};
    const n = norm(s.name || d.sejourName || "");
    const start = (s.startDate || d.sejourStartDate || "").slice(0,10);
    return (n === "mcsc" || n.includes("mycreativesurfcamp")) && start === WEEK_DATES.S1.startDate;
  });

  console.log(`✅  ${allDocs.length} docs Firestore total`);
  console.log(`📋  ${fsMcscS1.length} docs MCSC S1 dans Firestore\n`);

  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const rows = parseCsv(readFileSync(path.join(__dir, "mcsc-s1.csv"), "utf8"));
  console.log(`📄  ${rows.length} inscrits dans le CSV MCSC S1\n`);

  const THRESHOLD = 40;
  const usedIds = new Set();
  const results = [];

  for (const row of rows) {
    const childName = `${row["prenom enfant"]} ${row["nom enfant"]}`.trim();

    let best = null, bestScore = 0;
    for (const doc of allDocs) {
      if (usedIds.has(doc.id)) continue;
      const { score, hits } = matchScore(row, doc);
      if (score > bestScore) { bestScore = score; best = { doc, hits }; }
    }

    if (bestScore >= THRESHOLD && best) {
      usedIds.add(best.doc.id);
      const diffs = computeDiff(best.doc, row);
      results.push({
        action: diffs.length ? "UPDATE" : "OK",
        childName, score: bestScore, hits: best.hits,
        fsId: best.doc.id, fsRef: best.doc.numeroDeReservation || "—",
        fsStatus: best.doc.status, diffs,
      });
    } else {
      results.push({ action: "CREATE", childName, score: bestScore, hits: best?.hits||[], diffs: [] });
    }
  }

  const oks     = results.filter(r => r.action === "OK");
  const updates = results.filter(r => r.action === "UPDATE");
  const creates = results.filter(r => r.action === "CREATE");
  const unmatched = fsMcscS1.filter(d => !usedIds.has(d.id));

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("          DRY RUN MCSC S1 — 23 inscrits validés");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  if (oks.length) {
    console.log(`✔️  DÉJÀ COMPLETS (${oks.length})`);
    for (const r of oks)
      console.log(`   ${r.childName.padEnd(28)} ref:${r.fsRef}  score:${r.score}  [${r.hits.join(", ")}]`);
    console.log();
  }

  if (updates.length) {
    console.log(`✏️  À METTRE À JOUR (${updates.length})`);
    for (const r of updates) {
      console.log(`\n   ${r.childName.padEnd(28)} ref:${r.fsRef}  status:${r.fsStatus}`);
      console.log(`   Match : ${r.hits.join(", ")}`);
      for (const d of r.diffs)
        console.log(`      → ${d.field.padEnd(22)} : ${d.from ? `"${d.from}" → ` : ""}"${d.to}"`);
    }
    console.log();
  }

  if (creates.length) {
    console.log(`🆕  À CRÉER (${creates.length})`);
    for (const r of creates)
      console.log(`   ${r.childName}  (meilleur score: ${r.score})`);
    console.log();
  }

  if (unmatched.length) {
    console.log(`⚠️  MCSC S1 FIRESTORE NON MATCHÉS PAR LE CSV (${unmatched.length})`);
    for (const d of unmatched) {
      const c = (d.minor?.children||[])[0] || {};
      const n = `${c.firstName||""} ${c.lastName||""}`.trim() || "?";
      console.log(`   ${n.padEnd(28)} ref:${d.numeroDeReservation||"—"}  status:${d.status}`);
    }
    console.log();
  }

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`  MCSC S1 Firestore : ${fsMcscS1.length}  |  CSV : ${rows.length}`);
  console.log(`  ✔ ${oks.length} déjà OK  |  ✏ ${updates.length} à mettre à jour  |  🆕 ${creates.length} à créer`);
  console.log(`  ⚠ ${unmatched.length} dans Firestore S1 hors CSV`);
  console.log("═══════════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
