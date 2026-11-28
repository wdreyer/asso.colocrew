import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";

const DRAFTS = "campagne_brouillons";

function serialize(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  };
}

async function handleGET() {
  const snapshot = await adminDb().collection(DRAFTS).orderBy("updatedAt", "desc").get();
  return Response.json({ drafts: snapshot.docs.map(serialize) });
}

async function handlePOST(request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || body.subject || "").trim();
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "").trim();
  const replyTo = String(body.replyTo || "").trim();

  if (!name || !subject || !html || !replyTo) {
    return Response.json(
      { error: "Nom, objet, contenu et adresse de réponse requis" },
      { status: 400 },
    );
  }

  const values = {
    name,
    subject,
    html,
    replyTo,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.id) {
    const draftRef = adminDb().collection(DRAFTS).doc(String(body.id));
    await draftRef.set(values, { merge: true });
    return Response.json({ ok: true, id: draftRef.id });
  }

  const draftRef = await adminDb().collection(DRAFTS).add({
    ...values,
    createdAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ ok: true, id: draftRef.id });
}

async function handleDELETE(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Identifiant requis" }, { status: 400 });
  await adminDb().collection(DRAFTS).doc(String(body.id)).delete();
  return Response.json({ ok: true });
}

export const GET = withDashboardAccess(["campaigns"], handleGET);
export const POST = withDashboardAccess(["campaigns"], handlePOST);
export const DELETE = withDashboardAccess(["campaigns"], handleDELETE);
