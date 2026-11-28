// Renseigne `crm.lastContactAt` / `crm.lastContactType` des demandes en cours (statuts en attente
// et liste d'attente) à partir de leur historique : dernier appel, email consigné ou email envoyé
// par l'équipe. Les emails automatiques ("automation") ne comptent pas.
//
// Sans --apply, la commande affiche seulement ce qu'elle ferait.
//   node scripts/backfill-reservation-crm.mjs
//   node scripts/backfill-reservation-crm.mjs --apply
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeReservationStatus } from "../src/lib/reservations.js";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const apply = process.argv.includes("--apply");
if (!projectId) throw new Error("Renseignez NEXT_PUBLIC_FIREBASE_PROJECT_ID avant de lancer la commande.");
const app = initializeApp({ projectId, credential: credentials ? cert(JSON.parse(credentials)) : applicationDefault() });
const db = getFirestore(app);

const CONTACT_TYPES = new Set(["call", "manualEmail", "email"]);
const reservations = await db.collection("reservations").get();
let updated = 0;
let skipped = 0;

for (const reservation of reservations.docs) {
  const data = reservation.data();
  if (data.archived === true || !["pending", "waitlist"].includes(normalizeReservationStatus(data.status))) continue;
  if (data.crm?.lastContactAt) { skipped += 1; continue; }

  const activity = await reservation.ref.collection("activity").orderBy("createdAt", "desc").limit(50).get();
  const contact = activity.docs.map((entry) => entry.data()).find((event) => (
    CONTACT_TYPES.has(event.type)
    && event.actorUid !== "automation"
    && (event.type !== "email" || event.delivery === "sent")
  ));
  if (!contact?.createdAt) continue;

  const label = `${data.numeroDeReservation || reservation.id} · ${contact.type} du ${contact.createdAt.toDate().toLocaleDateString("fr-FR")}`;
  if (apply) {
    await reservation.ref.update({ "crm.lastContactAt": contact.createdAt, "crm.lastContactType": contact.type });
  }
  console.log((apply ? "Mis à jour  " : "À mettre à jour  ") + label);
  updated += 1;
}

console.log(`\n${updated} demande(s) ${apply ? "mise(s) à jour" : "à mettre à jour (relancez avec --apply)"}, ${skipped} déjà renseignée(s).`);
