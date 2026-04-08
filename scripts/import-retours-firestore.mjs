import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xlsx from "xlsx";
import { initializeApp } from "firebase/app";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

function loadEnvLocal() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function firebaseConfigFromEnv() {
  const keys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];

  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Variables Firebase manquantes: ${missing.join(", ")}`);
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function findSourceFiles() {
  const downloads = path.join(os.homedir(), "Downloads");
  const names = fs.readdirSync(downloads);

  const avis = names.find((name) => /^Avis colocrew \(1\)\.xlsx$/i.test(name));
  const parent = names.find((name) =>
    /^Questionnaire satisfaction - My Creative Surf Camp .*\.xlsx$/i.test(name)
  );
  const young = names.find((name) =>
    /^Questionnaire satisfaction jeune - My Creative Surf Camp .*\.xlsx$/i.test(name)
  );

  if (!avis || !parent || !young) {
    throw new Error(
      "Fichiers manquants dans Downloads (Avis colocrew (1), Questionnaire parent, Questionnaire jeune)."
    );
  }

  return {
    avisPath: path.join(downloads, avis),
    parentPath: path.join(downloads, parent),
    youngPath: path.join(downloads, young),
  };
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  return null;
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function findValueByHeaderIncludes(row, needles) {
  const entries = Object.entries(row);
  for (const [header, value] of entries) {
    const normalized = String(header || "").toLowerCase();
    if (needles.every((needle) => normalized.includes(needle))) {
      return value;
    }
  }
  return null;
}

function parseScore(rawValue, header = "") {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (typeof rawValue === "number" && !Number.isNaN(rawValue)) {
    const max = rawValue > 5 ? 10 : 5;
    return { score: Number(rawValue), max, raw: rawValue };
  }

  const value = String(rawValue).trim();
  if (!value) return null;
  const lower = value.toLowerCase();

  const numericMatch = lower.match(/(\d+(?:[.,]\d+)?)/);
  if (numericMatch) {
    const score = Number(numericMatch[1].replace(",", "."));
    if (!Number.isNaN(score)) {
      const max =
        lower.includes("etoile") || lower.includes("étoile")
          ? 5
          : score > 5
            ? 10
            : 5;
      return { score, max, raw: rawValue };
    }
  }

  const textScale = new Map([
    ["tres satisfaisant", 5],
    ["très satisfaisant", 5],
    ["satisfaisant", 4],
    ["moyennement satisfaisant", 3],
    ["peu satisfaisant", 2],
    ["pas du tout satisfaisant", 1],
    ["tres bien", 5],
    ["très bien", 5],
    ["bien", 4],
    ["moyen", 3],
    ["mauvais", 2],
  ]);

  for (const [label, score] of textScale.entries()) {
    if (lower === label) {
      return { score, max: 5, raw: rawValue };
    }
  }

  if (String(header).toLowerCase().includes("note")) return null;
  return null;
}

function normalizeRatingName(header) {
  return String(header || "")
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]+\]/g, "")
    .trim();
}

function extractTextFeedback(row) {
  const comments = [];
  const entries = Object.entries(row);
  const textHeaders = [
    "commentaire",
    "avis final",
    "souvenir",
    "ameliore",
    "améliore",
    "moins aime",
    "moins aimé",
    "plus apprecie",
    "plus apprécié",
    "pourquoi",
    "retour",
  ];

  for (const [header, value] of entries) {
    if (typeof value !== "string") continue;
    const normalizedHeader = String(header || "").toLowerCase();
    const normalizedValue = value.trim();
    if (!normalizedValue) continue;

    if (
      textHeaders.some((token) => normalizedHeader.includes(token)) ||
      normalizedValue.length > 80
    ) {
      comments.push({ header: String(header), text: normalizedValue });
    }
  }

  return comments;
}

function extractHighlights(comments) {
  const positiveTokens = [
    "super",
    "top",
    "bien",
    "genial",
    "génial",
    "excellent",
    "ravi",
    "ravie",
    "ador",
    "heureux",
    "heureuse",
    "convivial",
    "bienveillant",
  ];
  const negativeTokens = ["proble", "problè", "decu", "déçu", "manque", "stress", "nul"];

  return comments
    .map((item) => item.text)
    .filter((text) => {
      const lowered = text.toLowerCase();
      const hasPositive = positiveTokens.some((token) => lowered.includes(token));
      const hasNegative = negativeTokens.some((token) => lowered.includes(token));
      return hasPositive && !hasNegative;
    })
    .slice(0, 3);
}

function extractRatings(row) {
  const ratings = [];
  for (const [header, value] of Object.entries(row)) {
    const normalizedHeader = String(header || "").toLowerCase();
    if (!header || value === null || value === undefined || value === "") continue;

    const shouldIgnore =
      normalizedHeader.includes("horodateur") ||
      normalizedHeader.includes("age") ||
      normalizedHeader.includes("nom") ||
      normalizedHeader.includes("mail") ||
      normalizedHeader.includes("adresse") ||
      normalizedHeader.includes("ville") ||
      normalizedHeader.includes("date") ||
      normalizedHeader.includes("sejour auquel") ||
      normalizedHeader.includes("séjour auquel");

    if (shouldIgnore) continue;

    const parsed = parseScore(value, header);
    if (!parsed) continue;
    ratings.push({
      key: slug(header),
      category: normalizeRatingName(header),
      score: parsed.score,
      max: parsed.max,
      normalized: Number(((parsed.score / parsed.max) * 10).toFixed(2)),
      raw: parsed.raw,
    });
  }
  return ratings;
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactObject(item))
      .filter((item) => item !== null && item !== undefined);
  }

  if (value && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = compactObject(item);
      if (
        cleaned === undefined ||
        cleaned === null ||
        cleaned === "" ||
        (Array.isArray(cleaned) && cleaned.length === 0) ||
        (typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0)
      ) {
        continue;
      }
      output[key] = cleaned;
    }
    return output;
  }
  return value;
}

function buildRecordsForWorkbook(filePath, sourceType, respondentType) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false });

  const records = [];
  rows.forEach((row, index) => {
    if (!Object.values(row).some((value) => value !== null && value !== "")) return;

    const sejourName =
      findValueByHeaderIncludes(row, ["nom", "sejour"]) ||
      findValueByHeaderIncludes(row, ["séjour", "a participe"]) ||
      findValueByHeaderIncludes(row, ["sejour", "a participe"]) ||
      null;

    const sejourPeriod =
      findValueByHeaderIncludes(row, ["dates", "sejour"]) ||
      findValueByHeaderIncludes(row, ["du "]) ||
      null;

    const childName =
      findValueByHeaderIncludes(row, ["nom enfant"]) ||
      findValueByHeaderIncludes(row, ["nom et prenom du/de la jeune"]) ||
      findValueByHeaderIncludes(row, ["nom et prenom"]) ||
      null;

    const respondentName =
      findValueByHeaderIncludes(row, ["nom parent"]) ||
      findValueByHeaderIncludes(row, ["parent", "nom"]) ||
      findValueByHeaderIncludes(row, ["nom et prenom"]) ||
      findValueByHeaderIncludes(row, ["nom enfant"]) ||
      null;

    const respondentNameClean = respondentName ? String(respondentName).trim() : null;
    const childNameClean = childName ? String(childName).trim() : null;
    const parentName = respondentType === "parent" ? respondentNameClean : null;

    const email = findValueByHeaderIncludes(row, ["adresse mail"]) || null;
    const submittedAt = toIsoDate(findValueByHeaderIncludes(row, ["horodateur"]));

    const globalValue =
      findValueByHeaderIncludes(row, ["note globale"]) ||
      findValueByHeaderIncludes(row, ["etoiles"]) ||
      findValueByHeaderIncludes(row, ["étoiles"]);
    const globalParsed = parseScore(globalValue, "global");

    const ratings = extractRatings(row);
    const comments = extractTextFeedback(row);
    const highlights = extractHighlights(comments);

    const fileName = path.basename(filePath);
    const rowNumber = index + 2;
    const record = compactObject({
      sourceType,
      respondentType,
      sejourName: sejourName ? String(sejourName).trim() : null,
      sejourPeriod: sejourPeriod ? String(sejourPeriod).trim() : null,
      childName: childNameClean,
      respondentName: respondentNameClean,
      parentName,
      contactEmail: email ? String(email).trim() : null,
      submittedAt,
      globalScoreRaw: globalParsed?.score ?? null,
      globalScoreMax: globalParsed?.max ?? null,
      globalScoreNormalized: globalParsed
        ? Number(((globalParsed.score / globalParsed.max) * 10).toFixed(2))
        : null,
      ratings,
      comments,
      highlights,
      importMeta: {
        fileName,
        rowNumber,
      },
      raw: row,
    });

    records.push(record);
  });

  return records;
}

async function run() {
  loadEnvLocal();
  const config = firebaseConfigFromEnv();
  const app = initializeApp(config);
  const db = getFirestore(app);

  const { avisPath, parentPath, youngPath } = findSourceFiles();
  const batchId = `retours-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const records = [
    ...buildRecordsForWorkbook(avisPath, "avis_manuels", "parent"),
    ...buildRecordsForWorkbook(parentPath, "questionnaire_parent", "parent"),
    ...buildRecordsForWorkbook(youngPath, "questionnaire_jeune", "jeune"),
  ];

  let written = 0;
  for (const record of records) {
    const id = `${record.sourceType}-${slug(record.importMeta.fileName)}-${record.importMeta.rowNumber}`;
    await setDoc(
      doc(db, "retours", id),
      {
        ...record,
        importMeta: {
          ...record.importMeta,
          batchId,
        },
        importedAt: serverTimestamp(),
      },
      { merge: true }
    );
    written += 1;
  }

  await setDoc(
    doc(db, "retours_imports", batchId),
    {
      batchId,
      files: [path.basename(avisPath), path.basename(parentPath), path.basename(youngPath)],
      totalRecords: written,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Import termine. ${written} retours ecrits dans Firestore (batch ${batchId}).`);
}

run().catch((error) => {
  console.error("Echec import retours:", error);
  process.exitCode = 1;
});
