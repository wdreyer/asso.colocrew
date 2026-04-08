import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps, getApp } from "firebase/app";
import { collection, getDocs, getFirestore, serverTimestamp, updateDoc, doc } from "firebase/firestore";

const TARGET_PATHS = ["/aide-financement", "/anims", "/qui-sommes-nous"];

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function fixMojibake(value) {
  let output = String(value || "");
  const badPattern = /[Ãâœ™�]/;
  if (!badPattern.test(output)) return output;

  for (let i = 0; i < 2; i += 1) {
    if (!badPattern.test(output)) break;
    try {
      output = decodeURIComponent(escape(output));
    } catch {
      break;
    }
  }
  return output;
}

function applyInclusiveWriting(content, pagePath) {
  let next = String(content || "");

  // Corrections inclusives demandées sur les pages equipe/recrutement et qui sommes-nous.
  if (pagePath === "/anims" || pagePath === "/qui-sommes-nous") {
    next = next
      .replace(/animateurs\s+et\s+animatrices/gi, "animateur·rices")
      .replace(/formateurs\s+et\s+formatrices/gi, "formateur·rices")
      .replace(/\banimateurs\b/gi, "animateur·rices")
      .replace(/\bformateurs\b/gi, "formateur·rices")
      .replace(/\bprofessionnels\b/gi, "professionnel·les")
      .replace(/\bmotives\b/gi, "motivé·es")
      .replace(/\bmotivés\b/gi, "motivé·es")
      .replace(/\bpassionnes\b/gi, "passionné·es")
      .replace(/\bpassionnés\b/gi, "passionné·es");
  }

  if (pagePath === "/aide-financement") {
    next = next
      .replace(/\badh[eé]rent\(e\)\b/gi, "adhérent·e")
      .replace(/\bn[eé]\(e\)\b/gi, "né·e");
  }

  return next;
}

async function main() {
  loadEnv();

  const config = getFirebaseConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error("Variables Firebase manquantes dans .env.local");
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  const db = getFirestore(app);

  const snap = await getDocs(collection(db, "pages"));
  const docs = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

  const updates = [];

  for (const targetPath of TARGET_PATHS) {
    const candidates = docs
      .filter((item) => String(item.path || "").toLowerCase() === targetPath)
      .sort((a, b) => {
        const aUpdated = a?.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const bUpdated = b?.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return bUpdated - aUpdated;
      });

    if (!candidates.length) {
      console.warn(`Aucun document trouvé pour ${targetPath}`);
      continue;
    }

    const page = candidates[0];
    const originalBody = String(page.body || "");

    const fixed = applyInclusiveWriting(fixMojibake(originalBody), targetPath)
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n");

    const changed = fixed !== originalBody || page.useFirebaseBody !== true;

    if (changed) {
      await updateDoc(doc(db, "pages", page.id), {
        body: fixed,
        useFirebaseBody: true,
        updatedAt: serverTimestamp(),
      });
    }

    updates.push({
      path: targetPath,
      id: page.id,
      changed,
      bodyLength: fixed.length,
      useFirebaseBody: true,
    });
  }

  console.log("Mise à jour Firestore terminée :");
  updates.forEach((row) => {
    console.log(`- ${row.path} (${row.id}) | changed=${row.changed} | body=${row.bodyLength} chars | useFirebaseBody=${row.useFirebaseBody}`);
  });
}

await main();
