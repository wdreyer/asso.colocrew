import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";

const RUNS = "campagne_runs";

async function handlePOST(request, context) {
  const { id } = await context.params;
  const { action, delayMs } = await request.json();

  if (!["pause", "stop", "speed"].includes(action)) {
    return Response.json({ error: "Action invalide" }, { status: 400 });
  }

  const runRef = adminDb().collection(RUNS).doc(id);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  if (action === "speed") {
    const nextDelay = Number(delayMs);
    if (![1000, 3000, 10000].includes(nextDelay)) {
      return Response.json({ error: "Vitesse invalide" }, { status: 400 });
    }

    await runRef.update({
      delayMs: nextDelay,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await runRef.collection("events").add({
      type: "speed_changed",
      delayMs: nextDelay,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true, delayMs: nextDelay });
  }

  await runRef.update({
    controlAction: action,
    controlRequestedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await runRef.collection("events").add({
    type: `${action}_requested`,
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true });
}

export const POST = withDashboardAccess(["campaigns"], handlePOST);
