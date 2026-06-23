// IMPORT RÉEL — MCSC S1 — 23 inscrits
// node scripts/do-import.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
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

const WEEK_DATES = { S1: { startDate: "2026-07-06", endDate: "2026-07-19" } };

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

  const fsStart=(sejour.startDate||fsDoc.sejourStartDate||"").slice(0,10);
  if (fsStart===WEEK_DATES.S1.startDate) score+=10;

  const cCity=normCity(row["ville aller"]), fCity=normCity(trans.departureCity||trans.stationName||"");
  if (cCity&&fCity&&cCity===fCity) score+=5;

  return score;
}

function buildUpdate(fsDoc, row) {
  const legal  = fsDoc.legal  || {};
  const minor  = fsDoc.minor  || {};
  const child  = (minor.children||[])[0] || {};
  const trans  = fsDoc.transport || {};
  const sejour = fsDoc.sejour    || {};

  const patch = {};

  if (fsDoc.status !== "validated") patch.status = "validated";

  // Legal
  if (!legal.email     && row["mail"])                  patch["legal.email"]     = row["mail"];
  if (!legal.phone     && row["tel"])                   patch["legal.phone"]     = row["tel"];
  if (!legal.firstName && row["prenom responsable"])    patch["legal.firstName"] = row["prenom responsable"];
  if (!legal.lastName  && row["nom responsable"])       patch["legal.lastName"]  = row["nom responsable"];
  if (!legal.address   && row["adresse"])               patch["legal.address"]   = row["adresse"];
  if (!legal.cafOrSecu && row["n caf"])                 patch["legal.cafOrSecu"] = row["n caf"];
  if (!legal.qf        && row["qf"])                    patch["legal.qf"]        = row["qf"];

  // Enfant — on met à jour children[0] via merge
  const childPatch = {};
  if (!child.birthDate && row["date naissance"]) childPatch.birthDate = row["date naissance"];
  if (!child.gender    && row["sexe"])           childPatch.gender    = row["sexe"];
  if (Object.keys(childPatch).length) {
    const updatedChildren = [...(minor.children||[{}])];
    updatedChildren[0] = { ...(updatedChildren[0]||{}), ...childPatch };
    patch["minor.children"] = updatedChildren;
  }

  // Séjour
  if (!sejour.startDate) patch["sejour.startDate"] = WEEK_DATES.S1.startDate;
  if (!sejour.endDate)   patch["sejour.endDate"]   = WEEK_DATES.S1.endDate;
  if (!sejour.name)      patch["sejour.name"]      = "MCSC";

  // Transport
  if (!trans.departureCity && row["ville aller"])  patch["transport.departureCity"] = row["ville aller"];
  if (!trans.returnCity    && row["ville retour"]) patch["transport.returnCity"]    = row["ville retour"];

  return patch;
}

function buildNewDoc(row) {
  return {
    status: "validated",
    numeroDeReservation: row["n dossier"] || "",
    source: row["source"] || "",
    notes:  row["infos"]  || "",
    legal: {
      firstName:  row["prenom responsable"] || "",
      lastName:   row["nom responsable"]    || "",
      email:      row["mail"]    || "",
      phone:      row["tel"]     || "",
      relation:   row["relation"]|| "",
      address:    row["adresse"] || "",
      cafOrSecu:  row["n caf"]  || "",
      qf:         row["qf"]     || "",
    },
    minor: {
      numberOfChildren: "1",
      children: [{
        firstName: row["prenom enfant"]   || "",
        lastName:  row["nom enfant"]      || "",
        birthDate: row["date naissance"]  || "",
        gender:    row["sexe"]            || "",
      }],
    },
    sejour: {
      name:      "MCSC",
      startDate: WEEK_DATES.S1.startDate,
      endDate:   WEEK_DATES.S1.endDate,
    },
    transport: {
      departureCity: row["ville aller"]  || "",
      returnCity:    row["ville retour"] || "",
    },
  };
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
  let updated=0, created=0, skipped=0;

  for (const row of rows) {
    const childName = `${row["prenom enfant"]} ${row["nom enfant"]}`.trim();

    let best=null, bestScore=0;
    for (const d of allDocs) {
      if (usedIds.has(d.id)) continue;
      const s = matchScore(row, d);
      if (s > bestScore) { bestScore=s; best=d; }
    }

    if (bestScore >= THRESHOLD && best) {
      usedIds.add(best.id);
      const patch = buildUpdate(best, row);
      if (Object.keys(patch).length === 0) {
        console.log(`✔  ${childName} — rien à changer`);
        skipped++;
      } else {
        await updateDoc(doc(db, "reservations", best.id), patch);
        console.log(`✏  ${childName} — mis à jour (${Object.keys(patch).join(", ")})`);
        updated++;
      }
    } else {
      const newRef = doc(collection(db, "reservations"));
      await setDoc(newRef, buildNewDoc(row));
      console.log(`🆕  ${childName} — créé (ID: ${newRef.id})`);
      created++;
    }
  }

  console.log(`\n✅  Import terminé : ${updated} mis à jour | ${created} créés | ${skipped} inchangés\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
