import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const TARGET_LIST = "liste 09 JUIN";
const CONTACTS = "campagne_contacts";
const LISTS = "campagne_listes";
const UNSUB = "campagne_unsubscribes";
const MAX_IMPORT = Number(process.argv[2] || 5000);

const DATA_DIR = "data_collect";
const DATA_INCLUSION_STRUCTURES = path.join(DATA_DIR, "structures-inclusion-2026-06-08.csv");
const OSM_SOCIAL = path.join(DATA_DIR, "osm-structures-sociales-2026-06-09.csv");
const DILA_TAR = path.join(DATA_DIR, "dila-annuaire-local-all-latest.tar.bz2");
const DILA_JSON = path.join(DATA_DIR, "dila-annuaire-local-all-latest.json");
const OUTPUT_CSV = path.join(DATA_DIR, "liste-09-juin-candidats-importes.csv");

const DILA_TYPES = new Map([
  ["ccas", { secteur: "Centre communal d'action sociale", score: 78 }],
  ["cij", { secteur: "Information jeunesse", score: 92 }],
  ["mission_locale", { secteur: "Mission locale", score: 95 }],
  ["pmi", { secteur: "PMI / enfance-famille", score: 84 }],
  ["mds", { secteur: "Maison departementale des solidarites", score: 88 }],
  ["mda", { secteur: "Maison des adolescents", score: 94 }],
  ["cio", { secteur: "Orientation jeunesse", score: 72 }],
  ["crib", { secteur: "Vie associative / jeunesse", score: 72 }],
  ["sdjes", { secteur: "Service jeunesse engagement sport", score: 82 }],
  ["ddpjj", { secteur: "Protection judiciaire jeunesse", score: 92 }],
  ["ddets", { secteur: "Insertion / solidarites", score: 72 }],
  ["pif", { secteur: "Point info famille", score: 80 }],
  ["cidf", { secteur: "Droits des femmes et familles", score: 70 }],
  ["maison_emploi", { secteur: "Insertion jeunesse", score: 68 }],
]);

const KEYWORDS = [
  [/mission locale|missions locales/i, 95, "Mission locale"],
  [/\b(crij|bij|pij|cij)\b|information jeunesse|info jeunes?|point information jeunesse/i, 92, "Information jeunesse"],
  [/\bmjc\b|maison des jeunes|maison de la jeunesse|jeunesse|espace jeunes?|service jeunes?/i, 90, "Structure jeunesse"],
  [/centre social|centres sociaux|maison de quartier|maison des habitants|animation sociale/i, 88, "Centre social / maison de quartier"],
  [/protection enfance|aide sociale a l.?enfance|\base\b|\bcrip\b|mecs|foyer de l.?enfance|enfance famille|enfance-famille/i, 96, "ASE / protection enfance"],
  [/prevention specialisee|prévention spécialisée|club de prevention|pjj|protection judiciaire jeunesse/i, 94, "Prevention / PJJ"],
  [/\bccas\b|centre communal d.?action sociale|action sociale/i, 78, "Action sociale"],
  [/\bpmi\b|protection maternelle|maison des adolescents|point info famille|planning familial/i, 82, "Famille / adolescents"],
  [/insertion|emploi|orientation|accompagnement social|solidarite|solidarité/i, 62, "Insertion / solidarites"],
];

const EXCLUDE = [
  /ehpad|e\.h\.p\.a\.d|personnes agees|personnes âgées|maison de retraite|residence autonomie|résidence autonomie|senior|seniors|nursing_home/i,
  /police|gendarmerie|douane|douanes|chasse|federation.*chasse|trésorerie|tresorerie|impots|impôts|fiscal/i,
  /chambre d.?agriculture|cci|chambre de commerce|artisanat|hypotheque|hypothèque|prudhommes|tribunal|notaire/i,
  /noreply|no-reply|nepasrepondre|donotreply/i,
];

loadEnv(".env.local");

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (ch === "," || ch === ";")) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += ch;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map(cells => Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""])));
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function departmentFromPostal(postalCode) {
  const raw = String(postalCode || "").trim();
  if (/^97[1-8]/.test(raw)) return raw.slice(0, 3);
  if (/^20/.test(raw)) return raw.slice(0, 2);
  return raw.slice(0, 2);
}

function scoreAndSector(text) {
  const normalized = normalizeText(text);
  if (!normalized || EXCLUDE.some((regex) => regex.test(normalized))) return null;
  let score = 0;
  let secteur = "";
  for (const [regex, points, label] of KEYWORDS) {
    if (regex.test(normalized)) {
      if (points > score) secteur = label;
      score = Math.max(score, points);
    }
  }
  if (!score) return null;
  return { score, secteur };
}

