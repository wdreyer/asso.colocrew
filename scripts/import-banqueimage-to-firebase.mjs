import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const banqueRoot = path.resolve(repoRoot, "public", "banqueimage");
const envLocalPath = path.resolve(repoRoot, ".env.local");

const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".avif"]);

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "",
  };
}

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(envLocalPath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const eqIndex = line.indexOf("=");
        if (eqIndex <= 0) return;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = value;
      });
  } catch {
    // optional
  }
}

function assertConfig(firebaseConfig) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !String(value || "").trim())
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Variables Firebase manquantes: ${missing.join(", ")}`);
  }
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function hashId(prefix, value) {
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
  return `${prefix}_${hash}`;
}

function mimeFromExt(ext) {
  const x = ext.toLowerCase();
  if (x === ".jpg" || x === ".jpeg") return "image/jpeg";
  if (x === ".png") return "image/png";
  if (x === ".webp") return "image/webp";
  if (x === ".gif") return "image/gif";
  if (x === ".bmp") return "image/bmp";
  if (x === ".tiff") return "image/tiff";
  if (x === ".avif") return "image/avif";
  return "application/octet-stream";
}

async function walkFiles(root) {
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExt.has(ext)) continue;
      output.push(abs);
    }
  }
  return output.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

async function main() {
  await loadEnvLocal();
  const firebaseConfig = getFirebaseConfig();
  assertConfig(firebaseConfig);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const stat = await fs.stat(banqueRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Dossier introuvable: ${banqueRoot}`);
  }

  const files = await walkFiles(banqueRoot);
  if (!files.length) {
    console.log("Aucune image à importer.");
    return;
  }

  let uploaded = 0;
  let albumsUpserted = 0;
  let photosUpserted = 0;

  const touchedAlbumIds = new Set();

  for (let i = 0; i < files.length; i += 1) {
    const abs = files[i];
    const rel = toPosix(path.relative(banqueRoot, abs));
    const folderPath = toPosix(path.dirname(rel) === "." ? "" : path.dirname(rel));
    const filename = path.basename(abs);
    const storagePath = `banqueimage/${rel}`;
    const fileBuffer = await fs.readFile(abs);
    const fileStat = await fs.stat(abs);
    const contentType = mimeFromExt(path.extname(filename));

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, fileBuffer, { contentType });
    const url = await getDownloadURL(storageRef);
    uploaded += 1;

    if (folderPath) {
      const parts = folderPath.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const albumId = hashId("album", current);
        if (!touchedAlbumIds.has(albumId)) {
          await setDoc(
            doc(db, "albums", albumId),
            {
              nom: part,
              path: current,
              parentPath: current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "",
              updatedAt: serverTimestamp(),
              source: "import-banqueimage-script",
            },
            { merge: true },
          );
          touchedAlbumIds.add(albumId);
          albumsUpserted += 1;
        }
      }
    }

    const photoId = hashId("photo", storagePath);
    await setDoc(
      doc(db, "photos", photoId),
      {
        nom: filename,
        album: folderPath.split("/").filter(Boolean).at(-1) || "banqueimage",
        albumPath: folderPath,
        folderPath,
        url,
        storagePath,
        taille: Number(fileStat.size || 0),
        ordre: i + 1,
        dateAjout: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "import-banqueimage-script",
      },
      { merge: true },
    );
    photosUpserted += 1;

    if ((i + 1) % 25 === 0 || i + 1 === files.length) {
      console.log(`[${i + 1}/${files.length}] importé`);
    }
  }

  console.log("Import terminé.");
  console.log(`- fichiers traités: ${files.length}`);
  console.log(`- uploads storage: ${uploaded}`);
  console.log(`- albums upsertés: ${albumsUpserted}`);
  console.log(`- photos upsertées: ${photosUpserted}`);
}

main().catch((error) => {
  console.error("Échec import banqueimage -> Firebase:", error);
  process.exitCode = 1;
});
