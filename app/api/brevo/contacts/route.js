import { db } from "@/src/lib/firebase";
import {
  collection, getDocs, addDoc, writeBatch, deleteDoc,
  query, where, doc, updateDoc, increment,
} from "firebase/firestore";

const C_CONTACTS = "campagne_contacts";
const C_LISTS    = "campagne_listes";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const q = listId
    ? query(collection(db, C_CONTACTS), where("listId", "==", listId))
    : query(collection(db, C_CONTACTS));
  const snap = await getDocs(q);
  const unsubSnap = await getDocs(collection(db, "campagne_unsubscribes"));
  const unsubscribed = new Set(unsubSnap.docs.map(d => String(d.data().email || d.id).toLowerCase().trim()));
  const contacts = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => !unsubscribed.has(String(c.email || "").toLowerCase().trim()))
    .sort((a, b) => (Number(b.scorePertinence) || 0) - (Number(a.scorePertinence) || 0));
  return Response.json({ contacts, count: contacts.length });
}

export async function POST(request) {
  const { contacts, listId } = await request.json();
  if (!contacts?.length || !listId) {
    return Response.json({ error: "contacts et listId requis" }, { status: 400 });
  }

  const batch = writeBatch(db);
  let added = 0;
  for (const c of contacts) {
    if (!c.email?.includes("@")) continue;
    const ref = doc(collection(db, C_CONTACTS));
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
  await updateDoc(doc(db, C_LISTS, listId), { count: increment(added) });

  return Response.json({ added });
}

export async function DELETE(request) {
  const { listId } = await request.json();
  if (!listId) return Response.json({ error: "listId requis" }, { status: 400 });
  const snap = await getDocs(query(collection(db, C_CONTACTS), where("listId", "==", listId)));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return Response.json({ deleted: snap.size });
}