function addCandidate(map, candidate) {
  const email = cleanEmail(candidate.email);
  if (!email) return false;
  const text = [
    email,
    candidate.organisation,
    candidate.secteur,
    candidate.type,
    candidate.commune,
    candidate.source,
  ].join(" ");
  if (EXCLUDE.some((regex) => regex.test(normalizeText(text)))) return false;

  const current = map.get(email);
  const next = {
    ...candidate,
    email,
    score: Number(candidate.score) || 0,
  };
  if (!current || next.score > current.score) {
    map.set(email, next);
  } else if (current.source && !current.source.includes(candidate.source)) {
    current.source = `${current.source}; ${candidate.source}`;
  }
  return true;
}

async function extractDilaJson() {
  if (fs.existsSync(DILA_JSON)) return;
  execFileSync("tar.exe", ["-xjf", DILA_TAR, "-C", DATA_DIR], { stdio: "inherit" });
  const extracted = fs.readdirSync(DATA_DIR).find((name) => name.endsWith("data.gouv_local.json"));
  if (!extracted) throw new Error("DILA local JSON introuvable apres extraction.");
  fs.renameSync(path.join(DATA_DIR, extracted), DILA_JSON);
}

async function readExisting(listIdToIgnore) {
  const unsubSnap = await getDocs(collection(db, UNSUB));
  const unsubscribed = new Set(unsubSnap.docs.map(d => cleanEmail(d.data().email || d.id)).filter(Boolean));

  const contactsSnap = await getDocs(collection(db, CONTACTS));
  const existing = new Set(
    contactsSnap.docs
      .filter(d => d.data().listId !== listIdToIgnore)
      .map(d => cleanEmail(d.data().email))
      .filter(Boolean),
  );
  return { existing, unsubscribed };
}

