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
  const { action, delayMs } = await request.json();

  if (!["pause", "stop", "speed"].includes(action)) {
    return Response.json({ error: "Action invalide" }, { status: 400 });
  }

  const runRef = doc(db, RUNS, id);
  const runSnap = await getDoc(runRef);
  if (!runSnap.exists()) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  if (action === "speed") {
    const nextDelay = Number(delayMs);
    if (![1000, 3000, 10000].includes(nextDelay)) {
      return Response.json({ error: "Vitesse invalide" }, { status: 400 });
    }

    await updateDoc(runRef, {
      delayMs: nextDelay,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(runRef, "events"), {
      type: "speed_changed",
      delayMs: nextDelay,
      createdAt: serverTimestamp(),
    });
    return Response.json({ ok: true, delayMs: nextDelay });
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
