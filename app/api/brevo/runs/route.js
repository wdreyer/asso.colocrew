import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";

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
    await docSnap.ref.update({
      status: "interrupted",
      lastError: "Envoi interrompu ou serveur redemarre",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return {
    id: docSnap.id,
    ...data,
    status: stale ? "interrupted" : data.status,
    lastError: stale ? "Envoi interrompu ou serveur redemarre" : data.lastError,
    canResume: data.queueVersion === 2 && !!data.htmlContent,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
    finishedAt: data.finishedAt?.toMillis?.() ?? null,
  };
}

async function handleGET(request) {
  const { searchParams } = new URL(request.url);
  const max = Math.min(Number(searchParams.get("limit") || 5), 20);
  const snap = await adminDb().collection(RUNS).orderBy("createdAt", "desc").limit(max).get();
  return Response.json({ runs: await Promise.all(snap.docs.map(serialize)) });
}

export const GET = withDashboardAccess(["campaigns"], handleGET);
