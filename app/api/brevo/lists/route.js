import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";

const COLL = "campagne_listes";

async function handleGET() {
  const snap = await adminDb().collection(COLL).orderBy("createdAt", "desc").get();
  const lists = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() ?? null,
  }));
  return Response.json({ lists });
}

async function handlePOST(request) {
  const { name } = await request.json();
  if (!name?.trim()) return Response.json({ error: "Nom requis" }, { status: 400 });
  const ref = await adminDb().collection(COLL).add({
    name: name.trim(),
    count: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ id: ref.id });
}

async function handleDELETE(request) {
  const { id } = await request.json();
  if (!id) return Response.json({ error: "id requis" }, { status: 400 });
  await adminDb().collection(COLL).doc(id).delete();
  return Response.json({ ok: true });
}

export const GET = withDashboardAccess(["campaigns"], handleGET);
export const POST = withDashboardAccess(["campaigns"], handlePOST);
export const DELETE = withDashboardAccess(["campaigns"], handleDELETE);
