// Met à jour createdAt (date d'inscription) pour les 23 MCSC S1
// node scripts/fix-dates.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";
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

// IDs trouvés lors de l'import précédent (dry-run + import)
// On re-matche par nom pour être sûr
const WEEK_DATES = { S1: { startDate: "2026-07-06" } };

function norm(s) {
  return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim().replace(/[\s\-']+/g," ");
}
function normCity(s) { return norm(s).replace(/\s/g,""); }

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const row = {};
    splitLine(line).forEach((v,i) => { row[(headers[i]||"").trim()] = v.trim(); });
    return row;
  });
}
function splitLine(line) {
  const r=[]; let cur=""; let q=false;
  for (const ch of line) {
    if (ch==='"'){q=!q;continue;}
    if (ch===","&&!q){r.push(cur);cur="";continue;}
    cur+=ch;
  }
  r.push(cur); return r;
}

// "07/03/2026" → Timestamp (à midi pour éviter les décalages UTC)
function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split("/");
  if (!d || !m || !y) return null;
  return Timestamp.fromDate(new Date(`${y}-${m}-${d}T12:00:00Z`));
}

function matchScore(row, fsDoc) {
  const legal  = fsDoc.legal  || {};
  const minor  = fsDoc.minor  || {};
  const child  = (minor.children||[])[0] || fsDoc.child || {};
  const sejour = fsDoc.sejour || {};
  const trans  = fsDoc.transport || {};
  let score=0;

  const csvRef=norm(row["n dossier"]||""), fsRef=norm(fsDoc.numeroDeReservation||"");
  if (csvRef&&fsRef&&csvRef===fsRef) score+=100;

  const cF=norm(row["prenom enfant"]), cL=norm(row["nom enfant"]);
  const fF=norm(child.firstName||child.prenom||""), fL=norm(child.lastName||child.nom||"");
  if (cF&&fF&&cF===fF) score+=20;
  if (cL&&fL&&cL===fL) score+=20;

  const cE=norm(row["mail"]), fE=norm(legal.email||fsDoc.email||"");
  if (cE&&fE&&cE===fE) score+=30;

  const fsN=norm(sejour.name||fsDoc.sejourName||"");
  if (fsN==="mcsc"||fsN.includes("mycreativesurfcamp")) score+=10;

  const fsStart=(sejour.startDate||"").slice(0,10);
  if (fsStart===WEEK_DATES.S1.startDate) score+=10;

  const cCity=normCity(row["ville aller"]), fCity=normCity(trans.departureCity||trans.stationName||"");
  if (cCity&&fCity&&cCity===fCity) score+=5;

  return score;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log("\n⏳  Lecture Firestore...");
  const snap = await getDocs(collection(db, "reservations"));
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`✅  ${allDocs.length} docs\n`);

  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const rows = parseCsv(readFileSync(path.join(__dir, "mcsc-s1.csv"), "utf8"));

  const THRESHOLD = 40;
  const usedIds = new Set();
  let done = 0;

  for (const row of rows) {
    const childName = `${row["prenom enfant"]} ${row["nom enfant"]}`.trim();
    const ts = parseDate(row["Date"]);
    if (!ts) { console.log(`⚠  ${childName} — date invalide: "${row["Date"]}"`); continue; }

    let best=null, bestScore=0;
    for (const d of allDocs) {
      if (usedIds.has(d.id)) continue;
      const s = matchScore(row, d);
      if (s > bestScore) { bestScore=s; best=d; }
    }

    if (bestScore >= THRESHOLD && best) {
      usedIds.add(best.id);
      await updateDoc(doc(db, "reservations", best.id), { createdAt: ts });
      console.log(`✅  ${childName.padEnd(30)} → createdAt: ${row["Date"]}  (ID: ${best.id})`);
      done++;
    } else {
      console.log(`❌  ${childName} — aucun match (score: ${bestScore})`);
    }
  }

  console.log(`\n✅  ${done} dates mises à jour\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
