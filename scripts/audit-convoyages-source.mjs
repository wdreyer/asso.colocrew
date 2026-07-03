import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

loadEnv(".env.local");
const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const snapshot = await getDocs(collection(getFirestore(app), "transports"));
const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) => transport.week === "S1")
  .map((transport) => ({
    id: transport.id,
    week: transport.week,
    direction: transport.direction,
    status: transport.status,
    date: transport.date,
    route: `${transport.departureCity || "?"} → ${transport.arrivalCity || "?"}`,
    segments: (transport.segments || []).map((segment) => `${segment.from} → ${segment.to}`),
    passengers: (transport.passengers || []).length,
    staff: (transport.staff || []).length,
  }));
console.log(JSON.stringify(rows, null, 2));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
