import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";

const C_CONTACTS = "campagne_contacts";
const C_LISTS    = "campagne_listes";

async function handleGET(request) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const q = listId
    ? adminDb().collection(C_CONTACTS).where("listId", "==", listId)
    : adminDb().collection(C_CONTACTS);
  const snap = await q.get();
  const unsubSnap = await adminDb().collection("campagne_unsubscribes").get();
  const unsubscribed = new Set(unsubSnap.docs.map(d => String(d.data().email || d.id).toLowerCase().trim()));
  const contacts = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => !unsubscribed.has(String(c.email || "").toLowerCase().trim()))
    .sort((a, b) => (Number(b.scorePertinence) || 0) - (Number(a.scorePertinence) || 0));
  return Response.json({ contacts, count: contacts.length });
}

async function handlePOST(request) {
  const { contacts, listId } = await request.json();
  if (!contacts?.length || !listId) {
    return Response.json({ error: "contacts et listId requis" }, { status: 400 });
  }

  const batch = adminDb().batch();
  let added = 0;
  for (const c of contacts) {
    if (!c.email?.includes("@")) continue;
    const ref = adminDb().collection(C_CONTACTS).doc();
    batch.set(ref, {
      listId,
      email:  c.email.toLowerCase().trim(),
      prenom: c.prenom || "",
      nom:    c.nom    || "",
    });
    added++;
  }
  await batch.commit();

  // Mettre à jour le compteur de la liste
  await adminDb().collection(C_LISTS).doc(listId).update({ count: FieldValue.increment(added) });

  return Response.json({ added });
}

async function handleDELETE(request) {
  const { listId } = await request.json();
  if (!listId) return Response.json({ error: "listId requis" }, { status: 400 });
  const snap = await adminDb().collection(C_CONTACTS).where("listId", "==", listId).get();
  const batch = adminDb().batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return Response.json({ deleted: snap.size });
}

export const GET = withDashboardAccess(["campaigns"], handleGET);
export const POST = withDashboardAccess(["campaigns"], handlePOST);
export const DELETE = withDashboardAccess(["campaigns"], handleDELETE);
