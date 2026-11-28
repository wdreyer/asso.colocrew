import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const members = ["william-dreyer", "marion-errard"];
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const apply = process.argv.includes("--apply");
if (!projectId) throw new Error("Renseignez NEXT_PUBLIC_FIREBASE_PROJECT_ID avant de lancer la commande.");
const app = initializeApp({ projectId, credential: credentials ? cert(JSON.parse(credentials)) : applicationDefault() });
const db = getFirestore(app);
const auth = getAuth(app);

for (const id of members) {
  const member = (await db.collection("staff_members").doc(id).get()).data();
  const email = String(member?.email || "").trim().toLowerCase();
  const label = member?.name || id;
  if (!email) {
    console.log(label + " · adresse du compte équipe à renseigner");
    process.exitCode = 1;
    continue;
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    console.log(label + " · compte Firebase à créer et à rattacher");
    process.exitCode = 1;
    continue;
  }
  const admin = db.collection("admins").doc(user.uid);
  const account = db.collection("staff_accounts").doc(user.uid);
  const result = await db.runTransaction(async (transaction) => {
    const [adminSnapshot, accountSnapshot] = await Promise.all([
      transaction.get(admin), transaction.get(account),
    ]);
    if (adminSnapshot.exists) return "accès administrateur existant";
    const staff = accountSnapshot.data();
    if (user.disabled || staff?.status !== "approved" || staff.memberId !== id) {
      process.exitCode = 1;
      return "compte équipe à valider et à rattacher à la fiche";
    }
    if (staff.dashboardSections?.includes("reservations")) return "accès Réservations déjà actif";
    if (!apply) return "accès Réservations prêt à être ajouté";
    transaction.update(account, {
      dashboardSections: FieldValue.arrayUnion("reservations"),
      dashboardReviewedAt: FieldValue.serverTimestamp(),
      dashboardReviewedBy: "migration-reservations",
    });
    return "accès Réservations ajouté";
  });
  console.log(label + " · " + result);
}
