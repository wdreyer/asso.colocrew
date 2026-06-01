import { db } from "@/src/lib/firebase";
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy,
} from "firebase/firestore";

const COLL = "campagne_listes";

export async function GET() {
  const snap = await getDocs(query(collection(db, COLL), orderBy("createdAt", "desc")));
  const lists = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() ?? null,
  }));
  return Response.json({ lists });
}

export async function POST(request) {
  const { name } = await request.json();
  if (!name?.trim()) return Response.json({ error: "Nom requis" }, { status: 400 });
  const ref = await addDoc(collection(db, COLL), {
    name: name.trim(),
    count: 0,
    createdAt: serverTimestamp(),
  });
  return Response.json({ id: ref.id });
}

export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return Response.json({ error: "id requis" }, { status: 400 });
  await deleteDoc(doc(db, COLL, id));
  return Response.json({ ok: true });
}
