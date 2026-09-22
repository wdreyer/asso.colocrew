import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

loadEnv(".env.local");

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "colocrew-5edf9.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "colocrew-5edf9",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "colocrew-5edf9.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "74332244617",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:74332244617:web:1947fe469b0ca4a103d458",
});

const db = getFirestore(app);
const snapshot = await getDocs(collection(db, "transports"));
const transports = snapshot.docs
  .map((item) => ({ id: item.id, ...item.data() }))
  .filter((transport) => {
    const date = String(transport.date || "");
    return date.startsWith("2026-07-31") || date.includes("31/07/2026");
  })
  .sort((a, b) => String(a.departureTime || "").localeCompare(String(b.departureTime || "")));

console.log(`# Récap billets - 31 juillet 2026\n`);
console.log(`${transports.length} transport(s) trouvé(s).\n`);

let totalTickets = 0;
let totalSeats = 0;
let totalCovered = 0;
let purchasedSeats = 0;
let pendingSeats = 0;

for (const transport of transports) {
  const tickets = transport.tickets || [];
  const passengers = transport.passengers || [];
  const transportSeats = tickets.reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
  const transportCovered = tickets.reduce((sum, ticket) => sum + (ticket.coveredReservationIds || []).length, 0);

  totalTickets += tickets.length;
  totalSeats += transportSeats;
  totalCovered += transportCovered;
  purchasedSeats += tickets
    .filter((ticket) => ticket.purchased)
    .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);
  pendingSeats += tickets
    .filter((ticket) => !ticket.purchased)
    .reduce((sum, ticket) => sum + Number(ticket.seats || 0), 0);

  console.log(`## ${transport.sejourName || "Séjour"} ${transport.week || ""} - ${labelDirection(transport.direction)}`);
  console.log(`Convoi : ${transport.departureCity || "?"} -> ${transport.arrivalCity || "?"} | ${transport.departureTime || "?"} - ${transport.arrivalTime || "?"}`);
  console.log(`Passagers : ${passengers.length} | Billets : ${tickets.length} | Places : ${transportSeats} | Affectés : ${transportCovered}\n`);

  if (!tickets.length) {
    console.log("- Aucun billet enregistré.\n");
  } else {
    for (const ticket of tickets) {
      const covered = (ticket.coveredReservationIds || []).length;
      const status = ticket.purchased ? "acheté" : ticket.paymentUrl ? "paiement à faire" : "à acheter / à confirmer";
      const ref = ticket.bookingReference ? ` | réf. ${ticket.bookingReference}` : "";
      const due = ticket.paymentDueAt ? ` | échéance ${formatDateTime(ticket.paymentDueAt)}` : "";
      console.log(`- ${ticket.name || [ticket.trainType, ticket.trainNumber].filter(Boolean).join(" ") || "Billet"}`);
      console.log(`  ${ticket.from || "?"} -> ${ticket.to || "?"} | ${ticket.departureTime || "?"} - ${ticket.arrivalTime || "?"} | ${covered}/${ticket.seats || "?"} places | ${status}${ref}${due}`);
    }
    console.log("");
  }

  const branchesToBuy = (transport.branches || []).filter((branch) =>
    String(branch.scheduleStatus || "").toLowerCase().includes("acheter")
  );
  if (branchesToBuy.length) {
    console.log("Embranchements encore marqués billet à acheter :");
    for (const branch of branchesToBuy) {
      console.log(`- ${branch.from || "?"} -> ${branch.to || "?"} | ${branch.mode || ""} ${branch.number || ""} | ${branch.departureTime || "?"} - ${branch.arrivalTime || "?"}`);
    }
    console.log("");
  }
}

console.log("## Totaux");
console.log(`Billets : ${totalTickets}`);
console.log(`Places : ${totalSeats}`);
console.log(`Places affectées : ${totalCovered}`);
console.log(`Places achetées : ${purchasedSeats}`);
console.log(`Places en attente / paiement : ${pendingSeats}`);

process.exit(0);

function labelDirection(direction) {
  if (direction === "retour") return "retour";
  if (direction === "aller") return "aller";
  return direction || "";
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
