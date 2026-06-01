import { db } from "@/src/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const RUNS = "campagne_runs";

function serializeRun(docSnap) {
  const data = docSnap.data();
  const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
  const staleAfter = Math.max(90000, Number(data.delayMs || 3000) * 10);
  const stale = data.status === "running" && updatedAt > 0 && Date.now() - updatedAt > staleAfter;
  return {
    id: docSnap.id,
    ...data,
    status: stale ? "interrupted" : data.status,
    lastError: stale ? "Envoi interrompu ou serveur redemarre" : data.lastError,
    canResume: !!(data.listId && data.htmlContent),
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
    finishedAt: data.finishedAt?.toMillis?.() ?? null,
  };
}

function serializeEvent(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toMillis?.() ?? null,
  };
}

export async function GET(_request, context) {
  const { id } = await context.params;
  const runRef = doc(db, RUNS, id);
  const runSnap = await getDoc(runRef);
  if (!runSnap.exists()) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }
  const data = runSnap.data();
  const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
  const staleAfter = Math.max(90000, Number(data.delayMs || 3000) * 10);
  if (data.status === "running" && updatedAt > 0 && Date.now() - updatedAt > staleAfter) {
    await updateDoc(runRef, {
      status: "interrupted",
      lastError: "Envoi interrompu ou serveur redemarre",
      updatedAt: serverTimestamp(),
    });
  }

  const eventsSnap = await getDocs(
    query(collection(runRef, "events"), orderBy("createdAt", "desc"), limit(50))
  );

  return Response.json({
    run: serializeRun(runSnap),
    events: eventsSnap.docs.map(serializeEvent),
  });
}
