import { db } from "@/src/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const RUNS = "campagne_runs";

function isStaleRunning(data) {
  if (data.status !== "running") return false;
  const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
  const staleAfter = Math.max(90000, Number(data.delayMs || 3000) * 10);
  return updatedAt > 0 && Date.now() - updatedAt > staleAfter;
}

async function serialize(docSnap) {
  const data = docSnap.data();
  const stale = isStaleRunning(data);
  if (stale) {
    await updateDoc(docSnap.ref, {
      status: "interrupted",
      lastError: "Envoi interrompu ou serveur redemarre",
      updatedAt: serverTimestamp(),
    });
  }
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const max = Math.min(Number(searchParams.get("limit") || 5), 20);
  const snap = await getDocs(query(collection(db, RUNS), orderBy("createdAt", "desc"), limit(max)));
  return Response.json({ runs: await Promise.all(snap.docs.map(serialize)) });
}
