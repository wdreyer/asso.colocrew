import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const RUNS = "campagne_runs";

export async function POST(request, context) {
  const { id } = await context.params;
  const { action } = await request.json();

  if (!["pause", "stop"].includes(action)) {
    return Response.json({ error: "Action invalide" }, { status: 400 });
  }

  const runRef = doc(db, RUNS, id);
  const runSnap = await getDoc(runRef);
  if (!runSnap.exists()) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  await updateDoc(runRef, {
    controlAction: action,
    controlRequestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(runRef, "events"), {
    type: `${action}_requested`,
    createdAt: serverTimestamp(),
  });

  return Response.json({ ok: true });
}
