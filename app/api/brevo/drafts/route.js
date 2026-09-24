import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

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

export async function GET() {
  const snapshot = await getDocs(query(collection(db, DRAFTS), orderBy("updatedAt", "desc")));
  return Response.json({ drafts: snapshot.docs.map(serialize) });
}

export async function POST(request) {
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
    updatedAt: serverTimestamp(),
  };

  if (body.id) {
    const draftRef = doc(db, DRAFTS, String(body.id));
    await setDoc(draftRef, values, { merge: true });
    return Response.json({ ok: true, id: draftRef.id });
  }

  const draftRef = await addDoc(collection(db, DRAFTS), {
    ...values,
    createdAt: serverTimestamp(),
  });
  return Response.json({ ok: true, id: draftRef.id });
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Identifiant requis" }, { status: 400 });
  await deleteDoc(doc(db, DRAFTS, String(body.id)));
  return Response.json({ ok: true });
}
