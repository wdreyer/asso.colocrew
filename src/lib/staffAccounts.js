import { collection, deleteField, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/**
 * Comptes de l'espace équipe (`staff_accounts/{uid}`, cf. docs/MODELE-DONNEES.md §6).
 * La personne crée sa demande (`status: "pending"`), un admin la valide en la liant à une fiche
 * `staff_members` existante ou nouvelle, la refuse, la suspend ou la délie.
 * Les fonctions pures servent à l'affichage ; les fonctions async écrivent dans Firestore en un
 * seul lot pour que le compte et la fiche ne soient jamais à moitié liés.
 */

export const STAFF_ACCOUNT_STATUS = {
  pending: { label: "En attente", variant: "warning" },
  approved: { label: "Validé", variant: "success" },
  rejected: { label: "Refusé / suspendu", variant: "error" },
};

export const STAFF_ACCOUNT_ROLES = {
  animateur: "Animateur·ice",
  adjoint: "Directeur·ice adjoint·e",
  directeur: "Directeur·ice",
};

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/** "Élodie  DUPONT-Martin" → "elodie dupont martin" */
export function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function timestampValue(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return String(value);
}

export function mapStaffAccount(snap) {
  const data = snap.data() || {};
  return {
    ...data,
    id: snap.id,
    uid: data.uid || snap.id,
    email: data.email || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    phone: data.phone || "",
    requestedRole: data.requestedRole || "animateur",
    status: STAFF_ACCOUNT_STATUS[data.status] ? data.status : "pending",
    memberId: data.memberId || "",
    rejectionReason: data.rejectionReason || "",
    createdAt: timestampValue(data.createdAt),
    reviewedAt: timestampValue(data.reviewedAt),
    reviewedBy: data.reviewedBy || "",
  };
}

export function staffAccountName(account) {
  return `${account?.firstName || ""} ${account?.lastName || ""}`.trim() || account?.email || "Compte sans nom";
}

function memberFullName(member) {
  return member?.name || `${member?.firstName || ""} ${member?.lastName || ""}`.trim();
}

/**
 * Fiches `staff_members` qui pourraient correspondre à la demande, les plus probables d'abord :
 * même e-mail, puis même prénom + nom (accents, casse et tirets ignorés), puis même nom complet
 * dans l'autre ordre.
 */
export function rankMemberCandidates(account, members) {
  const email = normalizeEmail(account?.email);
  const first = normalizePersonName(account?.firstName);
  const last = normalizePersonName(account?.lastName);
  const full = normalizePersonName(`${account?.firstName || ""} ${account?.lastName || ""}`);
  const reversed = normalizePersonName(`${account?.lastName || ""} ${account?.firstName || ""}`);

  return (members || [])
    .map((member) => {
      const memberFirst = normalizePersonName(member.firstName);
      const memberLast = normalizePersonName(member.lastName);
      const memberFull = normalizePersonName(memberFullName(member));
      if (email && normalizeEmail(member.email) === email) return { member, score: 3, reason: "même e-mail" };
      if (first && last && memberFirst === first && memberLast === last) return { member, score: 2, reason: "même nom et prénom" };
      if (full && (memberFull === full || memberFull === reversed)) return { member, score: 1, reason: "même nom complet" };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || memberFullName(a.member).localeCompare(memberFullName(b.member), "fr"));
}

/** Meilleure fiche à proposer pour une demande, ou null. */
export function suggestMemberForAccount(account, members) {
  return rankMemberCandidates(account, members)[0] || null;
}

/** Compte déjà lié à une fiche (autre que `exceptUid`) : une fiche ne porte qu'un seul compte. */
export function accountLinkedToMember(memberId, accounts, exceptUid = "") {
  if (!memberId) return null;
  return (accounts || []).find((account) => (
    account.uid !== exceptUid && account.memberId === memberId && account.status !== "rejected"
  )) || null;
}

export function countPendingAccounts(accounts) {
  return (accounts || []).filter((account) => account.status === "pending").length;
}

function reviewerLabel(reviewer) {
  return reviewer?.email || reviewer?.uid || "";
}

/** Valide la demande et la lie à une fiche existante. */
export async function approveStaffAccount({ account, memberId, reviewer }) {
  if (!account?.uid || !memberId) throw new Error("Compte ou fiche manquant.");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.STAFF_ACCOUNTS, account.uid), {
    status: "approved",
    memberId,
    rejectionReason: deleteField(),
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerLabel(reviewer),
  }, { merge: true });
  const memberFields = { accountUid: account.uid };
  if (account.email) memberFields.email = normalizeEmail(account.email);
  batch.set(doc(db, COLLECTIONS.STAFF_MEMBERS, memberId), memberFields, { merge: true });
  await batch.commit();
  return { memberId };
}

/** Valide la demande en créant une nouvelle fiche à partir des informations du compte. */
export async function approveStaffAccountWithNewMember({ account, reviewer }) {
  if (!account?.uid) throw new Error("Compte manquant.");
  const memberRef = doc(collection(db, COLLECTIONS.STAFF_MEMBERS));
  const firstName = String(account.firstName || "").trim();
  const lastName = String(account.lastName || "").trim();
  const member = {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: normalizeEmail(account.email),
    phone: String(account.phone || "").trim(),
    staffType: ["directeur", "adjoint"].includes(account.requestedRole) ? "directeur" : "animateur",
    active: true,
    accountUid: account.uid,
    createdAt: serverTimestamp(),
    createdFrom: "staff-account",
  };
  const batch = writeBatch(db);
  batch.set(memberRef, member);
  batch.set(doc(db, COLLECTIONS.STAFF_ACCOUNTS, account.uid), {
    status: "approved",
    memberId: memberRef.id,
    rejectionReason: deleteField(),
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerLabel(reviewer),
  }, { merge: true });
  await batch.commit();
  return { memberId: memberRef.id, member: { id: memberRef.id, ...member, createdAt: new Date().toISOString() } };
}

/**
 * Refuse une demande, ou suspend un compte validé. Le lien vers la fiche est conservé pour
 * pouvoir réactiver le compte plus tard ; la personne n'a plus accès à l'espace équipe.
 */
export async function rejectStaffAccount({ account, reason = "", reviewer }) {
  if (!account?.uid) throw new Error("Compte manquant.");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.STAFF_ACCOUNTS, account.uid), {
    status: "rejected",
    rejectionReason: String(reason || "").trim(),
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerLabel(reviewer),
  }, { merge: true });
  await batch.commit();
}

/**
 * Délie le compte de sa fiche : la fiche perd `accountUid`, le compte repasse en attente sans
 * fiche. Les données de la fiche (contrats, documents) ne bougent pas.
 */
export async function unlinkStaffAccount({ account, reviewer }) {
  if (!account?.uid) throw new Error("Compte manquant.");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.STAFF_ACCOUNTS, account.uid), {
    status: "pending",
    memberId: "",
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerLabel(reviewer),
  }, { merge: true });
  if (account.memberId) {
    batch.set(doc(db, COLLECTIONS.STAFF_MEMBERS, account.memberId), { accountUid: deleteField() }, { merge: true });
  }
  await batch.commit();
}
