import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xlsx from "xlsx";
import { initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

function loadEnvLocal() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function firebaseConfigFromEnv() {
  const required = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Variables Firebase manquantes: ${missing.join(", ")}`);
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function resolveXlsxPath() {
  const argPath = process.argv[2];
  if (argPath && fs.existsSync(argPath)) return argPath;
  const defaultPath = path.join(os.homedir(), "Downloads", "retours_qualitatifs_MCSC.xlsx");
  if (fs.existsSync(defaultPath)) return defaultPath;
  throw new Error("Fichier XLS introuvable. Passe le chemin en argument.");
}

function parseNote(value) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*\/\s*10/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateRange(period) {
  const raw = String(period || "").trim();
  const match = raw.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s*(juillet|aout|août)/i);
  if (!match) return { date: "", period: raw };
  const month = /aout|août/i.test(match[3]) ? "08" : "07";
  const day = match[1].padStart(2, "0");
  return { date: `2025-${month}-${day}`, period: raw };
}

function normalizeType(type) {
  const v = String(type || "").toLowerCase();
  return v.includes("jeune") ? "jeune" : "parent";
}

function parseSheetRows(filePath) {
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  // Ligne 3 = entetes, lignes suivantes = data
  const bodyRows = aoa.slice(3).filter((row) => String(row[0] || "").trim());

  return bodyRows.map((row, index) => {
    const { date, period } = parseDateRange(row[3]);
    return {
      id: `mcsc-qualitatif-${String(index + 1).padStart(3, "0")}`,
      identite: String(row[1] || "").trim(),
      type: normalizeType(row[2]),
      sejour: "my-creative-surf-camp-2025",
      date,
      period,
      retourQualitatif: String(row[4] || "").trim(),
      note: parseNote(row[5]) ?? 10,
      photoUrl: "",
      photoPath: "",
      source: "retours_qualitatifs_MCSC.xlsx",
    };
  });
}

async function clearCollection(db, name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return 0;
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, name, d.id))));
  return snap.size;
}

async function run() {
  loadEnvLocal();
  const config = firebaseConfigFromEnv();
  const app = initializeApp(config);
  const db = getFirestore(app);

  const filePath = resolveXlsxPath();
  const rows = parseSheetRows(filePath);

  const deleted = await clearCollection(db, "retours");
  console.log(`Collection retours videe: ${deleted} document(s) supprime(s).`);

  for (const row of rows) {
    await setDoc(
      doc(db, "retours", row.id),
      {
        ...row,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await setDoc(
    doc(db, "retours_imports", `retours-qualitatifs-${Date.now()}`),
    {
      sourceFile: path.basename(filePath),
      importedRows: rows.length,
      importedAt: serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`Import termine. ${rows.length} retours qualitatifs importes.`);
}

run().catch((error) => {
  console.error("Echec import retours qualitatifs:", error);
  process.exitCode = 1;
});