async function findOrCreateList() {
  const snap = await getDocs(query(collection(db, LISTS), where("name", "==", TARGET_LIST)));
  const existing = snap.docs[0];
  if (existing) {
    const contactsSnap = await getDocs(query(collection(db, CONTACTS), where("listId", "==", existing.id)));
    for (let i = 0; i < contactsSnap.docs.length; i += 450) {
      const batch = writeBatch(db);
      contactsSnap.docs.slice(i, i + 450).forEach(contactDoc => batch.delete(contactDoc.ref));
      await batch.commit();
    }
    await setDoc(doc(db, LISTS, existing.id), { name: TARGET_LIST, count: 0, updatedAt: serverTimestamp() }, { merge: true });
    return { listId: existing.id, removed: contactsSnap.size };
  }

  const ref = await addDoc(collection(db, LISTS), {
    name: TARGET_LIST,
    count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { listId: ref.id, removed: 0 };
}

async function collectDila(candidates) {
  await extractDilaJson();
  const data = JSON.parse(fs.readFileSync(DILA_JSON, "utf8"));
  let rows = 0;
  let kept = 0;
  for (const service of data.service || []) {
    rows++;
    const emails = Array.isArray(service.adresse_courriel) ? service.adresse_courriel : [];
    if (!emails.length) continue;
    const pivots = Array.isArray(service.pivot) ? service.pivot : [];
    const matchingTypes = pivots
      .map((pivot) => pivot?.type_service_local)
      .filter((type) => DILA_TYPES.has(type));
    if (!matchingTypes.length) continue;
    const type = matchingTypes.sort((a, b) => DILA_TYPES.get(b).score - DILA_TYPES.get(a).score)[0];
    const meta = DILA_TYPES.get(type);
    const adresse = Array.isArray(service.adresse) ? (service.adresse[0] || {}) : (service.adresse || {});
    const commune = adresse.nom_commune || adresse.localite || "";
    const postalCode = adresse.code_postal || "";
    for (const email of emails) {
      if (addCandidate(candidates, {
        email,
        organisation: service.nom || "",
        type,
        secteur: meta.secteur,
        score: meta.score,
        commune,
        departement: departmentFromPostal(postalCode),
        postalCode,
        phone: (service.telephone || []).map((item) => item?.valeur).filter(Boolean).join("; "),
        website: (service.site_internet || []).map((item) => item?.valeur).filter(Boolean)[0] || "",
        source: "Service-Public.gouv.fr / DILA",
      })) kept++;
    }
  }
  return { rows, kept };
}

function collectDataInclusion(candidates) {
  const rows = parseCsv(fs.readFileSync(DATA_INCLUSION_STRUCTURES, "utf8"));
  let kept = 0;
  for (const row of rows) {
    const email = cleanEmail(row.courriel);
    if (!email) continue;
    const text = [
      row.nom,
      row.description,
      row.source,
      row.reseaux_porteurs,
      row.commune,
    ].join(" ");
    const scored = scoreAndSector(text);
    if (!scored) continue;
    if (addCandidate(candidates, {
      email,
      organisation: row.nom || "",
      type: row.source || "",
      secteur: scored.secteur,
      score: scored.score - 4,
      commune: row.commune || "",
      departement: departmentFromPostal(row.code_postal),
      postalCode: row.code_postal || "",
      phone: row.telephone || "",
      website: row.site_web || "",
      source: "data.inclusion.gouv.fr",
    })) kept++;
  }
  return { rows: rows.length, kept };
}

function collectOsm(candidates) {
  const rows = parseCsv(fs.readFileSync(OSM_SOCIAL, "utf8"));
  let kept = 0;
  for (const row of rows) {
    const email = cleanEmail(row.email || row["contact-email"]);
    if (!email) continue;
    const text = [
      row.name,
      row.amenity,
      row.office,
      row.social_facility,
      row["social_facility-for"],
      row.community_centre,
      row["community_centre-for"],
      row.operator,
      row.description,
    ].join(" ");
    const scored = scoreAndSector(text) || (
      row.amenity === "community_centre"
        ? { score: 66, secteur: "Centre social / maison de quartier" }
        : null
    );
    if (!scored) continue;
    if (addCandidate(candidates, {
      email,
      organisation: row.name || row.official_name || "",
      type: [row.amenity, row.social_facility, row.community_centre].filter(Boolean).join(" / "),
      secteur: scored.secteur,
      score: scored.score - 6,
      commune: row["addr-city"] || "",
      departement: departmentFromPostal(row["addr-postcode"]),
      postalCode: row["addr-postcode"] || "",
      phone: row.phone || row["contact-phone"] || "",
      website: row.website || row["contact-website"] || row.url || row["contact-url"] || "",
      source: "OpenStreetMap / magOSM structures sociales",
    })) kept++;
  }
  return { rows: rows.length, kept };
}

function writeCsv(filePath, contacts) {
  const fields = ["email", "organisation", "secteur", "type", "departement", "commune", "postalCode", "phone", "website", "source", "score"];
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [
    fields.join(","),
    ...contacts.map((contact) => fields.map((field) => escape(contact[field])).join(",")),
  ].join("\n");
  fs.writeFileSync(filePath, body, "utf8");
}

const { listId, removed } = await findOrCreateList();
const { existing, unsubscribed } = await readExisting(listId);

const candidates = new Map();
const stats = {
  dila: await collectDila(candidates),
  dataInclusion: collectDataInclusion(candidates),
  osm: collectOsm(candidates),
};

let skippedExisting = 0;
let skippedUnsub = 0;
const filtered = [];
for (const contact of candidates.values()) {
  if (unsubscribed.has(contact.email)) {
    skippedUnsub++;
    continue;
  }
  if (existing.has(contact.email)) {
    skippedExisting++;
    continue;
  }
  filtered.push(contact);
}

const selectable = filtered.filter((contact) => contact.departement).length >= MAX_IMPORT
  ? filtered.filter((contact) => contact.departement)
  : filtered;

const selected = selectable
  .sort((a, b) =>
    (b.score - a.score) ||
    String(a.departement || "zz").localeCompare(String(b.departement || "zz")) ||
    a.email.localeCompare(b.email),
  )
  .slice(0, MAX_IMPORT)
  .sort((a, b) =>
    String(a.departement || "zz").localeCompare(String(b.departement || "zz")) ||
    (b.score - a.score) ||
    a.email.localeCompare(b.email),
  );

for (let i = 0; i < selected.length; i += 450) {
  const batch = writeBatch(db);
  selected.slice(i, i + 450).forEach((contact) => {
    batch.set(doc(collection(db, CONTACTS)), {
      listId,
      email: contact.email,
      prenom: "",
      nom: "",
      organisation: contact.organisation || "",
      categorie: contact.secteur || "Structure sociale / jeunesse",
      type: contact.type || "",
      departement: contact.departement || "",
      commune: contact.commune || "",
      postalCode: contact.postalCode || "",
      phone: contact.phone || "",
      website: contact.website || "",
      source: contact.source || "",
      scorePertinence: contact.score || 0,
    });
  });
  await batch.commit();
}

await setDoc(doc(db, LISTS, listId), {
  name: TARGET_LIST,
  count: selected.length,
  updatedAt: serverTimestamp(),
}, { merge: true });

writeCsv(OUTPUT_CSV, selected);

const bySource = selected.reduce((acc, item) => {
  acc[item.source] = (acc[item.source] || 0) + 1;
  return acc;
}, {});
const bySector = selected.reduce((acc, item) => {
  acc[item.secteur] = (acc[item.secteur] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  targetList: TARGET_LIST,
  listId,
  removedFromExistingTargetList: removed,
  rawStats: stats,
  uniqueCandidatesBeforeExclusion: candidates.size,
  skippedExisting,
  skippedUnsubscribed: skippedUnsub,
  eligibleNewCandidates: filtered.length,
  imported: selected.length,
  outputCsv: OUTPUT_CSV,
  bySource,
  bySector,
}, null, 2));
