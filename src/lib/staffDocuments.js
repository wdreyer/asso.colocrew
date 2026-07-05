import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

export const STAFF_DOCUMENT_TYPES = [
  { key: "diploma", label: "Diplôme", shortLabel: "Diplôme", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "identity", label: "Carte d’identité", shortLabel: "Identité", accept: ".pdf,.jpg,.jpeg,.png" },
  { key: "health", label: "Vaccins ou certificat médical", shortLabel: "Santé", accept: ".pdf,.jpg,.jpeg,.png" },
];

export const STAFF_DOCUMENT_TYPE_MAP = Object.fromEntries(STAFF_DOCUMENT_TYPES.map((type) => [type.key, type]));
export const STAFF_DOCUMENT_STATUS = {
  pending: { label: "À vérifier", tone: "warning" },
  validated: { label: "Validé", tone: "success" },
  rejected: { label: "À remplacer", tone: "danger" },
};

export const MAX_STAFF_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function validateStaffDocumentFile(file) {
  if (!file) return "Sélectionnez un fichier.";
  if (file.size > MAX_STAFF_DOCUMENT_SIZE) return "Le fichier dépasse 10 Mo.";
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.has(file.type) && !["pdf", "jpg", "jpeg", "png"].includes(extension)) {
    return "Format accepté : PDF, JPG ou PNG.";
  }
  return "";
}

export function safeStaffFileName(value) {
  const cleaned = String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "document";
}

export async function uploadStaffDocument({ member, documentType, file, source = "public" }) {
  const error = validateStaffDocumentFile(file);
  if (error) throw new Error(error);
  if (!member?.id || !STAFF_DOCUMENT_TYPE_MAP[documentType]) throw new Error("Dépôt incomplet.");

  const uploadId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `staff-documents/${member.id}/${documentType}/${uploadId}-${safeStaffFileName(file.name)}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: {
      memberId: member.id,
      memberName: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
      documentType,
      source,
      status: "pending",
    },
  });

  try {
    const entry = {
      memberId: member.id,
      memberName: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
      documentType,
      originalName: file.name,
      storagePath,
      contentType: file.type || "",
      size: Number(file.size) || 0,
      status: "pending",
      locked: false,
      source,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const created = await addDoc(collection(db, COLLECTIONS.STAFF_DOCUMENTS), entry);
    return { id: created.id, ...entry, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  } catch (uploadError) {
    try { await deleteObject(storageRef); } catch {}
    throw uploadError;
  }
}

export function latestDocumentByType(documents, memberId, documentType) {
  return (documents || [])
    .filter((document) => document.memberId === memberId && document.documentType === documentType)
    .sort((left, right) => documentTimestamp(right) - documentTimestamp(left))[0] || null;
}

export function documentTimestamp(document) {
  const value = document?.createdAt;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function publicAssignmentsForMember(memberId, contracts) {
  return (contracts || [])
    .filter((contract) => contract.memberId === memberId)
    .map((contract) => ({
      contractId: contract.id,
      week: contract.week || "",
      stay: contract.stay || contract.stayName || contract.stayCode || "",
      stayCode: contract.stayCode || "",
      role: contract.role || "Poste à confirmer",
      startDate: contract.startDate || "",
      endDate: contract.endDate || "",
    }))
    .sort((left, right) => `${left.week}-${left.stay}`.localeCompare(`${right.week}-${right.stay}`, "fr"));
}
