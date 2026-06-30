// DRY RUN — MCSC S1 v2 — 26 inscrits (PDF Eté 26)
// node scripts/dry-run-mcsc-s1-v2.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId:         "colocrew-5edf9",
  authDomain:        "colocrew-5edf9.firebaseapp.com",
  storageBucket:     "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId:             "1:74332244617:web:1947fe469b0ca4a103d458",
};

// ── Données du PDF (26 inscrits MCSC S1) ──
const PDF_DATA = [
  { dossier: "",                childFirst: "Noam",        childLast: "Ndoukobo Nyansi",  dob: "22/12/2015", sex: "M", respFirst: "Viviane",     respLast: "Cheron",           relation: "mère",  phone: "662050078",    email: "vivianecheron@gmail.com",          address: "14 avenue Aristide Briand 27930 gravigny", caf: "516193",   qf: "",    aller: "Paris",       retour: "Paris",       source: "google",   montantTotal: 750,  montantSejourReel: 600,  montantTransport: 150, aideCaf: 250,  montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "23/06/2026" },
  { dossier: "",                childFirst: "Océane",      childLast: "Raude",             dob: "26/09/2014", sex: "F", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "",                                 address: "", caf: "",       qf: "",    aller: "Nantes",      retour: "Nantes",      source: "totemia",  montantTotal: 1087, montantSejourReel: 933,  montantTransport: 154, aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "09/06/2026" },
  { dossier: "",                childFirst: "Dimitri",     childLast: "Hervy",             dob: "16/08/2013", sex: "M", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "",                                 address: "", caf: "",       qf: "",    aller: "Paris",       retour: "Paris",       source: "totemia",  montantTotal: 1061, montantSejourReel: 933,  montantTransport: 128, aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "10/06/2026" },
  { dossier: "",                childFirst: "Audric",      childLast: "Clain",             dob: "31/01/2014", sex: "M", respFirst: "",            respLast: "autre",            relation: "autre", phone: "",             email: "matoka.urgence@amape.fr",           address: "", caf: "",       qf: "",    aller: "Valence",     retour: "Valence",     source: "groupe",   montantTotal: 1100, montantSejourReel: 950,  montantTransport: 150, aideCaf: 0,    montantRegle: 450,  convTransport: "",        infos: "Groupe de valence", date: "08/06/2026" },
  { dossier: "",                childFirst: "Elie-Emmanuel", childLast: "Gaspard",         dob: "13/03/2013", sex: "M", respFirst: "Claudette",   respLast: "Gaspard",          relation: "mère",  phone: "",             email: "celine.lelouet@neuillysurmarne.fr", address: "80 avenue du 8 mai 1945 93330 Neuilly-sur-Marne", caf: "7561214", qf: "",    aller: "Paris",       retour: "Paris",       source: "groupe",   montantTotal: 1200, montantSejourReel: 1050, montantTransport: 150, aideCaf: 0,    montantRegle: 600,  convTransport: "Envoyé", infos: "", date: "05/06/2026" },
  { dossier: "",                childFirst: "Lina",        childLast: "Mia",               dob: "12/08/2012", sex: "F", respFirst: "Jiuchun",     respLast: "Lin",              relation: "mère",  phone: "768898557",    email: "jiuchun.lin89@gmail.com",           address: "19av du général pierre billot, 94000 Créteil", caf: "",       qf: "",    aller: "Paris",       retour: "Paris",       source: "résa site", montantTotal: 1100, montantSejourReel: 950, montantTransport: 150, aideCaf: 0,   montantRegle: 0,   convTransport: "Envoyé", infos: "/", date: "23/06/2026" },
  { dossier: "MCSC-061726-CO3", childFirst: "Marie",       childLast: "Courjaud",          dob: "12/02/2013", sex: "F", respFirst: "Fabienne",    respLast: "Fleuranceau",      relation: "autre", phone: "689774927",    email: "fleuranceau.fabienne@orange.fr",    address: "1900 route du grand lopin, VAL DE LIVENNE 33860", caf: "395294H", qf: "848", aller: "Sur Place",   retour: "Sur Place",   source: "résa site", montantTotal: 960, montantSejourReel: 960, montantTransport: 0, aideCaf: 0,    montantRegle: 600,  convTransport: "Envoyé", infos: "TOUT PAYE", date: "07/03/2026" },
  { dossier: "MCSC-061726-REN", childFirst: "Yugo",        childLast: "Renault Debecker",  dob: "21/02/2013", sex: "M", respFirst: "Lise-marie",  respLast: "Renault Debecker", relation: "mère",  phone: "",             email: "",                                 address: "", caf: "",       qf: "",    aller: "Toulouse",    retour: "Toulouse",    source: "totemia",  montantTotal: 1036, montantSejourReel: 942,  montantTransport: 94,  aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "18/05/2026" },
  { dossier: "MCSC-061726-SUB", childFirst: "Maëlle",      childLast: "Subal",             dob: "28/08/2011", sex: "F", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "c.cornil@lesdecisifs.com",          address: "", caf: "",       qf: "",    aller: "Lyon",        retour: "Lyon",        source: "anciens",  montantTotal: 998,  montantSejourReel: 848,  montantTransport: 150, aideCaf: 0,    montantRegle: 998,  convTransport: "Envoyé", infos: "", date: "20/05/2026" },
  { dossier: "",                childFirst: "Emma",        childLast: "Girardot",          dob: "11/10/2011", sex: "F", respFirst: "Thibaut",     respLast: "Girardot",         relation: "père",  phone: "646718669",    email: "thibaut.girardot@bbox.fr",          address: "", caf: "",       qf: "",    aller: "Lyon",        retour: "Lyon",        source: "bouche à oreille", montantTotal: 1195, montantSejourReel: 1045, montantTransport: 150, aideCaf: 0, montantRegle: 400, convTransport: "Envoyé", infos: "", date: "05/06/2026" },
  { dossier: "",                childFirst: "Sofia",       childLast: "Latrache",          dob: "12/08/2010", sex: "F", respFirst: "",            respLast: "autre",            relation: "autre", phone: "33749161843",  email: "Secretariat@mariedeluze.fr",        address: "", caf: "",       qf: "",    aller: "Bordeaux",    retour: "Bordeaux",    source: "amis",     montantTotal: 700,  montantSejourReel: 700,  montantTransport: 0,   aideCaf: 0,    montantRegle: 0,   convTransport: "",        infos: "", date: "26/06/2026" },
  { dossier: "MCSC-061726-SAR", childFirst: "Jasmine",     childLast: "Sarr",              dob: "14/09/2010", sex: "F", respFirst: "Touatia",     respLast: "Meguenine",        relation: "mère",  phone: "749813239",    email: "touatiaevajasmegue@gmail.com",      address: "22 chemin des martinettes, 73000 CHAMBERY", caf: "1035547", qf: "357", aller: "Lyon",        retour: "Lyon",        source: "anciens",  montantTotal: 1200, montantSejourReel: 1050, montantTransport: 150, aideCaf: 600, montantRegle: 0,   convTransport: "Envoyé", infos: "reste à payer : 300", date: "09/04/2026" },
  { dossier: "MCSC-061726-BAU", childFirst: "Thelma",      childLast: "Baudin",            dob: "14/04/2011", sex: "F", respFirst: "Stéphanie",   respLast: "Guerry",           relation: "mère",  phone: "681034608",    email: "famillebaudin85@gmail.com",         address: "", caf: "",       qf: "",    aller: "Nantes",      retour: "Nantes",      source: "anciens",  montantTotal: 988,  montantSejourReel: 808,  montantTransport: 180, aideCaf: 0,    montantRegle: 660,  convTransport: "Envoyé", infos: "reste à payer : 327,5", date: "16/04/2026" },
  { dossier: "MCSC-061726-LIG", childFirst: "Julia",       childLast: "Ligniez",           dob: "23/07/2010", sex: "F", respFirst: "Carole",      respLast: "Ligniez",          relation: "mère",  phone: "662443263",    email: "xligniez@gmail.com",                address: "", caf: "",       qf: "",    aller: "Nantes",      retour: "Nantes",      source: "anciens",  montantTotal: 988,  montantSejourReel: 808,  montantTransport: 180, aideCaf: 0,    montantRegle: 988,  convTransport: "Envoyé", infos: "", date: "03/05/2026" },
  { dossier: "MCSC-061726-HEF", childFirst: "Aaron",       childLast: "Heffer",            dob: "13/12/2010", sex: "M", respFirst: "Oriane",      respLast: "Kapitho",          relation: "mère",  phone: "611049671",    email: "ekoumekapitho@yahoo.com",           address: "3 villa saint Fargeau 75020 Paris", caf: "7474277", qf: "362", aller: "Paris",       retour: "Paris",       source: "résa site", montantTotal: 1250, montantSejourReel: 1100, montantTransport: 150, aideCaf: 400, montantRegle: 850, convTransport: "Envoyé", infos: "TOUT PAYE", date: "28/03/2026" },
  { dossier: "",                childFirst: "Léane",       childLast: "Stein",             dob: "09/04/2011", sex: "F", respFirst: "Sophie",      respLast: "Stein",            relation: "mère",  phone: "675056432",    email: "",                                 address: "", caf: "",       qf: "",    aller: "Paris",       retour: "Paris",       source: "totemia",  montantTotal: 1061, montantSejourReel: 933,  montantTransport: 128, aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "17/06/2026" },
  { dossier: "MCSC-061726-CO2", childFirst: "Gabriel",     childLast: "Courjaud",          dob: "20/02/2011", sex: "M", respFirst: "Fabienne",    respLast: "Fleuranceau",      relation: "autre", phone: "689774927",    email: "fleuranceau.fabienne@orange.fr",    address: "1900 route du grand lopin, VAL DE LIVENNE 33860", caf: "395294H", qf: "848", aller: "Sur Place",   retour: "Sur Place",   source: "résa site", montantTotal: 960, montantSejourReel: 960, montantTransport: 0, aideCaf: 0,    montantRegle: 360,  convTransport: "Envoyé", infos: "TOUT PAYE", date: "07/03/2026" },
  { dossier: "MCSC-061726-KAP", childFirst: "Nils",        childLast: "Kaptur",            dob: "09/03/2010", sex: "M", respFirst: "Emmanuelle",  respLast: "Galon",            relation: "mère",  phone: "622480328",    email: "emmanuellegalon@gmail.com",         address: "37, allée du château, Tresses, 33370", caf: "870865",   qf: "",    aller: "Bordeaux",    retour: "Bordeaux",    source: "juvigo",   montantTotal: 1021, montantSejourReel: 961,  montantTransport: 60,  aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "21/05/2026" },
  { dossier: "",                childFirst: "Stanislas",   childLast: "Hervy",             dob: "11/06/2010", sex: "M", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "",                                 address: "", caf: "",       qf: "",    aller: "Paris",       retour: "Paris",       source: "totemia",  montantTotal: 1061, montantSejourReel: 933,  montantTransport: 128, aideCaf: 0,    montantRegle: 0,   convTransport: "Envoyé", infos: "", date: "10/06/2026" },
  { dossier: "",                childFirst: "Lina",        childLast: "Ye Wei",            dob: "29/05/2010", sex: "F", respFirst: "Lifen",       respLast: "Wei",              relation: "mère",  phone: "624797243",    email: "lifenwei1976@gmail.com",            address: "131 Rue Nationale, 75013 Paris", caf: "988699",   qf: "770", aller: "Paris",       retour: "Paris",       source: "résa site", montantTotal: 1100, montantSejourReel: 950, montantTransport: 150, aideCaf: 600, montantRegle: 0,   convTransport: "Envoyé", infos: "en 3x automatique par CB", date: "15/06/2026" },
  { dossier: "MCSC-061726-CO1", childFirst: "Laura",       childLast: "Courjaud",          dob: "13/12/2009", sex: "F", respFirst: "Fabienne",    respLast: "Fleuranceau",      relation: "autre", phone: "689774927",    email: "fleuranceau.fabienne@orange.fr",    address: "1900 route du grand lopin, VAL DE LIVENNE 33860", caf: "395294H", qf: "848", aller: "Sur Place",   retour: "Sur Place",   source: "résa site", montantTotal: 960, montantSejourReel: 960, montantTransport: 0, aideCaf: 0,    montantRegle: 360,  convTransport: "Envoyé", infos: "TOUT PAYE", date: "07/03/2026" },
  { dossier: "",                childFirst: "Arushni",     childLast: "Dharmenthira",      dob: "27/08/2008", sex: "F", respFirst: "",            respLast: "autre",            relation: "autre", phone: "33749161843",  email: "Secretariat@mariedeluze.fr",        address: "", caf: "",       qf: "",    aller: "Bordeaux",    retour: "Bordeaux",    source: "amis",     montantTotal: 750,  montantSejourReel: 750,  montantTransport: 150, aideCaf: 0,    montantRegle: 0,   convTransport: "",        infos: "", date: "26/06/2026" },
  { dossier: "",                childFirst: "Marwa",       childLast: "Ahmed Mamoune",     dob: "03/12/2008", sex: "F", respFirst: "",            respLast: "",                 relation: "mère",  phone: "",             email: "mimiahmed2ma@gmail.com",            address: "", caf: "",       qf: "",    aller: "Rouen",       retour: "Rouen",       source: "groupe",   montantTotal: 1050, montantSejourReel: 900,  montantTransport: 150, aideCaf: 0,    montantRegle: 600,  convTransport: "Envoyé", infos: "", date: "24/06/2026" },
  { dossier: "",                childFirst: "Logan",       childLast: "Gleize",            dob: "?",          sex: "M", respFirst: "Charlène",    respLast: "Chaumes",          relation: "mère",  phone: "0642159947",   email: "chcaumes@gmail.com",                address: "13 boulevard Victor Hugo 12400 Sainte Afrique", caf: "2921012208022", qf: "159", aller: "Montpellier", retour: "Montpellier", source: "résa site", montantTotal: 1010, montantSejourReel: 900, montantTransport: 110, aideCaf: 168, montantRegle: 0,  convTransport: "Envoyé", infos: "", date: "17/06/2026" },
  { dossier: "",                childFirst: "Zainab",      childLast: "Coulibaly",         dob: "?",          sex: "F", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "celine.lelouet@neuillysurmarne.fr", address: "2 rue des Halles 93160 Noisy le Grand", caf: "7318100", qf: "",   aller: "Paris",       retour: "Paris",       source: "groupe",   montantTotal: 1200, montantSejourReel: 1050, montantTransport: 150, aideCaf: 0,    montantRegle: 600,  convTransport: "Envoyé", infos: "", date: "19/06/2026" },
  { dossier: "",                childFirst: "Soualio",     childLast: "Bakayoko",          dob: "?",          sex: "?", respFirst: "",            respLast: "",                 relation: "",      phone: "",             email: "celine.lelouet@neuillysurmarne.fr", address: "2 rue du Président John Kennedy 93330 Neuilly-sur-Marne", caf: "", qf: "", aller: "Paris",      retour: "Paris",       source: "groupe",   montantTotal: 1200, montantSejourReel: 1050, montantTransport: 150, aideCaf: 0,    montantRegle: 600,  convTransport: "Envoyé", infos: "", date: "03/06/2026" },
];

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s\-']+/g, " ");
}

