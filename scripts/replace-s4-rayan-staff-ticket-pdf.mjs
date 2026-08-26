import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const transportId = "SN9Uc6i88JNkkScxLzcE";
const attachmentId = "s4-retour-staff-rayan-lyon-paris-v9lmce";
const sourcePdf = "C:\\Users\\dreye\\Downloads\\LYON_PART_DIEU-PARIS_GARE_DE_LYON_28-08-26_MOHAMED_HASSAN_FADL_RAYAN_V9LMCE_WfBdSJpKae79GhSo3A1f.pdf";

if (!fs.existsSync(sourcePdf)) throw new Error(`PDF introuvable: ${sourcePdf}`);

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});

const db = getFirestore(app);
const storage = getStorage(app);

const transportRef = doc(db, "transports", transportId);
const snap = await getDoc(transportRef);
if (!snap.exists()) throw new Error(`Transport introuvable: ${transportId}`);
const transport = { id: snap.id, ...snap.data() };

const attachments = transport.staffTicketAttachments || [];
const attachment = attachments.find((item) => item.id === attachmentId);
if (!attachment) throw new Error(`Piece jointe Rayan introuvable: ${attachmentId}`);

const storagePath = attachment.storagePath || `transports/${transportId}/staff-billets/2026-08-28-${attachmentId}.pdf`;
let url = attachment.url || "";
if (shouldApply) {
  const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePdf), {
    contentType: "application/pdf",
  });
  url = await getDownloadURL(uploaded.ref);
}

const nextAttachments = attachments.map((item) => {
  if (item.id !== attachmentId) return item;
  return {
    ...item,
    url,
    storagePath,
    uploadedFileName: path.basename(sourcePdf),
    visibleInRoutes: true,
    updatedAt: new Date().toISOString(),
  };
});

console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - remplacement PDF staff Rayan`);
console.log(JSON.stringify({
  transportId,
  attachmentId,
  segmentId: attachment.segmentId,
  previousFileName: attachment.uploadedFileName || "",
  nextFileName: path.basename(sourcePdf),
  storagePath,
  hasUrl: Boolean(url),
}, null, 2));

if (shouldApply) {
  await updateDoc(transportRef, {
    staffTicketAttachments: nextAttachments,
    updatedAt: serverTimestamp(),
    scheduleUpdatedAt: new Date().toISOString(),
  });
  console.log("Firestore mis a jour.");
}

process.exit(0);
