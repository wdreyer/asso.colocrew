// fix-transport-refs.mjs
// Corrige les passagers de "transports" qui référencent des reservationId
// supprimés par dedupe-ete26.mjs (remplace par l'ID de réservation survivant).
//
// Dry-run par défaut. --apply pour écrire.

import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";

loadEnv(".env.local");
const shouldApply = process.argv.includes("--apply");

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });
const db = getFirestore(app);

const REMAP = {
  "19Bfjuuzg00Zac4qo4Ky": "iSwoNNCxgWl0vGi3yiWq", // Kyle Boscher -> RES-1006THO
  "6rLUtrZy1T3a4SVefnXE": "iSwoNNCxgWl0vGi3yiWq", // Maxime Thouard -> RES-1006THO
  "4qwmYnceEH4KF5OcQ6Aj": "P1rDylsEHKXHpK4Uq1tF", // Jahyan Dindangila
  "hRt7jPr5hMX0x3qQ6gMR": "LzLaT9iBp4KGuYRXDuqr", // Typhaine Rippling
  "7MMJLwz7AbpcBjmo8lCM": "IgC4ypL281byfuqma3o1", // El Gloria Makita
  "E87o5lalk4ryRiNguDka": "aBkcxECKYi2T98A6yHYn", // Samy Macaronus
  "JkOOOG3AIY7GaCJogBjU": "LJ3dB4rQ8U7g4s9FqvhF", // Goundo Camara
  "Wd1aJBETu3IRMScWEcJ8": "I4ZQrTdvLR2co1EkhghH", // Mohamed Kehlaoui
  "fkRrzyRq7Ikzbc9yX5gK": "F3gAiY4ShLOOJuf94zRz", // Mokhtar Soumare
  "gbT6SzOpqMByYlXkZJIT": "hFHrFHMB36EUGEoxqmNj", // Diahouba Diawara
  "l0p8eSt1MhbpODGLzJB7": "HVhT8PrBoTVEzR6boEih", // Mohamed Kone
  "x1q0UHQAL5v6ofM4vhkQ": "NOBFJ0yg6uToUfms9208", // Nazad Hamidou
  "xHXjT1LWkrKJbYHD2SdB": "5w8OKDH2hFJZdjZ0WP7i", // Djibril Soumare
  "XumQTtpu9pLIMCs0206k": "306dH3PwH4QLpy6I3iFB", // Océane Raude
  "XqFoma0VPjoyyxnkQdHX": "2JlzTUf3PAHAJhJwXgEh", // Keyla Berthe
  "eHhVHVfEwYzjDFuXvxot": "DHlTIJYou74nQEAVAhdh", // Soumaila Drame
};

const snap = await getDocs(collection(db, "transports"));
const transports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

let totalFixed = 0;
for (const t of transports) {
  const passengers = t.passengers || [];
  let changed = false;
  const newPassengers = passengers.map((p) => {
    if (REMAP[p.reservationId]) {
      changed = true;
      totalFixed++;
      return { ...p, reservationId: REMAP[p.reservationId] };
    }
    return p;
  });
  if (changed) {
    console.log(`${t.sejourName} (${t.direction}) [${t.id}] : ${newPassengers.filter((p, i) => passengers[i].reservationId !== p.reservationId).length} référence(s) corrigée(s)`);
    if (shouldApply) {
      await updateDoc(doc(db, "transports", t.id), { passengers: newPassengers });
    }
  }
}
console.log(`\n${shouldApply ? "Appliqué" : "Dry-run"} — ${totalFixed} référence(s) corrigée(s) au total.`);
process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