function matchScore(row, fsDoc) {
  const legal = fsDoc.legal || {};
  const minor = fsDoc.minor || {};
  const child = (minor.children || [])[0] || {};
  let score = 0;

  if (row.dossier && norm(row.dossier) === norm(fsDoc.numeroDeReservation || "")) score += 100;

  const cF = norm(row.childFirst), cL = norm(row.childLast);
  const fF = norm(child.firstName || child.prenom || ""), fL = norm(child.lastName || child.nom || "");
  if (cF && fF && cF === fF) score += 20;
  if (cL && fL && cL === fL) score += 20;

  const cE = norm(row.email), fE = norm(legal.email || fsDoc.email || "");
  if (cE && fE && cE === fE) score += 30;

  const fsN = norm(fsDoc.sejour?.name || fsDoc.sejourName || "");
  if (fsN === "mcsc" || fsN.includes("mycreativesurfcamp")) score += 10;

  const fsStart = (fsDoc.sejour?.startDate || fsDoc.sejourStartDate || "").slice(0, 10);
  if (fsStart === "2026-07-06") score += 10;

  return score;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("\n⏳  Lecture Firestore...");
  const snap = await getDocs(collection(db, "reservations"));
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fsMcscS1 = allDocs.filter(d => {
    const n = norm(d.sejour?.name || d.sejourName || "");
    const start = (d.sejour?.startDate || d.sejourStartDate || "").slice(0, 10);
    return (n === "mcsc" || n.includes("mycreativesurfcamp")) && start === "2026-07-06";
  });

  console.log(`✅  ${allDocs.length} docs Firestore total`);
  console.log(`📋  ${fsMcscS1.length} docs MCSC S1 dans Firestore`);
  console.log(`📄  ${PDF_DATA.length} inscrits dans le PDF\n`);

  const THRESHOLD = 40;
  const usedIds = new Set();
  const toCreate = [];
  const toUpdate = [];
  const matched = [];

  for (const row of PDF_DATA) {
    const childName = `${row.childFirst} ${row.childLast}`.trim();
    let best = null, bestScore = 0;

    for (const d of allDocs) {
      if (usedIds.has(d.id)) continue;
      const s = matchScore(row, d);
      if (s > bestScore) { bestScore = s; best = d; }
    }

    if (bestScore >= THRESHOLD && best) {
      usedIds.add(best.id);
      const legal = best.legal || {};
      const trans = best.transport || {};
      const minor = best.minor || {};
      const child = (minor.children || [])[0] || {};

      const diffs = [];
      if (best.status !== "validated") diffs.push(`status: "${best.status}" → "validated"`);
      if (row.dossier && !best.numeroDeReservation) diffs.push(`numeroDeReservation: → "${row.dossier}"`);
      if (row.email && !legal.email) diffs.push(`email: → "${row.email}"`);
      if (row.phone && !legal.phone) diffs.push(`phone: → "${row.phone}"`);
      if (row.respFirst && !legal.firstName) diffs.push(`prénom responsable: → "${row.respFirst}"`);
      if (row.respLast && row.respLast !== "autre" && !legal.lastName) diffs.push(`nom responsable: → "${row.respLast}"`);
      if (row.address && !legal.address) diffs.push(`adresse: → "${row.address.slice(0, 40)}..."`);
      if (row.caf && !legal.cafOrSecu) diffs.push(`caf: → "${row.caf}"`);
      if (row.qf && !legal.qf) diffs.push(`qf: → "${row.qf}"`);
      if (row.dob && row.dob !== "?" && !child.birthDate) diffs.push(`ddn enfant: → "${row.dob}"`);
      if (row.sex && !child.gender) diffs.push(`sexe: → "${row.sex}"`);
      if (row.aller && !trans.departureCity) diffs.push(`ville aller: → "${row.aller}"`);
      if (row.retour && !trans.returnCity) diffs.push(`ville retour: → "${row.retour}"`);
      if (row.infos && !best.notes) diffs.push(`notes: → "${row.infos}"`);

      matched.push({ childName, fsId: best.id, fsRef: best.numeroDeReservation || "—", score: bestScore, diffs });

      if (diffs.length) toUpdate.push({ childName, fsId: best.id, diffs, row, fsDoc: best });
    } else {
      toCreate.push({ childName, row, score: bestScore });
    }
  }

  const unmatched = fsMcscS1.filter(d => !usedIds.has(d.id));

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("          DRY RUN MCSC S1 v2 — 26 inscrits PDF");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  if (toCreate.length) {
    console.log(`🆕  À CRÉER (${toCreate.length}) — pas trouvés dans Firestore :`);
    for (const c of toCreate) {
      console.log(`   ${c.childName.padEnd(30)} (meilleur score: ${c.score})  aller: ${c.row.aller}`);
    }
    console.log();
  }

  if (toUpdate.length) {
    console.log(`✏️  À METTRE À JOUR (${toUpdate.length}) :`);
    for (const u of toUpdate) {
      console.log(`\n   ${u.childName.padEnd(30)} (ID: ${u.fsId})`);
      for (const d of u.diffs) console.log(`      → ${d}`);
    }
    console.log();
  }

  const okCount = matched.length - toUpdate.length;
  if (okCount > 0) {
    console.log(`✔️  DÉJÀ À JOUR (${okCount}) — aucune modification nécessaire`);
    for (const m of matched.filter(x => !x.diffs.length)) {
      console.log(`   ${m.childName.padEnd(30)} ref: ${m.fsRef}`);
    }
    console.log();
  }

  if (unmatched.length) {
    console.log(`⚠️  DANS FIRESTORE S1 MAIS PAS DANS LE PDF (${unmatched.length}) :`);
    for (const d of unmatched) {
      const c = (d.minor?.children || [])[0] || {};
      const n = `${c.firstName || ""} ${c.lastName || ""}`.trim() || d.nom || "?";
      console.log(`   ${n.padEnd(30)} ref: ${d.numeroDeReservation || "—"}  statut: ${d.status}`);
    }
    console.log();
  }

  // Résumé par ville transport
  console.log("── RÉPARTITION PAR VILLE (selon PDF) ──");
  const byCity = {};
  for (const row of PDF_DATA) {
    const city = row.aller || "?";
    byCity[city] = (byCity[city] || 0) + 1;
  }
  for (const [city, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${city.padEnd(15)} ${n} inscrit${n > 1 ? "s" : ""}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(`  PDF: ${PDF_DATA.length}  |  Firestore S1: ${fsMcscS1.length}`);
  console.log(`  🆕 ${toCreate.length} à créer  |  ✏️ ${toUpdate.length} à mettre à jour  |  ✔️ ${okCount} OK  |  ⚠️ ${unmatched.length} hors PDF`);
  console.log("═══════════════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
